package com.lazydoglab.zhinzen.util

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.lazydoglab.zhinzen.MainActivity
import com.lazydoglab.zhinzen.R
import java.util.concurrent.atomic.AtomicInteger

/** Posts user-facing alerts (arrivals, low battery, pokes) as system notifications. */
object Notifier {
    private const val CHANNEL_ID = "zhinzen_alerts"
    private val nextId = AtomicInteger(2000)

    fun alert(context: Context, title: String, text: String) {
        val ctx = context.applicationContext
        ensureChannel(ctx)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val open =
            PendingIntent.getActivity(
                ctx,
                0,
                Intent(ctx, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
        val notification =
            NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(text)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(open)
                .build()
        NotificationManagerCompat.from(ctx).notify(nextId.incrementAndGet(), notification)
    }

    private fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = ctx.getSystemService(NotificationManager::class.java)
            if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                manager.createNotificationChannel(
                    NotificationChannel(CHANNEL_ID, ctx.getString(R.string.alert_channel), NotificationManager.IMPORTANCE_HIGH),
                )
            }
        }
    }
}
