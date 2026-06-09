package com.lazydoglab.zhinzen

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lazydoglab.zhinzen.ui.screens.MapScreen
import com.lazydoglab.zhinzen.ui.screens.OnboardingScreen
import com.lazydoglab.zhinzen.ui.screens.RoomChoiceScreen
import com.lazydoglab.zhinzen.ui.theme.ZhinzenTheme
import com.lazydoglab.zhinzen.ui.theme.ZzColor

/** Root composable: phase router over onboarding → room → map (mirrors the web). */
@Composable
fun ZhinzenApp(viewModel: AppViewModel = viewModel()) {
    // Map back handling (close detail / confirm leave) lives inside MapScreen.
    ZhinzenTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = ZzColor.Bg) {
            when (viewModel.phase) {
                Phase.Onboarding ->
                    OnboardingScreen(
                        initialName = viewModel.displayName,
                        onContinue = viewModel::finishOnboarding,
                    )

                Phase.Room ->
                    RoomChoiceScreen(
                        displayName = viewModel.displayName,
                        busy = viewModel.busy,
                        error = viewModel.errorMessage,
                        history = viewModel.roomHistory,
                        onCreate = viewModel::createRoom,
                        onJoin = viewModel::joinRoom,
                        onJoinHistory = viewModel::joinRoom,
                        onRemoveHistory = viewModel::removeHistory,
                        onClearError = viewModel::clearError,
                    )

                Phase.Map ->
                    MapScreen(
                        roomId = viewModel.roomId,
                        members = viewModel.members,
                        ownLocation = viewModel.ownLocation,
                        selectedDeviceId = viewModel.selectedDeviceId,
                        deviceHeading = viewModel.deviceHeading,
                        sharing = viewModel.sharing,
                        trackPoints = viewModel.trackPoints,
                        headingUp = viewModel.headingUp,
                        nearbyEstimates = viewModel.nearbyEstimates,
                        nearbyUwb = viewModel.nearbyUwb,
                        nearbyScanning = viewModel.nearbyScanning,
                        isOwner = viewModel.isOwner,
                        isFamilyRoom = viewModel.isFamilyRoom,
                        onToggleFamily = viewModel::toggleFamilyRoom,
                        rallyPoints = viewModel.rallyPoints,
                        selectedRallyId = viewModel.selectedRallyId,
                        pendingRally = viewModel.pendingRally,
                        onLeave = viewModel::leaveRoom,
                        onPermissionGranted = viewModel::onLocationPermissionGranted,
                        onSelectMember = viewModel::selectMember,
                        onRename = viewModel::renameInRoom,
                        onKick = viewModel::kickMember,
                        onLongPress = viewModel::startRally,
                        onSelectRally = viewModel::selectRally,
                        onConfirmRally = viewModel::confirmRally,
                        onCancelRally = viewModel::cancelRally,
                        onDeleteRally = viewModel::deleteRally,
                        onToggleSharing = { viewModel.updateSharing(!viewModel.sharing) },
                        onToggleHeadingUp = viewModel::toggleHeadingUp,
                    )
            }
        }
    }
}
