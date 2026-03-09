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
 * MainActivity — host for the 3-page swipe UI.
 *
 * Page 0 ← History | Page 1 (default) = Mood Picker | Page 2 → Sync Status
 *
 * The mood picker calls back into here (via [MoodPickerFragment.Callback]) so
 * that confirmation overlays float above the ViewPager and are always visible
 * regardless of which page the user is on during the send animation.
 */
class MainActivity : FragmentActivity(), MoodPickerFragment.Callback {

    companion object {
        private const val PAGE_HISTORY = 0
        private const val PAGE_PICKER  = 1
        private const val PAGE_SYNC    = 2
    }

    private lateinit var viewPager: ViewPager2
    private lateinit var dots: List<View>

    private lateinit var confirmationOverlay: View
    private lateinit var confirmEmoji: TextView
    private lateinit var confirmMoodName: TextView

    private lateinit var queuedOverlay: View
    private lateinit var queuedEmoji: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        viewPager           = findViewById(R.id.viewPager)
        confirmationOverlay = findViewById(R.id.confirmationOverlay)
        confirmEmoji        = findViewById(R.id.confirmEmoji)
        confirmMoodName     = findViewById(R.id.confirmMoodName)
        queuedOverlay       = findViewById(R.id.queuedOverlay)
        queuedEmoji         = findViewById(R.id.queuedEmoji)

        dots = listOf(
            findViewById(R.id.dot0),
            findViewById(R.id.dot1),
            findViewById(R.id.dot2),
        )

        viewPager.adapter = MainPagerAdapter(this)
        viewPager.setCurrentItem(PAGE_PICKER, false)

        viewPager.registerOnPageChangeCallback(object : ViewPager2.OnPageChangeCallback() {
            override fun onPageSelected(position: Int) = updateDots(position)
        })

        updateDots(PAGE_PICKER)
    }

    override fun onResume() {
        super.onResume()
        // Drain offline queue silently on every app open
        lifecycleScope.launch {
            SignalSender.drainAndSend(this@MainActivity)
        }
    }

    // ── MoodPickerFragment.Callback ──────────────────────────────────────────

    override fun onMoodSelected(mood: MoodItem) {
        hapticTap(this)
        MoodHistory.record(this, mood.level)

        lifecycleScope.launch {
            val sent = SignalSender.sendMoodTap(this@MainActivity, mood.level)
            if (sent) showConfirmation(mood) else showQueued(mood)
        }
    }

    // ── Overlays ──────────────────────────────────────────────────────────────

    private suspend fun showConfirmation(mood: MoodItem) {
        val color = try { Color.parseColor(mood.colorHex) } catch (_: Exception) { Color.DKGRAY }
        confirmEmoji.text    = mood.emoji
        confirmMoodName.text = mood.label
        confirmationOverlay.setBackgroundColor(color)

        confirmationOverlay.visibility = View.VISIBLE
        delay(1400)
        confirmationOverlay.visibility = View.GONE
        // Return to picker after confirming
        viewPager.setCurrentItem(PAGE_PICKER, true)
    }

    private suspend fun showQueued(mood: MoodItem) {
        queuedEmoji.text = mood.emoji
        queuedOverlay.visibility = View.VISIBLE
        delay(2000)
        queuedOverlay.visibility = View.GONE
        viewPager.setCurrentItem(PAGE_PICKER, true)
    }

    // ── Dots ──────────────────────────────────────────────────────────────────

    private fun updateDots(selected: Int) {
        dots.forEachIndexed { i, dot ->
            dot.alpha = if (i == selected) 1.0f else 0.3f
        }
    }

    // ── Pager adapter ─────────────────────────────────────────────────────────

    private inner class MainPagerAdapter(fa: FragmentActivity) : FragmentStateAdapter(fa) {
        override fun getItemCount(): Int = 3
        override fun createFragment(position: Int): Fragment = when (position) {
            PAGE_HISTORY -> HistoryFragment()
            PAGE_PICKER  -> MoodPickerFragment()
            PAGE_SYNC    -> SyncFragment()
            else         -> throw IllegalStateException("Unknown page $position")
        }
    }
}
