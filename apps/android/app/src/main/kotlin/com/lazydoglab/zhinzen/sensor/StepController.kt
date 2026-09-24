package com.lazydoglab.zhinzen.sensor

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.lazydoglab.zhinzen.nearby.StepDetector
import kotlin.math.sqrt
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/**
 * Step timestamps (System.currentTimeMillis) from the raw accelerometer, for walk-and-range
 * direction estimates (design.md §5.7.1). Uses the accelerometer rather than the step
 * detector sensor so no ACTIVITY_RECOGNITION permission is needed. Cold Flow.
 */
class StepController(context: Context) {
    private val sensorManager =
        context.applicationContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val accelerometer: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

    fun steps(): Flow<Long> = callbackFlow {
        val sensor = accelerometer
        if (sensor == null) {
            close()
            return@callbackFlow
        }
        val detector = StepDetector()
        val listener =
            object : SensorEventListener {
                override fun onSensorChanged(event: SensorEvent) {
                    val (x, y, z) = event.values
                    val now = System.currentTimeMillis()
                    if (detector.onAcceleration(now, sqrt(x * x + y * y + z * z))) trySend(now)
                }

                override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
            }
        sensorManager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_GAME)
        awaitClose { sensorManager.unregisterListener(listener) }
    }
}
