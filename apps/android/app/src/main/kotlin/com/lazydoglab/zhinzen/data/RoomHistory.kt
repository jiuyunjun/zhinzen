package com.lazydoglab.zhinzen.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Recently joined rooms, kept locally (mirrors the web's roomHistory). Newest
 * first, at most [MAX_ENTRIES].
 */
data class RoomHistoryEntry(val roomId: String, val lastJoinedAt: Long)

class RoomHistory(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun list(): List<RoomHistoryEntry> {
        val raw = prefs.getString(KEY, null) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { i ->
                val o = arr.optJSONObject(i) ?: return@mapNotNull null
                val id = o.optString("roomId").takeIf { it.isNotEmpty() } ?: return@mapNotNull null
                RoomHistoryEntry(id, o.optLong("lastJoinedAt"))
            }.take(MAX_ENTRIES)
        }.getOrDefault(emptyList())
    }

    fun add(roomId: String): List<RoomHistoryEntry> {
        val next =
            (listOf(RoomHistoryEntry(roomId, System.currentTimeMillis())) +
                list().filter { it.roomId != roomId }).take(MAX_ENTRIES)
        save(next)
        return next
    }

    fun remove(roomId: String): List<RoomHistoryEntry> {
        val next = list().filter { it.roomId != roomId }
        save(next)
        return next
    }

    private fun save(entries: List<RoomHistoryEntry>) {
        val arr = JSONArray()
        entries.forEach { arr.put(JSONObject().put("roomId", it.roomId).put("lastJoinedAt", it.lastJoinedAt)) }
        prefs.edit().putString(KEY, arr.toString()).apply()
    }

    private companion object {
        const val PREFS = "zhinzen.roomHistory.v1"
        const val KEY = "entries"
        const val MAX_ENTRIES = 10
    }
}
