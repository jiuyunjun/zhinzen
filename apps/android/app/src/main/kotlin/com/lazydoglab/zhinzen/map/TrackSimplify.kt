package com.lazydoglab.zhinzen.map

import com.google.android.gms.maps.model.LatLng
import com.lazydoglab.zhinzen.data.TrackPoint
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/** A renderable run of the track sharing one speed-bucket color. */
data class TrackSegment(val path: List<LatLng>, val bucket: Int)

/**
 * Track render optimization (mirrors @zhinzen/geo-utils.buildTrackSegments):
 * 1) simplify points by zoom (drop sub-pixel detail when zoomed out), and
 * 2) quantize speed into color buckets + merge consecutive same-bucket runs into
 *    one polyline. Turns O(N) per-segment polylines into O(color runs).
 */
object TrackSimplify {
    private const val BUCKET_KMH = 8.0
    private const val MAX_BUCKET = 8
    private const val EARTH_RADIUS_M = 6_371_000.0

    fun speedBucket(speedMps: Double): Int {
        val kmh = if (speedMps.isFinite()) max(0.0, speedMps * 3.6) else 0.0
        return min((kmh / BUCKET_KMH).roundToInt(), MAX_BUCKET)
    }

    /** Representative speed (m/s) at the center of a bucket, for coloring. */
    fun bucketSpeedMps(bucket: Int): Double = bucket * BUCKET_KMH / 3.6

    private fun metersPerPixel(lat: Double, zoom: Float): Double =
        156543.03392 * cos(lat * PI / 180.0) / 2.0.pow(zoom.toDouble())

    fun buildSegments(points: List<TrackPoint>, zoom: Float, pixelTolerance: Double = 2.5): List<TrackSegment> {
        val ordered = points.filter { it.lat.isFinite() && it.lng.isFinite() }
        if (ordered.size < 2) return emptyList()
        val midLat = ordered[ordered.size / 2].lat
        val tolerance = max(0.5, metersPerPixel(midLat, zoom) * pixelTolerance)
        val simplified = simplify(ordered, tolerance)

        val segments = ArrayList<TrackSegment>()
        for (i in 1 until simplified.size) {
            val a = simplified[i - 1]
            val b = simplified[i]
            val bucket = speedBucket((a.speed + b.speed) / 2.0)
            val last = segments.lastOrNull()
            if (last != null && last.bucket == bucket) {
                segments[segments.size - 1] = last.copy(path = last.path + LatLng(b.lat, b.lng))
            } else {
                segments.add(TrackSegment(listOf(LatLng(a.lat, a.lng), LatLng(b.lat, b.lng)), bucket))
            }
        }
        return segments
    }

    /** Ramer–Douglas–Peucker on an equirectangular projection (meters). */
    private fun simplify(points: List<TrackPoint>, tolerance: Double): List<TrackPoint> {
        if (points.size <= 2) return points
        val lat0 = points[0].lat * PI / 180.0
        val projected =
            points.map { p ->
                doubleArrayOf(
                    (p.lng * PI / 180.0) * cos(lat0) * EARTH_RADIUS_M,
                    (p.lat * PI / 180.0) * EARTH_RADIUS_M,
                )
            }
        val keep = BooleanArray(points.size)
        keep[0] = true
        keep[points.size - 1] = true
        val stack = ArrayDeque<Pair<Int, Int>>()
        stack.addLast(0 to points.size - 1)
        while (stack.isNotEmpty()) {
            val (start, end) = stack.removeLast()
            var maxDist = -1.0
            var index = -1
            for (i in start + 1 until end) {
                val d = perpendicular(projected[i], projected[start], projected[end])
                if (d > maxDist) {
                    maxDist = d
                    index = i
                }
            }
            if (maxDist > tolerance && index != -1) {
                keep[index] = true
                stack.addLast(start to index)
                stack.addLast(index to end)
            }
        }
        return points.filterIndexed { i, _ -> keep[i] }
    }

    private fun perpendicular(p: DoubleArray, a: DoubleArray, b: DoubleArray): Double {
        val dx = b[0] - a[0]
        val dy = b[1] - a[1]
        val lenSq = dx * dx + dy * dy
        if (lenSq == 0.0) return hypot(p[0] - a[0], p[1] - a[1])
        val t = (((p[0] - a[0]) * dx) + ((p[1] - a[1]) * dy)) / lenSq
        val c = t.coerceIn(0.0, 1.0)
        return hypot(p[0] - (a[0] + c * dx), p[1] - (a[1] + c * dy))
    }
}
