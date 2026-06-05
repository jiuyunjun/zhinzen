package com.lazydoglab.zhinzen.util

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * Small haptics helper. Short ticks for taps, distinct patterns for success and
 * error. Requires the VIBRATE permission. No-ops if the device has no vibrator.
 */
class Haptics(context: Context) {
    private val vibrator: Vibrator? =
        context.applicationContext.let { ctx ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
        }

    fun tap() = oneShot(12, 90)

    fun light() = oneShot(8, 60)

    fun success() = waveform(longArrayOf(0, 14, 50, 20))

    fun error() = waveform(longArrayOf(0, 28, 60, 28, 60, 28))

    private fun oneShot(ms: Long, amplitude: Int) {
        val v = vibrator?.takeIf { it.hasVibrator() } ?: return
        v.vibrate(VibrationEffect.createOneShot(ms, amplitude))
    }

    private fun waveform(timings: LongArray) {
        val v = vibrator?.takeIf { it.hasVibrator() } ?: return
        v.vibrate(VibrationEffect.createWaveform(timings, -1))
    }
}
