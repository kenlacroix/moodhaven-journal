package com.moodbloom.wear

import android.content.Intent
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
 * Features:
 *  - Mood picker (5 moods, WearableRecyclerView)
 *  - Full-colour confirmation screen
 *  - Offline queue: signals saved locally when phone unreachable
 *  - Queued badge: dot shown when unsent signals are pending
 *  - History button → HistoryActivity
 *  - Offline drain: retries queued signals on resume
 */
class MainActivity : FragmentActivity() {

    private lateinit var pickerLayer: View
    private lateinit var moodList: WearableRecyclerView
    private lateinit var historyBtn: View
    private lateinit var queuedBadge: TextView

    private lateinit var confirmationOverlay: View
    private lateinit var confirmEmoji: TextView
    private lateinit var confirmMoodName: TextView
    private lateinit var confirmLabel: TextView

    private lateinit var queuedOverlay: View
    private lateinit var queuedEmoji: TextView

    private var isSending = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        pickerLayer         = findViewById(R.id.pickerLayer)
        moodList            = findViewById(R.id.moodList)
        historyBtn          = findViewById(R.id.historyBtn)
        queuedBadge         = findViewById(R.id.queuedBadge)

        confirmationOverlay = findViewById(R.id.confirmationOverlay)
        confirmEmoji        = findViewById(R.id.confirmEmoji)
        confirmMoodName     = findViewById(R.id.confirmMoodName)
        confirmLabel        = findViewById(R.id.confirmLabel)

        queuedOverlay       = findViewById(R.id.queuedOverlay)
        queuedEmoji         = findViewById(R.id.queuedEmoji)

        moodList.isEdgeItemsCenteringEnabled = true
        moodList.layoutManager = WearableLinearLayoutManager(this)
        moodList.adapter = MoodAdapter(MOODS) { mood -> onMoodSelected(mood) }

        historyBtn.setOnClickListener {
            startActivity(Intent(this, HistoryActivity::class.java))
        }

        updateQueuedBadge()
    }

    override fun onResume() {
        super.onResume()
        // Drain any offline-queued signals each time the app comes to the foreground
        lifecycleScope.launch {
            val sent = SignalSender.drainAndSend(this@MainActivity)
            if (sent > 0) updateQueuedBadge()
        }
    }

    // ── Mood selection ────────────────────────────────────────────────────────

    private fun onMoodSelected(mood: MoodItem) {
        if (isSending) return
        isSending = true
        hapticTap(this)

        lifecycleScope.launch {
            // Record to local history regardless of send outcome
            MoodHistory.record(this@MainActivity, mood.level)

            val sent = SignalSender.sendMoodTap(this@MainActivity, mood.level)
            isSending = false

            if (sent) {
                showConfirmation(mood)
            } else {
                showQueued(mood)
            }
            updateQueuedBadge()
        }
    }

    // ── Overlays ──────────────────────────────────────────────────────────────

    private fun showConfirmation(mood: MoodItem) {
        val color = try { Color.parseColor(mood.colorHex) } catch (_: IllegalArgumentException) { Color.DKGRAY }

        confirmEmoji.text    = mood.emoji
        confirmMoodName.text = mood.label
        confirmationOverlay.setBackgroundColor(color)
        confirmationOverlay.visibility = View.VISIBLE
        pickerLayer.visibility = View.GONE

        lifecycleScope.launch {
            delay(1500)
            finish()
        }
    }

    private fun showQueued(mood: MoodItem) {
        queuedEmoji.text = mood.emoji
        queuedOverlay.visibility = View.VISIBLE
        pickerLayer.visibility = View.GONE

        lifecycleScope.launch {
            delay(2000)
            queuedOverlay.visibility = View.GONE
            pickerLayer.visibility = View.VISIBLE
        }
    }

    private fun updateQueuedBadge() {
        val count = OfflineQueue.size(this)
        queuedBadge.visibility = if (count > 0) View.VISIBLE else View.GONE
        if (count > 0) queuedBadge.text = "● $count queued"
    }
}
