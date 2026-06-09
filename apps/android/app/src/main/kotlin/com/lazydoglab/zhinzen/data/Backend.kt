package com.lazydoglab.zhinzen.data

import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import com.lazydoglab.zhinzen.device.DeviceIdentity
import kotlinx.coroutines.tasks.await

/**
 * Firebase backend access, reusing the same project/functions as the web client.
 * Functions live in asia-northeast1; live locations in the named RTDB instance.
 */
object Backend {
    private const val RTDB_URL = "https://zhinzen-live.asia-southeast1.firebasedatabase.app"
    private const val REGION = "asia-northeast1"

    val firestore: FirebaseFirestore by lazy { FirebaseFirestore.getInstance() }
    val database: FirebaseDatabase by lazy { FirebaseDatabase.getInstance(RTDB_URL) }
    val functions: FirebaseFunctions by lazy { FirebaseFunctions.getInstance(REGION) }

    /** Initialize the SDK clients early so the first room call doesn't pay init cost. */
    fun warmUp() {
        firestore
        database
        functions
    }

    private fun payload(
        identity: DeviceIdentity,
        sharing: Boolean,
        capabilities: Map<String, Any>,
    ): HashMap<String, Any?> =
        hashMapOf(
            "deviceId" to identity.deviceId,
            "deviceSecret" to identity.deviceSecret,
            "displayName" to identity.displayName,
            "platform" to "android",
            "sharingLocation" to sharing,
            "capabilities" to capabilities,
        )

    /** Create a room via the createRoom callable. */
    suspend fun createRoom(
        identity: DeviceIdentity,
        sharing: Boolean,
        capabilities: Map<String, Any>,
    ): RoomResult {
        val result =
            functions.getHttpsCallable("createRoom").call(payload(identity, sharing, capabilities)).await()
        return roomResultFrom(result.getData())
    }

    /** Join an existing room via the joinRoom callable. */
    suspend fun joinRoom(
        identity: DeviceIdentity,
        roomId: String,
        sharing: Boolean,
        capabilities: Map<String, Any>,
    ): RoomResult {
        val data = payload(identity, sharing, capabilities).apply { put("roomId", roomId) }
        val result = functions.getHttpsCallable("joinRoom").call(data).await()
        return roomResultFrom(result.getData())
    }

    /** Owner-only: remove a member from the room. */
    suspend fun kickMember(identity: DeviceIdentity, roomId: String, targetDeviceId: String) {
        val data =
            hashMapOf(
                "roomId" to roomId,
                "deviceId" to identity.deviceId,
                "deviceSecret" to identity.deviceSecret,
                "targetDeviceId" to targetDeviceId,
            )
        functions.getHttpsCallable("kickMember").call(data).await()
    }

    /**
     * Append a track point straight to RTDB (no per-write cost; suits the
     * high-frequency append). Point id `{createdAt}_{rand}` so orderByKey is
     * chronological. Cleaned up per room on expiry (functions pruneExpiredRooms).
     */
    suspend fun appendTrackPoint(identity: DeviceIdentity, roomId: String, loc: LiveLocation) {
        val createdAt = loc.updatedAt
        val pointId = "${createdAt}_${java.util.UUID.randomUUID().toString().take(6)}"
        val point =
            hashMapOf<String, Any?>(
                "deviceId" to identity.deviceId,
                "lat" to loc.lat,
                "lng" to loc.lng,
                "accuracy" to loc.accuracy,
                "heading" to loc.heading,
                "speed" to loc.speed,
                "createdAt" to createdAt,
            )
        database.getReference("tracks/$roomId/${identity.deviceId}/$pointId").setValue(point).await()
    }

    /** Create a rally point (direct RTDB write). */
    suspend fun createRally(roomId: String, name: String, lat: Double, lng: Double, createdBy: String) {
        val ref = database.getReference("rallyPoints/$roomId").push()
        ref.setValue(
            hashMapOf(
                "name" to name,
                "lat" to lat,
                "lng" to lng,
                "createdByDeviceId" to createdBy,
                "createdAt" to System.currentTimeMillis(),
            ),
        ).await()
    }

    /** Send a poke / quick message (direct RTDB write). */
    suspend fun sendPoke(roomId: String, from: String, fromName: String, to: String, text: String) {
        val ref = database.getReference("pokes/$roomId").push()
        ref.setValue(
            hashMapOf(
                "from" to from,
                "fromName" to fromName,
                "to" to to,
                "text" to text,
                "createdAt" to System.currentTimeMillis(),
            ),
        ).await()
    }

    /** Delete a rally point (creator/owner gated in UI). */
    suspend fun deleteRally(roomId: String, id: String) {
        database.getReference("rallyPoints/$roomId/$id").removeValue().await()
    }

    /** Recent track points for a member since [sinceMs], ordered oldest→newest. */
    suspend fun fetchTrack(roomId: String, deviceId: String, sinceMs: Long): List<TrackPoint> {
        val snapshot =
            database.getReference("tracks/$roomId/$deviceId")
                .orderByKey()
                .startAt("${sinceMs}_")
                .get()
                .await()
        // orderByKey yields chronological order (createdAt-prefixed keys).
        return snapshot.children.mapNotNull { it.getValue(TrackPoint::class.java) }
    }

    private fun roomResultFrom(data: Any?): RoomResult {
        val map = data as? Map<*, *> ?: error("Unexpected room response")
        val roomId = map["roomId"] as? String ?: error("Missing roomId in response")
        return RoomResult(roomId, (map["createdByDeviceId"] as? String).orEmpty())
    }
}

/** Result of create/join: the room id and its creator (owner) device id. */
data class RoomResult(val roomId: String, val createdByDeviceId: String)
