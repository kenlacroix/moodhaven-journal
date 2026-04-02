package com.moodbloom.wear

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.widget.FrameLayout
import android.widget.TextView
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * TileActionActivity — transparent trampoline launched when a user taps a
 * mood emoji in the Wear OS Tile.
 *
 * Shows a brief full-colour confirmation, sends the signal, then finishes.
 * The tile is then refreshed via [androidx.wear.tiles.TileService.getUpdater].
 */
class TileActionActivity : FragmentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val moodLevel = intent.getStringExtra("mood_level")?.toIntOrNull() ?: run {
            finish()
            return
        }

        val mood = MOODS.firstOrNull { it.level == moodLevel } ?: run {
            finish()
            return
        }

        // Build a simple full-screen confirmation view without XML inflation
        val root = FrameLayout(this)
        val color = try { Color.parseColor(mood.colorHex) } catch (_: Exception) { Color.DKGRAY }
        root.setBackgroundColor(color)

        val label = TextView(this).apply {
            text = "${mood.emoji}\n${mood.label}"
            textSize = 22f
            setTextColor(Color.WHITE)
            gravity = android.view.Gravity.CENTER
        }
        root.addView(label, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            android.view.Gravity.CENTER
        ))
        setContentView(root)

        hapticTap(this)
        MoodHistory.record(this, mood.level)

        lifecycleScope.launch {
            val sent = SignalSender.sendMoodTap(this@TileActionActivity, mood.level)
            if (!sent) {
                // Signal queued — show error state so user knows it will retry
                root.setBackgroundColor(Color.parseColor("#7F1D1D"))
                label.text = "${mood.emoji}\nQueued"
                try {
                    val vib = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        (getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
                    } else {
                        @Suppress("DEPRECATION") getSystemService(VIBRATOR_SERVICE) as Vibrator
                    }
                    vib.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 30, 60, 30), -1))
                } catch (_: Exception) {}
            }
            androidx.wear.tiles.TileService.getUpdater(this@TileActionActivity)
                .requestUpdate(MoodTileService::class.java)
            delay(1200)
            finish()
        }
    }
}
