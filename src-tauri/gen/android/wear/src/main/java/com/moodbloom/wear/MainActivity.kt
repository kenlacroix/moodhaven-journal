package com.moodbloom.wear

import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import androidx.viewpager2.adapter.FragmentStateAdapter
import androidx.viewpager2.widget.ViewPager2
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * MainActivity — host for the 4-page swipe UI.
 *
 * Page 0 ← History   | recorded memos + mood taps
 * Page 1   Record     | (DEFAULT) — voice recording primary action
 * Page 2 → Mood       | quick emoji mood picker
 * Page 3 → Sync       | connection status, queue, retry
 *
 * Mood confirmations and queued overlays float above the ViewPager so they
 * are visible regardless of which page is showing.
 */
class MainActivity : FragmentActivity(),
    MoodPickerFragment.Callback,
    RecordFragment.Callback {

    companion object {
        const val PAGE_HISTORY = 0
        const val PAGE_RECORD  = 1   // default
        const val PAGE_MOOD    = 2
        const val PAGE_SYNC    = 3
    }

    private lateinit var viewPager: ViewPager2
    private lateinit var dots: List<View>

    // Mood confirmation overlay
    private lateinit var confirmationOverlay: View
    private lateinit var confirmEmoji: TextView
    private lateinit var confirmMoodName: TextView
    private lateinit var addNoteBtn: TextView

    // Offline-queued overlay
    private lateinit var queuedOverlay: View
    private lateinit var queuedEmoji: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        viewPager           = findViewById(R.id.viewPager)
        confirmationOverlay = findViewById(R.id.confirmationOverlay)
        confirmEmoji        = findViewById(R.id.confirmEmoji)
        confirmMoodName     = findViewById(R.id.confirmMoodName)
        addNoteBtn          = findViewById(R.id.addNoteBtn)
        queuedOverlay       = findViewById(R.id.queuedOverlay)
        queuedEmoji         = findViewById(R.id.queuedEmoji)

        dots = listOf(
            findViewById(R.id.dot0),
            findViewById(R.id.dot1),
            findViewById(R.id.dot2),
            findViewById(R.id.dot3),
        )

        viewPager.adapter = MainPagerAdapter(this)
        viewPager.setCurrentItem(PAGE_RECORD, false)
        viewPager.registerOnPageChangeCallback(object : ViewPager2.OnPageChangeCallback() {
            override fun onPageSelected(position: Int) = updateDots(position)
        })
        updateDots(PAGE_RECORD)
    }

    override fun onResume() {
        super.onResume()
        // Drain audio queue silently on every foreground
        lifecycleScope.launch { AudioTransferService.drainQueue(this@MainActivity) }
        // Drain mood signal queue
        lifecycleScope.launch { SignalSender.drainAndSend(this@MainActivity) }
    }

    // ── MoodPickerFragment.Callback ──────────────────────────────────────────

    override fun onMoodSelected(mood: MoodItem) {
        hapticTap(this)
        MoodHistory.record(this, mood.level)

        lifecycleScope.launch {
            val sent = SignalSender.sendMoodTap(this@MainActivity, mood.level)
            if (sent) showMoodConfirmation(mood) else showMoodQueued(mood)
        }
    }

    // ── RecordFragment.Callback ──────────────────────────────────────────────

    override fun onNavigateToMoodPicker() {
        viewPager.setCurrentItem(PAGE_MOOD, true)
    }

    // ── Navigation helpers ───────────────────────────────────────────────────

    fun navigateToRecord() {
        viewPager.setCurrentItem(PAGE_RECORD, true)
    }

    // ── Overlays ──────────────────────────────────────────────────────────────

    private suspend fun showMoodConfirmation(mood: MoodItem) {
        val color = try { Color.parseColor(mood.colorHex) } catch (_: Exception) { Color.DKGRAY }
        confirmEmoji.text    = mood.emoji
        confirmMoodName.text = mood.label
        confirmationOverlay.setBackgroundColor(color)
        addNoteBtn.visibility = View.GONE
        confirmationOverlay.visibility = View.VISIBLE

        // Show "Add a note" button after brief pause
        delay(400)
        if (confirmationOverlay.visibility != View.VISIBLE) return
        addNoteBtn.visibility = View.VISIBLE
        addNoteBtn.setOnClickListener {
            confirmationOverlay.visibility = View.GONE
            navigateToRecord()
        }

        // Auto-dismiss after 2.4 s total
        delay(2_000)
        confirmationOverlay.visibility = View.GONE
        addNoteBtn.visibility = View.GONE
    }

    private suspend fun showMoodQueued(mood: MoodItem) {
        queuedEmoji.text = mood.emoji
        queuedOverlay.visibility = View.VISIBLE
        delay(2_000)
        queuedOverlay.visibility = View.GONE
    }

    // ── Dots ──────────────────────────────────────────────────────────────────

    private fun updateDots(selected: Int) {
        dots.forEachIndexed { i, dot ->
            dot.alpha = if (i == selected) 1f else 0.28f
        }
    }

    // ── Pager adapter ─────────────────────────────────────────────────────────

    private inner class MainPagerAdapter(fa: FragmentActivity) : FragmentStateAdapter(fa) {
        override fun getItemCount() = 4
        override fun createFragment(position: Int): Fragment = when (position) {
            PAGE_HISTORY -> HistoryFragment()
            PAGE_RECORD  -> RecordFragment()
            PAGE_MOOD    -> MoodPickerFragment()
            PAGE_SYNC    -> SyncFragment()
            else         -> throw IllegalStateException("Unknown page $position")
        }
    }
}
