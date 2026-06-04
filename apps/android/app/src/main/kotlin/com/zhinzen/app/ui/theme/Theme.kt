package com.zhinzen.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val ZhinzenColorScheme =
    lightColorScheme(
        primary = ZzColor.Self,
        onPrimary = Color.White,
        secondary = ZzColor.Target,
        background = ZzColor.Bg,
        onBackground = ZzColor.Ink,
        surface = ZzColor.Surface,
        onSurface = ZzColor.Ink,
        error = ZzColor.Danger,
        outline = ZzColor.Line,
    )

@Composable
fun ZhinzenTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = ZhinzenColorScheme,
        content = content,
    )
}
