package com.zhinzen.app

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.zhinzen.app.ui.screens.MapScreen
import com.zhinzen.app.ui.screens.OnboardingScreen
import com.zhinzen.app.ui.screens.RoomChoiceScreen
import com.zhinzen.app.ui.theme.ZhinzenTheme
import com.zhinzen.app.ui.theme.ZzColor

/** Root composable: phase router over onboarding → room → map (mirrors the web). */
@Composable
fun ZhinzenApp(viewModel: AppViewModel = viewModel()) {
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
                        onCreate = viewModel::createRoom,
                        onJoin = { viewModel.joinRoom(it) },
                    )

                Phase.Map ->
                    MapScreen(
                        roomId = viewModel.roomId,
                        onLeave = viewModel::leaveRoom,
                    )
            }
        }
    }
}
