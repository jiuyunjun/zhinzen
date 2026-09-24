package com.lazydoglab.zhinzen.nearby

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class UwbSessionTest {
    @Test
    fun invalidDistanceNeverReplacesFallback() {
        listOf(null, Float.NaN, Float.POSITIVE_INFINITY, -1f).forEach {
            assertNull(UwbSamples.valid(it, 10f))
        }
        assertEquals(UwbResult(0f, null), UwbSamples.valid(0f, Float.NaN))
        assertEquals(UwbResult(2f, null), UwbSamples.valid(2f, null))
        assertEquals(UwbResult(2f, -45f), UwbSamples.valid(2f, -45f))
    }

    @Test
    fun replacementDisposesOldSessionBeforeStartingNewOne() = runTest {
        val peers = MutableStateFlow<String?>("first")
        val events = mutableListOf<String>()
        val job = async {
            runUwbSessions(peers, { events.add("clear") }, {}, { testScheduler.currentTime }) { id, _ ->
                events.add("start:$id")
                try { awaitCancellation() } finally { events.add("stop:$id") }
            }
        }
        runCurrent()
        peers.value = "second"
        runCurrent()
        assertEquals(listOf("clear", "start:first", "stop:first", "clear", "start:second"), events)
        peers.value = null
        runCurrent()
        assertEquals(listOf("stop:second", "clear"), events.takeLast(2))
        job.cancelAndJoin()
    }

    @Test
    fun deletingLatestAttemptCannotReplayAnOldAcknowledgement() = runTest {
        val peers = MutableStateFlow<String?>("001")
        val started = mutableListOf<String>()
        val job = async {
            runUwbSessions(peers, {}, {}, { testScheduler.currentTime }) { id, _ ->
                started.add(id)
                awaitCancellation()
            }
        }
        runCurrent()
        peers.value = "002"
        runCurrent()
        peers.value = "001"
        runCurrent()
        assertEquals(listOf("001", "002"), started)
        job.cancelAndJoin()
    }

    @Test
    fun noPeerTimesOutAfterThirtySeconds() = runTest {
        supervisorScope {
            val job = async {
                runUwbSessions(MutableStateFlow(null), {}, {}, { testScheduler.currentTime }) { _, _ ->
                    fail("No peer should not start hardware")
                }
            }
            runCurrent()
            advanceTimeBy(29_999)
            assertFalse(job.isCompleted)
            advanceTimeBy(1)
            runCurrent()
            try { job.await(); fail("Expected timeout") } catch (_: UwbTimeout) { }
        }
    }

    @Test
    fun lostSignalTimesOutAndCancelsHardware() = runTest {
        supervisorScope {
            var disposed = false
            val job = async {
                runUwbSessions(MutableStateFlow("peer"), {}, {}, { testScheduler.currentTime }) { _, emit ->
                    emit(UwbResult(1f, null))
                    try { awaitCancellation() } finally { disposed = true }
                }
            }
            runCurrent()
            advanceTimeBy(8_000)
            runCurrent()
            try { job.await(); fail("Expected timeout") } catch (_: UwbTimeout) { }
            assertTrue(disposed)
        }
    }
}
