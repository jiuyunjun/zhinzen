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
 * A single phone cannot derive bearing-to-peer from BLE alone (no antenna array),
 * so direction is estimated heuristically: we bucket smoothed RSSI by the heading
 * the user was facing, and report the heading with the strongest signal. The user
 * turning/walking is what makes this converge — like a warmer/colder compass.
 */
class NearbyEstimator {
    private var smoothed = Double.NaN
    private val history = ArrayDeque<Pair<Long, Double>>()
    private val headingBuckets = DoubleArray(BUCKETS) { Double.NaN }

    fun reset() {
        smoothed = Double.NaN
        history.clear()
        for (i in headingBuckets.indices) headingBuckets[i] = Double.NaN
    }

    fun onSample(rssi: Int, headingDeg: Float?, nowMs: Long): NearbyEstimate {
        smoothed = if (smoothed.isNaN()) rssi.toDouble() else smoothed + SMOOTH_ALPHA * (rssi - smoothed)

        history.addLast(nowMs to smoothed)
        while (history.isNotEmpty() && nowMs - history.first().first > HISTORY_MS) history.removeFirst()

        if (headingDeg != null) {
            val b = (((headingDeg / (360f / BUCKETS)).toInt() % BUCKETS) + BUCKETS) % BUCKETS
            headingBuckets[b] =
                if (headingBuckets[b].isNaN()) smoothed else headingBuckets[b] + BUCKET_ALPHA * (smoothed - headingBuckets[b])
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
        val present = headingBuckets.withIndex().filter { !it.value.isNaN() }
        if (present.size < 3) return null
        val best = present.maxBy { it.value }
        val mean = present.map { it.value }.average()
        if (best.value - mean < BEST_HEADING_MARGIN) return null
        return best.index * (360f / BUCKETS) + (360f / BUCKETS) / 2f
    }

    companion object {
        private const val BUCKETS = 8
        private const val SMOOTH_ALPHA = 0.25
        private const val BUCKET_ALPHA = 0.3
        private const val HISTORY_MS = 6_000L
        private const val TREND_DELTA = 2.0 // dB
        private const val BEST_HEADING_MARGIN = 3.0 // dB above the mean
        private const val TX_POWER_AT_1M = -59.0
        private const val PATH_LOSS_N = 2.5 // indoor

        /** Rough path-loss distance in meters (clamped). Present as a range, not exact. */
        fun pathLossMeters(rssi: Double): Double =
            10.0.pow((TX_POWER_AT_1M - rssi) / (10.0 * PATH_LOSS_N)).coerceIn(0.3, 60.0)
    }
}
