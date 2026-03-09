package com.moodbloom.wear

import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.widget.TextView
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import androidx.wear.widget.WearableLinearLayoutManager
import androidx.wear.widget.WearableRecyclerView
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * MoodBloom Watch — main entry point.
 *
 * Opens directly to the mood picker. No splash, no onboarding — the watch
 * experience is intentionally instant: open → tap mood → done.
 *
 * View-based implementation using WearableRecyclerView (no Compose dependency).
 */
class MainActivity : FragmentActivity() {

    private lateinit var moodList: WearableRecyclerView
    private lateinit var confirmationOverlay: View
    private lateinit var confirmEmoji: TextView
    private lateinit var confirmLabel: TextView
    private lateinit var confirmMoodName: TextView
    private lateinit var errorOverlay: View

    private var isSending = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        moodList          = findViewById(R.id.moodList)
        confirmationOverlay = findViewById(R.id.confirmationOverlay)
        confirmEmoji      = findViewById(R.id.confirmEmoji)
        confirmLabel      = findViewById(R.id.confirmLabel)
        confirmMoodName   = findViewById(R.id.confirmMoodName)
        errorOverlay      = findViewById(R.id.errorOverlay)

        moodList.isEdgeItemsCenteringEnabled = true
        moodList.layoutManager = WearableLinearLayoutManager(this)
        moodList.adapter = MoodAdapter(MOODS) { mood -> onMoodSelected(mood) }
    }

    private fun onMoodSelected(mood: MoodItem) {
        if (isSending) return
        isSending = true
        hapticTap(this)

        lifecycleScope.launch {
            val ok = SignalSender.sendMoodTap(this@MainActivity, mood.level)
            isSending = false
            if (ok) showConfirmation(mood) else showError()
        }
    }

    private fun showConfirmation(mood: MoodItem) {
        confirmEmoji.text = mood.emoji
        confirmMoodName.text = mood.label

        // Tint the "Logged" label with the mood colour
        try {
            confirmLabel.setTextColor(Color.parseColor(mood.colorHex))
        } catch (_: IllegalArgumentException) {
            confirmLabel.setTextColor(Color.WHITE)
        }

        confirmationOverlay.visibility = View.VISIBLE
        moodList.visibility = View.GONE

        lifecycleScope.launch {
            delay(1500)
            finish()
        }
    }

    private fun showError() {
        errorOverlay.visibility = View.VISIBLE
        moodList.visibility = View.GONE

        lifecycleScope.launch {
            delay(1500)
            errorOverlay.visibility = View.GONE
            moodList.visibility = View.VISIBLE
        }
    }
}
