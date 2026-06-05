package com.lazydoglab.zhinzen.nearby

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import java.security.MessageDigest

/** Coarse BLE proximity buckets (design.md §5.8 — never precise meters). */
enum class NearbyProximity { VERY_NEAR, NEAR, FAR, WEAK }

/**
 * BLE near-distance helper (design.md §5.8). Each device advertises a small
 * room-agnostic token derived from its deviceId in BLE manufacturer data, and
 * scans for peers' tokens, mapping RSSI to a coarse proximity bucket. RSSI is
 * noisy/affected by bodies and reflections, so we expose buckets only.
 *
 * Not a substitute for UWB precision; it's the fallback for "are they close?".
 */
class BleRangingController(context: Context) {
    private val appContext = context.applicationContext
    private val manager = appContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private val adapter get() = manager?.adapter

    private var advertiser: BluetoothLeAdvertiser? = null
    private var scanner: BluetoothLeScanner? = null
    private var advertiseCallback: AdvertiseCallback? = null
    private var scanCallback: ScanCallback? = null

    fun isSupported(): Boolean =
        adapter != null && appContext.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)

    fun hasPermission(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            granted(Manifest.permission.BLUETOOTH_SCAN) && granted(Manifest.permission.BLUETOOTH_ADVERTISE)
        } else {
            // Legacy BLUETOOTH/BLUETOOTH_ADMIN are install-time permissions.
            true
        }

    private fun granted(permission: String): Boolean =
        ContextCompat.checkSelfPermission(appContext, permission) == PackageManager.PERMISSION_GRANTED

    /** Start advertising our token + scanning for peers. Returns false if unavailable. */
    @SuppressLint("MissingPermission")
    fun start(selfDeviceId: String, onReading: (token: Int, rssi: Int) -> Unit): Boolean {
        if (!isSupported() || !hasPermission()) return false
        val a = adapter ?: return false
        if (!a.isEnabled) return false
        val adv = a.bluetoothLeAdvertiser ?: return false
        val scn = a.bluetoothLeScanner ?: return false

        // Runs continuously while in a room (auto nearby-detection), so use balanced
        // power rather than low-latency to keep battery cost reasonable.
        val settings =
            AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(false)
                .build()
        val data =
            AdvertiseData.Builder()
                .addManufacturerData(COMPANY_ID, tokenBytes(selfDeviceId))
                .build()
        val advCb = object : AdvertiseCallback() {}
        adv.startAdvertising(settings, data, advCb)

        val filter = ScanFilter.Builder().setManufacturerData(COMPANY_ID, ByteArray(0), ByteArray(0)).build()
        val scanSettings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
        val scnCb =
            object : ScanCallback() {
                override fun onScanResult(callbackType: Int, result: ScanResult) {
                    val md = result.scanRecord?.getManufacturerSpecificData(COMPANY_ID) ?: return
                    if (md.size >= 4) onReading(tokenInt(md), result.rssi)
                }
            }
        scn.startScan(listOf(filter), scanSettings, scnCb)

        advertiser = adv
        scanner = scn
        advertiseCallback = advCb
        scanCallback = scnCb
        return true
    }

    @SuppressLint("MissingPermission")
    fun stop() {
        advertiseCallback?.let { runCatching { advertiser?.stopAdvertising(it) } }
        scanCallback?.let { runCatching { scanner?.stopScan(it) } }
        advertiser = null
        scanner = null
        advertiseCallback = null
        scanCallback = null
    }

    companion object {
        // 0xFFFF is the reserved "for testing" company id — fine for dev.
        private const val COMPANY_ID = 0xFFFF

        fun tokenBytes(deviceId: String): ByteArray =
            MessageDigest.getInstance("SHA-256").digest(deviceId.toByteArray()).copyOf(4)

        fun tokenInt(deviceId: String): Int = bytesToInt(tokenBytes(deviceId))

        fun tokenInt(bytes: ByteArray): Int = bytesToInt(bytes)

        private fun bytesToInt(b: ByteArray): Int =
            ((b[0].toInt() and 0xFF) shl 24) or
                ((b[1].toInt() and 0xFF) shl 16) or
                ((b[2].toInt() and 0xFF) shl 8) or
                (b[3].toInt() and 0xFF)

        fun proximityForRssi(rssi: Int): NearbyProximity =
            when {
                rssi >= -55 -> NearbyProximity.VERY_NEAR
                rssi >= -70 -> NearbyProximity.NEAR
                rssi >= -85 -> NearbyProximity.FAR
                else -> NearbyProximity.WEAK
            }
    }
}
