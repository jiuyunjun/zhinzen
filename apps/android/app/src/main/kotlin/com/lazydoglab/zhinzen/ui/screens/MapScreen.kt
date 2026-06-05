package com.lazydoglab.zhinzen.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberMultiplePermissionsState
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.MapsComposeExperimentalApi
import com.google.maps.android.compose.MarkerComposable
import com.google.maps.android.compose.Polyline
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.maps.android.compose.rememberMarkerState
import com.lazydoglab.zhinzen.R
import com.lazydoglab.zhinzen.data.Geo
import com.lazydoglab.zhinzen.data.LiveLocation
import com.lazydoglab.zhinzen.data.MemberStatus
import com.lazydoglab.zhinzen.data.MemberView
import com.lazydoglab.zhinzen.data.RoomCode
import com.lazydoglab.zhinzen.data.TrackPoint
import com.lazydoglab.zhinzen.ui.theme.ZzColor

@OptIn(ExperimentalPermissionsApi::class, MapsComposeExperimentalApi::class)
@Composable
fun MapScreen(
    roomId: String?,
    members: List<MemberView>,
    ownLocation: LiveLocation?,
    selectedDeviceId: String?,
    deviceHeading: Float?,
    sharing: Boolean,
    trackPoints: List<TrackPoint>,
    headingUp: Boolean,
    onLeave: () -> Unit,
    onPermissionGranted: () -> Unit,
    onSelectMember: (String?) -> Unit,
    onRename: (String) -> Unit,
    onToggleSharing: () -> Unit,
    onToggleHeadingUp: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val permissions =
        rememberMultiplePermissionsState(
            buildList {
                add(android.Manifest.permission.ACCESS_FINE_LOCATION)
                add(android.Manifest.permission.ACCESS_COARSE_LOCATION)
                // Notification permission so the background-sharing notification shows.
                if (android.os.Build.VERSION.SDK_INT >= 33) {
                    add(android.Manifest.permission.POST_NOTIFICATIONS)
                }
            },
        )
    val granted =
        permissions.permissions.any { it.permission.endsWith("LOCATION") && it.status.isGranted }

    LaunchedEffect(granted) {
        if (granted) onPermissionGranted()
    }

    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(LatLng(35.681236, 139.767125), 15f)
    }
    var centered by remember { mutableStateOf(false) }
    LaunchedEffect(ownLocation) {
        val loc = ownLocation
        if (loc != null && !centered) {
            cameraPositionState.position = CameraPosition.fromLatLngZoom(LatLng(loc.lat, loc.lng), 16f)
            centered = true
        }
    }

    val selfLocation = ownLocation ?: members.firstOrNull { it.isSelf }?.location
    val selected = members.firstOrNull { it.member.deviceId == selectedDeviceId }
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current

    // Heading-up: rotate the map to follow the device compass; reset to north off.
    // Animate (tween) between compass samples so the rotation is smooth, not steppy.
    LaunchedEffect(headingUp, deviceHeading) {
        if (headingUp && deviceHeading != null) {
            val pos = cameraPositionState.position
            runCatching {
                cameraPositionState.animate(
                    CameraUpdateFactory.newCameraPosition(
                        CameraPosition.Builder()
                            .target(pos.target).zoom(pos.zoom).tilt(pos.tilt).bearing(deviceHeading).build(),
                    ),
                    durationMs = 220,
                )
            }
        }
    }
    LaunchedEffect(headingUp) {
        if (!headingUp && cameraPositionState.position.bearing != 0f) {
            val pos = cameraPositionState.position
            runCatching {
                cameraPositionState.animate(
                    CameraUpdateFactory.newCameraPosition(
                        CameraPosition.Builder()
                            .target(pos.target).zoom(pos.zoom).tilt(pos.tilt).bearing(0f).build(),
                    ),
                )
            }
        }
    }

    // Track mode: when an other member is selected, frame self + target once.
    LaunchedEffect(selectedDeviceId) {
        val target = selected?.takeIf { !it.isSelf }?.location ?: return@LaunchedEffect
        val self = selfLocation ?: return@LaunchedEffect
        val bounds = LatLngBounds.builder()
            .include(LatLng(self.lat, self.lng))
            .include(LatLng(target.lat, target.lng))
            .build()
        runCatching { cameraPositionState.animate(CameraUpdateFactory.newLatLngBounds(bounds, 200)) }
    }

    Box(modifier = modifier.fillMaxSize()) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            properties = MapProperties(isMyLocationEnabled = granted),
            uiSettings = MapUiSettings(
                zoomControlsEnabled = false,
                myLocationButtonEnabled = true,
                compassEnabled = false,
                rotationGesturesEnabled = true,
                tiltGesturesEnabled = true,
            ),
            // Keep the Google logo + controls inside the system bars (edge-to-edge).
            contentPadding = WindowInsets.systemBars.asPaddingValues(),
        ) {
            // Track as per-segment polylines colored by speed (mirrors the web).
            for (i in 1 until trackPoints.size) {
                val a = trackPoints[i - 1]
                val b = trackPoints[i]
                key(b.createdAt) {
                    Polyline(
                        points = listOf(LatLng(a.lat, a.lng), LatLng(b.lat, b.lng)),
                        color = colorForSpeed((a.speed + b.speed) / 2.0),
                        width = 14f,
                    )
                }
            }
            members.forEach { mv ->
                val loc = mv.location ?: return@forEach
                key(mv.member.deviceId) {
                    val markerState = rememberMarkerState(position = LatLng(loc.lat, loc.lng))
                    LaunchedEffect(loc.lat, loc.lng) {
                        markerState.position = LatLng(loc.lat, loc.lng)
                    }
                    MarkerComposable(
                        mv.member.deviceId,
                        mv.status,
                        mv.isSelf,
                        mv.member.displayName,
                        state = markerState,
                        title = mv.member.displayName.ifBlank { mv.member.deviceId },
                        onClick = {
                            onSelectMember(mv.member.deviceId)
                            true
                        },
                    ) {
                        AvatarMarker(mv)
                    }
                }
            }
        }

        // top: room code + member count
        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .statusBarsPadding()
                .padding(12.dp)
                .clip(RoundedCornerShape(15.dp))
                .background(Color(0xE6FFFFFF))
                .padding(horizontal = 14.dp, vertical = 12.dp),
        ) {
            Text(
                text = stringResource(R.string.room_code) + "  " +
                    (roomId?.let { RoomCode.format(it) } ?: "—") + "   ·   ${members.size}",
                color = ZzColor.Ink,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }

        if (!granted) {
            Column(
                modifier = Modifier
                    .align(Alignment.Center)
                    .clip(RoundedCornerShape(18.dp))
                    .background(Color(0xF2FFFFFF))
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = stringResource(R.string.location_permission_rationale),
                    color = ZzColor.Ink,
                    fontSize = 14.sp,
                )
                Button(onClick = { permissions.launchMultiplePermissionRequest() }) {
                    Text(stringResource(R.string.grant_location))
                }
            }
        }

        // right-side floating actions: sharing toggle + fit everyone
        Column(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            FabButton(
                icon = FabIcon.Compass,
                active = headingUp,
                rotationDeg = -cameraPositionState.position.bearing,
                onClick = onToggleHeadingUp,
            )
            FabButton(icon = if (sharing) FabIcon.Pause else FabIcon.Play, active = !sharing, onClick = onToggleSharing)
            FabButton(
                icon = FabIcon.FitAll,
                onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    val pins = members.mapNotNull { it.location }
                    if (pins.isNotEmpty()) {
                        val builder = LatLngBounds.builder()
                        pins.forEach { builder.include(LatLng(it.lat, it.lng)) }
                        scope.launch {
                            runCatching {
                                cameraPositionState.animate(
                                    CameraUpdateFactory.newLatLngBounds(builder.build(), 160),
                                )
                            }
                        }
                    }
                },
            )
        }

        // bottom sheet: member strip or selected member detail
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .background(ZzColor.Surface)
                .navigationBarsPadding()
                .padding(horizontal = 18.dp, vertical = 14.dp),
        ) {
            if (selected != null) {
                MemberDetail(
                    member = selected,
                    selfLocation = selfLocation,
                    deviceHeading = deviceHeading,
                    onClose = { onSelectMember(null) },
                    onRename = onRename,
                    onLeave = onLeave,
                )
            } else {
                MemberStrip(members = members, onSelect = onSelectMember)
            }
        }
    }
}

@Composable
private fun MemberStrip(members: List<MemberView>, onSelect: (String) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        members.forEach { mv ->
            Column(
                modifier = Modifier
                    .width(72.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .clickable { onSelect(mv.member.deviceId) }
                    .padding(vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Avatar(mv)
                Text(
                    text = if (mv.isSelf) stringResource(R.string.you) else mv.member.displayName.ifBlank { "?" },
                    color = ZzColor.Ink,
                    fontSize = 12.sp,
                    maxLines = 1,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
    }
}

@Composable
private fun MemberDetail(
    member: MemberView,
    selfLocation: LiveLocation?,
    deviceHeading: Float?,
    onClose: () -> Unit,
    onRename: (String) -> Unit,
    onLeave: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Avatar(member)
        Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
            Text(
                text = if (member.isSelf) stringResource(R.string.you) else member.member.displayName.ifBlank { "?" },
                color = ZzColor.Ink,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
            )
            Text(
                text = statusLabel(member.status),
                color = statusColor(member.status),
                fontSize = 12.sp,
            )
        }
        Text(
            text = "✕",
            color = ZzColor.InkFaint,
            fontSize = 18.sp,
            modifier = Modifier
                .clip(RoundedCornerShape(10.dp))
                .clickable { onClose() }
                .padding(horizontal = 12.dp, vertical = 6.dp),
        )
    }

    if (member.isSelf) {
        SelfEditor(member, onRename, onLeave)
    } else {
        OtherDetail(member, selfLocation, deviceHeading)
    }
}

@Composable
private fun SelfEditor(member: MemberView, onRename: (String) -> Unit, onLeave: () -> Unit) {
    var draft by remember(member.member.displayName) { mutableStateOf(member.member.displayName) }
    Row(
        modifier = Modifier.padding(top = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OutlinedTextField(
            value = draft,
            onValueChange = { draft = it },
            singleLine = true,
            placeholder = { Text(stringResource(R.string.name_placeholder)) },
            modifier = Modifier.weight(1f),
        )
        Button(
            onClick = { if (draft.isNotBlank()) onRename(draft) },
            enabled = draft.isNotBlank() && draft.trim() != member.member.displayName,
            modifier = Modifier.padding(start = 8.dp),
        ) {
            Text(stringResource(R.string.save))
        }
    }
    OutlinedButton(
        onClick = onLeave,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 10.dp),
    ) {
        Text(stringResource(R.string.leave_room), color = ZzColor.Danger)
    }
}

@Composable
private fun OtherDetail(member: MemberView, selfLocation: LiveLocation?, deviceHeading: Float?) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val location = member.location
    val distance =
        if (selfLocation != null && location != null) {
            Geo.formatDistance(
                Geo.distanceMeters(selfLocation.lat, selfLocation.lng, location.lat, location.lng),
            )
        } else {
            "—"
        }
    val relative: Float? =
        if (selfLocation != null && location != null && deviceHeading != null) {
            val bearing =
                Geo.bearingDegrees(selfLocation.lat, selfLocation.lng, location.lat, location.lng).toFloat()
            (bearing - deviceHeading + 360f) % 360f
        } else {
            null
        }

    Row(
        modifier = Modifier.padding(top = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DirectionPointer(relative)
        Metric(label = stringResource(R.string.distance), value = distance, modifier = Modifier.weight(1f))
        Metric(
            label = stringResource(R.string.last_updated),
            value = location?.let { formatAgo(it.updatedAt) } ?: "—",
            modifier = Modifier.weight(1f),
        )
    }

    Button(
        onClick = {
            if (location != null) {
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                val uri =
                    Uri.parse(
                        "https://www.google.com/maps/dir/?api=1&destination=" +
                            "${location.lat},${location.lng}&travelmode=walking",
                    )
                context.startActivity(Intent(Intent.ACTION_VIEW, uri))
            }
        },
        enabled = location != null,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 12.dp),
    ) {
        Text(stringResource(R.string.navigate))
    }

    if (location != null && member.status != MemberStatus.ONLINE) {
        Text(
            text = stringResource(R.string.nav_stale_hint),
            color = ZzColor.Stale,
            fontSize = 12.sp,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

@Composable
private fun Metric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(ZzColor.Bg)
            .padding(12.dp),
    ) {
        Text(text = label, color = ZzColor.InkFaint, fontSize = 11.sp)
        Text(
            text = value,
            color = ZzColor.Ink,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

@Composable
private fun Avatar(mv: MemberView) {
    val color = if (mv.isSelf) ZzColor.Self else ZzColor.Target
    val initial = (mv.member.displayName.ifBlank { "?" }).take(1)
    // Outer box is NOT clipped, so the status dot can sit on the circle's edge
    // without being cut off by the circular clip.
    Box(modifier = Modifier.size(46.dp), contentAlignment = Alignment.Center) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(color),
            contentAlignment = Alignment.Center,
        ) {
            Text(text = initial, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.Bold)
        }
        // status dot with a white ring, on the bottom-right edge
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .size(15.dp)
                .clip(CircleShape)
                .background(Color.White),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(11.dp)
                    .clip(CircleShape)
                    .background(statusColor(mv.status)),
            )
        }
    }
}

private enum class FabIcon { Pause, Play, FitAll, Compass }

/** Floating action button matching the web's rounded-16 glass FABs, with a
 *  Canvas-drawn icon (geometric, like the web icon set). */
@Composable
private fun FabButton(
    icon: FabIcon,
    active: Boolean = false,
    rotationDeg: Float = 0f,
    onClick: () -> Unit,
) {
    val tint = if (active) Color.White else ZzColor.Ink
    Box(
        modifier = Modifier
            .size(46.dp)
            .shadow(6.dp, RoundedCornerShape(16.dp))
            .clip(RoundedCornerShape(16.dp))
            .background(if (active) ZzColor.Self else Color.White)
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.size(22.dp).rotate(rotationDeg)) {
            when (icon) {
                FabIcon.Pause -> drawPauseIcon(tint)
                FabIcon.Play -> drawPlayIcon(tint)
                FabIcon.FitAll -> drawFitAllIcon(tint)
                FabIcon.Compass -> drawCompassIcon(tint)
            }
        }
    }
}

private fun DrawScope.drawCompassIcon(color: Color) {
    val w = size.width
    val h = size.height
    // north pointer (arrowhead up) + tail
    val needle = Path().apply {
        moveTo(w / 2f, h * 0.1f)
        lineTo(w * 0.68f, h * 0.5f)
        lineTo(w / 2f, h * 0.4f)
        lineTo(w * 0.32f, h * 0.5f)
        close()
    }
    drawPath(needle, color)
    drawLine(color, Offset(w / 2f, h * 0.46f), Offset(w / 2f, h * 0.9f), w * 0.07f, StrokeCap.Round)
}

private fun DrawScope.drawPauseIcon(color: Color) {
    val w = size.width
    val h = size.height
    val barW = w * 0.2f
    val barH = h * 0.66f
    val top = (h - barH) / 2f
    val gap = w * 0.16f
    drawRoundRect(
        color = color,
        topLeft = Offset(w / 2f - gap / 2f - barW, top),
        size = Size(barW, barH),
        cornerRadius = CornerRadius(barW * 0.4f),
    )
    drawRoundRect(
        color = color,
        topLeft = Offset(w / 2f + gap / 2f, top),
        size = Size(barW, barH),
        cornerRadius = CornerRadius(barW * 0.4f),
    )
}

private fun DrawScope.drawPlayIcon(color: Color) {
    val w = size.width
    val h = size.height
    val path = Path().apply {
        moveTo(w * 0.3f, h * 0.22f)
        lineTo(w * 0.82f, h * 0.5f)
        lineTo(w * 0.3f, h * 0.78f)
        close()
    }
    drawPath(path, color)
}

private fun DrawScope.drawFitAllIcon(color: Color) {
    val s = size.minDimension
    val pad = s * 0.16f
    val len = s * 0.26f
    val sw = s * 0.1f
    val max = s - pad
    // four corner brackets
    drawLine(color, Offset(pad, pad + len), Offset(pad, pad), sw, StrokeCap.Round)
    drawLine(color, Offset(pad, pad), Offset(pad + len, pad), sw, StrokeCap.Round)
    drawLine(color, Offset(max - len, pad), Offset(max, pad), sw, StrokeCap.Round)
    drawLine(color, Offset(max, pad), Offset(max, pad + len), sw, StrokeCap.Round)
    drawLine(color, Offset(max, max - len), Offset(max, max), sw, StrokeCap.Round)
    drawLine(color, Offset(max, max), Offset(max - len, max), sw, StrokeCap.Round)
    drawLine(color, Offset(pad + len, max), Offset(pad, max), sw, StrokeCap.Round)
    drawLine(color, Offset(pad, max), Offset(pad, max - len), sw, StrokeCap.Round)
}

/** Circular avatar drawn as the map marker (initial only — status shown in the sheet). */
@Composable
private fun AvatarMarker(mv: MemberView) {
    val color = if (mv.isSelf) ZzColor.Self else ZzColor.Target
    val initial = mv.member.displayName.ifBlank { "?" }.take(1)
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(Color.White),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(CircleShape)
                .background(color),
            contentAlignment = Alignment.Center,
        ) {
            Text(text = initial, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        }
    }
}

/** Arrow pointing toward the target relative to the device heading. */
@Composable
private fun DirectionPointer(relative: Float?) {
    if (relative == null) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(ZzColor.Bg),
            contentAlignment = Alignment.Center,
        ) {
            Text(text = "—", color = ZzColor.InkFaint, fontSize = 18.sp)
        }
        return
    }

    // Continuous (unwrapped) angle so the arrow takes the short path across 0°/360°.
    var continuous by remember { mutableStateOf(relative) }
    LaunchedEffect(relative) {
        val delta = ((relative - (continuous % 360f) + 540f) % 360f) - 180f
        continuous += delta
    }
    val angle by animateFloatAsState(targetValue = continuous, label = "direction")

    Box(
        modifier = Modifier
            .size(56.dp)
            .clip(CircleShape)
            .background(ZzColor.Bg),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(
            modifier = Modifier
                .size(28.dp)
                .rotate(angle),
        ) {
            val w = size.width
            val h = size.height
            val path = Path().apply {
                moveTo(w / 2f, 0f)
                lineTo(w * 0.82f, h)
                lineTo(w / 2f, h * 0.66f)
                lineTo(w * 0.18f, h)
                close()
            }
            drawPath(path, color = ZzColor.Target)
        }
    }
}

/**
 * Track segment color by speed. Input is m/s; thresholds are in km/h:
 * 0–15 red, ~28 yellow, 40+ green, with a smooth gradient between (mirrors web).
 */
private fun colorForSpeed(speedMps: Double): Color {
    val kmh = (speedMps * 3.6).coerceAtLeast(0.0)
    val stops =
        listOf(
            0.0 to Triple(220, 38, 38), // red
            15.0 to Triple(220, 38, 38), // still red at the top of the slow band
            28.0 to Triple(234, 179, 8), // yellow (middle of 16–39)
            40.0 to Triple(34, 197, 94), // green from 40 km/h
            200.0 to Triple(34, 197, 94),
        )
    for (i in 1 until stops.size) {
        val (s0, c0) = stops[i - 1]
        val (s1, c1) = stops[i]
        if (kmh <= s1) {
            val r = ((kmh - s0) / (s1 - s0)).coerceIn(0.0, 1.0)
            return Color(lerp(c0.first, c1.first, r), lerp(c0.second, c1.second, r), lerp(c0.third, c1.third, r))
        }
    }
    val last = stops.last().second
    return Color(last.first, last.second, last.third)
}

private fun lerp(a: Int, b: Int, r: Double): Int = (a + (b - a) * r).toInt()

private fun statusColor(status: MemberStatus): Color =
    when (status) {
        MemberStatus.ONLINE -> ZzColor.Online
        MemberStatus.STALE -> ZzColor.Stale
        MemberStatus.OFFLINE -> ZzColor.Offline
        MemberStatus.NOT_SHARING -> ZzColor.InkFaint
    }

@Composable
private fun statusLabel(status: MemberStatus): String =
    stringResource(
        when (status) {
            MemberStatus.ONLINE -> R.string.status_online
            MemberStatus.STALE -> R.string.status_stale
            MemberStatus.OFFLINE -> R.string.status_offline
            MemberStatus.NOT_SHARING -> R.string.status_not_sharing
        },
    )

private fun formatAgo(updatedAt: Long): String {
    val s = ((System.currentTimeMillis() - updatedAt) / 1000).coerceAtLeast(0)
    return when {
        s < 60 -> "${s}s"
        s < 3600 -> "${s / 60}m"
        else -> "${s / 3600}h"
    }
}
