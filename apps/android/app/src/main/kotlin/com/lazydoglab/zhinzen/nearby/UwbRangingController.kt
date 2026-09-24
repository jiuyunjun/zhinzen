package com.lazydoglab.zhinzen.nearby

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import androidx.core.content.ContextCompat
import androidx.core.uwb.RangingParameters
import androidx.core.uwb.RangingResult
import androidx.core.uwb.UwbAddress
import androidx.core.uwb.UwbComplexChannel
import androidx.core.uwb.UwbDevice
import androidx.core.uwb.UwbManager
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.DatabaseReference
import com.google.firebase.database.Query
import com.google.firebase.database.ValueEventListener
import com.lazydoglab.zhinzen.data.Backend
import java.security.SecureRandom
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout

/** Azimuth is relative to the device, in degrees; it is not a compass bearing. */
data class UwbResult(val distanceMeters: Float, val azimuthDeg: Float?)

enum class UwbStatus {
    IDLE, UNSUPPORTED, PERMISSION_REQUIRED, WAITING, RANGING, UNAVAILABLE, TIMED_OUT,
}

/** Foreground, single-peer ranging. v2 binds every exchange to both attempt IDs. */
class UwbRangingController(context: Context) {
    private val appContext = context.applicationContext
    private val uwbManager by lazy { UwbManager.createInstance(appContext) }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val random = SecureRandom()
    private val hardwareLock = Mutex()
    private var job: Job? = null
    private var generation = 0L

    fun isSupported(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            appContext.packageManager.hasSystemFeature("android.hardware.uwb")

    fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(appContext, "android.permission.UWB_RANGING") ==
            PackageManager.PERMISSION_GRANTED

    fun start(
        roomId: String,
        selfDeviceId: String,
        peerDeviceId: String,
        onStatus: (UwbStatus) -> Unit,
        onResult: (UwbResult?) -> Unit,
    ) {
        stop()
        val current = generation
        fun status(value: UwbStatus) {
            if (current == generation) onStatus(value)
        }
        fun result(value: UwbResult?) {
            if (current == generation) onResult(value)
        }
        result(null)
        if (!isSupported() || selfDeviceId == peerDeviceId) {
            status(UwbStatus.UNSUPPORTED)
            return
        }
        if (!hasPermission()) {
            status(UwbStatus.PERMISSION_REQUIRED)
            return
        }
        val controller = selfDeviceId < peerDeviceId
        val pairKey = listOf(selfDeviceId, peerDeviceId).sorted().joinToString("_")
        val base = Backend.database.getReference("rooms/$roomId/uwb/$pairKey/v2")
        val own = base.child(if (controller) "controller" else "controlee").push()
        val peer = base.child(if (controller) "controlee" else "controller")
        job = scope.launch {
            hardwareLock.withLock {
                try {
                    status(UwbStatus.WAITING)
                    withTimeout(30_000) {
                        own.onDisconnect().removeValue().await()
                        own.setValue(mapOf("ready" to true)).await()
                    }
                    runUwbSessions(
                        peerAttempts = peer.orderByKey().limitToLast(1).snapshots()
                            .map { it.children.lastOrNull()?.key },
                        onWaiting = {
                            result(null)
                            status(UwbStatus.WAITING)
                        },
                        onSample = { sample ->
                            status(UwbStatus.RANGING)
                            result(sample)
                        },
                    ) { peerAttempt, emit ->
                        val peerRef = peer.child(peerAttempt)
                        val exchange = own.child(peerAttempt)
                        try {
                            val samples = withTimeout(30_000) {
                                if (controller) controllerSession(exchange, peerRef.child(own.key!!))
                                else controleeSession(exchange, peerRef.child(own.key!!))
                            }
                            collectSession(samples, emit)
                        } finally {
                            exchange.removeValue()
                        }
                    }
                } catch (_: TimeoutCancellationException) {
                    status(UwbStatus.TIMED_OUT)
                } catch (e: CancellationException) {
                    throw e
                } catch (_: UwbTimeout) {
                    status(UwbStatus.TIMED_OUT)
                } catch (_: Exception) {
                    status(UwbStatus.UNAVAILABLE)
                } finally {
                    result(null)
                    // Unique node: late cleanup can never delete a replacement session.
                    // Leave onDisconnect armed if this deletion cannot reach the server.
                    own.removeValue().addOnSuccessListener { own.onDisconnect().cancel() }
                }
            }
        }
    }

    private suspend fun controllerSession(own: DatabaseReference, peer: DatabaseReference): Flow<RangingResult> {
        val session = uwbManager.controllerSessionScope()
        val sessionId = random.nextInt(Int.MAX_VALUE - 1) + 1
        val key = ByteArray(8).also(random::nextBytes)
        own.setValue(
            mapOf(
                "address" to b64(session.localAddress.address),
                "channel" to session.uwbComplexChannel.channel,
                "preamble" to session.uwbComplexChannel.preambleIndex,
                "sessionId" to sessionId,
                "sessionKey" to b64(key),
            ),
        ).await()
        val ack = peer.snapshots().first { it.hasChild("address") }
        val address = decode(ack, "address", setOf(2, 8))
        return session.prepareSession(parameters(sessionId, key, session.uwbComplexChannel, address))
    }

    private suspend fun controleeSession(own: DatabaseReference, peer: DatabaseReference): Flow<RangingResult> {
        val offer = peer.snapshots().first { it.hasChild("sessionKey") }
        val address = decode(offer, "address", setOf(2, 8))
        val key = decode(offer, "sessionKey", setOf(8))
        val id = offer.child("sessionId").getValue(Int::class.java) ?: error("Missing session id")
        val channel = offer.child("channel").getValue(Int::class.java) ?: error("Missing channel")
        val preamble = offer.child("preamble").getValue(Int::class.java) ?: error("Missing preamble")
        require(id > 0 && channel in setOf(5, 9) && preamble in 9..12)
        val session = uwbManager.controleeSessionScope()
        own.setValue(mapOf("address" to b64(session.localAddress.address))).await()
        return session.prepareSession(parameters(id, key, UwbComplexChannel(channel, preamble), address))
    }

    private fun parameters(id: Int, key: ByteArray, channel: UwbComplexChannel, address: ByteArray) =
        RangingParameters(
            uwbConfigType = RangingParameters.CONFIG_UNICAST_DS_TWR,
            sessionId = id,
            subSessionId = 0,
            sessionKeyInfo = key,
            subSessionKeyInfo = null,
            complexChannel = channel,
            peerDevices = listOf(UwbDevice(UwbAddress(address))),
            updateRateType = RangingParameters.RANGING_UPDATE_RATE_AUTOMATIC,
        )

    private suspend fun collectSession(flow: Flow<RangingResult>, onResult: (UwbResult) -> Unit) {
        flow.collect { result ->
            when (result) {
                is RangingResult.RangingResultPosition -> {
                    UwbSamples.valid(result.position.distance?.value, result.position.azimuth?.value)?.let(onResult)
                }
                is RangingResult.RangingResultPeerDisconnected -> error("Peer disconnected")
                else -> Unit
            }
        }
    }

    fun stop() {
        generation++
        job?.cancel()
        job = null
    }

    fun close() {
        stop()
        scope.cancel()
    }

    private fun Query.snapshots(): Flow<DataSnapshot> = callbackFlow {
        val listener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) { trySend(snapshot) }
            override fun onCancelled(error: DatabaseError) { close(error.toException()) }
        }
        addValueEventListener(listener)
        awaitClose { removeEventListener(listener) }
    }

    private fun decode(snapshot: DataSnapshot, field: String, sizes: Set<Int>): ByteArray {
        val value = snapshot.child(field).getValue(String::class.java) ?: error("Missing $field")
        require(value.length <= 32)
        return Base64.decode(value, Base64.NO_WRAP).also { require(it.size in sizes) }
    }

    private fun b64(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.NO_WRAP)
}

/** Reject missing/invalid distance; angle support is optional and must not invent a heading. */
internal object UwbSamples {
    fun valid(distance: Float?, azimuth: Float?): UwbResult? {
        if (distance == null || !distance.isFinite() || distance < 0) return null
        return UwbResult(distance, azimuth?.takeIf { it.isFinite() && it in -180f..180f })
    }
}
