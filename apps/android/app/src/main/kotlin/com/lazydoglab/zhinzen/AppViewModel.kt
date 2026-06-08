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
import com.lazydoglab.zhinzen.data.RoomHistory
import com.lazydoglab.zhinzen.data.RoomHistoryEntry
import com.lazydoglab.zhinzen.data.RoomMember
import com.lazydoglab.zhinzen.data.TrackPoint
import com.lazydoglab.zhinzen.data.deriveStatus
import com.lazydoglab.zhinzen.device.DeviceIdentity
import com.lazydoglab.zhinzen.device.DeviceIdentityStore
import com.lazydoglab.zhinzen.location.LocationController
import com.lazydoglab.zhinzen.nearby.BleRangingController
import com.lazydoglab.zhinzen.nearby.NearbyEstimate
import com.lazydoglab.zhinzen.nearby.NearbyEstimator
import com.lazydoglab.zhinzen.nearby.UwbRangingController
import com.lazydoglab.zhinzen.nearby.UwbResult
import com.lazydoglab.zhinzen.sensor.CompassController
import com.lazydoglab.zhinzen.service.LocationSharingService
import com.lazydoglab.zhinzen.util.DeviceCapabilities
import com.lazydoglab.zhinzen.util.Haptics
import kotlinx.coroutines.Job
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
    private val compassController = CompassController(application)
    private val roomHistoryStore = RoomHistory(application)
    private val haptics = Haptics(application)
    private val capabilities = DeviceCapabilities.detect(application)
    private val bleController = BleRangingController(application)
    private val uwbController = UwbRangingController(application)
    private val estimators = mutableMapOf<String, NearbyEstimator>()
    private var lastHistoryMembers: List<String> = emptyList()
    private var lastTrackFetchAt = 0L
    private var pendingInvite: String? = null

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
    var selectedDeviceId by mutableStateOf<String?>(null)
        private set
    /** Device compass heading (degrees, 0 = north), or null if unavailable. */
    var deviceHeading by mutableStateOf<Float?>(null)
        private set
    /** When true, the map rotates to follow the device compass (heading-up). */
    var headingUp by mutableStateOf(false)
        private set
    var roomHistory by mutableStateOf<List<RoomHistoryEntry>>(roomHistoryStore.list())
        private set
    /** Recent track points of the currently selected (other) member. */
    var trackPoints by mutableStateOf<List<TrackPoint>>(emptyList())
        private set
    /** Near-distance estimate (BLE + compass) per nearby member deviceId. */
    var nearbyEstimates by mutableStateOf<Map<String, NearbyEstimate>>(emptyMap())
        private set
    /** Precise UWB ranging for the selected member, when both support UWB. */
    var nearbyUwb by mutableStateOf<UwbResult?>(null)
        private set
    /** True while BLE advertising/scanning is active (continuous while in a room). */
    var nearbyScanning by mutableStateOf(false)
        private set

    val members: SnapshotStateList<MemberView> = mutableStateListOf()

    private var memberDocs: List<RoomMember> = emptyList()
    private var liveLocations: Map<String, LiveLocation> = emptyMap()
    private var membersReg: ListenerRegistration? = null
    private var liveRef: DatabaseReference? = null
    private var liveListener: ValueEventListener? = null
    private var compassJob: Job? = null

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
        // If we arrived via an invite link before having a name, join now.
        pendingInvite?.let { code ->
            pendingInvite = null
            joinRoom(code)
        }
    }

    /**
     * Handle an App Link / invite URL (https://.../r/CODE). Joins immediately if
     * we have a name and aren't already in that room; otherwise defers until
     * onboarding finishes.
     */
    fun handleDeepLink(uri: String?) {
        val code = uri?.let { RoomCode.parse(it) } ?: return
        if (roomId == code) return
        if (displayName.isBlank()) {
            pendingInvite = code
        } else {
            joinRoom(code)
        }
    }

    /** Rename and propagate to the room: re-upsert the member doc + next upload. */
    fun renameInRoom(name: String) {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return
        haptics.tap()
        updateDisplayName(trimmed)
        ownLocation = ownLocation?.copy(displayName = trimmed)
        val rid = roomId ?: return
        viewModelScope.launch {
            runCatching { Backend.joinRoom(currentIdentity(), rid, sharing, capabilities) }
        }
    }

    fun selectMember(deviceId: String?) {
        selectedDeviceId = deviceId
        if (deviceId != null && deviceId != this.deviceId) {
            haptics.light()
            startUwb(deviceId)
        } else {
            stopUwb()
        }
        // Show the selected member's track, or your own when nothing/self is selected.
        fetchTrack(selectedDeviceId ?: this.deviceId)
        updateCompass()
    }

    /**
     * Continuous BLE advertise + scan while in a room, so nearby members are
     * detected automatically (no need to open anyone's detail). Idempotent.
     */
    private fun startNearby() {
        if (nearbyScanning) return
        if (!bleController.isSupported() || !bleController.hasPermission()) return
        nearbyScanning =
            bleController.start(deviceId) { token, rssi ->
                viewModelScope.launch {
                    val match =
                        members.firstOrNull { !it.isSelf && BleRangingController.tokenInt(it.member.deviceId) == token }
                            ?: return@launch
                    val id = match.member.deviceId
                    val estimator = estimators.getOrPut(id) { NearbyEstimator() }
                    nearbyEstimates =
                        nearbyEstimates + (id to estimator.onSample(rssi, deviceHeading, System.currentTimeMillis()))
                }
            }
    }

    private fun stopNearby() {
        bleController.stop()
        estimators.clear()
        nearbyEstimates = emptyMap()
        nearbyScanning = false
    }

    /** Precise UWB ranging for the selected peer (only if both support UWB). */
    private fun startUwb(peerId: String) {
        val rid = roomId ?: return
        if (capabilities["uwb"] != true) return
        if (!uwbController.isSupported() || !uwbController.hasPermission()) return
        val peer = members.firstOrNull { it.member.deviceId == peerId } ?: return
        if (!peer.member.capabilities.uwb) return
        uwbController.start(rid, deviceId, peerId) { result ->
            viewModelScope.launch { nearbyUwb = result }
        }
    }

    private fun stopUwb() {
        uwbController.stop()
        nearbyUwb = null
    }

    fun toggleHeadingUp() {
        headingUp = !headingUp
        haptics.tap()
        updateCompass()
    }

    /** The compass runs while in heading-up mode or while pointing at another member. */
    private fun updateCompass() {
        val wanted = headingUp || (selectedDeviceId != null && selectedDeviceId != deviceId)
        if (wanted) startCompass() else stopCompass()
    }

    private fun fetchTrack(targetDeviceId: String) {
        val rid = roomId ?: return
        lastTrackFetchAt = System.currentTimeMillis()
        viewModelScope.launch {
            val since = System.currentTimeMillis() - 24 * 60 * 60 * 1000L
            runCatching { Backend.fetchTrack(rid, targetDeviceId, since) }
                // Ignore stale results: only apply if this is still the active target
                // (the selected member, or self when nothing is selected).
                .onSuccess { if ((selectedDeviceId ?: deviceId) == targetDeviceId) trackPoints = it }
        }
    }

    private fun startCompass() {
        if (compassJob != null || !compassController.isAvailable()) return
        compassJob = viewModelScope.launch {
            compassController.headings().collect { deviceHeading = it }
        }
    }

    private fun stopCompass() {
        compassJob?.cancel()
        compassJob = null
        deviceHeading = null
    }

    fun removeHistory(roomId: String) {
        roomHistory = roomHistoryStore.remove(roomId)
    }

    fun createRoom() {
        if (busy) return
        haptics.tap()
        viewModelScope.launch {
            busy = true
            errorMessage = null
            try {
                enterRoom(Backend.createRoom(currentIdentity(), sharing, capabilities))
                haptics.success()
            } catch (e: Exception) {
                errorMessage = e.message ?: "创建房间失败"
                haptics.error()
            } finally {
                busy = false
            }
        }
    }

    fun joinRoom(input: String) {
        if (busy) return
        val parsed = RoomCode.parse(input) ?: run {
            errorMessage = "请输入有效的房间码或邀请链接"
            haptics.error()
            return
        }
        haptics.tap()
        viewModelScope.launch {
            busy = true
            errorMessage = null
            try {
                enterRoom(Backend.joinRoom(currentIdentity(), parsed, sharing, capabilities))
                haptics.success()
            } catch (e: Exception) {
                errorMessage = e.message ?: "加入房间失败"
                haptics.error()
            } finally {
                busy = false
            }
        }
    }

    fun leaveRoom() {
        haptics.tap()
        headingUp = false
        stopLocation()
        // Mark not-sharing right away so peers see us leave immediately, the same as
        // when the app is closed (RTDB onDisconnect). Web does the same on leave.
        val rid = roomId
        val loc = ownLocation
        if (rid != null && loc != null) {
            Backend.database.getReference("liveLocations/$rid/$deviceId")
                .setValue(loc.copy(sharingLocation = false, updatedAt = System.currentTimeMillis()))
        }
        stopWatching()
        stopCompass()
        stopNearby()
        stopUwb()
        roomId = null
        ownLocation = null
        selectedDeviceId = null
        trackPoints = emptyList()
        members.clear()
        phase = Phase.Room
    }

    /** Called by the map screen once location permission is granted. */
    fun onLocationPermissionGranted() {
        if (roomId != null && sharing) startLocation()
        // BLE/notification permissions are requested together; (re)start nearby once granted.
        startNearby()
    }

    /** Pause/resume sharing this device's live location. */
    fun updateSharing(on: Boolean) {
        if (sharing == on) return
        haptics.tap()
        sharing = on
        if (on) {
            // Immediately mark sharing again so peers update without waiting for a fix.
            val rid = roomId
            val loc = ownLocation
            if (rid != null && loc != null) {
                val resumed = loc.copy(sharingLocation = true, updatedAt = System.currentTimeMillis())
                ownLocation = resumed
                Backend.database.getReference("liveLocations/$rid/$deviceId").setValue(resumed)
            }
            if (locationController.hasPermission()) startLocation()
        } else {
            stopLocation()
            val rid = roomId
            val loc = ownLocation
            if (rid != null && loc != null) {
                val paused = loc.copy(sharingLocation = false, updatedAt = System.currentTimeMillis())
                ownLocation = paused
                Backend.database.getReference("liveLocations/$rid/$deviceId").setValue(paused)
            }
        }
    }

    fun clearError() {
        errorMessage = null
    }

    private fun enterRoom(id: String) {
        roomId = id
        selectedDeviceId = null
        lastHistoryMembers = emptyList()
        roomHistory = roomHistoryStore.add(id)
        phase = Phase.Map
        startWatching(id)
        if (locationController.hasPermission()) startLocation()
        startNearby()
        fetchTrack(deviceId) // show your own track by default
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
        // ownLocation comes from our own RTDB echo (the foreground service uploads it).
        views.firstOrNull { it.isSelf }?.location?.let { ownLocation = it }
        // Capture member names for the room-history avatar previews (only on change).
        val rid = roomId
        if (rid != null) {
            val names = views.map { it.member.displayName.ifBlank { "?" } }
            if (names != lastHistoryMembers) {
                lastHistoryMembers = names
                roomHistory = roomHistoryStore.updateMembers(rid, names)
            }
            // Live-grow the active track (own or selected) as positions come in.
            if (System.currentTimeMillis() - lastTrackFetchAt > 10_000L) {
                fetchTrack(selectedDeviceId ?: deviceId)
            }
        }
        if (selectedDeviceId != null && views.none { it.member.deviceId == selectedDeviceId }) {
            selectMember(null)
        }
    }

    // Location is driven by a foreground service so it keeps running in the
    // background. ownLocation is derived from the members feed (RTDB echo).
    private fun startLocation() {
        val rid = roomId ?: return
        if (!locationController.hasPermission()) return
        LocationSharingService.start(getApplication(), rid)
    }

    private fun stopLocation() {
        LocationSharingService.stop(getApplication())
    }

    override fun onCleared() {
        stopWatching()
        stopLocation()
        stopCompass()
        stopNearby()
        stopUwb()
        super.onCleared()
    }
}
