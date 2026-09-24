package com.lazydoglab.zhinzen.nearby

import kotlin.random.Random
import org.junit.Assert.*
import org.junit.Test

class UwbChannelsTest {
    @Test
    fun prefersChannel9WithJetpackCompatiblePreamble() {
        // Capabilities reported by Xiaomi 17 Ultra (dumpsys ranging).
        val preambles = listOf(9, 10, 11, 12, 25, 26, 27, 28, 29, 30, 31, 32)
        repeat(50) {
            val (channel, preamble) = UwbChannels.pick(listOf(9), preambles, Random(it))!!
            assertEquals(9, channel)
            assertTrue(preamble in 9..12)
        }
    }

    @Test
    fun fallsBackToChannel5() {
        assertEquals(5 to 10, UwbChannels.pick(listOf(5), listOf(10)))
    }

    @Test
    fun rejectsChannelsOrPreamblesJetpackPeersCannotUse() {
        assertNull(UwbChannels.pick(listOf(6, 8), listOf(9)))
        assertNull(UwbChannels.pick(listOf(9), listOf(25, 26)))
    }
}
