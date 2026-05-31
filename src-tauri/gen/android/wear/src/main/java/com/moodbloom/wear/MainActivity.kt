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
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * MainActivity — host for the 5-page swipe UI.
 *
 * Page 0 ← History   | recorded memos + mood taps
 * Page 1   Record     | (DEFAULT) — voice recording primary action
 * Page 2 → Mood       | quick emoji mood picker
 * Page 3 → Breathe    | guided breathing modes
 * Page 4 → Sync       | connection status, queue, retry
 */
class MainActivity : FragmentActivity(),
    MoodPickerFragment.Callback,
    RecordFragment.Callback {

    companion object {
        const val PAGE_HISTORY = 0
        const val PAGE_RECORD  = 1   // default
        const val PAGE_MOOD    = 2
        const val PAGE_BREATHE = 3
        const val PAGE_SYNC    = 4

        /** From BreatheSummaryActivity: which page to land on after a session. */
        const val EXTRA_START_PAGE    = "start_page"
        /** Pre-filled context tag passed to RecordFragment e.g. "Post-Balance". */
        const val EXTRA_RECORD_PREFILL = "record_prefill"
    }

    private lateinit var viewPager: ViewPager2
    private lateinit var dots: List<View>

    private lateinit var confirmationOverlay: View
    private lateinit var confirmEmoji:        TextView
    private lateinit var confirmMoodName:     TextView
    private lateinit var addNoteBtn:          TextView
    private lateinit var queuedOverlay:       View
    private lateinit var queuedEmoji:         TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
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
            findViewById(R.id.dot4),
        )

        viewPager.adapter = MainPagerAdapter(this)
        viewPager.setPageTransformer { page, position ->
            val absPos = Math.abs(position)
            page.alpha = 1f - absPos * 0.5f
            page.scaleX = 1f - absPos * 0.08f
            page.scaleY = page.scaleX
        }

        // BreatheSummaryActivity can request a specific start page
        val startPage = intent.getIntExtra(EXTRA_START_PAGE, PAGE_RECORD)
        viewPager.setCurrentItem(startPage, false)
        viewPager.registerOnPageChangeCallback(object : ViewPager2.OnPageChangeCallback() {
            override fun onPageSelected(position: Int) = updateDots(position)
        })
        updateDots(startPage)
    }

    override fun onResume() {
        super.onResume()
        lifecycleScope.launch { AudioTransferService.drainQueue(this@MainActivity) }
        lifecycleScope.launch { SignalSender.drainAndSend(this@MainActivity) }
    }

    // ── MoodPickerFragment.Callback ──────────────────────────────────────────

    override fun onMoodSelected(mood: MoodItem) {
        hapticTap(this)
        window.decorView.postDelayed({ hapticTap(this) }, 80)
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

    override fun onNavigateToBreathe() {
        viewPager.setCurrentItem(PAGE_BREATHE, true)
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

        delay(400)
        if (confirmationOverlay.visibility != View.VISIBLE) return
        addNoteBtn.visibility = View.VISIBLE
        addNoteBtn.setOnClickListener {
            confirmationOverlay.visibility = View.GONE
            navigateToRecord()
        }

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
        override fun getItemCount() = 5
        override fun createFragment(position: Int): Fragment = when (position) {
            PAGE_HISTORY -> HistoryFragment()
            PAGE_RECORD  -> RecordFragment()
            PAGE_MOOD    -> MoodPickerFragment()
            PAGE_BREATHE -> BreatheFragment()
            PAGE_SYNC    -> SyncFragment()
            else         -> throw IllegalStateException("Unknown page $position")
        }
    }
}
