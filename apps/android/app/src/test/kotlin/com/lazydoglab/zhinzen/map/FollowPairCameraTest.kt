package com.lazydoglab.zhinzen.map

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.tan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FollowPairCameraTest {
    private val scenarios = listOf(
        doubleArrayOf(35.68, 139.76, 35.681, 139.77),
        doubleArrayOf(35.68, 139.76, 36.3, 140.8),
        doubleArrayOf(35.0, 179.99, 35.01, -179.99),
        doubleArrayOf(78.0, 15.0, 79.0, 17.0),
    )

    @Test
    fun bothMarkersFitAfterRotationOnPortraitAndLandscapeScreens() {
        for ((w, h) in listOf(390.0 to 844.0, 844.0 to 390.0, 320.0 to 480.0)) {
            for (points in scenarios) {
                for (bearing in 0 until 360 step 15) {
                    val camera = fitFollowPair(points[0], points[1], points[2], points[3], w, h, bearing.toDouble())
                    for (i in listOf(0, 2)) {
                        val (x, y) = screen(points[i], points[i + 1], camera, w, h, bearing.toDouble())
                        val side = minOf(40.0, w * 0.1)
                        assertTrue("x=$x heading=$bearing", x >= side - 1e-6 && x <= w - side + 1e-6)
                        assertTrue("y=$y heading=$bearing",
                            y >= minOf(170.0, h * 0.28) - 1e-6 && y <= h - minOf(220.0, h * 0.32) + 1e-6)
                    }
                }
            }
        }
    }

    @Test
    fun distantPairCanZoomOutAndDateLineUsesShortestSpan() {
        assertTrue(fitFollowPair(35.68, 139.76, 36.3, 140.8, 390.0, 844.0, 0.0).zoom < 13)
        assertTrue(fitFollowPair(35.0, 179.99, 35.01, -179.99, 390.0, 844.0, 0.0).zoom > 10)
    }

    @Test
    fun coincidentLocationsAndZoomLimitStayFinite() {
        val camera = fitFollowPair(35.0, 139.0, 35.0, 139.0, 390.0, 844.0, 123.0)
        assertEquals(17.5, camera.zoom, 0.0)
        assertTrue(camera.lat.isFinite() && camera.lng.isFinite())
        assertEquals(10.0, fitFollowPair(35.68, 139.76, 35.681, 139.77, 390.0, 844.0, 91.0, 10.0).zoom, 0.0)
    }

    private fun screen(lat: Double, lng: Double, camera: PairCamera, w: Double, h: Double, bearing: Double): Pair<Double, Double> {
        fun y(value: Double) = -ln(tan(PI / 4 + value * PI / 360)) / (2 * PI)
        val scale = 256 * 2.0.pow(camera.zoom)
        val dx = ((lng - camera.lng + 540) % 360 - 180) / 360 * scale
        val dy = (y(lat) - y(camera.lat)) * scale
        val angle = bearing * PI / 180
        return (w / 2 + dx * cos(angle) + dy * sin(angle)) to
            (h / 2 - dx * sin(angle) + dy * cos(angle))
    }
}
