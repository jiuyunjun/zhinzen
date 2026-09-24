package com.lazydoglab.zhinzen.nearby

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.random.Random
import org.junit.Assert.*
import org.junit.Test

class WalkLocatorTest {
    private val step = 0.7

    /** Walks [headings] one step per 500 ms, ranging every 250 ms to a peer at ([px], [py]). */
    private fun walk(
        headings: List<Float>,
        px: Double,
        py: Double,
        noise: Double = 0.05,
        peerJitter: Double = 0.0,
        seed: Int = 1,
        trueStep: Double = step,
    ): WalkDirection {
        val random = Random(seed)
        val locator = WalkLocator(stepLengthMeters = step)
        val waypoints = mutableListOf(Triple(0L, 0.0, 0.0))
        headings.forEachIndexed { i, h ->
            val (_, x, y) = waypoints.last()
            val rad = Math.toRadians(h.toDouble())
            waypoints.add(Triple((i + 1) * 500L, x + trueStep * sin(rad), y + trueStep * cos(rad)))
        }
        val end = waypoints.last().first
        var t = 0L
        var next = 1
        while (t <= end) {
            while (next < waypoints.size && waypoints[next].first <= t) {
                locator.onStep(waypoints[next].first, headings[next - 1])
                next++
            }
            val (x, y) = truePosition(waypoints, t)
            val jx = px + (random.nextDouble() - 0.5) * 2 * peerJitter
            val jy = py + (random.nextDouble() - 0.5) * 2 * peerJitter
            val d = hypot(jx - x, jy - y) + (random.nextDouble() - 0.5) * 2 * noise
            locator.onDistance(t, d.toFloat())
            t += 250
        }
        return locator.estimate()
    }

    private fun truePosition(w: List<Triple<Long, Double, Double>>, t: Long): Pair<Double, Double> {
        for (i in 1 until w.size) {
            if (t <= w[i].first) {
                val f = (t - w[i - 1].first).toDouble() / (w[i].first - w[i - 1].first)
                return (w[i - 1].second + (w[i].second - w[i - 1].second) * f) to
                    (w[i - 1].third + (w[i].third - w[i - 1].third) * f)
            }
        }
        return w.last().second to w.last().third
    }

    private fun bearingError(
        result: WalkDirection,
        headings: List<Float>,
        px: Double,
        py: Double,
        trueStep: Double = step,
    ): Double {
        var x = 0.0
        var y = 0.0
        headings.forEach {
            x += trueStep * sin(Math.toRadians(it.toDouble()))
            y += trueStep * cos(Math.toRadians(it.toDouble()))
        }
        val truth = (Math.toDegrees(atan2(px - x, py - y)) + 360) % 360
        return abs(((result.bearingDeg!! - truth + 540) % 360) - 180)
    }

    @Test
    fun turningWalkFindsPeerBearing() {
        val path = List(6) { 0f } + List(6) { 90f } // north, then east
        listOf(-2.0 to 4.0, 6.0 to 1.0, 2.0 to 8.0).forEachIndexed { i, (px, py) ->
            val result = walk(path, px, py, seed = i)
            assertEquals(WalkDirectionState.READY, result.state)
            assertTrue("bearing error for $px,$py", bearingError(result, path, px, py) < 10)
        }
    }

    @Test
    fun wrongStepLengthStillGivesUsableBearing() {
        val path = List(6) { 0f } + List(6) { 90f }
        val result = walk(path, -2.0, 4.0, trueStep = 0.6)
        assertEquals(WalkDirectionState.READY, result.state)
        val error = bearingError(result, path, -2.0, 4.0, trueStep = 0.6)
        assertTrue("error=$error", error < 25)
    }

    @Test
    fun straightWalkCannotTellLeftFromRight() {
        val result = walk(List(12) { 0f }, 2.0, 3.0)
        assertEquals(WalkDirectionState.TURN, result.state)
        assertNull(result.bearingDeg)
    }

    @Test
    fun standingStillNeedsAWalk() {
        assertEquals(WalkDirectionState.NEED_WALK, walk(List(1) { 0f }, 3.0, 3.0).state)
        assertEquals(WalkDirectionState.NEED_WALK, WalkLocator().estimate().state)
    }

    @Test
    fun movingPeerIsReportedUnstable() {
        val path = List(6) { 0f } + List(6) { 90f }
        val result = walk(path, 3.0, 4.0, peerJitter = 3.0)
        assertEquals(WalkDirectionState.UNSTABLE, result.state)
    }

    @Test
    fun stepDetectorCountsWalkingAndIgnoresNoise() {
        val walking = StepDetector()
        var steps = 0
        for (i in 0 until 250) { // 5 s at 50 Hz, 2 steps/s
            val t = i * 20L
            val m = 9.81 + 2.5 * sin(2 * Math.PI * 2.0 * t / 1000.0)
            if (walking.onAcceleration(t, m.toFloat())) steps++
        }
        assertTrue("steps=$steps", steps in 9..11)

        val still = StepDetector()
        val random = Random(7)
        repeat(250) { i ->
            assertFalse(still.onAcceleration(i * 20L, (9.81 + (random.nextDouble() - 0.5) * 0.4).toFloat()))
        }
    }
}
