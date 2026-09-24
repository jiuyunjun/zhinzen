package com.lazydoglab.zhinzen.nearby

import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch

internal class UwbTimeout : Exception()

/** Owns replacement/cancellation and timeouts independently of hardware and Firebase. */
internal suspend fun runUwbSessions(
    peerAttempts: Flow<String?>,
    onWaiting: () -> Unit,
    onSample: (UwbResult) -> Unit,
    now: () -> Long = { System.nanoTime() / 1_000_000 },
    range: suspend (String, (UwbResult) -> Unit) -> Unit,
) = coroutineScope {
    var lastSample = now()
    var receivedSample = false
    var newestAttempt: String? = null
    val watchdog = launch {
        while (true) {
            delay(1_000)
            val limit = if (receivedSample) 8_000 else 30_000
            if (now() - lastSample >= limit) throw UwbTimeout()
        }
    }
    try {
        peerAttempts.distinctUntilChanged().collectLatest { attempt ->
            onWaiting()
            lastSample = now()
            receivedSample = false
            // Removing the latest Firebase push node may expose an older leftover.
            // Never reuse an exchange (and its old acknowledgement) after replacement.
            if (attempt == null || newestAttempt?.let { attempt <= it } == true) return@collectLatest
            newestAttempt = attempt
            range(attempt) { sample ->
                lastSample = now()
                receivedSample = true
                onSample(sample)
            }
            error("Ranging ended")
        }
    } finally {
        watchdog.cancel()
    }
}
