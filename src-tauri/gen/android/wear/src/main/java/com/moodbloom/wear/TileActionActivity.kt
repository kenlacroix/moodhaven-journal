package com.moodbloom.wear

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.widget.FrameLayout
import android.widget.TextView
import androidx.lifecycle.lifecycleScope
import androidx.fragment.app.FragmentActivity
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
            SignalSender.sendMoodTap(this@TileActionActivity, mood.level)
            // Refresh the tile so the highlighted button updates
            androidx.wear.tiles.TileService.getUpdater(this@TileActionActivity)
                .requestUpdate(MoodTileService::class.java)
            delay(1200)
            finish()
        }
    }
}
