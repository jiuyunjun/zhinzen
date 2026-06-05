package com.lazydoglab.zhinzen.util

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

/**
 * Real device capabilities reported to the backend member record (design.md
 * §5.7–5.8). UWB needs a hardware feature + Android 12+; BLE is near-universal.
 * These drive the cross-platform "UWB ready / Bluetooth" capability chips and
 * gate the (planned) near-distance ranging.
 */
object DeviceCapabilities {
    fun detect(context: Context): HashMap<String, Any> {
        val pm = context.packageManager
        val uwb = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && pm.hasSystemFeature("android.hardware.uwb")
        val ble = pm.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)
        return hashMapOf(
            "location" to true,
            "imu" to true,
            "compass" to true,
            "uwb" to uwb,
            "ble" to ble,
        )
    }
}
