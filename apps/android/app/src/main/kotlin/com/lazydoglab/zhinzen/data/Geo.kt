package com.lazydoglab.zhinzen.data

import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** Exit point of a ray from a rectangle: screen position + pixel distance. */
data class RayExit(val x: Float, val y: Float, val distance: Float)

/** A follow-mode road scale: how far ahead the screen shows at a given speed. */
data class FollowRegime(val key: String, val rangeM: Double, val minSpeed: Double)

/**
 * Follow mode's road scale is set by *your own speed*, not by how far away your
 * friend is (design.md §5.10). Walking you want the next few streets; on the highway
 * you want the next few kilometers. Holding the scale steady is what makes the view
 * readable — chasing the target's distance with the zoom does not.
 */
val FOLLOW_REGIMES = listOf(
    FollowRegime("walk", 250.0, 0.0),
    FollowRegime("bike", 600.0, 3.0),
    FollowRegime("city", 1100.0, 8.0),
    FollowRegime("hwy", 2800.0, 18.0),
)

/**
 * Pick the road scale for a ground speed. [prev] adds hysteresis: a speed hovering on
 * a boundary would otherwise flip the scale back and forth every packet.
 */
fun followRegime(speedMps: Double, prev: String? = null): FollowRegime {
    val speed = if (speedMps.isFinite() && speedMps > 0) speedMps else 0.0
    val index = FOLLOW_REGIMES.indexOfLast { speed >= it.minSpeed }.coerceAtLeast(0)
    if (prev == null) return FOLLOW_REGIMES[index]
    val prevIndex = FOLLOW_REGIMES.indexOfFirst { it.key == prev }
    if (prevIndex < 0 || prevIndex == index) return FOLLOW_REGIMES[index]
    // Require a 25% overshoot past the boundary before changing scale.
    return if (index > prevIndex) {
        if (speed >= FOLLOW_REGIMES[prevIndex + 1].minSpeed * 1.25) FOLLOW_REGIMES[index]
        else FOLLOW_REGIMES[prevIndex]
    } else {
        if (speed <= FOLLOW_REGIMES[prevIndex].minSpeed * 0.75) FOLLOW_REGIMES[index]
        else FOLLOW_REGIMES[prevIndex]
    }
}

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

    /** The zoom at which one screen pixel covers [mpp] meters of ground. */
    fun zoomForMpp(lat: Double, mpp: Double): Double = zoomForMeters(lat, mpp, 1)

    /**
     * Where the ray from ([ox], [oy]) along ([dx], [dy]) leaves a rectangle, plus how
     * many pixels away that is. Follow mode uses it to know how much room the target
     * has before falling off screen, and to park the edge indicator on that boundary.
     */
    fun rayExit(
        ox: Float,
        oy: Float,
        dx: Float,
        dy: Float,
        left: Float,
        top: Float,
        right: Float,
        bottom: Float,
    ): RayExit {
        var s = Float.MAX_VALUE
        if (dx > 1e-6f) s = minOf(s, (right - ox) / dx)
        if (dx < -1e-6f) s = minOf(s, (left - ox) / dx)
        if (dy > 1e-6f) s = minOf(s, (bottom - oy) / dy)
        if (dy < -1e-6f) s = minOf(s, (top - oy) / dy)
        if (!s.isFinite() || s < 0f) s = 0f
        return RayExit(ox + dx * s, oy + dy * s, s)
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
