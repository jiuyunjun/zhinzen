package com.zhinzen.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zhinzen.app.R
import com.zhinzen.app.ui.theme.ZzColor

@Composable
fun RoomChoiceScreen(
    displayName: String,
    onCreate: () -> Unit,
    onJoin: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var code by remember { mutableStateOf("") }

    Column(
        modifier = modifier
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
            onClick = onCreate,
            modifier = Modifier.padding(top = 24.dp),
        )
        ActionCard(
            title = stringResource(R.string.join_room),
            subtitle = stringResource(R.string.join_room_sub),
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
                onValueChange = { code = it },
                singleLine = true,
                placeholder = { Text(stringResource(R.string.join_placeholder)) },
                modifier = Modifier.weight(1f),
            )
            Button(
                onClick = { if (code.isNotBlank()) onJoin(code) },
                enabled = code.isNotBlank(),
                modifier = Modifier
                    .padding(start = 10.dp)
                    .width(96.dp),
            ) {
                Text(stringResource(R.string.join))
            }
        }
    }
}

@Composable
private fun ActionCard(
    title: String,
    subtitle: String,
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
            .clickable(onClick = onClick)
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(text = title, color = ZzColor.Ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
        Text(text = subtitle, color = ZzColor.InkFaint, fontSize = 13.sp)
    }
}
