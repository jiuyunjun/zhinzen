package com.lazydoglab.zhinzen.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import com.lazydoglab.zhinzen.data.RoomHistoryEntry
import com.lazydoglab.zhinzen.ui.theme.ZzColor

@Composable
fun RoomChoiceScreen(
    displayName: String,
    busy: Boolean,
    error: String?,
    history: List<RoomHistoryEntry>,
    onCreate: () -> Unit,
    onJoin: (String) -> Unit,
    onJoinHistory: (String) -> Unit,
    onRemoveHistory: (String) -> Unit,
    onClearError: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var code by remember { mutableStateOf("") }

    Box(modifier = modifier.fillMaxSize()) {
      Column(
        modifier = Modifier
            .fillMaxSize()
            .systemBarsPadding()
            .padding(horizontal = 22.dp, vertical = 28.dp),
    ) {
        BrandWordmark()
        Text(
            text = stringResource(R.string.hi, displayName.ifBlank { stringResource(R.string.you) }),
            color = ZzColor.Ink,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 18.dp, bottom = 4.dp),
        )
        Text(
            text = stringResource(R.string.pick_action),
            color = ZzColor.InkSoft,
            fontSize = 15.sp,
        )

        ActionCard(
            title = stringResource(R.string.create_room),
            subtitle = stringResource(R.string.create_room_sub),
            enabled = !busy,
            onClick = onCreate,
            modifier = Modifier.padding(top = 24.dp),
        )
        ActionCard(
            title = stringResource(R.string.join_room),
            subtitle = stringResource(R.string.join_room_sub),
            enabled = !busy,
            onClick = { if (code.isNotBlank()) onJoin(code) },
            modifier = Modifier.padding(top = 12.dp),
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = code,
                onValueChange = {
                    code = it
                    if (error != null) onClearError()
                },
                singleLine = true,
                enabled = !busy,
                placeholder = { Text(stringResource(R.string.join_placeholder)) },
                modifier = Modifier.weight(1f),
            )
            Button(
                onClick = { if (code.isNotBlank()) onJoin(code) },
                enabled = !busy && code.isNotBlank(),
                modifier = Modifier
                    .padding(start = 10.dp)
                    .width(96.dp),
            ) {
                Text(if (busy) "…" else stringResource(R.string.join))
            }
        }

        if (error != null) {
            Text(
                text = error,
                color = ZzColor.Danger,
                fontSize = 13.sp,
                modifier = Modifier.padding(top = 14.dp),
            )
        }

        if (history.isNotEmpty()) {
            Text(
                text = stringResource(R.string.recent_rooms),
                color = ZzColor.InkFaint,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 26.dp, bottom = 8.dp),
            )
            history.forEach { entry ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    val shape = RoundedCornerShape(14.dp)
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .clip(shape)
                            .background(ZzColor.Surface)
                            .border(1.5.dp, ZzColor.Line, shape)
                            .clickable(enabled = !busy) { onJoinHistory(entry.roomId) }
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                            Text(
                                text = RoomCode.format(entry.roomId),
                                color = ZzColor.Ink,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            if (entry.members.isNotEmpty()) {
                                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    entry.members.take(6).forEach { MiniAvatar(it) }
                                    if (entry.members.size > 6) {
                                        Text(
                                            text = "+${entry.members.size - 6}",
                                            color = ZzColor.InkFaint,
                                            fontSize = 12.sp,
                                            modifier = Modifier.align(Alignment.CenterVertically),
                                        )
                                    }
                                }
                            }
                        }
                    }
                    Text(
                        text = "✕",
                        color = ZzColor.InkFaint,
                        fontSize = 16.sp,
                        modifier = Modifier
                            .padding(start = 8.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .clickable { onRemoveHistory(entry.roomId) }
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                    )
                }
            }
        }
      }

      if (busy) {
          Box(
              modifier = Modifier
                  .fillMaxSize()
                  .background(Color(0x55000000)),
              contentAlignment = Alignment.Center,
          ) {
              CircularProgressIndicator(color = Color.White)
          }
      }
    }
}

/** Small initial avatar for the room-history member preview. */
@Composable
private fun MiniAvatar(name: String) {
    Box(
        modifier = Modifier
            .size(26.dp)
            .clip(CircleShape)
            .background(ZzColor.Target),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = name.ifBlank { "?" }.take(1),
            color = Color.White,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun ActionCard(
    title: String,
    subtitle: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(20.dp)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(ZzColor.Surface)
            .border(1.5.dp, ZzColor.Line, shape)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(text = title, color = ZzColor.Ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
        Text(text = subtitle, color = ZzColor.InkFaint, fontSize = 13.sp)
    }
}
