package com.lazydoglab.zhinzen.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
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
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.Density
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberMultiplePermissionsState
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptor
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.Dash
import com.google.android.gms.maps.model.Gap
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.CameraMoveStartedReason
import com.google.maps.android.compose.CameraPositionState
import com.google.maps.android.compose.Circle
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.Polyline
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.maps.android.compose.rememberMarkerState
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalDensity
import com.lazydoglab.zhinzen.FollowCamera
import com.lazydoglab.zhinzen.FollowState
import com.lazydoglab.zhinzen.FollowTarget
import com.lazydoglab.zhinzen.R
import com.lazydoglab.zhinzen.data.Geo
import com.lazydoglab.zhinzen.data.followRegime
import com.lazydoglab.zhinzen.data.LiveLocation
import com.lazydoglab.zhinzen.data.MemberStatus
import com.lazydoglab.zhinzen.data.MemberView
import com.lazydoglab.zhinzen.data.RallyPoint
import com.lazydoglab.zhinzen.data.RoomCode
import com.lazydoglab.zhinzen.nearby.NearbyEstimate
import com.lazydoglab.zhinzen.nearby.NearbyTrend
import com.lazydoglab.zhinzen.nearby.UwbResult
import com.lazydoglab.zhinzen.data.TrackPoint
import com.lazydoglab.zhinzen.map.TrackSimplify
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import com.lazydoglab.zhinzen.ui.theme.ZzColor

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun MapScreen(
    roomId: String?,
    members: List<MemberView>,
    ownLocation: LiveLocation?,
    selectedDeviceId: String?,
    deviceHeading: Float?,
    /** Heading the map points at: GPS course while moving, compass otherwise. */
    followHeading: Float?,
    /** True when [followHeading] is a GPS course (sparse) rather than the compass. */
    headingFromGps: Boolean,
    needsCompassCalibration: Boolean,
    sharing: Boolean,
    trackPoints: List<TrackPoint>,
    headingUp: Boolean,
    nearbyEstimates: Map<String, NearbyEstimate>,
    nearbyUwb: UwbResult?,
    nearbyScanning: Boolean,
    isOwner: Boolean,
    isFamilyRoom: Boolean,
    onToggleFamily: () -> Unit,
    rallyPoints: List<RallyPoint>,
    selectedRallyId: String?,
    pendingRally: Pair<Double, Double>?,
    // Follow mode (design.md §5.10).
    followTarget: FollowTarget?,
    followCamera: FollowCamera,
    followPoint: Pair<Double, Double>?,
    followName: String?,
    /** `updatedAt` of the followed fix, so a stale target shows its age. */
    followUpdatedAt: Long?,
    followState: FollowState,
    /** Your own ground speed (m/s) — this, not the distance, sets the road scale. */
    ownSpeed: Double,
    onStartFollow: (FollowTarget) -> Unit,
    onStopFollow: () -> Unit,
    onPauseFollow: () -> Unit,
    onSetFollowCamera: (FollowCamera) -> Unit,
    onLeave: () -> Unit,
    onPermissionGranted: () -> Unit,
    onSelectMember: (String?) -> Unit,
    onRename: (String) -> Unit,
    onKick: (String) -> Unit,
    onPoke: (String, String) -> Unit,
    onLongPress: (Double, Double) -> Unit,
    onSelectRally: (String?) -> Unit,
    onConfirmRally: (String, Int) -> Unit,
    onCancelRally: () -> Unit,
    onDeleteRally: (String) -> Unit,
    onSetRallyRadius: (String, Int) -> Unit,
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
                // BLE near-distance (Android 12+ runtime permissions).
                if (android.os.Build.VERSION.SDK_INT >= 31) {
                    add(android.Manifest.permission.BLUETOOTH_SCAN)
                    add(android.Manifest.permission.BLUETOOTH_ADVERTISE)
                    add(android.Manifest.permission.BLUETOOTH_CONNECT)
                    add(android.Manifest.permission.UWB_RANGING)
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
    val context = LocalContext.current

    val copyInvite = {
        val rid = roomId
        if (rid != null) {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            clipboard?.setPrimaryClip(ClipData.newPlainText("Zhinzen", RoomCode.inviteLink(rid)))
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            Toast.makeText(context, context.getString(R.string.copied), Toast.LENGTH_SHORT).show()
        }
    }

    var showLeaveConfirm by remember { mutableStateOf(false) }
    // System back: close an open member detail first, otherwise confirm leaving.
    BackHandler {
        if (selectedDeviceId != null) onSelectMember(null) else showLeaveConfirm = true
    }
    if (showLeaveConfirm) {
        AlertDialog(
            onDismissRequest = { showLeaveConfirm = false },
            title = { Text(stringResource(R.string.leave_confirm_title)) },
            text = { Text(stringResource(R.string.leave_confirm_message)) },
            confirmButton = {
                TextButton(onClick = {
                    showLeaveConfirm = false
                    onLeave()
                }) { Text(stringResource(R.string.leave_room)) }
            },
            dismissButton = {
                TextButton(onClick = { showLeaveConfirm = false }) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }

    // ---- Follow mode camera (design.md §5.10) ------------------------------
    // You are the anchor: the camera centers on *you*, parked at a fixed point below
    // the middle of the screen, and the zoom is sized so the target stays inside the
    // visible radius. `newLatLngBounds` is deliberately not used — it fits a
    // north-aligned box (wrong once the map is rotated) and resets the bearing.
    var mapSizePx by remember { mutableStateOf(IntSize.Zero) }
    val density = LocalDensity.current
    val followLat = followPoint?.first
    val followLng = followPoint?.second
    val bothMode = followCamera == FollowCamera.Both
    val followActive = followTarget != null && followCamera != FollowCamera.Paused &&
        followLat != null && followLng != null && selfLocation != null
    // Desired camera, read by the frame loop below.
    val desired = remember { DesiredCam() }
    val regimeRef = remember { RegimeRef() }
    // Whether the target has left the viewport, per the SDK's own visible region.
    var targetOffScreen by remember { mutableStateOf(false) }
    // The frame loop below is a long-lived coroutine, so it would capture these once
    // and never see another value — which is exactly why the map stopped rotating.
    // rememberUpdatedState keeps the running loop reading the latest ones.
    val liveHeading = rememberUpdatedState(followHeading)
    val liveTargetLat = rememberUpdatedState(followLat)
    val liveTargetLng = rememberUpdatedState(followLng)

    // *Your own speed* sets the road scale — walking you want the next few streets,
    // on the highway the next few kilometers. The target's distance does not drive
    // the zoom: chasing someone 2km away would throw away the scale you are actually
    // navigating at, so past FOLLOW_HOLD_BOTH_M the edge indicator takes that job.
    LaunchedEffect(followActive, bothMode, selfLocation?.lat, selfLocation?.lng, followLat, followLng, ownSpeed, mapSizePx) {
        if (!followActive) {
            desired.valid = false
            regimeRef.key = null
            return@LaunchedEffect
        }
        val me = selfLocation ?: return@LaunchedEffect
        val tLat = followLat ?: return@LaunchedEffect
        val tLng = followLng ?: return@LaunchedEffect
        if (mapSizePx.width == 0 || mapSizePx.height == 0) return@LaunchedEffect

        // All of this is in **dp**, not raw pixels: Maps' zoom is defined against
        // 256dp tiles, so metersPerPixel is really meters-per-dp. Mixing in device
        // pixels puts the scale off by the display density (2–3×).
        val widthDp = with(density) { mapSizePx.width.toDp().value }
        val heightDp = with(density) { mapSizePx.height.toDp().value }
        val anchorX = widthDp / 2f
        val anchorY = heightDp * FOLLOW_ANCHOR_FRAC
        val forwardDp = anchorY.coerceAtLeast(80f)
        val regime = followRegime(ownSpeed, regimeRef.key)
        regimeRef.key = regime.key

        if (bothMode) {
            // "View both" is a live fit: centered on the midpoint, north-up, zoomed to
            // exactly hold the pair — and it keeps re-fitting as you both move.
            val midLat = (me.lat + tLat) / 2
            val midLng = (me.lng + tLng) / 2
            val usableW = (widthDp - 2 * 40f).coerceAtLeast(80f)
            val usableH = (heightDp - 150f - 200f).coerceAtLeast(80f)
            val northM = kotlin.math.abs(me.lat - tLat) * 111_320.0
            val eastM = kotlin.math.abs(me.lng - tLng) * 111_320.0 *
                kotlin.math.cos(Math.toRadians(midLat))
            val fitMpp = maxOf(northM / usableH, eastM / usableW, 0.5)
            var fitZoom = Geo.zoomForMpp(midLat, fitMpp)
                .coerceIn(FOLLOW_MIN_ZOOM, FOLLOW_MAX_ZOOM).toFloat()
            if (desired.valid && kotlin.math.abs(fitZoom - desired.zoom) < FOLLOW_ZOOM_EPSILON) {
                fitZoom = desired.zoom
            }
            desired.lat = midLat
            desired.lng = midLng
            desired.zoom = fitZoom
            desired.centered = true
            desired.valid = true
            return@LaunchedEffect
        }

        val baseMpp = regime.rangeM / forwardDp
        val distance = Geo.distanceMeters(me.lat, me.lng, tLat, tLng)
        val bearing = liveHeading.value?.toDouble() ?: 0.0
        val theta = Math.toRadians(Geo.bearingDegrees(me.lat, me.lng, tLat, tLng) - bearing)
        val exit = Geo.rayExit(
            anchorX, anchorY, sin(theta).toFloat(), -cos(theta).toFloat(),
            26f, 150f, widthDp - 26f, heightDp - 200f,
        )

        // Close enough that we can widen a little to keep them on screen for free.
        val mpp = if (distance < FOLLOW_HOLD_BOTH_M) {
            maxOf(baseMpp, distance / maxOf(40.0, exit.distance * 0.85))
        } else {
            baseMpp
        }
        var zoom = Geo.zoomForMpp(me.lat, mpp).coerceIn(FOLLOW_MIN_ZOOM, FOLLOW_MAX_ZOOM).toFloat()
        // Dead zone, so the map doesn't "breathe" on every jittery fix.
        if (desired.valid && kotlin.math.abs(zoom - desired.zoom) < FOLLOW_ZOOM_EPSILON) {
            zoom = desired.zoom
        }
        desired.lat = me.lat
        desired.lng = me.lng
        desired.zoom = zoom
        desired.centered = false
        desired.valid = true
    }

    // Single per-frame camera driver. Rotation and framing cannot be two competing
    // `animate()` calls (each cancels the other, which is what made this feel mushy):
    // one loop eases target + zoom + bearing and writes the camera directly. The
    // center offset must be recomputed from the *current* bearing every frame —
    // that is what keeps you pinned to the anchor while the world turns around you,
    // instead of you orbiting the screen center.
    LaunchedEffect(headingUp, followActive, bothMode, followCamera, mapSizePx) {
        // A paused session means the user took the camera — don't even write the
        // bearing, or their pinch/rotate would keep getting corrected.
        if (followTarget != null && followCamera == FollowCamera.Paused) return@LaunchedEffect
        if (!headingUp && !followActive) return@LaunchedEffect
        // In dp, to match metersPerPixel (Maps' zoom is defined against 256dp tiles).
        val heightDp = with(density) { mapSizePx.height.toDp().value }
        val offsetDp = heightDp * FOLLOW_ANCHOR_FRAC - heightDp / 2f
        var lastNanos = 0L
        var publishedNanos = 0L
        var bearing = cameraPositionState.position.bearing
        var zoom = cameraPositionState.position.zoom
        var lat = Double.NaN
        var lng = Double.NaN
        while (true) {
            withFrameNanos { now ->
                val dt = if (lastNanos == 0L) 16.0 else ((now - lastNanos) / 1_000_000.0).coerceIn(1.0, 120.0)
                lastNanos = now
                // Never fight the user's own gesture — any of them, pinch included.
                // Pausing from here (rather than only from an isMoving effect) is
                // what makes manual zoom actually stick instead of being overwritten
                // on the next frame.
                val gesturing = cameraPositionState.isMoving &&
                    cameraPositionState.cameraMoveStartedReason == CameraMoveStartedReason.GESTURE
                if (gesturing) {
                    onPauseFollow()
                } else {
                    // "View both" is north-up: with the road scale dropped for a
                    // moment, a fixed north is easier to reconcile with the map you
                    // were just reading.
                    val headingTarget = if (bothMode) 0f else liveHeading.value
                    var bearingSettled = true
                    if ((headingUp || bothMode) && headingTarget != null) {
                        val tau = if (headingFromGps) FOLLOW_GPS_HEADING_TAU_MS else FOLLOW_HEADING_TAU_MS
                        val delta = ((headingTarget - bearing + 540f) % 360f) - 180f
                        bearingSettled = kotlin.math.abs(delta) < 0.05f
                        bearing =
                            if (bearingSettled) {
                                headingTarget
                            } else {
                                ((bearing + delta * (1f - kotlin.math.exp((-dt / tau).toFloat())) + 360f) % 360f)
                            }
                    }
                    // Nothing left to converge on → don't touch the map at all. A
                    // 60fps camera write while stopped at a light is pure battery.
                    val settled = bearingSettled && desired.valid && !lat.isNaN() &&
                        kotlin.math.abs(desired.lat - lat) < 1e-7 &&
                        kotlin.math.abs(desired.lng - lng) < 1e-7 &&
                        kotlin.math.abs(desired.zoom - zoom) < 0.002f
                    if (settled) {
                        // still nothing to do
                    } else if (desired.valid) {
                        val k = 1.0 - kotlin.math.exp(-dt / FOLLOW_CENTER_TAU_MS)
                        if (lat.isNaN()) {
                            lat = desired.lat
                            lng = desired.lng
                            zoom = desired.zoom
                        } else {
                            lat += (desired.lat - lat) * k
                            lng += (desired.lng - lng) * k
                            zoom += ((desired.zoom - zoom) * k).toFloat()
                        }
                        // You sit below center, so the camera center is that many dp
                        // *up-screen* from you — up-screen is the bearing.
                        val center =
                            if (offsetDp == 0f || desired.centered) {
                                LatLng(lat, lng)
                            } else {
                                val meters = offsetDp * Geo.metersPerPixel(lat, zoom.toDouble())
                                val (cLat, cLng) = Geo.destination(lat, lng, bearing.toDouble(), meters)
                                LatLng(cLat, cLng)
                            }
                        cameraPositionState.position = CameraPosition.builder()
                            .target(center).zoom(zoom).tilt(cameraPositionState.position.tilt)
                            .bearing(bearing).build()
                        // Is the target still on screen? Ask the SDK for its own
                        // visible region rather than reimplementing the projection.
                        if (now - publishedNanos > 200_000_000L) {
                            publishedNanos = now
                            val region = cameraPositionState.projection?.visibleRegion
                            val tLat = liveTargetLat.value
                            val tLng = liveTargetLng.value
                            if (region != null && tLat != null && tLng != null) {
                                targetOffScreen = !region.latLngBounds.contains(LatLng(tLat, tLng))
                            }
                        }
                    } else {
                        lat = Double.NaN
                        if (headingUp) {
                            val pos = cameraPositionState.position
                            cameraPositionState.position = CameraPosition.builder()
                                .target(pos.target).zoom(pos.zoom).tilt(pos.tilt).bearing(bearing).build()
                        }
                    }
                }
            }
        }
    }

    // A gesture hands the camera back to the user without ending the session.
    LaunchedEffect(cameraPositionState.isMoving) {
        if (cameraPositionState.isMoving &&
            cameraPositionState.cameraMoveStartedReason == CameraMoveStartedReason.GESTURE
        ) {
            onPauseFollow()
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

    // On selecting a member — including your own avatar — glide to them in one smooth
    // pan+zoom at a consistent zoom (no hard stop framing both first; that felt stiff).
    LaunchedEffect(selectedDeviceId) {
        val target = selected?.location ?: return@LaunchedEffect
        smoothFocus(cameraPositionState, target.lat, target.lng)
    }

    // Same single smooth glide for the selected rally point.
    LaunchedEffect(selectedRallyId) {
        val rally = rallyPoints.firstOrNull { it.id == selectedRallyId } ?: return@LaunchedEffect
        smoothFocus(cameraPositionState, rally.lat, rally.lng)
    }

    Box(
        modifier = modifier.fillMaxSize().onSizeChanged { mapSizePx = it },
    ) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            properties = MapProperties(isMyLocationEnabled = granted),
            uiSettings = MapUiSettings(
                zoomControlsEnabled = false,
                // Hide the built-in top-right my-location button; we provide a recenter
                // FAB in the right column to match the web layout.
                myLocationButtonEnabled = false,
                compassEnabled = false,
                rotationGesturesEnabled = true,
                tiltGesturesEnabled = true,
            ),
            // Keep the Google logo + controls inside the system bars (edge-to-edge).
            contentPadding = WindowInsets.systemBars.asPaddingValues(),
            // Long-press the empty map to drop a rally point (single tap is too easy to
            // trigger by accident on Android; web keeps single-tap since long-press
            // doesn't fire there).
            onMapLongClick = { onLongPress(it.latitude, it.longitude) },
        ) {
            rallyPoints.forEach { rp ->
                key("rally-${rp.id}") {
                    val st = rememberMarkerState(position = LatLng(rp.lat, rp.lng))
                    LaunchedEffect(rp.lat, rp.lng) { st.position = LatLng(rp.lat, rp.lng) }
                    val selectedRally = rp.id == selectedRallyId
                    Marker(
                        state = st,
                        icon = BitmapDescriptorFactory.defaultMarker(
                            if (selectedRally) BitmapDescriptorFactory.HUE_AZURE else BitmapDescriptorFactory.HUE_VIOLET,
                        ),
                        zIndex = if (selectedRally) 6f else 2f,
                        title = rp.name,
                        onClick = {
                            onSelectRally(rp.id)
                            true
                        },
                    )
                    if (selectedRally) {
                        Circle(
                            center = LatLng(rp.lat, rp.lng),
                            radius = rp.radius.toDouble(),
                            strokeColor = ZzColor.Target,
                            strokeWidth = 4f,
                            fillColor = ZzColor.Target.copy(alpha = 0.12f),
                        )
                    }
                }
            }
            // Track: simplify by zoom + merge same-color runs into one polyline each.
            // Only rebuild once the camera settles (not on every zoom step mid-animation,
            // which made zooming janky) — the existing polylines just transform meanwhile.
            val zoomKey = cameraPositionState.position.zoom.roundToInt()
            var settledTrackKey by remember { mutableStateOf(trackPoints.size to zoomKey) }
            LaunchedEffect(cameraPositionState.isMoving, trackPoints.size, zoomKey) {
                if (!cameraPositionState.isMoving) settledTrackKey = trackPoints.size to zoomKey
            }
            val trackSegments = remember(settledTrackKey) {
                TrackSimplify.buildSegments(trackPoints, settledTrackKey.second.toFloat())
            }
            trackSegments.forEachIndexed { i, seg ->
                key(i) {
                    Polyline(
                        points = seg.path,
                        color = colorForSpeed(TrackSimplify.bucketSpeedMps(seg.bucket)),
                        width = 14f,
                    )
                }
            }
            // Follow connector: a native dashed Polyline, projected by the SDK, so it
            // is correct at any zoom/bearing without us computing screen geometry.
            if (followActive && selfLocation != null && followLat != null && followLng != null) {
                Polyline(
                    points = listOf(
                        LatLng(selfLocation.lat, selfLocation.lng),
                        LatLng(followLat, followLng),
                    ),
                    color = if (followState == FollowState.Stale) ZzColor.Stale else ZzColor.Target,
                    width = 8f,
                    pattern = listOf(Dash(18f), Gap(14f)),
                    zIndex = 4f,
                )
            }
            members.forEach { mv ->
                val loc = mv.location ?: return@forEach
                key(mv.member.deviceId) {
                    val markerState = rememberMarkerState(position = LatLng(loc.lat, loc.lng))
                    LaunchedEffect(loc.lat, loc.lng) {
                        markerState.position = LatLng(loc.lat, loc.lng)
                    }
                    // While following, your own pin becomes a heading arrow. A flat
                    // marker rotates with the map, so the rotation is simply your
                    // course over ground.
                    val asArrow = followActive && mv.isSelf && followHeading != null
                    val icon = if (asArrow) {
                        rememberArrowDescriptor()
                    } else {
                        rememberAvatarDescriptor(
                            mv.member.displayName.ifBlank { "?" }.take(1),
                            mv.isSelf,
                            mv.member.deviceId == selectedDeviceId,
                        )
                    }
                    Marker(
                        state = markerState,
                        icon = icon,
                        anchor = Offset(0.5f, 0.5f),
                        flat = asArrow,
                        rotation = if (asArrow) followHeading!! else 0f,
                        zIndex = if (mv.member.deviceId == selectedDeviceId) 5f else 1f,
                        title = mv.member.displayName.ifBlank { mv.member.deviceId },
                        onClick = {
                            onSelectMember(mv.member.deviceId)
                            true
                        },
                    )
                }
            }
        }

        // top: room code (tap to copy invite) + family-room star
        Row(
            modifier = Modifier
                .align(Alignment.TopStart)
                .statusBarsPadding()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(15.dp))
                    .background(Color(0xE6FFFFFF))
                    .clickable { copyInvite() }
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    text = stringResource(R.string.room_code) + "  " +
                        (roomId?.let { RoomCode.format(it) } ?: "—") + "   ·   ${members.size}",
                    color = ZzColor.Ink,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = stringResource(R.string.copy_invite),
                    color = ZzColor.Self,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(15.dp))
                    .background(if (isFamilyRoom) Color(0xFFF59E0B) else Color(0xE6FFFFFF))
                    .clickable { onToggleFamily() }
                    .padding(13.dp),
            ) {
                Text(
                    text = if (isFamilyRoom) "★" else "☆",
                    color = if (isFamilyRoom) Color.White else ZzColor.InkFaint,
                    fontSize = 18.sp,
                )
            }
        }

        // ── Follow view (design.md §5.10) ──
        if (followTarget != null) {
            // Tick once a second so the "x ago" keeps counting up even when no new
            // packets arrive — which is exactly when its value matters most.
            var ageTick by remember { mutableStateOf(0) }
            LaunchedEffect(followTarget) {
                while (true) {
                    kotlinx.coroutines.delay(1000)
                    ageTick += 1
                }
            }
            val ageLabel = remember(followUpdatedAt, ageTick) {
                followUpdatedAt?.let { formatAgo(it) }
            }
            val fLat = followPoint?.first
            val fLng = followPoint?.second
            val distanceM =
                if (selfLocation != null && fLat != null && fLng != null) {
                    Geo.distanceMeters(selfLocation.lat, selfLocation.lng, fLat, fLng)
                } else {
                    null
                }
            // The map is course-up, so screen-up is our heading and the arrow points
            // straight at them.
            val followRelative: Float? =
                if (selfLocation != null && fLat != null && fLng != null) {
                    val bearing = Geo.bearingDegrees(selfLocation.lat, selfLocation.lng, fLat, fLng).toFloat()
                    (bearing - cameraPositionState.position.bearing + 360f) % 360f
                } else {
                    null
                }

            // Top HUD: the one line that answers "which way, how far".
            Row(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .statusBarsPadding()
                    .padding(top = 64.dp, start = 12.dp, end = 12.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(18.dp))
                    .background(Color(0xEDFFFFFF))
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (followRelative != null) {
                    FollowArrow(
                        followRelative,
                        if (followState == FollowState.Stale) ZzColor.Stale else ZzColor.Target,
                        26.dp,
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        Text(stringResource(R.string.follow_apart), color = ZzColor.InkFaint, fontSize = 11.5.sp)
                        Text(
                            text = distanceM?.let {
                                if (it >= 1000) "%.1f".format(it / 1000) else it.toInt().toString()
                            } ?: "—",
                            color = ZzColor.Ink,
                            fontSize = 26.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = if ((distanceM ?: 0.0) >= 1000) "km" else "m",
                            color = ZzColor.InkSoft,
                            fontSize = 14.sp,
                        )
                    }
                    Text(
                        text = buildString {
                            if (followRelative != null) {
                                append(stringResource(R.string.follow_target_at, stringResource(directionWordRes(followRelative))))
                            }
                            if (targetOffScreen) {
                                if (isNotEmpty()) append(" · ")
                                append(stringResource(R.string.follow_off_screen))
                            }
                            if (ageLabel != null) {
                                if (isNotEmpty()) append(" · ")
                                append(stringResource(R.string.follow_updated_ago, ageLabel))
                            }
                        },
                        color = if (followState == FollowState.Stale) ZzColor.Stale else ZzColor.InkSoft,
                        fontSize = 12.5.sp,
                        maxLines = 1,
                    )
                }
                Text(
                    text = stringResource(
                        when (followState) {
                            FollowState.Moving -> R.string.follow_moving
                            FollowState.Stale -> R.string.follow_stale
                            FollowState.Stopped -> R.string.follow_stopped
                        },
                    ),
                    color = when (followState) {
                        FollowState.Moving -> ZzColor.Online
                        FollowState.Stale -> ZzColor.Stale
                        FollowState.Stopped -> ZzColor.InkSoft
                    },
                    fontSize = 10.5.sp,
                    modifier = Modifier
                        .clip(RoundedCornerShape(7.dp))
                        .background(
                            when (followState) {
                                FollowState.Moving -> ZzColor.Online.copy(alpha = .16f)
                                FollowState.Stale -> ZzColor.Stale.copy(alpha = .18f)
                                FollowState.Stopped -> ZzColor.Offline.copy(alpha = .2f)
                            },
                        )
                        .padding(horizontal = 7.dp, vertical = 3.dp),
                )
            }

            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .padding(bottom = 74.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                if (followCamera == FollowCamera.Paused) {
                    Text(
                        text = stringResource(R.string.follow_recenter),
                        color = Color.White,
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier
                            .padding(bottom = 10.dp)
                            .clip(RoundedCornerShape(21.dp))
                            .background(ZzColor.Self)
                            .clickable { onSetFollowCamera(FollowCamera.Follow) }
                            .padding(horizontal = 18.dp, vertical = 11.dp),
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    FollowModeButton(
                        active = followCamera == FollowCamera.Follow,
                        activeColor = ZzColor.Self,
                        label = stringResource(R.string.follow_self),
                        modifier = Modifier.weight(1f),
                        onClick = { onSetFollowCamera(FollowCamera.Follow) },
                    )
                    FollowModeButton(
                        active = followCamera == FollowCamera.Both,
                        activeColor = ZzColor.Target,
                        label = stringResource(R.string.follow_view_both),
                        modifier = Modifier.weight(1f),
                        onClick = { onSetFollowCamera(FollowCamera.Both) },
                    )
                    Box(
                        modifier = Modifier
                            .size(52.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(Color(0xF0FFFFFF))
                            .clickable { onStopFollow() },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("✕", color = ZzColor.Danger, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // Compass calibration prompt: shows while the compass is active but accuracy is
        // low. Calibration itself is OS-driven — the user waves a figure-8 and the
        // magnetometer recalibrates, then accuracy recovers and this hides. ✕ dismisses
        // until it drops again.
        var calibrationDismissed by remember { mutableStateOf(false) }
        LaunchedEffect(needsCompassCalibration) {
            if (!needsCompassCalibration) calibrationDismissed = false
        }
        if (needsCompassCalibration && !calibrationDismissed) {
            Row(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .statusBarsPadding()
                    // Sits below the follow HUD when following.
                    .padding(
                        top = if (followTarget == null) 64.dp else 136.dp,
                        start = 16.dp,
                        end = 16.dp,
                    )
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(Color(0xF2FFF4D6))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(text = "🧭", fontSize = 18.sp)
                Text(
                    text = stringResource(R.string.compass_calibrate),
                    color = ZzColor.Ink,
                    fontSize = 13.sp,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = "✕",
                    color = ZzColor.InkFaint,
                    fontSize = 16.sp,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { calibrationDismissed = true }
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
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

        // right-side floating actions — the follow controls replace them while following
        Column(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (followTarget != null) return@Column
            FabButton(
                icon = FabIcon.Compass,
                active = headingUp,
                rotationDeg = -cameraPositionState.position.bearing,
                onClick = onToggleHeadingUp,
            )
            FabButton(
                icon = FabIcon.Recenter,
                onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    // Taking the camera pauses a follow session rather than ending it.
                    onPauseFollow()
                    val self = selfLocation
                    if (self != null) {
                        scope.launch {
                            runCatching {
                                cameraPositionState.animate(
                                    CameraUpdateFactory.newLatLngZoom(LatLng(self.lat, self.lng), 16f),
                                )
                            }
                        }
                    }
                },
            )
            FabButton(icon = if (sharing) FabIcon.Pause else FabIcon.Play, active = !sharing, onClick = onToggleSharing)
            FabButton(
                icon = FabIcon.FitAll,
                onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    onPauseFollow()
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
        // Draggable bottom sheet: grab the handle and slide it down to a small peek so
        // it stops covering the map; slide back up to read the detail. Selecting a new
        // target reopens it.
        val peekPx = with(LocalDensity.current) { 52.dp.toPx() }
        val sheetOffset = remember { Animatable(0f) }
        var sheetHeightPx by remember { mutableStateOf(0) }
        val maxOffset = (sheetHeightPx - peekPx).coerceAtLeast(0f)
        LaunchedEffect(selectedDeviceId, selectedRallyId) { sheetOffset.animateTo(0f) }
        val detailOpen = selected != null || selectedRallyId != null
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .offset { IntOffset(0, sheetOffset.value.roundToInt()) }
                .onSizeChanged { sheetHeightPx = it.height },
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                    .background(ZzColor.Surface)
                    .navigationBarsPadding()
                    .padding(horizontal = 18.dp, vertical = 14.dp),
            ) {
                // Grab handle — drag down to peek, up to open; snaps to the nearer end.
                // When peeked, a single tap on it expands the sheet back. (For a detail,
                // the taller strip overlay below also drags/expands from the name area.)
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                        ) {
                            if (sheetOffset.value > 8f) scope.launch { sheetOffset.animateTo(0f) }
                        }
                        .pointerInput(maxOffset) {
                            detectVerticalDragGestures(
                                onDragEnd = {
                                    val target = if (sheetOffset.value > maxOffset / 2f) maxOffset else 0f
                                    scope.launch { sheetOffset.animateTo(target) }
                                },
                            ) { change, dragAmount ->
                                change.consume()
                                scope.launch {
                                    sheetOffset.snapTo((sheetOffset.value + dragAmount).coerceIn(0f, maxOffset))
                                }
                            }
                        }
                        .padding(bottom = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        modifier = Modifier
                            .width(36.dp)
                            .height(4.dp)
                            .clip(RoundedCornerShape(2.dp))
                            .background(ZzColor.InkFaint.copy(alpha = 0.3f)),
                    )
                }
                val selectedRally = rallyPoints.firstOrNull { it.id == selectedRallyId }
                val selfId = members.firstOrNull { it.isSelf }?.member?.deviceId
                if (selected != null) {
                    MemberDetail(
                        member = selected,
                        selfLocation = selfLocation,
                        deviceHeading = deviceHeading,
                        estimate = nearbyEstimates[selected.member.deviceId],
                        uwb = nearbyUwb,
                        nearbyScanning = nearbyScanning,
                        canKick = isOwner && !selected.isSelf,
                        following = followTarget?.let { !it.isRally && it.id == selected.member.deviceId } == true,
                        onToggleFollow = {
                            val t = followTarget
                            if (t != null && !t.isRally && t.id == selected.member.deviceId) {
                                onStopFollow()
                            } else {
                                onStartFollow(FollowTarget(isRally = false, id = selected.member.deviceId))
                            }
                        },
                        onKick = onKick,
                        onPoke = { text -> onPoke(selected.member.deviceId, text) },
                        onClose = { onSelectMember(null) },
                        onRename = onRename,
                        onLeave = { showLeaveConfirm = true },
                    )
                } else if (selectedRally != null) {
                    RallyDetail(
                        point = selectedRally,
                        selfLocation = selfLocation,
                        deviceHeading = deviceHeading,
                        canEdit = selectedRally.createdByDeviceId == selfId || isOwner,
                        following = followTarget?.let { it.isRally && it.id == selectedRally.id } == true,
                        onToggleFollow = {
                            val t = followTarget
                            if (t != null && t.isRally && t.id == selectedRally.id) {
                                onStopFollow()
                            } else {
                                onStartFollow(FollowTarget(isRally = true, id = selectedRally.id))
                            }
                        },
                        onSetRadius = { r -> onSetRallyRadius(selectedRally.id, r) },
                        onDelete = { onDeleteRally(selectedRally.id) },
                        onClose = { onSelectRally(null) },
                    )
                } else {
                    MemberStrip(
                        members = members,
                        nearbyIds = nearbyEstimates.keys,
                        rallyPoints = rallyPoints,
                        onSelect = onSelectMember,
                        onSelectRally = onSelectRally,
                    )
                }
            }
            // Taller drag/tap strip over the top (handle + name) when a detail is open;
            // the close-button corner (end) is left free. Drag to peek, tap to expand.
            if (detailOpen) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .fillMaxWidth()
                        .height(66.dp)
                        .padding(end = 54.dp)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                        ) {
                            if (sheetOffset.value > 8f) scope.launch { sheetOffset.animateTo(0f) }
                        }
                        .pointerInput(maxOffset) {
                            detectVerticalDragGestures(
                                onDragEnd = {
                                    val target = if (sheetOffset.value > maxOffset / 2f) maxOffset else 0f
                                    scope.launch { sheetOffset.animateTo(target) }
                                },
                            ) { change, dragAmount ->
                                change.consume()
                                scope.launch {
                                    sheetOffset.snapTo((sheetOffset.value + dragAmount).coerceIn(0f, maxOffset))
                                }
                            }
                        },
                )
            }
        }

        if (pendingRally != null) {
            RallyNameDialog(onConfirm = onConfirmRally, onCancel = onCancelRally)
        }
    }
}

@Composable
private fun MemberStrip(
    members: List<MemberView>,
    nearbyIds: Set<String>,
    rallyPoints: List<RallyPoint>,
    onSelect: (String) -> Unit,
    onSelectRally: (String?) -> Unit,
) {
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
                // Auto-detected nearby (BLE) without needing to open the detail.
                if (!mv.isSelf && nearbyIds.contains(mv.member.deviceId)) {
                    Text(
                        text = stringResource(R.string.nearby_badge),
                        color = ZzColor.Self,
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
        rallyPoints.forEach { rp ->
            Column(
                modifier = Modifier
                    .width(72.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .clickable { onSelectRally(rp.id) }
                    .padding(vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    modifier = Modifier
                        .size(46.dp)
                        .clip(CircleShape)
                        .background(ZzColor.Target),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(text = "📍", fontSize = 22.sp)
                }
                Text(
                    text = rp.name,
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
    estimate: NearbyEstimate?,
    uwb: UwbResult?,
    nearbyScanning: Boolean,
    canKick: Boolean,
    following: Boolean,
    onToggleFollow: () -> Unit,
    onKick: (String) -> Unit,
    onPoke: (String) -> Unit,
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
        OtherDetail(
            member, selfLocation, deviceHeading, estimate, uwb, nearbyScanning, canKick,
            onKick, onPoke, following, onToggleFollow,
        )
    }
}

/** "Follow / Stop following" — the single entry point into follow mode. */
@Composable
private fun FollowButton(
    following: Boolean,
    onToggle: () -> Unit,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    if (following) {
        OutlinedButton(onClick = onToggle, modifier = modifier.height(52.dp)) {
            Text(
                text = "◎ " + stringResource(R.string.follow_stop),
                color = accent,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
            )
        }
    } else {
        Button(
            onClick = onToggle,
            colors = ButtonDefaults.buttonColors(containerColor = accent),
            modifier = modifier.height(52.dp),
        ) {
            Text(
                text = "◎ " + stringResource(R.string.follow),
                fontWeight = FontWeight.Bold,
                maxLines = 1,
            )
        }
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
private fun RallyDetail(
    point: RallyPoint,
    selfLocation: LiveLocation?,
    deviceHeading: Float?,
    canEdit: Boolean,
    following: Boolean,
    onToggleFollow: () -> Unit,
    onSetRadius: (Int) -> Unit,
    onDelete: () -> Unit,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val distance =
        if (selfLocation != null) {
            Geo.formatDistance(Geo.distanceMeters(selfLocation.lat, selfLocation.lng, point.lat, point.lng))
        } else {
            "—"
        }
    val relative: Float? =
        if (selfLocation != null && deviceHeading != null) {
            (Geo.bearingDegrees(selfLocation.lat, selfLocation.lng, point.lat, point.lng).toFloat() - deviceHeading + 360f) % 360f
        } else {
            null
        }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(text = "📍 ${point.name}", color = ZzColor.Ink, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
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
    FollowButton(following = following, onToggle = onToggleFollow, accent = ZzColor.Target)
    Row(
        modifier = Modifier.padding(top = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DirectionPointer(relative)
        Metric(label = stringResource(R.string.distance), value = distance, modifier = Modifier.weight(1f))
        Metric(label = stringResource(R.string.rally_radius), value = "${point.radius} m", modifier = Modifier.weight(1f))
    }
    if (canEdit) {
        Box(modifier = Modifier.padding(top = 8.dp)) {
            RadiusChips(point.radius, onSetRadius)
        }
    }
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FollowButton(
            following = following,
            onToggle = onToggleFollow,
            accent = ZzColor.Target,
            modifier = Modifier.weight(1f),
        )
        OutlinedButton(
            onClick = {
                val uri =
                    Uri.parse("https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}&travelmode=walking")
                context.startActivity(Intent(Intent.ACTION_VIEW, uri))
            },
            modifier = Modifier.weight(1f).height(52.dp),
        ) {
            Text(stringResource(R.string.navigate), fontWeight = FontWeight.Bold)
        }
    }
    if (canEdit) {
        OutlinedButton(
            onClick = onDelete,
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFDC2626)),
        ) {
            Text(stringResource(R.string.delete_rally))
        }
    }
}

@Composable
private fun RallyNameDialog(onConfirm: (String, Int) -> Unit, onCancel: () -> Unit) {
    var name by remember { mutableStateOf("") }
    var radius by remember { mutableStateOf(100) }
    AlertDialog(
        onDismissRequest = onCancel,
        shape = RoundedCornerShape(22.dp),
        containerColor = ZzColor.Surface,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(text = "📍", fontSize = 20.sp)
                Text(stringResource(R.string.new_rally), fontWeight = FontWeight.Bold)
            }
        },
        text = {
            Column {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    label = { Text(stringResource(R.string.rally_name_label)) },
                    placeholder = { Text(stringResource(R.string.rally_default_name)) },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ZzColor.Target,
                        focusedLabelColor = ZzColor.Target,
                        cursorColor = ZzColor.Target,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    text = stringResource(R.string.rally_radius),
                    color = ZzColor.InkSoft,
                    fontSize = 12.5.sp,
                    modifier = Modifier.padding(top = 12.dp, bottom = 6.dp),
                )
                RadiusChips(radius) { radius = it }
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(name.trim().ifBlank { "集结点" }, radius) },
                colors = ButtonDefaults.buttonColors(containerColor = ZzColor.Target),
            ) {
                Text(stringResource(R.string.create))
            }
        },
        dismissButton = { TextButton(onClick = onCancel) { Text(stringResource(R.string.cancel), color = ZzColor.InkSoft) } },
    )
}

@Composable
private fun RadiusChips(selected: Int, onSelect: (Int) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(50, 100, 200, 500).forEach { r ->
            val active = r == selected
            OutlinedButton(
                onClick = { onSelect(r) },
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 2.dp),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = if (active) ZzColor.Target else ZzColor.InkSoft,
                ),
            ) {
                Text("${r}m", fontSize = 12.5.sp, fontWeight = if (active) FontWeight.Bold else FontWeight.Normal)
            }
        }
    }
}

@Composable
private fun OtherDetail(
    member: MemberView,
    selfLocation: LiveLocation?,
    deviceHeading: Float?,
    estimate: NearbyEstimate?,
    uwb: UwbResult?,
    nearbyScanning: Boolean,
    canKick: Boolean,
    onKick: (String) -> Unit,
    onPoke: (String) -> Unit,
    following: Boolean,
    onToggleFollow: () -> Unit,
) {
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

    // Follow and navigate are the two things you actually do with a person, so they
    // share one row: track them live, or hand off to turn-by-turn.
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FollowButton(
            following = following,
            onToggle = onToggleFollow,
            accent = ZzColor.Self,
            modifier = Modifier.weight(1f),
        )
        OutlinedButton(
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
            modifier = Modifier.weight(1f).height(52.dp),
        ) {
            Text(stringResource(R.string.navigate), fontWeight = FontWeight.Bold)
        }
    }

    member.location?.battery?.let { battery ->
        Text(
            text = "${stringResource(R.string.battery_label)} $battery%",
            color = ZzColor.InkSoft,
            fontSize = 12.5.sp,
            modifier = Modifier.padding(top = 8.dp),
        )
    }

    // Poke / quick messages.
    val pokes = listOf(
        stringResource(R.string.poke_poke),
        stringResource(R.string.poke_arrived),
        stringResource(R.string.poke_wait),
        stringResource(R.string.poke_where),
    )
    Row(
        modifier = Modifier
            .horizontalScroll(rememberScrollState())
            .padding(top = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        pokes.forEach { text ->
            OutlinedButton(onClick = { onPoke(text) }, contentPadding = PaddingValues(horizontal = 14.dp, vertical = 4.dp)) {
                Text(text, fontSize = 13.sp)
            }
        }
    }

    if (location != null && member.status != MemberStatus.ONLINE) {
        Text(
            text = stringResource(R.string.nav_stale_hint),
            color = ZzColor.Stale,
            fontSize = 12.sp,
            modifier = Modifier.padding(top = 8.dp),
        )
    }

    if (canKick) {
        OutlinedButton(
            onClick = { onKick(member.member.deviceId) },
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 10.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFDC2626)),
        ) {
            Text(stringResource(R.string.kick_member))
        }
    }

    // Indoor: GPS is unreliable, lean on Bluetooth to find each other.
    val accuracy = location?.accuracy ?: selfLocation?.accuracy
    if (accuracy != null && accuracy > 30) {
        Text(
            text = stringResource(R.string.nearby_indoor_hint),
            color = ZzColor.Stale,
            fontSize = 12.sp,
            modifier = Modifier.padding(top = 8.dp),
        )
    }

    if (uwb != null) {
        Row(
            modifier = Modifier.padding(top = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            UwbArrow(azimuthDeg = uwb.azimuthDeg)
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    text = stringResource(R.string.uwb_distance, String.format("%.1f", uwb.distanceMeters)),
                    color = ZzColor.Target,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = stringResource(R.string.uwb_precise),
                    color = ZzColor.InkSoft,
                    fontSize = 12.sp,
                )
            }
        }
    } else if (estimate != null) {
        val trendRes =
            when (estimate.trend) {
                NearbyTrend.CLOSER -> R.string.trend_closer
                NearbyTrend.FARTHER -> R.string.trend_farther
                NearbyTrend.STEADY -> R.string.trend_steady
            }
        Row(
            modifier = Modifier.padding(top = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            NearbyDirection(estimate.bestHeadingDeg, deviceHeading, estimate.trend)
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    text = stringResource(rangeRes(estimate.distanceMeters)),
                    color = ZzColor.Ink,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                )
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SignalBars(barsForRssi(estimate.rssi))
                    Text(
                        text = "${estimate.rssi} dBm · ${stringResource(trendRes)}",
                        color = ZzColor.InkSoft,
                        fontSize = 12.sp,
                    )
                }
                if (estimate.bestHeadingDeg == null) {
                    Text(
                        text = stringResource(R.string.nearby_dir_unknown),
                        color = ZzColor.InkFaint,
                        fontSize = 11.5.sp,
                    )
                }
            }
        }
    } else if (nearbyScanning) {
        Text(
            text = stringResource(R.string.nearby_searching),
            color = ZzColor.InkSoft,
            fontSize = 12.5.sp,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

/** Precise UWB bearing arrow (azimuth is a real angle to the peer). */
@Composable
private fun UwbArrow(azimuthDeg: Float?) {
    Box(
        modifier = Modifier
            .size(56.dp)
            .clip(CircleShape)
            .background(ZzColor.Target.copy(alpha = 0.14f)),
        contentAlignment = Alignment.Center,
    ) {
        if (azimuthDeg == null) {
            Text(text = "UWB", color = ZzColor.Target, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        } else {
            var continuous by remember { mutableStateOf(azimuthDeg) }
            LaunchedEffect(azimuthDeg) {
                continuous += ((azimuthDeg - (continuous % 360f) + 540f) % 360f) - 180f
            }
            val angle by animateFloatAsState(targetValue = continuous, label = "uwbDir")
            Canvas(modifier = Modifier.size(26.dp).rotate(angle)) {
                val w = size.width
                val h = size.height
                val path = Path().apply {
                    moveTo(w / 2f, 0f)
                    lineTo(w * 0.82f, h)
                    lineTo(w / 2f, h * 0.66f)
                    lineTo(w * 0.18f, h)
                    close()
                }
                drawPath(path, ZzColor.Target)
            }
        }
    }
}

/**
 * BLE near-distance badge. When a strongest-signal heading has been estimated
 * (detrended RSSI vs facing direction) it shows an arrow toward the peer relative
 * to the device; otherwise it falls back to a warmer/colder trend glyph. Rough
 * hint only — precise bearing comes from UWB.
 */
@Composable
private fun NearbyDirection(bestHeadingDeg: Float?, deviceHeading: Float?, trend: NearbyTrend) {
    val relative =
        if (bestHeadingDeg != null && deviceHeading != null) {
            ((bestHeadingDeg - deviceHeading + 360f) % 360f)
        } else {
            null
        }
    Box(
        modifier = Modifier
            .size(56.dp)
            .clip(CircleShape)
            .background(ZzColor.Self.copy(alpha = 0.14f)),
        contentAlignment = Alignment.Center,
    ) {
        if (relative != null) {
            var continuous by remember { mutableStateOf(relative) }
            LaunchedEffect(relative) {
                continuous += ((relative - (continuous % 360f) + 540f) % 360f) - 180f
            }
            val angle by animateFloatAsState(targetValue = continuous, label = "nearbyDir")
            Canvas(modifier = Modifier.size(26.dp).rotate(angle)) {
                val w = size.width
                val h = size.height
                val path = Path().apply {
                    moveTo(w / 2f, 0f)
                    lineTo(w * 0.82f, h)
                    lineTo(w / 2f, h * 0.66f)
                    lineTo(w * 0.18f, h)
                    close()
                }
                drawPath(path, ZzColor.Self)
            }
        } else {
            val (glyph, tint) =
                when (trend) {
                    NearbyTrend.CLOSER -> "↑" to ZzColor.Online
                    NearbyTrend.FARTHER -> "↓" to ZzColor.Stale
                    NearbyTrend.STEADY -> "•" to ZzColor.InkFaint
                }
            Text(text = glyph, color = tint, fontSize = 26.sp, fontWeight = FontWeight.Bold)
        }
    }
}

private fun rangeRes(distanceMeters: Double): Int =
    when {
        distanceMeters < 2 -> R.string.nearby_range_1
        distanceMeters < 5 -> R.string.nearby_range_2
        distanceMeters < 10 -> R.string.nearby_range_3
        distanceMeters < 20 -> R.string.nearby_range_4
        else -> R.string.nearby_range_5
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

private enum class FabIcon { Pause, Play, FitAll, Compass, Recenter }

/** Floating action button matching the web's rounded-16 glass FABs, with a
 *  Canvas-drawn icon (geometric, like the web icon set). */
/** 4-bar signal strength meter for BLE RSSI. */
@Composable
private fun SignalBars(level: Int) {
    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        listOf(6, 9, 12, 15).forEachIndexed { index, barHeight ->
            Box(
                modifier = Modifier
                    .width(3.dp)
                    .height(barHeight.dp)
                    .clip(RoundedCornerShape(1.dp))
                    .background(if (index < level) ZzColor.Self else ZzColor.Self.copy(alpha = 0.22f)),
            )
        }
    }
}

private fun barsForRssi(rssi: Int): Int =
    when {
        rssi >= -55 -> 4
        rssi >= -67 -> 3
        rssi >= -78 -> 2
        else -> 1
    }

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
                FabIcon.Recenter -> drawRecenterIcon(tint)
            }
        }
    }
}

private fun DrawScope.drawRecenterIcon(color: Color) {
    val w = size.width
    val h = size.height
    val cx = w / 2f
    val cy = h / 2f
    val sw = w * 0.09f
    drawCircle(color = color, radius = w * 0.26f, center = Offset(cx, cy), style = androidx.compose.ui.graphics.drawscope.Stroke(width = sw))
    drawCircle(color = color, radius = w * 0.07f, center = Offset(cx, cy))
    // crosshair ticks N/S/E/W
    drawLine(color, Offset(cx, h * 0.06f), Offset(cx, h * 0.2f), sw, StrokeCap.Round)
    drawLine(color, Offset(cx, h * 0.8f), Offset(cx, h * 0.94f), sw, StrokeCap.Round)
    drawLine(color, Offset(w * 0.06f, cy), Offset(w * 0.2f, cy), sw, StrokeCap.Round)
    drawLine(color, Offset(w * 0.8f, cy), Offset(w * 0.94f, cy), sw, StrokeCap.Round)
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

/**
 * Avatar map marker rendered to a real Bitmap (white ring + accent circle +
 * initial). Drawn via android.graphics for reliability across devices — the
 * Compose MarkerComposable path renders blank on some phones (e.g. Sony A13).
 */
/** Your heading arrow while following — a flat marker, so the SDK rotates it. */
@Composable
private fun rememberArrowDescriptor(): BitmapDescriptor {
    val density = LocalDensity.current.density
    return remember(density) {
        val size = (44 * density).toInt().coerceAtLeast(28)
        val bmp = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(bmp)
        val path = android.graphics.Path().apply {
            moveTo(size * 0.5f, size * 0.06f)
            lineTo(size * 0.86f, size * 0.92f)
            lineTo(size * 0.5f, size * 0.70f)
            lineTo(size * 0.14f, size * 0.92f)
            close()
        }
        val stroke = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.WHITE
            style = android.graphics.Paint.Style.STROKE
            strokeWidth = 3f * density
            strokeJoin = android.graphics.Paint.Join.ROUND
        }
        val fill = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            color = ZzColor.Self.toArgb()
        }
        canvas.drawPath(path, stroke)
        canvas.drawPath(path, fill)
        BitmapDescriptorFactory.fromBitmap(bmp)
    }
}

@Composable
private fun rememberAvatarDescriptor(initial: String, isSelf: Boolean, selected: Boolean): BitmapDescriptor {
    val density = LocalDensity.current
    val fill = (if (isSelf) ZzColor.Self else ZzColor.Target).toArgb()
    return remember(initial, isSelf, fill, selected) {
        val baseDp = if (selected) 56 else 44
        val sizePx = with(density) { baseDp.dp.toPx() }.toInt().coerceAtLeast(1)
        buildAvatarBitmap(initial, fill, sizePx, selected)
    }
}

private fun buildAvatarBitmap(initial: String, fillArgb: Int, sizePx: Int, selected: Boolean): BitmapDescriptor {
    val bitmap = android.graphics.Bitmap.createBitmap(sizePx, sizePx, android.graphics.Bitmap.Config.ARGB_8888)
    val canvas = android.graphics.Canvas(bitmap)
    val center = sizePx / 2f
    if (selected) {
        // Accent halo so the chosen target stands out.
        canvas.drawCircle(
            center,
            center,
            center,
            android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = fillArgb; alpha = 80 },
        )
    }
    val ringR = if (selected) center * 0.82f else center
    val ring = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.WHITE
    }
    canvas.drawCircle(center, center, ringR, ring)
    val fill = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = fillArgb }
    canvas.drawCircle(center, center, ringR * 0.82f, fill)
    val text = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.WHITE
        textAlign = android.graphics.Paint.Align.CENTER
        textSize = ringR * 0.7f
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val metrics = text.fontMetrics
    canvas.drawText(initial, center, center - (metrics.ascent + metrics.descent) / 2f, text)
    return BitmapDescriptorFactory.fromBitmap(bitmap)
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
 * Turn a relative bearing into the phrase you'd actually say out loud. Eight sectors:
 * precise enough to act on, coarse enough to read at a glance.
 */
private fun directionWordRes(relative: Float): Int {
    val signed = ((relative + 540f) % 360f) - 180f
    val a = kotlin.math.abs(signed)
    val right = signed > 0
    return when {
        a < 22.5f -> R.string.dir_ahead
        a < 67.5f -> if (right) R.string.dir_front_right else R.string.dir_front_left
        a < 112.5f -> if (right) R.string.dir_right else R.string.dir_left
        a < 157.5f -> if (right) R.string.dir_back_right else R.string.dir_back_left
        else -> R.string.dir_back
    }
}

/** One of the two big camera-mode buttons at the bottom of the follow view. */
@Composable
private fun FollowModeButton(
    active: Boolean,
    activeColor: Color,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .height(52.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(if (active) activeColor else Color(0xF0FFFFFF))
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (active) Color.White else ZzColor.Ink,
            fontSize = 14.5.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

/** Small arrow for the follow HUD; unwrapped angle so it never spins the long way. */
@Composable
private fun FollowArrow(
    relative: Float,
    color: Color,
    iconSize: androidx.compose.ui.unit.Dp = 22.dp,
) {
    var continuous by remember { mutableStateOf(relative) }
    LaunchedEffect(relative) {
        continuous += ((relative - (continuous % 360f) + 540f) % 360f) - 180f
    }
    val angle by animateFloatAsState(targetValue = continuous, label = "followArrow")
    Canvas(modifier = Modifier.size(iconSize).rotate(angle)) {
        val w = size.width
        val h = size.height
        val path = Path().apply {
            moveTo(w / 2f, 0f)
            lineTo(w * 0.82f, h)
            lineTo(w / 2f, h * 0.66f)
            lineTo(w * 0.18f, h)
            close()
        }
        drawPath(path, color = color)
    }
}

/** Street-level zoom the camera glides to when a target is selected. */
private const val TARGET_FOCUS_ZOOM = 17f

/*
 * Follow mode tuning (design.md §5.10) — kept in step with
 * packages/geo-utils/src/constants.ts so both platforms feel the same.
 */
/** Where you sit in the viewport (0 top → 1 bottom): 35% up from the bottom. */
private const val FOLLOW_ANCHOR_FRAC = 0.65f
private const val FOLLOW_MIN_ZOOM = 13.0
/** Riding side by side should not slam the camera to street level. */
private const val FOLLOW_MAX_ZOOM = 18.0
private const val FOLLOW_ZOOM_EPSILON = 0.2f
/**
 * Below this distance the camera may widen to hold the target on screen. Past it the
 * road scale wins and the edge indicator takes over.
 */
private const val FOLLOW_HOLD_BOTH_M = 300.0
private const val FOLLOW_CENTER_TAU_MS = 220.0
private const val FOLLOW_HEADING_TAU_MS = 90.0
/** GPS course arrives once per position packet, so it needs much more smoothing. */
private const val FOLLOW_GPS_HEADING_TAU_MS = 450.0

/** Last road-scale regime, held across recompositions for the hysteresis. */
private class RegimeRef {
    var key: String? = null
}

/** Desired follow camera, written by the sizing effect and read by the frame loop. */
private class DesiredCam {
    var valid: Boolean = false
    var lat: Double = 0.0
    var lng: Double = 0.0
    var zoom: Float = 0f
    /** True when the point should sit dead center (view both) rather than at the anchor. */
    var centered: Boolean = false
}

/** One smooth eased pan+zoom to the target (mirrors web). */
private suspend fun smoothFocus(camera: CameraPositionState, lat: Double, lng: Double) {
    runCatching {
        camera.animate(CameraUpdateFactory.newLatLngZoom(LatLng(lat, lng), TARGET_FOCUS_ZOOM), 900)
    }
}

/**
 * Track segment color by speed. Input is m/s; thresholds are in km/h: only
 * stopped/walking is red, slow riding warms to yellow, normal riding/driving is
 * green, with a smooth gradient between (mirrors web @zhinzen/geo-utils).
 */
private fun colorForSpeed(speedMps: Double): Color {
    val kmh = (speedMps * 3.6).coerceAtLeast(0.0)
    val stops =
        listOf(
            0.0 to Triple(220, 38, 38), // red — stopped / walking
            5.0 to Triple(220, 38, 38),
            18.0 to Triple(234, 179, 8), // yellow — slow riding / heavy traffic
            32.0 to Triple(34, 197, 94), // green — riding / driving
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
