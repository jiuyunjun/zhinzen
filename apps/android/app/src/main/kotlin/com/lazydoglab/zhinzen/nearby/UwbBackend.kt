package com.lazydoglab.zhinzen.nearby

import android.content.Context
import android.os.Build
import kotlinx.coroutines.flow.Flow

internal const val UWB_TAG = "ZhinzenUwb"

/** Session parameters the controller offers over RTDB; both backends use the same fields. */
internal class UwbOffer(
    val sessionId: Int,
    val sessionKey: ByteArray,
    val channel: Int,
    val preamble: Int,
)

/** One local UWB endpoint: its address is exchanged before ranging starts. */
internal interface UwbLocalSession {
    val address: ByteArray
    /** Channel/preamble this endpoint proposes (used only by the controller). */
    val channel: Int
    val preamble: Int
    /** Emits valid samples; completes or throws when the session ends. */
    fun range(offer: UwbOffer, peerAddress: ByteArray): Flow<UwbResult>
}

internal interface UwbBackend {
    val name: String
    val permission: String
    suspend fun controller(): UwbLocalSession
    suspend fun controlee(offer: UwbOffer): UwbLocalSession
}

/** Device has UWB hardware but no usable software path (e.g. China ROM without AOSP backend). */
internal class UwbUnsupported(message: String) : Exception(message)

/** UWB exists but the system has it switched off (user, regulation or policy). */
internal class UwbDisabled(message: String) : Exception(message)

internal object UwbBackends {
    fun select(context: Context): UwbBackend =
        if (Build.VERSION.SDK_INT >= 36) PlatformUwbBackend(context) else JetpackUwbBackend(context)
}
