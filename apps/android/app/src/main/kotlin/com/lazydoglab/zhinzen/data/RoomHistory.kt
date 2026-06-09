package com.lazydoglab.zhinzen.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Recently joined rooms, kept locally (mirrors the web's roomHistory). Newest
 * first, at most [MAX_ENTRIES].
 */
data class RoomHistoryEntry(
    val roomId: String,
    val lastJoinedAt: Long,
    /** Display names of the members seen in this room, for avatar previews. */
    val members: List<String> = emptyList(),
)

class RoomHistory(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun list(): List<RoomHistoryEntry> {
        val raw = prefs.getString(KEY, null) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { i ->
                val o = arr.optJSONObject(i) ?: return@mapNotNull null
                val id = o.optString("roomId").takeIf { it.isNotEmpty() } ?: return@mapNotNull null
                val membersArr = o.optJSONArray("members")
                val members =
                    if (membersArr != null) {
                        (0 until membersArr.length()).map { membersArr.optString(it) }
                    } else {
                        emptyList()
                    }
                RoomHistoryEntry(id, o.optLong("lastJoinedAt"), members)
            }.take(MAX_ENTRIES)
        }.getOrDefault(emptyList())
    }

    fun add(roomId: String): List<RoomHistoryEntry> {
        // Preserve previously captured members for this room until they're refreshed.
        val existing = list().firstOrNull { it.roomId == roomId }?.members ?: emptyList()
        val next =
            (listOf(RoomHistoryEntry(roomId, System.currentTimeMillis(), existing)) +
                list().filter { it.roomId != roomId }).take(MAX_ENTRIES)
        save(next)
        return next
    }

    /** Refresh the member-name preview for a room already in history. */
    fun updateMembers(roomId: String, members: List<String>): List<RoomHistoryEntry> {
        val current = list()
        if (current.none { it.roomId == roomId }) return current
        val next = current.map { if (it.roomId == roomId) it.copy(members = members) else it }
        save(next)
        return next
    }

    /** The pinned "family room" auto-entered on launch (device-local), or null. */
    fun familyRoom(): String? = prefs.getString(FAMILY_KEY, null)?.takeIf { it.isNotEmpty() }

    fun setFamilyRoom(roomId: String?) {
        prefs.edit().apply {
            if (roomId.isNullOrEmpty()) remove(FAMILY_KEY) else putString(FAMILY_KEY, roomId)
        }.apply()
    }

    fun remove(roomId: String): List<RoomHistoryEntry> {
        val next = list().filter { it.roomId != roomId }
        save(next)
        return next
    }

    private fun save(entries: List<RoomHistoryEntry>) {
        val arr = JSONArray()
        entries.forEach { entry ->
            val members = JSONArray()
            entry.members.forEach { members.put(it) }
            arr.put(
                JSONObject()
                    .put("roomId", entry.roomId)
                    .put("lastJoinedAt", entry.lastJoinedAt)
                    .put("members", members),
            )
        }
        prefs.edit().putString(KEY, arr.toString()).apply()
    }

    private companion object {
        const val PREFS = "zhinzen.roomHistory.v1"
        const val KEY = "entries"
        const val FAMILY_KEY = "familyRoom"
        const val MAX_ENTRIES = 10
    }
}
