package com.moodbloom.wear

import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

/**
 * FeedbackService — receives /feedback messages from the phone app.
 *
 * The phone calls wearSendFeedback(nodeId, "saved") after successfully
 * persisting a signal. We respond with a haptic double-pulse to let the user
 * know the mood tap was recorded, even if they've glanced away.
 *
 * Message values:
 *   "saved"        — signal stored successfully → double pulse
 *   "error"        — storage failed → long buzz
 *   "prompt_ready" — AI prompt generated → reserved for future use
 */
class FeedbackService : WearableListenerService() {

    companion object {
        private const val TAG = "WearFeedback"
        // Two short pulses: "saved"
        private val PATTERN_SUCCESS = longArrayOf(0, 60, 80, 60)
        // One long buzz: "error"
        private val PATTERN_ERROR   = longArrayOf(0, 300)
    }

    override fun onMessageReceived(event: MessageEvent) {
        if (event.path != "/feedback") return

        val message = String(event.data, Charsets.UTF_8)
        Log.d(TAG, "Feedback from phone: $message")

        when (message) {
            "saved"        -> haptic(PATTERN_SUCCESS)
            "error"        -> haptic(PATTERN_ERROR)
            else           -> haptic(PATTERN_SUCCESS) // default: treat as success
        }
    }

    private fun haptic(pattern: LongArray) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vm.defaultVibrator.vibrate(
                    VibrationEffect.createWaveform(pattern, -1)
                )
            } else {
                @Suppress("DEPRECATION")
                val v = getSystemService(VIBRATOR_SERVICE) as Vibrator
                @Suppress("DEPRECATION")
                v.vibrate(pattern, -1)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Haptic failed: ${e.message}")
        }
    }
}
