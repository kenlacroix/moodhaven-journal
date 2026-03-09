package com.moodbloom.wear

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

// ── Mood model ────────────────────────────────────────────────────────────────

data class MoodItem(
    val level: Int,        // 1–5 matching MoodBloom scale
    val emoji: String,
    val label: String,
    val colorHex: String,
)

val MOODS = listOf(
    MoodItem(5, "😊", "Great", "#10B981"),
    MoodItem(4, "🙂", "Good",  "#84CC16"),
    MoodItem(3, "😐", "Okay",  "#EAB308"),
    MoodItem(2, "😔", "Low",   "#F97316"),
    MoodItem(1, "😢", "Bad",   "#EF4444"),
)

// ── Haptic helper ─────────────────────────────────────────────────────────────

internal fun hapticTap(context: Context) {
    try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vm.defaultVibrator.vibrate(
                VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK)
            )
        } else {
            @Suppress("DEPRECATION")
            val v = context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            v.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE))
        }
    } catch (e: Exception) {
        Log.w("MoodBloomWear", "Haptic tap failed: ${e.message}")
    }
}
