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
import kotlin.math.sqrt

/**
 * HealthSnapshot — captures HR, step delta, and inferred activity at the moment of recording.
 *
 * Requires BODY_SENSORS permission. Returns null silently if the sensor is
 * unavailable or permission is denied — health context is optional.
 *
 * Result: {"hr":78,"steps":412,"activity":"walking"}
 */
object HealthSnapshot {

    private const val TAG = "HealthSnapshot"
    private const val HR_TIMEOUT_MS = 10_000L
    private const val ACCEL_TIMEOUT_MS = 5_000L
    private const val ACCEL_SAMPLE_COUNT = 10
    private const val PREFS_NAME = "moodbloom_health"
    private const val KEY_STEPS_BASELINE = "steps_baseline"

    @Volatile var lastHr: Int? = null
    @Volatile var lastHrTimestamp: Long? = null
    @Volatile var lastSteps: Int? = null
    @Volatile var lastActivity: String? = null

    suspend fun capture(context: Context): String? {
        if (!hasBodySensorPermission(context)) {
            Log.d(TAG, "BODY_SENSORS not granted — skipping snapshot")
            return null
        }

        val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        val hr = captureHeartRate(sm) ?: return null

        lastHr = hr
        lastHrTimestamp = System.currentTimeMillis()

        val steps = captureStepDelta(context, sm)
        val activity = captureActivity(sm)

        lastSteps = steps
        lastActivity = activity

        return JSONObject().apply {
            put("hr", hr)
            if (steps != null) put("steps", steps)
            put("activity", activity ?: "unknown")
        }.toString()
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
            if (hr == null) Log.i(TAG, "HR timeout — no reading in ${HR_TIMEOUT_MS}ms")
            else Log.d(TAG, "HR snapshot: $hr bpm")
        }
    }

    private suspend fun captureStepDelta(context: Context, sm: SensorManager): Int? {
        val sensor = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) ?: return null

        val totalSteps = withTimeoutOrNull(ACCEL_TIMEOUT_MS) {
            suspendCancellableCoroutine<Long> { cont ->
                val listener = object : SensorEventListener {
                    override fun onSensorChanged(event: SensorEvent) {
                        val value = event.values.firstOrNull() ?: return
                        sm.unregisterListener(this)
                        if (cont.isActive) cont.resume(value.toLong())
                    }
                    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {}
                }
                sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL)
                cont.invokeOnCancellation { sm.unregisterListener(listener) }
            }
        } ?: return null

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val baseline = prefs.getLong(KEY_STEPS_BASELINE, -1L)
        return if (baseline < 0L) {
            prefs.edit().putLong(KEY_STEPS_BASELINE, totalSteps).apply()
            0
        } else {
            val delta = (totalSteps - baseline).coerceAtLeast(0L).toInt()
            prefs.edit().putLong(KEY_STEPS_BASELINE, totalSteps).apply()
            delta
        }
    }

    private suspend fun captureActivity(sm: SensorManager): String? {
        val sensor = sm.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION) ?: return "unknown"

        val samples = mutableListOf<Float>()
        withTimeoutOrNull(ACCEL_TIMEOUT_MS) {
            suspendCancellableCoroutine { cont ->
                val listener = object : SensorEventListener {
                    override fun onSensorChanged(event: SensorEvent) {
                        val x = event.values[0]
                        val y = event.values[1]
                        val z = event.values[2]
                        samples += sqrt(x * x + y * y + z * z)
                        if (samples.size >= ACCEL_SAMPLE_COUNT) {
                            sm.unregisterListener(this)
                            if (cont.isActive) cont.resume(Unit)
                        }
                    }
                    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {}
                }
                sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_GAME)
                cont.invokeOnCancellation { sm.unregisterListener(listener) }
            }
        }

        if (samples.isEmpty()) return "unknown"
        val mean = samples.average().toFloat()
        return when {
            mean < 0.4f  -> "still"
            mean < 2.5f  -> "walking"
            else         -> "running"
        }
    }
}
