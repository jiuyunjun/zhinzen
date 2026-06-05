package com.lazydoglab.zhinzen.sensor

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/**
 * Device compass heading (degrees, 0 = north, clockwise) from the rotation-vector
 * sensor, low-pass smoothed. Mirrors the web sensorStore. Emits a cold Flow.
 */
class CompassController(context: Context) {
    private val sensorManager =
        context.applicationContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val rotationSensor: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)

    fun isAvailable(): Boolean = rotationSensor != null

    fun headings(): Flow<Float> = callbackFlow {
        val sensor = rotationSensor
        if (sensor == null) {
            close()
            return@callbackFlow
        }

        val rotation = FloatArray(9)
        val orientation = FloatArray(3)
        var smoothed = Float.NaN

        val listener =
            object : SensorEventListener {
                override fun onSensorChanged(event: SensorEvent) {
                    SensorManager.getRotationMatrixFromVector(rotation, event.values)
                    SensorManager.getOrientation(rotation, orientation)
                    val raw = ((Math.toDegrees(orientation[0].toDouble()).toFloat()) + 360f) % 360f
                    smoothed =
                        if (smoothed.isNaN()) {
                            raw
                        } else {
                            val delta = ((raw - smoothed + 540f) % 360f) - 180f
                            (smoothed + SMOOTHING_ALPHA * delta + 360f) % 360f
                        }
                    trySend(smoothed)
                }

                override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
            }

        sensorManager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_UI)
        awaitClose { sensorManager.unregisterListener(listener) }
    }

    private companion object {
        const val SMOOTHING_ALPHA = 0.15f
    }
}
