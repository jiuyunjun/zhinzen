package com.lazydoglab.zhinzen.nearby

import kotlin.math.pow
import kotlin.math.roundToInt

enum class NearbyTrend { CLOSER, FARTHER, STEADY }

/**
 * One snapshot of the near-distance estimate for the selected peer.
 * - [rssi]: smoothed RSSI in dBm.
 * - [distanceMeters]: very rough path-loss estimate (shown as a RANGE, never exact).
 * - [trend]: getting closer / farther based on the recent RSSI slope.
 * - [bestHeadingDeg]: the absolute compass heading (0=N) at which the signal has
 *   been strongest so far — an IMU+RSSI "warmer this way" hint. Null until the
 *   user has turned/walked enough to sample several directions.
 */
data class NearbyEstimate(
    val rssi: Int,
    val distanceMeters: Double,
    val trend: NearbyTrend,
    val bestHeadingDeg: Float?,
)

/**
 * Fuses BLE RSSI + the device compass to guide "find each other" indoors.
 *
 * A single phone has no antenna array, so absolute bearing isn't directly
 * measurable. We approximate it by exploiting body shadowing: 2.4 GHz is absorbed
 * by your body, so when you face the peer (phone between you and them) the signal
 * is relatively stronger than when you face away. The naive version is confounded
 * by distance changing as you move, so we DETREND first: subtract a slow RSSI
 * baseline (the distance component) and bucket only the residual by heading. The
 * heading with the highest residual ≈ the direction to the peer. Converges as the
 * user turns/walks; treat it as a rough hint, not a precise pointer (UWB is that).
 */
class NearbyEstimator {
    private var smoothed = Double.NaN
    private var baseline = Double.NaN
    private val history = ArrayDeque<Pair<Long, Double>>()
    private val headingBuckets = DoubleArray(BUCKETS) { Double.NaN }

    fun reset() {
        smoothed = Double.NaN
        baseline = Double.NaN
        history.clear()
        for (i in headingBuckets.indices) headingBuckets[i] = Double.NaN
    }

    fun onSample(rssi: Int, headingDeg: Float?, nowMs: Long): NearbyEstimate {
        smoothed = if (smoothed.isNaN()) rssi.toDouble() else smoothed + SMOOTH_ALPHA * (rssi - smoothed)
        // Slow baseline tracks the distance-driven RSSI level; the residual is what's
        // left over (mostly heading-dependent body shadowing).
        baseline = if (baseline.isNaN()) smoothed else baseline + BASELINE_ALPHA * (smoothed - baseline)
        val residual = smoothed - baseline

        history.addLast(nowMs to smoothed)
        while (history.isNotEmpty() && nowMs - history.first().first > HISTORY_MS) history.removeFirst()

        if (headingDeg != null) {
            val b = (((headingDeg / (360f / BUCKETS)).toInt() % BUCKETS) + BUCKETS) % BUCKETS
            headingBuckets[b] =
                if (headingBuckets[b].isNaN()) residual else headingBuckets[b] + BUCKET_ALPHA * (residual - headingBuckets[b])
        }

        return NearbyEstimate(
            rssi = smoothed.roundToInt(),
            distanceMeters = pathLossMeters(smoothed),
            trend = computeTrend(),
            bestHeadingDeg = bestHeading(),
        )
    }

    private fun computeTrend(): NearbyTrend {
        if (history.size < 4) return NearbyTrend.STEADY
        val mid = history.size / 2
        val older = history.take(mid).map { it.second }.average()
        val newer = history.drop(mid).map { it.second }.average()
        return when {
            newer - older >= TREND_DELTA -> NearbyTrend.CLOSER
            older - newer >= TREND_DELTA -> NearbyTrend.FARTHER
            else -> NearbyTrend.STEADY
        }
    }

    private fun bestHeading(): Float? {
        // Need decent angular coverage (user has turned/walked) before trusting it.
        val present = headingBuckets.withIndex().filter { !it.value.isNaN() }
        if (present.size < 4) return null
        val best = present.maxBy { it.value }
        val mean = present.map { it.value }.average()
        // The strongest direction must stand out from the average residual.
        if (best.value - mean < BEST_HEADING_MARGIN) return null
        return best.index * (360f / BUCKETS) + (360f / BUCKETS) / 2f
    }

    companion object {
        private const val BUCKETS = 8
        private const val SMOOTH_ALPHA = 0.25
        private const val BASELINE_ALPHA = 0.05 // slow: tracks distance, not heading
        private const val BUCKET_ALPHA = 0.3
        private const val HISTORY_MS = 6_000L
        private const val TREND_DELTA = 2.0 // dB
        private const val BEST_HEADING_MARGIN = 1.5 // dB of residual above the mean
        private const val TX_POWER_AT_1M = -59.0
        private const val PATH_LOSS_N = 2.5 // indoor

        /** Rough path-loss distance in meters (clamped). Present as a range, not exact. */
        fun pathLossMeters(rssi: Double): Double =
            10.0.pow((TX_POWER_AT_1M - rssi) / (10.0 * PATH_LOSS_N)).coerceIn(0.3, 60.0)
    }
}
