package com.lazydoglab.zhinzen.service

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.ValueEventListener
import com.lazydoglab.zhinzen.MainActivity
import com.lazydoglab.zhinzen.R
import com.lazydoglab.zhinzen.data.Backend
import com.lazydoglab.zhinzen.data.Geo
import com.lazydoglab.zhinzen.data.LiveLocation
import com.lazydoglab.zhinzen.device.DeviceIdentityStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Foreground service that keeps sharing this device's live location while the app
 * is backgrounded (design.md §3.2, §8.3). It owns the fused-location updates and
 * uploads (live → RTDB, adaptive track → Firestore) so they survive the Activity
 * lifecycle, with a persistent "sharing location" notification.
 *
 * Started while the app is in the foreground, so the foreground-service location
 * exemption applies; "allow all the time" background location further extends it.
 */
class LocationSharingService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val fused: FusedLocationProviderClient by lazy {
        LocationServices.getFusedLocationProviderClient(this)
    }
    private val identityStore: DeviceIdentityStore by lazy { DeviceIdentityStore(this) }
    private var roomId: String? = null
    private var lastUploadAt = 0L
    private var lastTrackAt = 0L
    private var lastTrackLat: Double? = null
    private var lastTrackLng: Double? = null

    private val callback =
        object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.lastLocation?.let { onLocation(it) }
            }
        }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val rid = intent?.getStringExtra(EXTRA_ROOM_ID)
        if (rid == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        roomId = rid
        startForegroundCompat()
        setupPresence(rid, identityStore.loadOrCreate().deviceId)
        startUpdates()
        return START_STICKY
    }

    /**
     * RTDB presence: re-arm an onDisconnect that flips our live location to
     * not-sharing whenever the connection drops (app killed / network lost), so
     * peers stop seeing us as online almost immediately.
     */
    private fun setupPresence(rid: String, deviceId: String) {
        val liveRef = Backend.database.getReference("liveLocations/$rid/$deviceId")
        Backend.database.getReference(".info/connected").addValueEventListener(
            object : ValueEventListener {
                override fun onDataChange(snapshot: DataSnapshot) {
                    if (snapshot.getValue(Boolean::class.java) == true) {
                        liveRef.child("sharingLocation").onDisconnect().setValue(false)
                    }
                }

                override fun onCancelled(error: DatabaseError) {}
            },
        )
    }

    @SuppressLint("MissingPermission")
    private fun startUpdates() {
        val request =
            LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 3000L)
                .setMinUpdateIntervalMillis(1000L)
                .build()
        fused.requestLocationUpdates(request, callback, Looper.getMainLooper())
    }

    private fun onLocation(loc: Location) {
        val rid = roomId ?: return
        val identity = identityStore.loadOrCreate()
        val now = System.currentTimeMillis()
        val live =
            LiveLocation(
                deviceId = identity.deviceId,
                displayName = identity.displayName,
                lat = loc.latitude,
                lng = loc.longitude,
                accuracy = loc.accuracy.toDouble(),
                heading = if (loc.hasBearing()) loc.bearing.toDouble() else null,
                speed = if (loc.hasSpeed()) loc.speed.toDouble() else 0.0,
                updatedAt = now,
                sharingLocation = true,
                battery = readBatteryPercent(),
            )

        if (now - lastUploadAt >= 3000L) {
            lastUploadAt = now
            Backend.database.getReference("liveLocations/$rid/${identity.deviceId}").setValue(live)
        }

        val elapsed = now - lastTrackAt
        val movedEnough =
            lastTrackLat?.let { Geo.distanceMeters(it, lastTrackLng ?: 0.0, live.lat, live.lng) >= 12.0 } ?: true
        if ((elapsed >= 2_500L && movedEnough) || elapsed >= 20_000L) {
            lastTrackAt = now
            lastTrackLat = live.lat
            lastTrackLng = live.lng
            scope.launch { runCatching { Backend.appendTrackPoint(identity, rid, live) } }
        }
    }

    private fun readBatteryPercent(): Int? {
        val bm = getSystemService(Context.BATTERY_SERVICE) as? android.os.BatteryManager ?: return null
        val pct = bm.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY)
        return pct.takeIf { it in 0..100 }
    }

    private fun startForegroundCompat() {
        createChannel()
        val openApp =
            PendingIntent.getActivity(
                this,
                0,
                Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE,
            )
        val notification =
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(getString(R.string.app_name))
                .setContentText(getString(R.string.sharing_notification))
                .setSmallIcon(R.drawable.ic_notification)
                .setOngoing(true)
                .setContentIntent(openApp)
                .build()
        ServiceCompat.startForeground(
            this,
            NOTIF_ID,
            notification,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            } else {
                0
            },
        )
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                manager.createNotificationChannel(
                    NotificationChannel(
                        CHANNEL_ID,
                        getString(R.string.sharing_channel),
                        NotificationManager.IMPORTANCE_LOW,
                    ),
                )
            }
        }
    }

    override fun onDestroy() {
        fused.removeLocationUpdates(callback)
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL_ID = "location_sharing"
        private const val NOTIF_ID = 1001
        private const val EXTRA_ROOM_ID = "roomId"

        fun start(context: Context, roomId: String) {
            val intent =
                Intent(context, LocationSharingService::class.java).putExtra(EXTRA_ROOM_ID, roomId)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, LocationSharingService::class.java))
        }
    }
}
