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
import com.google.firebase.database.ValueEventListener
import com.lazydoglab.zhinzen.data.Backend
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.tasks.await
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.random.Random

/** A single UWB ranging sample: precise distance + (when available) azimuth bearing. */
data class UwbResult(val distanceMeters: Float, val azimuthDeg: Float?)

/**
 * UWB precise near-distance ranging (design.md §5.7). Only on Android 12+ devices
 * with UWB hardware, and only when both peers support it. Session parameters are
 * negotiated out-of-band over RTDB: the lexicographically smaller deviceId is the
 * controller (dictates channel/session id/key), the other is the controlee.
 *
 * Alpha API + niche hardware; needs two UWB phones to validate.
 */
class UwbRangingController(context: Context) {
    private val appContext = context.applicationContext
    private val uwbManager by lazy { UwbManager.createInstance(appContext) }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var job: Job? = null

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
        onResult: (UwbResult?) -> Unit,
    ): Boolean {
        if (!isSupported() || !hasPermission()) return false
        val isController = selfDeviceId < peerDeviceId
        val pairKey = listOf(selfDeviceId, peerDeviceId).sorted().joinToString("_")
        val base = Backend.database.getReference("rooms/$roomId/uwb/$pairKey")
        job =
            scope.launch {
                runCatching {
                    if (isController) runController(base, onResult) else runControlee(base, onResult)
                }.onFailure { onResult(null) }
            }
        return true
    }

    private suspend fun runController(base: DatabaseReference, onResult: (UwbResult?) -> Unit) {
        val session = uwbManager.controllerSessionScope()
        val sessionId = Random.nextInt(1, Int.MAX_VALUE)
        val sessionKey = Random.nextBytes(8)
        base.child("controller")
            .setValue(
                mapOf(
                    "address" to b64(session.localAddress.address),
                    "channel" to session.uwbComplexChannel.channel,
                    "preamble" to session.uwbComplexChannel.preambleIndex,
                    "sessionId" to sessionId,
                    "sessionKey" to b64(sessionKey),
                ),
            )
            .await()
        val peerAddress = awaitBytes(base.child("controlee").child("address"))
        val params =
            RangingParameters(
                uwbConfigType = RangingParameters.CONFIG_UNICAST_DS_TWR,
                sessionId = sessionId,
                subSessionId = 0,
                sessionKeyInfo = sessionKey,
                subSessionKeyInfo = null,
                complexChannel = session.uwbComplexChannel,
                peerDevices = listOf(UwbDevice(UwbAddress(peerAddress))),
                updateRateType = RangingParameters.RANGING_UPDATE_RATE_AUTOMATIC,
            )
        collectSession(session.prepareSession(params), onResult)
    }

    private suspend fun runControlee(base: DatabaseReference, onResult: (UwbResult?) -> Unit) {
        val session = uwbManager.controleeSessionScope()
        base.child("controlee")
            .setValue(mapOf("address" to b64(session.localAddress.address)))
            .await()
        val ctrl = awaitController(base.child("controller"))
        val params =
            RangingParameters(
                uwbConfigType = RangingParameters.CONFIG_UNICAST_DS_TWR,
                sessionId = ctrl.sessionId,
                subSessionId = 0,
                sessionKeyInfo = ctrl.sessionKey,
                subSessionKeyInfo = null,
                complexChannel = UwbComplexChannel(ctrl.channel, ctrl.preamble),
                peerDevices = listOf(UwbDevice(UwbAddress(ctrl.address))),
                updateRateType = RangingParameters.RANGING_UPDATE_RATE_AUTOMATIC,
            )
        collectSession(session.prepareSession(params), onResult)
    }

    private suspend fun collectSession(flow: Flow<RangingResult>, onResult: (UwbResult?) -> Unit) {
        flow.collect { result ->
            when (result) {
                is RangingResult.RangingResultPosition -> {
                    val distance = result.position.distance?.value
                    if (distance != null) onResult(UwbResult(distance, result.position.azimuth?.value))
                }
                is RangingResult.RangingResultPeerDisconnected -> onResult(null)
                else -> {}
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
    }

    private data class ControllerParams(
        val address: ByteArray,
        val channel: Int,
        val preamble: Int,
        val sessionId: Int,
        val sessionKey: ByteArray,
    )

    private suspend fun awaitBytes(ref: DatabaseReference): ByteArray =
        suspendCancellableCoroutine { cont ->
            val listener =
                object : ValueEventListener {
                    override fun onDataChange(snapshot: DataSnapshot) {
                        val value = snapshot.getValue(String::class.java)
                        if (value != null && cont.isActive) {
                            ref.removeEventListener(this)
                            cont.resume(unb64(value))
                        }
                    }

                    override fun onCancelled(error: DatabaseError) {
                        if (cont.isActive) cont.resumeWithException(error.toException())
                    }
                }
            ref.addValueEventListener(listener)
            cont.invokeOnCancellation { ref.removeEventListener(listener) }
        }

    private suspend fun awaitController(ref: DatabaseReference): ControllerParams =
        suspendCancellableCoroutine { cont ->
            val listener =
                object : ValueEventListener {
                    override fun onDataChange(snapshot: DataSnapshot) {
                        val address = snapshot.child("address").getValue(String::class.java)
                        val key = snapshot.child("sessionKey").getValue(String::class.java)
                        val channel = snapshot.child("channel").getValue(Int::class.java)
                        val preamble = snapshot.child("preamble").getValue(Int::class.java)
                        val sessionId = snapshot.child("sessionId").getValue(Int::class.java)
                        if (address != null && key != null && channel != null && preamble != null &&
                            sessionId != null && cont.isActive
                        ) {
                            ref.removeEventListener(this)
                            cont.resume(ControllerParams(unb64(address), channel, preamble, sessionId, unb64(key)))
                        }
                    }

                    override fun onCancelled(error: DatabaseError) {
                        if (cont.isActive) cont.resumeWithException(error.toException())
                    }
                }
            ref.addValueEventListener(listener)
            cont.invokeOnCancellation { ref.removeEventListener(listener) }
        }

    private fun b64(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.NO_WRAP)

    private fun unb64(value: String): ByteArray = Base64.decode(value, Base64.NO_WRAP)
}
