package com.lazydoglab.zhinzen.data

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Geo helpers mirroring packages/geo-utils (design.md §13). Keep behavior aligned
 * with the web so distances/bearings match across platforms.
 */
object Geo {
    private const val EARTH_RADIUS_M = 6_371_000.0

    /** Great-circle distance in meters (haversine). */
    fun distanceMeters(fromLat: Double, fromLng: Double, toLat: Double, toLng: Double): Double {
        val p1 = Math.toRadians(fromLat)
        val p2 = Math.toRadians(toLat)
        val dp = Math.toRadians(toLat - fromLat)
        val dl = Math.toRadians(toLng - fromLng)
        val a = sin(dp / 2) * sin(dp / 2) + cos(p1) * cos(p2) * sin(dl / 2) * sin(dl / 2)
        return EARTH_RADIUS_M * 2 * atan2(sqrt(a), sqrt(1 - a))
    }

    /** Initial bearing from→to, degrees 0=N clockwise (0..360). */
    fun bearingDegrees(fromLat: Double, fromLng: Double, toLat: Double, toLng: Double): Double {
        val p1 = Math.toRadians(fromLat)
        val p2 = Math.toRadians(toLat)
        val dl = Math.toRadians(toLng - fromLng)
        val y = sin(dl) * cos(p2)
        val x = cos(p1) * sin(p2) - sin(p1) * cos(p2) * cos(dl)
        return (Math.toDegrees(atan2(y, x)) + 360) % 360
    }

    /** Format meters per design.md §5.6: "<1km" rounded m, else km with 1 decimal. */
    fun formatDistance(meters: Double): String =
        if (meters >= 1000) "%.1f km".format(meters / 1000) else "${meters.toInt()} m"
}
