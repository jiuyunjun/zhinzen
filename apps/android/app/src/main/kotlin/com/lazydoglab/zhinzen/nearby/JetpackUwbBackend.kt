package com.lazydoglab.zhinzen.nearby

import android.content.Context
import android.content.pm.PackageManager
import androidx.core.uwb.RangingParameters
import androidx.core.uwb.RangingResult
import androidx.core.uwb.UwbAddress
import androidx.core.uwb.UwbClientSessionScope
import androidx.core.uwb.UwbComplexChannel
import androidx.core.uwb.UwbDevice
import androidx.core.uwb.UwbManager
import androidx.core.uwb.exceptions.UwbHardwareNotAvailableException
import androidx.core.uwb.exceptions.UwbServiceNotAvailableException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.mapNotNull

/** Android 12–15. On China ROMs Jetpack needs the separate AOSP backend APK (design.md §5.7). */
internal class JetpackUwbBackend(context: Context) : UwbBackend {
    private val appContext = context.applicationContext
    private val uwbManager by lazy { UwbManager.createInstance(appContext) }

    override val name = "jetpack"
    override val permission = "android.permission.UWB_RANGING"

    override suspend fun controller(): UwbLocalSession {
        requireBackend()
        val scope = wrap { uwbManager.controllerSessionScope() }
        return Local(scope, scope.uwbComplexChannel.channel, scope.uwbComplexChannel.preambleIndex)
    }

    override suspend fun controlee(offer: UwbOffer): UwbLocalSession {
        requireBackend()
        return Local(wrap { uwbManager.controleeSessionScope() }, offer.channel, offer.preamble)
    }

    /** Mirrors UwbManagerImpl's backend choice: China ROM → AOSP backend package required. */
    private fun requireBackend() {
        val pm = appContext.packageManager
        val chinaRom = pm.hasSystemFeature("cn.google.services") &&
            pm.hasSystemFeature("com.google.android.feature.services_updater")
        if (!chinaRom) return
        try {
            pm.getPackageInfo("androidx.core.uwb.backend", 0)
        } catch (_: PackageManager.NameNotFoundException) {
            throw UwbUnsupported("China ROM without androidx.core.uwb.backend")
        }
    }

    private inner class Local(
        private val scope: UwbClientSessionScope,
        override val channel: Int,
        override val preamble: Int,
    ) : UwbLocalSession {
        override val address: ByteArray = scope.localAddress.address

        override fun range(offer: UwbOffer, peerAddress: ByteArray): Flow<UwbResult> {
            val params = RangingParameters(
                uwbConfigType = RangingParameters.CONFIG_UNICAST_DS_TWR,
                sessionId = offer.sessionId,
                subSessionId = 0,
                sessionKeyInfo = offer.sessionKey,
                subSessionKeyInfo = null,
                complexChannel = UwbComplexChannel(offer.channel, offer.preamble),
                peerDevices = listOf(UwbDevice(UwbAddress(peerAddress))),
                updateRateType = RangingParameters.RANGING_UPDATE_RATE_AUTOMATIC,
            )
            return scope.prepareSession(params)
                .catch { throw translate(it) }
                .mapNotNull { result ->
                    when (result) {
                        is RangingResult.RangingResultPosition ->
                            UwbSamples.valid(result.position.distance?.value, result.position.azimuth?.value)
                        is RangingResult.RangingResultPeerDisconnected -> error("Peer disconnected")
                        else -> null
                    }
                }
        }
    }

    private suspend fun <T> wrap(block: suspend () -> T): T =
        try {
            block()
        } catch (e: Exception) {
            throw translate(e)
        }

    private fun translate(e: Throwable): Throwable = when (e) {
        is UwbHardwareNotAvailableException -> UwbDisabled(e.message ?: "UWB hardware not available")
        is UwbServiceNotAvailableException -> UwbUnsupported(e.message ?: "UWB service not available")
        else -> e
    }
}
