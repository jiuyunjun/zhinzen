package com.lazydoglab.zhinzen.data

import java.security.SecureRandom

/**
 * Room identifiers (design.md §2.3, §11.1), mirroring the web's roomCode.ts:
 * high-entropy Crockford base32 codes that double as the shareable join code.
 */
object RoomCode {
    private const val ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
    private const val CODE_LEN = 10

    fun generate(): String {
        val buf = ByteArray(CODE_LEN)
        SecureRandom().nextBytes(buf)
        return buildString {
            for (b in buf) append(ALPHABET[(b.toInt() and 0xFF) % ALPHABET.length])
        }
    }

    /** Group in fours for display: "7K2Q-9XF3-MN". */
    fun format(roomId: String): String = roomId.chunked(4).joinToString("-")

    /** Extract a normalized code from an invite link or raw code; null if empty. */
    fun parse(input: String): String? {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) return null
        val afterLink = Regex("/r/([^/?#\\s]+)", RegexOption.IGNORE_CASE).find(trimmed)
        val candidate = afterLink?.groupValues?.get(1) ?: trimmed
        val normalized = candidate.uppercase().filter { ALPHABET.contains(it) }
        return normalized.ifEmpty { null }
    }

    fun inviteLink(roomId: String): String = "https://zhinzen.lazydoglab.com/r/$roomId"
}
