package com.moodbloom.wear

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

/**
 * BreatheModeDetailActivity — shows mode description, cycle adjuster, and Begin button.
 *
 * Launched by BreatheFragment when the user taps a mode.
 * On Begin: captures a resting HR snapshot (non-blocking), then starts
 * BreatheSessionActivity.
 */
class BreatheModeDetailActivity : FragmentActivity() {

    companion object {
        const val EXTRA_MODE_ID = "mode_id"
        const val MIN_CYCLES    = 3
        const val MAX_CYCLES    = 20
    }

    private lateinit var mode:    BreathingMode
    private var cycles:   Int  = 8

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_breathe_mode_detail)

        val modeId = intent.getStringExtra(EXTRA_MODE_ID) ?: "balance"
        mode   = BreathingMode.byId(modeId)
        cycles = mode.defaultCycles

        val tvEmoji   = findViewById<TextView>(R.id.detailEmoji)
        val tvName    = findViewById<TextView>(R.id.detailName)
        val tvTagline = findViewById<TextView>(R.id.detailTagline)
        val tvDesc    = findViewById<TextView>(R.id.detailDesc)
        val tvPattern = findViewById<TextView>(R.id.detailPattern)
        val tvCycles  = findViewById<TextView>(R.id.detailCycles)
        val tvTime    = findViewById<TextView>(R.id.detailTime)
        val btnMinus  = findViewById<Button>(R.id.btnMinus)
        val btnPlus   = findViewById<Button>(R.id.btnPlus)
        val btnBegin  = findViewById<Button>(R.id.btnBegin)

        tvEmoji.text   = mode.emoji
        tvName.text    = mode.name
        tvTagline.text = mode.tagline
        tvDesc.text    = mode.description
        tvPattern.text = mode.patternLabel()

        // Tint the Begin button with the mode colour
        try {
            btnBegin.setBackgroundColor(android.graphics.Color.parseColor(mode.colorHex))
        } catch (_: Exception) {}

        fun refresh() {
            tvCycles.text = "$cycles cycles"
            tvTime.text   = mode.approxTimeLabel(cycles)
        }
        refresh()

        btnMinus.setOnClickListener { if (cycles > MIN_CYCLES) { cycles--; refresh() } }
        btnPlus.setOnClickListener  { if (cycles < MAX_CYCLES) { cycles++; refresh() } }

        btnBegin.setOnClickListener {
            btnBegin.isEnabled = false
            btnBegin.text      = "…"
            lifecycleScope.launch {
                // Non-blocking resting HR capture (≤10s timeout)
                val hrJson  = HealthSnapshot.capture(applicationContext)
                val hrBefore = hrJson?.let {
                    try { org.json.JSONObject(it).optInt("hr", 0).takeIf { v -> v > 0 } }
                    catch (_: Exception) { null }
                }
                // Cache for suggestion chip in BreatheFragment
                hrBefore?.let { HealthSnapshot.lastHr = it }
                startSession(hrBefore)
            }
        }
    }

    private fun startSession(hrBefore: Int?) {
        val intent = Intent(this, BreatheSessionActivity::class.java).apply {
            putExtra(BreatheSessionActivity.EXTRA_MODE_ID,   mode.id)
            putExtra(BreatheSessionActivity.EXTRA_CYCLES,    cycles)
            hrBefore?.let { putExtra(BreatheSessionActivity.EXTRA_HR_BEFORE, it) }
        }
        startActivity(intent)
        finish()
    }
}
