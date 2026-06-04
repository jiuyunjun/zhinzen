package com.zhinzen.app

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import com.zhinzen.app.data.RoomCode
import com.zhinzen.app.device.DeviceIdentityStore

enum class Phase { Onboarding, Room, Map }

/**
 * App state holder (mirrors the web's device/room stores). Skeleton: create/join
 * only set local state — the backend (the existing Cloud Functions) is wired in
 * the next increment.
 */
class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val identityStore = DeviceIdentityStore(application)
    private val identity = identityStore.loadOrCreate()

    val deviceId: String = identity.deviceId

    var displayName by mutableStateOf(identity.displayName)
        private set

    var roomId by mutableStateOf<String?>(null)
        private set

    var phase by mutableStateOf(if (identity.displayName.isBlank()) Phase.Onboarding else Phase.Room)
        private set

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
        roomId = RoomCode.generate()
        phase = Phase.Map
    }

    /** Returns true if the input parsed into a room code. */
    fun joinRoom(input: String): Boolean {
        val parsed = RoomCode.parse(input) ?: return false
        roomId = parsed
        phase = Phase.Map
        return true
    }

    fun leaveRoom() {
        roomId = null
        phase = Phase.Room
    }
}
