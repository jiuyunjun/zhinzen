package com.lazydoglab.zhinzen.data

/**
 * Data model mirroring packages/shared-types (design.md §6.2). All fields have
 * defaults so Firestore (.toObject) and Realtime Database (getValue) can
 * deserialize via the synthesized no-arg constructor.
 */
data class DeviceCapabilities(
    val location: Boolean = false,
    val imu: Boolean = false,
    val compass: Boolean = false,
    val uwb: Boolean = false,
    val ble: Boolean = false,
)

data class RoomMember(
    val deviceId: String = "",
    val displayName: String = "",
    val joinedAt: Long = 0,
    val lastSeenAt: Long = 0,
    val online: Boolean = false,
    val sharingLocation: Boolean = false,
    val platform: String = "web",
    val capabilities: DeviceCapabilities = DeviceCapabilities(),
)

data class LiveLocation(
    val deviceId: String = "",
    val displayName: String = "",
    val lat: Double = 0.0,
    val lng: Double = 0.0,
    val accuracy: Double = 0.0,
    val heading: Double? = null,
    val speed: Double = 0.0,
    val updatedAt: Long = 0,
    val sharingLocation: Boolean = true,
    val battery: Int? = null,
)

data class RallyPoint(
    val id: String = "",
    val name: String = "",
    val lat: Double = 0.0,
    val lng: Double = 0.0,
    val createdByDeviceId: String = "",
    val createdAt: Long = 0,
)

data class TrackPoint(
    val lat: Double = 0.0,
    val lng: Double = 0.0,
    val speed: Double = 0.0,
    val createdAt: Long = 0,
)

enum class MemberStatus { ONLINE, OFFLINE, STALE, NOT_SHARING }

/** A member combined with their live location and derived presence (UI shape). */
data class MemberView(
    val member: RoomMember,
    val location: LiveLocation?,
    val status: MemberStatus,
    val isSelf: Boolean,
)

private const val STALE_MS = 60_000L

fun deriveStatus(member: RoomMember, location: LiveLocation?, now: Long = System.currentTimeMillis()): MemberStatus =
    when {
        !member.online -> MemberStatus.OFFLINE
        !member.sharingLocation || location?.sharingLocation == false -> MemberStatus.NOT_SHARING
        location == null || now - location.updatedAt > STALE_MS -> MemberStatus.STALE
        else -> MemberStatus.ONLINE
    }
