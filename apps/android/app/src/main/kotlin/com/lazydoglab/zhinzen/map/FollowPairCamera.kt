package com.lazydoglab.zhinzen.map

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.log2
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sinh
import kotlin.math.tan

/** Course-up framing mirrored in packages/geo-utils/src/followPair.ts. Units are dp. */
data class PairCamera(val lat: Double, val lng: Double, val zoom: Double)

fun fitFollowPair(
    selfLat: Double,
    selfLng: Double,
    targetLat: Double,
    targetLng: Double,
    width: Double,
    height: Double,
    bearing: Double,
    maxZoom: Double = 17.5,
): PairCamera {
    fun projectY(lat: Double): Double {
        val phi = lat.coerceIn(-85.05112878, 85.05112878) * PI / 180
        return (1 - ln(tan(PI / 4 + phi / 2)) / PI) / 2
    }
    val y1 = projectY(selfLat)
    val y2 = projectY(targetLat)
    val dx = ((targetLng - selfLng + 540) % 360 - 180) / 360
    val dy = y2 - y1
    val angle = bearing * PI / 180
    val c = cos(angle)
    val s = sin(angle)
    val left = minOf(40.0, width * 0.1)
    val top = minOf(170.0, height * 0.28)
    val bottom = minOf(220.0, height * 0.32)
    val usableW = maxOf(1.0, width - 2 * left)
    val usableH = maxOf(1.0, height - top - bottom)
    val spanX = abs(dx * c + dy * s)
    val spanY = abs(-dx * s + dy * c)
    val scale = minOf(usableW / maxOf(spanX, 1e-12), usableH / maxOf(spanY, 1e-12))
    val zoom = maxOf(0.0, minOf(maxZoom, log2(scale / 256)))
    val worldScale = 256 * 2.0.pow(zoom)
    val screenOffsetY = (top - bottom) / 2
    val centerX = selfLng / 360 + 0.5 + dx / 2 + screenOffsetY * s / worldScale
    val centerY = (y1 + y2) / 2 - screenOffsetY * c / worldScale
    return PairCamera(
        atan(sinh(PI * (1 - 2 * centerY))) * 180 / PI,
        ((centerX * 360 - 180 + 540) % 360) - 180,
        zoom,
    )
}
