package com.lazydoglab.zhinzen.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Design tokens (design.md §9.2), mirrored from packages/shared-ui as sRGB
 * approximations of the web's oklch values. Keep roughly in sync with the web.
 */
object ZzColor {
    val Self = Color(0xFF2563EB) // 自己 — blue
    val Target = Color(0xFF7C3AED) // 选中目标 — violet
    val Online = Color(0xFF16A34A) // 在线 — green
    val Stale = Color(0xFFD97706) // 位置过期 — amber
    val Offline = Color(0xFF94A3B8) // 离线 — gray
    val Danger = Color(0xFFDC2626) // 危险 — red

    val Ink = Color(0xFF222433)
    val InkSoft = Color(0xFF5B6070)
    val InkFaint = Color(0xFF8A8FA0)
    val Line = Color(0xFFE4E6EC)
    val Bg = Color(0xFFF7F8FB)
    val Surface = Color(0xFFFFFFFF)
}
