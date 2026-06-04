package com.lazydoglab.zhinzen

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.DatabaseReference
import com.google.firebase.database.ValueEventListener
import com.google.firebase.firestore.ListenerRegistration
import com.lazydoglab.zhinzen.data.Backend
import com.lazydoglab.zhinzen.data.LiveLocation
import com.lazydoglab.zhinzen.data.MemberStatus
import com.lazydoglab.zhinzen.data.MemberView
import com.lazydoglab.zhinzen.data.RoomCode
import com.lazydoglab.zhinzen.data.RoomMember
import com.lazydoglab.zhinzen.data.deriveStatus
import com.lazydoglab.zhinzen.device.DeviceIdentity
import com.lazydoglab.zhinzen.device.DeviceIdentityStore
import com.lazydoglab.zhinzen.location.LocationController
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

enum class Phase { Onboarding, Room, Map }

/**
 * App state + backend orchestration. Mirrors the web's device/room/members/
 * location stores: create/join call the same Cloud Functions, live location goes
 * to RTDB, and members are merged from Firestore + RTDB.
 */
class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val identityStore = DeviceIdentityStore(application)
    private val identity = identityStore.loadOrCreate()
    private val locationController = LocationController(application)

    val deviceId: String = identity.deviceId

    var displayName by mutableStateOf(identity.displayName)
        private set
    var roomId by mutableStateOf<String?>(null)
        private set
    var phase by mutableStateOf(if (identity.displayName.isBlank()) Phase.Onboarding else Phase.Room)
        private set
    var busy by mutableStateOf(false)
        private set
    var errorMessage by mutableStateOf<String?>(null)
        private set
    var sharing by mutableStateOf(true)
        private set
    var ownLocation by mutableStateOf<LiveLocation?>(null)
        private set

    val members: SnapshotStateList<MemberView> = mutableStateListOf()

    private var memberDocs: List<RoomMember> = emptyList()
    private var liveLocations: Map<String, LiveLocation> = emptyMap()
    private var membersReg: ListenerRegistration? = null
    private var liveRef: DatabaseReference? = null
    private var liveListener: ValueEventListener? = null
    private var locationJob: Job? = null
    private var lastUploadAt = 0L

    private fun currentIdentity(): DeviceIdentity = identity.copy(displayName = displayName)

    fun updateDisplayName(name: String) {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return
        displayName = trimmed
        identityStore.saveDisplayName(trimmed)
    }

    fun finishOnboarding(name: String) {
        updateDisplayName(name)
        phase = Phase.Room
    }

    fun createRoom() {
        if (busy) return
        viewModelScope.launch {
            busy = true
            errorMessage = null
            try {
                enterRoom(Backend.createRoom(currentIdentity(), sharing))
            } catch (e: Exception) {
                errorMessage = e.message ?: "创建房间失败"
            } finally {
                busy = false
            }
        }
    }

    fun joinRoom(input: String) {
        if (busy) return
        val parsed = RoomCode.parse(input) ?: run {
            errorMessage = "请输入有效的房间码或邀请链接"
            return
        }
        viewModelScope.launch {
            busy = true
            errorMessage = null
            try {
                enterRoom(Backend.joinRoom(currentIdentity(), parsed, sharing))
            } catch (e: Exception) {
                errorMessage = e.message ?: "加入房间失败"
            } finally {
                busy = false
            }
        }
    }

    fun leaveRoom() {
        stopWatching()
        stopLocation()
        roomId = null
        ownLocation = null
        members.clear()
        phase = Phase.Room
    }

    /** Called by the map screen once location permission is granted. */
    fun onLocationPermissionGranted() {
        if (roomId != null) startLocation()
    }

    fun clearError() {
        errorMessage = null
    }

    private fun enterRoom(id: String) {
        roomId = id
        phase = Phase.Map
        startWatching(id)
        if (locationController.hasPermission()) startLocation()
    }

    private fun startWatching(roomId: String) {
        stopWatching()
        membersReg =
            Backend.firestore
                .collection("rooms").document(roomId).collection("members")
                .addSnapshotListener { snapshot, _ ->
                    memberDocs = snapshot?.documents?.mapNotNull { it.toObject(RoomMember::class.java) } ?: emptyList()
                    rebuildMembers()
                }
        val ref = Backend.database.getReference("liveLocations/$roomId")
        val listener =
            object : ValueEventListener {
                override fun onDataChange(snapshot: DataSnapshot) {
                    liveLocations =
                        snapshot.children.mapNotNull { child ->
                            val key = child.key ?: return@mapNotNull null
                            val loc = child.getValue(LiveLocation::class.java) ?: return@mapNotNull null
                            key to loc
                        }.toMap()
                    rebuildMembers()
                }

                override fun onCancelled(error: DatabaseError) {}
            }
        ref.addValueEventListener(listener)
        liveRef = ref
        liveListener = listener
    }

    private fun stopWatching() {
        membersReg?.remove()
        membersReg = null
        liveListener?.let { liveRef?.removeEventListener(it) }
        liveRef = null
        liveListener = null
        memberDocs = emptyList()
        liveLocations = emptyMap()
    }

    private fun rebuildMembers() {
        val now = System.currentTimeMillis()
        val views =
            memberDocs
                .map { member ->
                    val location = liveLocations[member.deviceId]
                    MemberView(member, location, deriveStatus(member, location, now), member.deviceId == deviceId)
                }
                .sortedWith(
                    compareByDescending<MemberView> { it.isSelf }
                        .thenByDescending { it.status == MemberStatus.ONLINE }
                        .thenBy { it.member.displayName },
                )
        members.clear()
        members.addAll(views)
    }

    private fun startLocation() {
        if (locationJob != null) return
        locationJob =
            viewModelScope.launch {
                locationController.updates().collectLatest { loc ->
                    val live =
                        LiveLocation(
                            deviceId = deviceId,
                            displayName = displayName,
                            lat = loc.latitude,
                            lng = loc.longitude,
                            accuracy = loc.accuracy.toDouble(),
                            heading = if (loc.hasBearing()) loc.bearing.toDouble() else null,
                            speed = if (loc.hasSpeed()) loc.speed.toDouble() else 0.0,
                            updatedAt = System.currentTimeMillis(),
                            sharingLocation = true,
                        )
                    ownLocation = live
                    val rid = roomId ?: return@collectLatest
                    val now = System.currentTimeMillis()
                    if (now - lastUploadAt >= 3000L) {
                        lastUploadAt = now
                        Backend.database.getReference("liveLocations/$rid/$deviceId").setValue(live)
                    }
                }
            }
    }

    private fun stopLocation() {
        locationJob?.cancel()
        locationJob = null
        lastUploadAt = 0L
    }

    override fun onCleared() {
        stopWatching()
        stopLocation()
        super.onCleared()
    }
}
