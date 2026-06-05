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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberMultiplePermissionsState
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.MapsComposeExperimentalApi
import com.google.maps.android.compose.MarkerComposable
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.maps.android.compose.rememberMarkerState
import com.lazydoglab.zhinzen.R
import com.lazydoglab.zhinzen.data.Geo
import com.lazydoglab.zhinzen.data.LiveLocation
import com.lazydoglab.zhinzen.data.MemberStatus
import com.lazydoglab.zhinzen.data.MemberView
import com.lazydoglab.zhinzen.data.RoomCode
import com.lazydoglab.zhinzen.ui.theme.ZzColor

@OptIn(ExperimentalPermissionsApi::class, MapsComposeExperimentalApi::class)
@Composable
fun MapScreen(
    roomId: String?,
    members: List<MemberView>,
    ownLocation: LiveLocation?,
    selectedDeviceId: String?,
    deviceHeading: Float?,
    onLeave: () -> Unit,
    onPermissionGranted: () -> Unit,
    onSelectMember: (String?) -> Unit,
    onRename: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val permissions =
        rememberMultiplePermissionsState(
            listOf(
                android.Manifest.permission.ACCESS_FINE_LOCATION,
                android.Manifest.permission.ACCESS_COARSE_LOCATION,
            ),
        )
    val granted = permissions.permissions.any { it.status.isGranted }

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

    Box(modifier = modifier.fillMaxSize()) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            properties = MapProperties(isMyLocationEnabled = granted),
            uiSettings = MapUiSettings(zoomControlsEnabled = false, myLocationButtonEnabled = true),
            // Keep the Google logo + controls inside the system bars (edge-to-edge).
            contentPadding = WindowInsets.systemBars.asPaddingValues(),
        ) {
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
    Box(
        modifier = Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(color),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = initial, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.Bold)
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .size(12.dp)
                .clip(CircleShape)
                .background(statusColor(mv.status)),
        )
    }
}

/** Circular avatar drawn as the map marker (initial + status dot). */
@Composable
private fun AvatarMarker(mv: MemberView) {
    val color = if (mv.isSelf) ZzColor.Self else ZzColor.Target
    val initial = mv.member.displayName.ifBlank { "?" }.take(1)
    Box(modifier = Modifier.size(48.dp), contentAlignment = Alignment.Center) {
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
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .size(14.dp)
                .clip(CircleShape)
                .background(Color.White),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(9.dp)
                    .clip(CircleShape)
                    .background(statusColor(mv.status)),
            )
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
