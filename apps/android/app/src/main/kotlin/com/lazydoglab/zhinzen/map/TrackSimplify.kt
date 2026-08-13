package com.lazydoglab.zhinzen.map

import com.google.android.gms.maps.model.LatLng
import com.lazydoglab.zhinzen.data.Geo
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

    /**
     * Points more than this far apart in time are treated as separate runs and not
     * joined by a line — so closing/reopening the app shows as a break in the track,
     * not one long straight segment. Comfortably above the ~20s heartbeat.
     */
    private const val GAP_BREAK_MS = 90_000L

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

        // Split into time-contiguous runs; each is simplified + colored on its own and
        // runs are never merged, leaving a visible break across the gap.
        val segments = ArrayList<TrackSegment>()
        var runStart = 0
        for (i in 1..ordered.size) {
            val broke = i == ordered.size || ordered[i].createdAt - ordered[i - 1].createdAt > GAP_BREAK_MS
            if (!broke) continue
            appendRunSegments(segments, ordered.subList(runStart, i), zoom, pixelTolerance)
            runStart = i
        }
        return segments
    }

    /** Simplify + color one time-contiguous run, appending its segments to [out]. */
    private fun appendRunSegments(
        out: ArrayList<TrackSegment>,
        run: List<TrackPoint>,
        zoom: Float,
        pixelTolerance: Double,
    ) {
        if (run.size < 2) return
        // GPS Doppler speed is often missing (reported as 0) even while moving, which would
        // color the whole run red. Fall back to ground speed from consecutive-point
        // distance / time so a moving track is colored by how fast it actually traveled.
        // A median-of-3 pass removes single-sample spikes that would otherwise flip color
        // buckets back and forth and fragment the track into many tiny polylines.
        val smoothed =
            smoothSpeeds(run.mapIndexed { i, p -> effectiveSpeed(if (i > 0) run[i - 1] else null, p) })
        val withSpeed = run.mapIndexed { i, p -> p.copy(speed = smoothed[i]) }
        val midLat = withSpeed[withSpeed.size / 2].lat
        val tolerance = max(0.5, metersPerPixel(midLat, zoom) * pixelTolerance)
        val simplified = simplify(withSpeed, tolerance)

        // A fresh run must not merge into the previous run's trailing segment.
        val runHead = out.size
        for (i in 1 until simplified.size) {
            val a = simplified[i - 1]
            val b = simplified[i]
            val bucket = speedBucket((a.speed + b.speed) / 2.0)
            val last = if (out.size > runHead) out.last() else null
            if (last != null && last.bucket == bucket) {
                out[out.size - 1] = last.copy(path = last.path + LatLng(b.lat, b.lng))
            } else {
                out.add(TrackSegment(listOf(LatLng(a.lat, a.lng), LatLng(b.lat, b.lng)), bucket))
            }
        }
    }

    /** Median-of-3 smoothing; endpoints unchanged. Tames single-sample speed spikes. */
    private fun smoothSpeeds(speeds: List<Double>): List<Double> {
        if (speeds.size < 3) return speeds
        val out = speeds.toMutableList()
        for (i in 1 until speeds.size - 1) {
            val a = speeds[i - 1]
            val b = speeds[i]
            val c = speeds[i + 1]
            out[i] = max(min(a, b), min(max(a, b), c))
        }
        return out
    }

    /**
     * Ground speed (m/s) for a track point: the reported GPS speed when present,
     * otherwise derived from distance / time since the previous point.
     */
    private fun effectiveSpeed(prev: TrackPoint?, cur: TrackPoint): Double {
        if (cur.speed.isFinite() && cur.speed > 0.0) return cur.speed
        if (prev == null) return 0.0
        val dtSec = (cur.createdAt - prev.createdAt) / 1000.0
        if (dtSec <= 0.0) return 0.0
        return Geo.distanceMeters(prev.lat, prev.lng, cur.lat, cur.lng) / dtSec
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
