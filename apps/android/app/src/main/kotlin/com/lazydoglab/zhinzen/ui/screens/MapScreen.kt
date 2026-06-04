package com.lazydoglab.zhinzen.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberMultiplePermissionsState
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.maps.android.compose.rememberMarkerState
import com.lazydoglab.zhinzen.R
import com.lazydoglab.zhinzen.data.LiveLocation
import com.lazydoglab.zhinzen.data.MemberStatus
import com.lazydoglab.zhinzen.data.MemberView
import com.lazydoglab.zhinzen.data.RoomCode
import com.lazydoglab.zhinzen.ui.theme.ZzColor

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun MapScreen(
    roomId: String?,
    members: List<MemberView>,
    ownLocation: LiveLocation?,
    onLeave: () -> Unit,
    onPermissionGranted: () -> Unit,
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

    // Center on self the first time we get a fix.
    var centered by remember { mutableStateOf(false) }
    LaunchedEffect(ownLocation) {
        val loc = ownLocation
        if (loc != null && !centered) {
            cameraPositionState.position = CameraPosition.fromLatLngZoom(LatLng(loc.lat, loc.lng), 16f)
            centered = true
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            properties = MapProperties(isMyLocationEnabled = granted),
            uiSettings = MapUiSettings(zoomControlsEnabled = false, myLocationButtonEnabled = true),
        ) {
            members.forEach { mv ->
                val loc = mv.location ?: return@forEach
                key(mv.member.deviceId) {
                    val markerState = rememberMarkerState(position = LatLng(loc.lat, loc.lng))
                    LaunchedEffect(loc.lat, loc.lng) {
                        markerState.position = LatLng(loc.lat, loc.lng)
                    }
                    Marker(
                        state = markerState,
                        title = mv.member.displayName.ifBlank { mv.member.deviceId },
                        icon = BitmapDescriptorFactory.defaultMarker(markerHue(mv)),
                    )
                }
            }
        }

        // top: room code + member count
        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
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

        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(18.dp),
        ) {
            OutlinedButton(onClick = onLeave, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.leave_room), color = ZzColor.Danger)
            }
        }
    }
}

private fun markerHue(mv: MemberView): Float =
    when {
        mv.isSelf -> BitmapDescriptorFactory.HUE_AZURE
        mv.status == MemberStatus.ONLINE -> BitmapDescriptorFactory.HUE_GREEN
        mv.status == MemberStatus.STALE -> BitmapDescriptorFactory.HUE_ORANGE
        else -> BitmapDescriptorFactory.HUE_ROSE
    }
