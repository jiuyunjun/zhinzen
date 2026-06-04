package com.zhinzen.app.device

import android.content.Context
import java.security.SecureRandom
import java.util.UUID

/**
 * Device-as-user identity (design.md §2.2). A deviceId + deviceSecret are
 * generated once and persisted in SharedPreferences; only displayName is
 * user-editable. deviceSecret is never shown or sent to peers — it backs
 * server-side write validation in later (Firebase) increments.
 */
data class DeviceIdentity(
    val deviceId: String,
    val deviceSecret: String,
    val displayName: String,
)

class DeviceIdentityStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun loadOrCreate(): DeviceIdentity {
        val existingId = prefs.getString(KEY_ID, null)
        val existingSecret = prefs.getString(KEY_SECRET, null)
        if (existingId != null && existingSecret != null) {
            return DeviceIdentity(existingId, existingSecret, prefs.getString(KEY_NAME, "") ?: "")
        }
        val created =
            DeviceIdentity(
                deviceId = UUID.randomUUID().toString(),
                deviceSecret = randomHex(32),
                displayName = "",
            )
        prefs.edit()
            .putString(KEY_ID, created.deviceId)
            .putString(KEY_SECRET, created.deviceSecret)
            .putString(KEY_NAME, created.displayName)
            .apply()
        return created
    }

    fun saveDisplayName(name: String) {
        prefs.edit().putString(KEY_NAME, name.trim()).apply()
    }

    private fun randomHex(bytes: Int): String {
        val buf = ByteArray(bytes)
        SecureRandom().nextBytes(buf)
        return buf.joinToString("") { "%02x".format(it) }
    }

    companion object {
        private const val PREFS = "zhinzen.device.v1"
        private const val KEY_ID = "deviceId"
        private const val KEY_SECRET = "deviceSecret"
        private const val KEY_NAME = "displayName"
    }
}
