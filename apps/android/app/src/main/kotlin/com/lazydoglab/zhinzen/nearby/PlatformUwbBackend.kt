package com.lazydoglab.zhinzen.nearby

import android.content.Context
import android.ranging.RangingCapabilities
import android.ranging.RangingData
import android.ranging.RangingDevice
import android.ranging.RangingManager
import android.ranging.RangingPreference
import android.ranging.RangingSession
import android.ranging.SessionConfig
import android.ranging.raw.RawInitiatorRangingConfig
import android.ranging.raw.RawRangingDevice
import android.ranging.raw.RawResponderRangingConfig
import android.ranging.uwb.UwbAddress
import android.ranging.uwb.UwbComplexChannel
import android.ranging.uwb.UwbRangingCapabilities
import android.ranging.uwb.UwbRangingParams
import android.util.Log
import androidx.annotation.RequiresApi
import java.util.UUID
import kotlin.coroutines.resume
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Android 16+ system ranging API. Needs no Play Services or extra APK, so it also works on
 * China ROMs where Jetpack UWB has no backend (design.md §5.7).
 */
@RequiresApi(36)
internal class PlatformUwbBackend(context: Context) : UwbBackend {
    private val appContext = context.applicationContext
    private val manager: RangingManager? = appContext.getSystemService(RangingManager::class.java)

    override val name = "platform"
    override val permission = "android.permission.RANGING"

    override suspend fun controller(): UwbLocalSession {
        val caps = uwbCapabilities()
        val (channel, preamble) = UwbChannels.pick(caps.supportedChannels, caps.supportedPreambleIndexes)
            ?: throw UwbUnsupported("No compatible channel: ${caps.supportedChannels} ${caps.supportedPreambleIndexes}")
        return Local(caps, initiator = true, channel, preamble)
    }

    override suspend fun controlee(offer: UwbOffer): UwbLocalSession {
        val caps = uwbCapabilities()
        if (offer.channel !in caps.supportedChannels || offer.preamble !in caps.supportedPreambleIndexes) {
            throw UwbUnsupported("Peer channel ${offer.channel}/${offer.preamble} not supported")
        }
        return Local(caps, initiator = false, offer.channel, offer.preamble)
    }

    private suspend fun uwbCapabilities(): UwbRangingCapabilities {
        val manager = manager ?: throw UwbUnsupported("RangingManager unavailable")
        val caps = suspendCancellableCoroutine { cont ->
            val callback = object : RangingManager.RangingCapabilitiesCallback {
                override fun onRangingCapabilities(capabilities: RangingCapabilities) {
                    manager.unregisterCapabilitiesCallback(this)
                    if (cont.isActive) cont.resume(capabilities)
                }
            }
            manager.registerCapabilitiesCallback(appContext.mainExecutor, callback)
            cont.invokeOnCancellation { manager.unregisterCapabilitiesCallback(callback) }
        }
        val availability = caps.technologyAvailability[RangingManager.UWB] ?: RangingCapabilities.NOT_SUPPORTED
        Log.i(UWB_TAG, "platform UWB availability=$availability caps=${caps.uwbCapabilities}")
        return when (availability) {
            RangingCapabilities.ENABLED -> caps.uwbCapabilities ?: throw UwbUnsupported("No UWB capabilities")
            RangingCapabilities.NOT_SUPPORTED -> throw UwbUnsupported("UWB not supported")
            else -> throw UwbDisabled("UWB availability $availability")
        }
    }

    private inner class Local(
        private val caps: UwbRangingCapabilities,
        private val initiator: Boolean,
        override val channel: Int,
        override val preamble: Int,
    ) : UwbLocalSession {
        private val local = UwbAddress.createRandomShortAddress()
        override val address: ByteArray = local.addressBytes

        override fun range(offer: UwbOffer, peerAddress: ByteArray): Flow<UwbResult> = callbackFlow {
            val manager = manager ?: throw UwbUnsupported("RangingManager unavailable")
            val params = UwbRangingParams.Builder(
                offer.sessionId,
                UwbRangingParams.CONFIG_UNICAST_DS_TWR,
                local,
                UwbAddress.fromBytes(peerAddress),
            )
                .setComplexChannel(
                    UwbComplexChannel.Builder()
                        .setChannel(offer.channel)
                        .setPreambleIndex(offer.preamble)
                        .build(),
                )
                .setSessionKeyInfo(offer.sessionKey)
                .setRangingUpdateRate(RawRangingDevice.UPDATE_RATE_NORMAL)
                .build()
            val device = RawRangingDevice.Builder()
                .setRangingDevice(RangingDevice.Builder().setUuid(UUID.randomUUID()).build())
                .setUwbRangingParams(params)
                .build()
            val config = if (initiator) {
                RawInitiatorRangingConfig.Builder().addRawRangingDevice(device).build()
            } else {
                RawResponderRangingConfig.Builder().setRawRangingDevice(device).build()
            }
            val preference = RangingPreference.Builder(
                if (initiator) RangingPreference.DEVICE_ROLE_INITIATOR else RangingPreference.DEVICE_ROLE_RESPONDER,
                config,
            )
                .setSessionConfig(
                    SessionConfig.Builder().setAngleOfArrivalNeeded(caps.isAzimuthalAngleSupported).build(),
                )
                .build()
            val session = manager.createRangingSession(appContext.mainExecutor, object : RangingSession.Callback {
                override fun onOpened() {
                    Log.i(UWB_TAG, "platform session opened")
                }
                override fun onOpenFailed(reason: Int) {
                    close(IllegalStateException("Open failed, reason=$reason"))
                }
                override fun onStarted(peer: RangingDevice, technology: Int) {
                    Log.i(UWB_TAG, "platform ranging started, technology=$technology")
                }
                override fun onResults(peer: RangingDevice, data: RangingData) {
                    // Angles arrive in degrees, matching the Jetpack path.
                    UwbSamples.valid(
                        data.distance?.measurement?.toFloat(),
                        data.azimuth?.measurement?.toFloat(),
                    )?.let { trySend(it) }
                }
                override fun onStopped(peer: RangingDevice, reason: Int) {
                    close(IllegalStateException("Peer stopped, reason=$reason"))
                }
                override fun onClosed(reason: Int) {
                    close(IllegalStateException("Session closed, reason=$reason"))
                }
            }) ?: throw UwbUnsupported("createRangingSession returned null")
            Log.i(UWB_TAG, "platform start initiator=$initiator channel=${offer.channel}/${offer.preamble}")
            session.start(preference)
            awaitClose { runCatching { session.close() } }
        }
    }
}

/** Pick a complex channel both Jetpack and platform peers accept (channel 5/9, preamble 9–12). */
internal object UwbChannels {
    private val channels = listOf(9, 5)
    private val preambles = 9..12

    fun pick(
        supportedChannels: List<Int>,
        supportedPreambles: List<Int>,
        random: kotlin.random.Random = kotlin.random.Random,
    ): Pair<Int, Int>? {
        val channel = channels.firstOrNull { it in supportedChannels } ?: return null
        val preamble = supportedPreambles.filter { it in preambles }.randomOrNull(random) ?: return null
        return channel to preamble
    }
}
