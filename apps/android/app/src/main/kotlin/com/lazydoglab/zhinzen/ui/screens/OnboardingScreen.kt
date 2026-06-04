package com.lazydoglab.zhinzen.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import com.lazydoglab.zhinzen.R
import com.lazydoglab.zhinzen.ui.theme.ZzColor

@Composable
fun OnboardingScreen(
    initialName: String,
    onContinue: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var name by remember { mutableStateOf(initialName) }
    val canContinue = name.trim().isNotEmpty()

    Column(
        modifier = modifier
            .fillMaxSize()
            .systemBarsPadding()
            .padding(horizontal = 26.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        BrandWordmark()
        Text(
            text = stringResource(R.string.tagline),
            color = ZzColor.Ink,
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 24.dp, bottom = 8.dp),
        )
        Text(
            text = stringResource(R.string.no_account),
            color = ZzColor.InkFaint,
            fontSize = 13.sp,
        )

        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            singleLine = true,
            label = { Text(stringResource(R.string.your_name)) },
            placeholder = { Text(stringResource(R.string.name_placeholder)) },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { if (canContinue) onContinue(name.trim()) }),
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 36.dp),
        )

        Button(
            onClick = { if (canContinue) onContinue(name.trim()) },
            enabled = canContinue,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 24.dp),
        ) {
            Text(stringResource(R.string.continue_action))
        }
    }
}
