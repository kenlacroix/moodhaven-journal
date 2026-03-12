package com.moodbloom.wear

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs

/**
 * BreatheSummaryActivity — post-session results screen.
 *
 * Shows mode + cycles completed, elapsed time, and optional HR before/after
 * delta. "Record a note" returns to the Record page with a pre-filled context
 * tag. Auto-dismisses to Record page after 6 seconds if no interaction.
 */
class BreatheSummaryActivity : FragmentActivity() {

    companion object {
        const val EXTRA_MODE_ID    = "mode_id"
        const val EXTRA_CYCLES     = "cycles"
        const val EXTRA_ELAPSED_MS = "elapsed_ms"
        const val EXTRA_HR_BEFORE  = "hr_before"
        const val EXTRA_HR_AFTER   = "hr_after"
    }

    private var userInteracted = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_breathe_summary)

        val modeId    = intent.getStringExtra(EXTRA_MODE_ID) ?: "balance"
        val mode      = BreathingMode.byId(modeId)
        val cycles    = intent.getIntExtra(EXTRA_CYCLES,     mode.defaultCycles)
        val elapsedMs = intent.getLongExtra(EXTRA_ELAPSED_MS, 0L)
        val hrBefore  = intent.getIntExtra(EXTRA_HR_BEFORE, 0).takeIf { it > 0 }
        val hrAfter   = intent.getIntExtra(EXTRA_HR_AFTER,  0).takeIf { it > 0 }

        // Mode + cycles
        findViewById<TextView>(R.id.summaryModeLabel).apply {
            text = "${mode.emoji} ${mode.name} · ${cycles}×"
            try { setTextColor(android.graphics.Color.parseColor(mode.colorHex)) }
            catch (_: Exception) {}
        }

        // Elapsed time
        val totalSec = (elapsedMs / 1000).toInt()
        val mins     = totalSec / 60
        val secs     = totalSec % 60
        findViewById<TextView>(R.id.summaryElapsed).text =
            if (secs == 0) "$mins min" else "$mins min $secs sec"

        // HR block
        val hrBlock = findViewById<LinearLayout>(R.id.hrBlock)
        if (hrBefore != null && hrAfter != null) {
            hrBlock.visibility = View.VISIBLE
            findViewById<TextView>(R.id.summaryHrBefore).text = "HR before:  $hrBefore"
            findViewById<TextView>(R.id.summaryHrAfter ).text = "HR after:   $hrAfter"
            val delta    = hrAfter - hrBefore
            val deltaStr = if (delta <= 0) "↓ ${abs(delta)} bpm" else "↑ $delta bpm"
            val deltaView = findViewById<TextView>(R.id.summaryHrDelta)
            deltaView.text = deltaStr
            deltaView.setTextColor(
                if (delta <= 0) android.graphics.Color.parseColor("#10B981")
                else            android.graphics.Color.parseColor("#F87171")
            )
        }

        // Buttons
        val btnNote = findViewById<Button>(R.id.btnRecordNote)
        val btnDone = findViewById<Button>(R.id.btnDone)

        btnNote.setOnClickListener {
            userInteracted = true
            navigateToRecord(prefill = "Post-${mode.name}")
        }
        btnDone.setOnClickListener {
            userInteracted = true
            navigateToRecord(prefill = null)
        }

        // Auto-dismiss after 6 seconds
        lifecycleScope.launch {
            delay(6_000)
            if (!userInteracted) navigateToRecord(prefill = null)
        }
    }

    private fun navigateToRecord(prefill: String?) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(MainActivity.EXTRA_START_PAGE, MainActivity.PAGE_RECORD)
            prefill?.let { putExtra(MainActivity.EXTRA_RECORD_PREFILL, it) }
        }
        startActivity(intent)
        finish()
    }
}
