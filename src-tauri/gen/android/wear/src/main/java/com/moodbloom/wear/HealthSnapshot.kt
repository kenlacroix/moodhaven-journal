package com.moodbloom.wear

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.util.Log
import androidx.core.content.ContextCompat
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import kotlin.coroutines.resume

/**
 * HealthSnapshot — captures a single HR reading at the moment of recording.
 *
 * Requires BODY_SENSORS permission. Returns null silently if the sensor is
 * unavailable or permission is denied — health context is optional.
 *
 * Result is a compact JSON string: {"hr":78} suitable for storing in
 * voice_memos.health_json and passing to the phone for insights enrichment.
 */
object HealthSnapshot {

    private const val TAG = "HealthSnapshot"
    private const val HR_TIMEOUT_MS = 10_000L

    /** Most recent successfully captured HR, used by BreatheFragment suggestion chip. */
    @Volatile var lastHr: Int? = null

    /**
     * Capture a single heart rate reading. Returns JSON or null.
     * Safe to call from any coroutine context; suspends on Dispatchers.IO.
     */
    suspend fun capture(context: Context): String? {
        if (!hasBodySensorPermission(context)) {
            Log.d(TAG, "BODY_SENSORS not granted — skipping HR snapshot")
            return null
        }

        val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        val hr = captureHeartRate(sm) ?: return null

        lastHr = hr
        return JSONObject().apply { put("hr", hr) }.toString()
    }

    private fun hasBodySensorPermission(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.BODY_SENSORS) ==
                PackageManager.PERMISSION_GRANTED

    private suspend fun captureHeartRate(sm: SensorManager): Int? {
        val sensor = sm.getDefaultSensor(Sensor.TYPE_HEART_RATE) ?: run {
            Log.d(TAG, "No HR sensor on this device")
            return null
        }

        return withTimeoutOrNull(HR_TIMEOUT_MS) {
            suspendCancellableCoroutine { cont ->
                val listener = object : SensorEventListener {
                    override fun onSensorChanged(event: SensorEvent) {
                        val value = event.values.firstOrNull() ?: return
                        if (value > 0f) {
                            sm.unregisterListener(this)
                            if (cont.isActive) cont.resume(value.toInt())
                        }
                    }
                    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {}
                }
                sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_FASTEST)
                cont.invokeOnCancellation { sm.unregisterListener(listener) }
            }
        }.also { hr ->
            if (hr == null) Log.d(TAG, "HR timeout — no reading in ${HR_TIMEOUT_MS}ms")
            else Log.d(TAG, "HR snapshot: $hr bpm")
        }
    }
}
