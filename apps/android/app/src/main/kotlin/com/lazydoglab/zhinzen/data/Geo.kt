package com.lazydoglab.zhinzen.data

import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.pow
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

    /** Web-Mercator ground resolution (meters per pixel) at a latitude + zoom. */
    fun metersPerPixel(lat: Double, zoom: Double): Double =
        156543.03392 * cos(Math.toRadians(lat)) / 2.0.pow(zoom)

    /**
     * Inverse of [metersPerPixel]: the zoom at which `meters` of ground spans
     * `pixels` on screen. Follow mode frames the pair by their enclosing circle
     * rather than a bounding box, because a north-aligned box breaks as soon as the
     * map is rotated heading-up (design.md §5.10).
     */
    fun zoomForMeters(lat: Double, meters: Double, pixels: Int): Double {
        if (meters <= 0 || pixels <= 0) return 21.0
        return ln(156543.03392 * cos(Math.toRadians(lat)) * pixels / meters) / ln(2.0)
    }

    /** The point `meters` away along `bearingDeg` (0 = north, clockwise), lat to lng. */
    fun destination(
        lat: Double,
        lng: Double,
        bearingDeg: Double,
        meters: Double,
    ): Pair<Double, Double> {
        val d = meters / EARTH_RADIUS_M
        val t = Math.toRadians(bearingDeg)
        val p1 = Math.toRadians(lat)
        val l1 = Math.toRadians(lng)
        val p2 = asin(sin(p1) * cos(d) + cos(p1) * sin(d) * cos(t))
        val l2 = l1 + atan2(sin(t) * sin(d) * cos(p1), cos(d) - sin(p1) * sin(p2))
        return Math.toDegrees(p2) to (((Math.toDegrees(l2) + 540) % 360) - 180)
    }
}
