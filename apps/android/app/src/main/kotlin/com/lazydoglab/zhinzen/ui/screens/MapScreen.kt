package com.lazydoglab.zhinzen.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lazydoglab.zhinzen.R
import com.lazydoglab.zhinzen.data.RoomCode
import com.lazydoglab.zhinzen.ui.theme.ZzColor

/**
 * Map screen placeholder (skeleton). The next increment wires Google Maps,
 * live location and members. For now it shows the room code + a self marker.
 */
@Composable
fun MapScreen(
    roomId: String?,
    onLeave: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFFEDF1E9)),
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(22.dp)
                    .clip(CircleShape)
                    .background(ZzColor.Self),
            )
            Text(
                text = stringResource(R.string.map_coming_soon),
                color = ZzColor.InkFaint,
                fontSize = 12.sp,
                modifier = Modifier.padding(top = 16.dp),
            )
        }

        // top: room code chip
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .systemBarsPadding()
                .padding(12.dp),
        ) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(15.dp))
                    .background(Color(0xE6FFFFFF))
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            ) {
                Text(
                    text = stringResource(R.string.room_code) + "  " +
                        (roomId?.let { RoomCode.format(it) } ?: "—"),
                    color = ZzColor.Ink,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }

        // bottom: leave room
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter)
                .systemBarsPadding()
                .padding(18.dp),
        ) {
            OutlinedButton(
                onClick = onLeave,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.leave_room), color = ZzColor.Danger)
            }
        }
    }
}
