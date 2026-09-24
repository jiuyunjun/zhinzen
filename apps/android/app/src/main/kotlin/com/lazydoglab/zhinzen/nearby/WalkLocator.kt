package com.lazydoglab.zhinzen.nearby

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.math.sqrt

enum class WalkDirectionState { NEED_WALK, TURN, UNSTABLE, READY }

/** [bearingDeg] is a compass bearing (0 = north, clockwise) from here to the peer; READY only. */
data class WalkDirection(val state: WalkDirectionState, val bearingDeg: Float? = null)

/**
 * Estimates where a (roughly stationary) UWB peer is from our own dead-reckoned walk plus
 * UWB distances, for devices without angle-of-arrival (design.md §5.7.1). Positions are
 * metres east (x) / north (y) of where tracking started. Not thread-safe; call from one thread.
 */
class WalkLocator(
    private val stepLengthMeters: Double = 0.7,
    private val windowMs: Long = 25_000,
) {
    private class Pose(val t: Long, val x: Double, val y: Double)
    private class Range(val t: Long, val d: Double)

    private val poses = ArrayList<Pose>()
    private val ranges = ArrayList<Range>()

    fun reset() {
        poses.clear()
        ranges.clear()
    }

    fun onStep(t: Long, headingDeg: Float) {
        val last = poses.lastOrNull() ?: Pose(t - STEP_MS, 0.0, 0.0).also(poses::add)
        // Standing still before this step: movement only spans this step, not the whole pause.
        if (t - last.t > PAUSE_MS) poses.add(Pose(t - STEP_MS, last.x, last.y))
        val rad = Math.toRadians(headingDeg.toDouble())
        poses.add(Pose(t, last.x + stepLengthMeters * sin(rad), last.y + stepLengthMeters * cos(rad)))
        prune(t)
    }

    fun onDistance(t: Long, meters: Float) {
        if (poses.isEmpty()) poses.add(Pose(t, 0.0, 0.0))
        ranges.add(Range(t, meters.toDouble()))
        prune(t)
    }

    fun estimate(): WalkDirection {
        val first = poses.firstOrNull() ?: return WalkDirection(WalkDirectionState.NEED_WALK)
        val usable = ranges.filter { it.t >= first.t }
        val xs = DoubleArray(usable.size)
        val ys = DoubleArray(usable.size)
        val ds = DoubleArray(usable.size)
        usable.forEachIndexed { i, r ->
            val (x, y) = positionAt(r.t)
            xs[i] = x
            ys[i] = y
            ds[i] = r.d
        }
        val here = poses.last()
        return WalkSolver.solve(xs, ys, ds, here.x, here.y)
    }

    private fun positionAt(t: Long): Pair<Double, Double> {
        if (t <= poses.first().t) return poses.first().let { it.x to it.y }
        for (i in 1 until poses.size) {
            val b = poses[i]
            if (t <= b.t) {
                val a = poses[i - 1]
                val f = if (b.t == a.t) 1.0 else (t - a.t).toDouble() / (b.t - a.t)
                return (a.x + (b.x - a.x) * f) to (a.y + (b.y - a.y) * f)
            }
        }
        return poses.last().let { it.x to it.y }
    }

    private fun prune(now: Long) {
        val cutoff = now - windowMs
        ranges.removeAll { it.t < cutoff }
        // Keep one pose at/before the cutoff as the interpolation anchor.
        while (poses.size >= 2 && poses[1].t <= cutoff) poses.removeAt(0)
    }

    private companion object {
        const val STEP_MS = 500L
        const val PAUSE_MS = 1_500L
    }
}

/** Multilateration against a walked path; see design.md §5.7.1 for the thresholds. */
internal object WalkSolver {
    const val MIN_SAMPLES = 8
    const val MIN_EXTENT_M = 1.5
    const val MIN_LATERAL_M = 0.3
    const val MAX_RMS_M = 0.8

    fun solve(xs: DoubleArray, ys: DoubleArray, ds: DoubleArray, fromX: Double, fromY: Double): WalkDirection {
        val n = xs.size
        if (n < MIN_SAMPLES || extent(xs, ys) < MIN_EXTENT_M) return WalkDirection(WalkDirectionState.NEED_WALK)

        // Principal axis of the path: u along it, v across it.
        val cx = xs.average()
        val cy = ys.average()
        var sxx = 0.0
        var syy = 0.0
        var sxy = 0.0
        for (i in 0 until n) {
            val dx = xs[i] - cx
            val dy = ys[i] - cy
            sxx += dx * dx
            syy += dy * dy
            sxy += dx * dy
        }
        val theta = 0.5 * atan2(2 * sxy, sxx - syy)
        val ux = cos(theta)
        val uy = sin(theta)
        val vx = -uy
        val vy = ux

        // 1-D fit along the path: d² − s² = −2·a·s + (a² + h²), a = along, h = off-path.
        val s = DoubleArray(n) { (xs[it] - cx) * ux + (ys[it] - cy) * uy }
        var lateral = 0.0
        for (i in 0 until n) {
            val l = (xs[i] - cx) * vx + (ys[i] - cy) * vy
            lateral += l * l
        }
        lateral = sqrt(lateral / n)
        val q = DoubleArray(n) { ds[it] * ds[it] - s[it] * s[it] }
        val sMean = s.average()
        val qMean = q.average()
        var cov = 0.0
        var varS = 0.0
        for (i in 0 until n) {
            cov += (s[i] - sMean) * (q[i] - qMean)
            varS += (s[i] - sMean) * (s[i] - sMean)
        }
        if (varS < 1e-9) return WalkDirection(WalkDirectionState.NEED_WALK)
        val slope = cov / varS
        val a = -slope / 2
        val h = sqrt((qMean - slope * sMean - a * a).coerceAtLeast(0.0))

        val left = refine(cx + a * ux + h * vx, cy + a * uy + h * vy, xs, ys, ds)
        val right = refine(cx + a * ux - h * vx, cy + a * uy - h * vy, xs, ys, ds)
        val best = if (left.rms <= right.rms) left else right
        val other = if (best === left) right else left
        if (best.rms > MAX_RMS_M) return WalkDirection(WalkDirectionState.UNSTABLE)

        // Both starting points converged to the same spot → no mirror ambiguity left.
        val agree = hypot(best.x - other.x, best.y - other.y) < 0.5
        if (!agree && (lateral < MIN_LATERAL_M || other.rms < best.rms * 1.5 + 0.02)) {
            return WalkDirection(WalkDirectionState.TURN)
        }
        val bearing = Math.toDegrees(atan2(best.x - fromX, best.y - fromY))
        return WalkDirection(WalkDirectionState.READY, ((bearing + 360) % 360).toFloat())
    }

    internal class Fit(val x: Double, val y: Double, val rms: Double)

    /** Gauss-Newton on Σ(|T − pᵢ| − dᵢ)². */
    internal fun refine(x0: Double, y0: Double, xs: DoubleArray, ys: DoubleArray, ds: DoubleArray): Fit {
        var tx = x0
        var ty = y0
        for (iter in 0 until 20) {
            var a11 = 0.0
            var a12 = 0.0
            var a22 = 0.0
            var b1 = 0.0
            var b2 = 0.0
            for (i in xs.indices) {
                val dx = tx - xs[i]
                val dy = ty - ys[i]
                val r = hypot(dx, dy).coerceAtLeast(1e-3)
                val jx = dx / r
                val jy = dy / r
                val e = r - ds[i]
                a11 += jx * jx
                a12 += jx * jy
                a22 += jy * jy
                b1 += jx * e
                b2 += jy * e
            }
            val det = a11 * a22 - a12 * a12
            if (kotlin.math.abs(det) < 1e-9) break
            val stepX = (a22 * b1 - a12 * b2) / det
            val stepY = (a11 * b2 - a12 * b1) / det
            tx -= stepX
            ty -= stepY
            if (hypot(stepX, stepY) < 1e-4) break
        }
        var sum = 0.0
        for (i in xs.indices) {
            val e = hypot(tx - xs[i], ty - ys[i]) - ds[i]
            sum += e * e
        }
        return Fit(tx, ty, sqrt(sum / xs.size))
    }

    private fun extent(xs: DoubleArray, ys: DoubleArray): Double {
        var max = 0.0
        for (i in xs.indices) for (j in i + 1 until xs.size) {
            max = maxOf(max, hypot(xs[i] - xs[j], ys[i] - ys[j]))
        }
        return max
    }
}

/** Accelerometer-magnitude step detector; avoids the ACTIVITY_RECOGNITION permission. */
class StepDetector {
    private var smoothed = Double.NaN
    private var gravity = Double.NaN
    private var armed = true
    private var lastStep = Long.MIN_VALUE / 2

    /** Returns true when [magnitude] (m/s², incl. gravity) at time [t] completes a step. */
    fun onAcceleration(t: Long, magnitude: Float): Boolean {
        val m = magnitude.toDouble()
        smoothed = if (smoothed.isNaN()) m else smoothed + 0.3 * (m - smoothed)
        gravity = if (gravity.isNaN()) m else gravity + 0.02 * (m - gravity)
        val dynamic = smoothed - gravity
        if (!armed && dynamic < 0.3) armed = true
        if (armed && dynamic > 1.2 && t - lastStep >= 280) {
            armed = false
            lastStep = t
            return true
        }
        return false
    }
}
