package com.moodbloom.wear

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.MotionEvent
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * BreatheSessionActivity — full-screen guided breathing session.
 *
 * Animated ring expands on inhale, contracts on exhale. Phase countdown
 * ticks every second. Haptic feedback marks phase transitions.
 *
 * Crown rotation → skip current phase early.
 * Tap anywhere     → pause overlay with Resume / End session.
 */
class BreatheSessionActivity : FragmentActivity() {

    companion object {
        const val EXTRA_MODE_ID   = "mode_id"
        const val EXTRA_CYCLES    = "cycles"
        const val EXTRA_HR_BEFORE = "hr_before"
    }

    private enum class Phase { INHALE, HOLD1, EXHALE, HOLD2 }

    private lateinit var mode:        BreathingMode
    private var totalCycles:  Int   = 8
    private var hrBefore:     Int?  = null

    private lateinit var ringView:      BreatheRingView
    private lateinit var tvPhase:       TextView
    private lateinit var tvCountdown:   TextView
    private lateinit var tvCycle:       TextView
    private lateinit var pauseOverlay:  LinearLayout
    private lateinit var btnResume:     Button
    private lateinit var btnEnd:        Button

    private var sessionJob:  Job     = Job()
    @Volatile private var isPaused:  Boolean = false
    @Volatile private var skipPhase: Boolean = false
    private var startMs:     Long    = 0L

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_breathe_session)

        val modeId    = intent.getStringExtra(EXTRA_MODE_ID) ?: "balance"
        mode          = BreathingMode.byId(modeId)
        totalCycles   = intent.getIntExtra(EXTRA_CYCLES, mode.defaultCycles)
        val hrRaw     = intent.getIntExtra(EXTRA_HR_BEFORE, 0)
        hrBefore      = if (hrRaw > 0) hrRaw else null

        ringView     = findViewById(R.id.breatheRing)
        tvPhase      = findViewById(R.id.tvPhase)
        tvCountdown  = findViewById(R.id.tvCountdown)
        tvCycle      = findViewById(R.id.tvCycle)
        pauseOverlay = findViewById(R.id.pauseOverlay)
        btnResume    = findViewById(R.id.btnResume)
        btnEnd       = findViewById(R.id.btnEnd)

        ringView.setModeColor(mode.colorHex)

        // Tap root → pause
        findViewById<View>(R.id.sessionRoot).setOnClickListener {
            if (pauseOverlay.visibility != View.VISIBLE) showPause()
        }
        btnResume.setOnClickListener { hidePause() }
        btnEnd.setOnClickListener {
            sessionJob.cancel()
            finishSession()
        }

        startMs = System.currentTimeMillis()
        startSession()
    }

    override fun onDestroy() {
        super.onDestroy()
        sessionJob.cancel()
    }

    // ── Session coroutine ─────────────────────────────────────────────────────

    private fun startSession() {
        sessionJob = lifecycleScope.launch {
            for (cycle in 1..totalCycles) {
                if (!isActive) return@launch
                tvCycle.text = "cycle $cycle / $totalCycles"

                val p = mode.pattern
                runPhase(Phase.INHALE, p[0])
                if (p[1] > 0 && isActive) runPhase(Phase.HOLD1, p[1])
                if (isActive)             runPhase(Phase.EXHALE, p[2])
                if (p[3] > 0 && isActive) runPhase(Phase.HOLD2, p[3])
                if (isActive) vibrate(longArrayOf(0, 40)) // cycle complete
            }
            if (isActive) {
                vibrate(longArrayOf(0, 100, 80, 100, 80, 200)) // session complete
                finishSession()
            }
        }
    }

    private suspend fun runPhase(phase: Phase, durationSec: Int) {
        vibratePhaseStart(phase)
        skipPhase = false

        val expanded  = phase == Phase.INHALE || phase == Phase.HOLD1
        val targetF   = if (expanded) 0.90f else 0.40f
        ringView.animateTo(targetF, durationSec * 1000L)

        tvPhase.text = when (phase) {
            Phase.INHALE          -> "Inhale…"
            Phase.HOLD1, Phase.HOLD2 -> "Hold…"
            Phase.EXHALE          -> "Exhale…"
        }

        // Count down second by second
        for (remaining in durationSec downTo 1) {
            if (!lifecycleScope.isActive || skipPhase) break
            tvCountdown.text = remaining.toString()
            awaitSecond()
            if (skipPhase) break
        }
    }

    /** Waits ~1 second, suspending cleanly while paused. */
    private suspend fun awaitSecond() {
        val deadline = System.currentTimeMillis() + 1_000L
        while (System.currentTimeMillis() < deadline) {
            if (!lifecycleScope.isActive || skipPhase) return
            while (isPaused) delay(50)
            delay(40)
        }
    }

    // ── Pause overlay ─────────────────────────────────────────────────────────

    private fun showPause() {
        isPaused              = true
        pauseOverlay.visibility = View.VISIBLE
    }

    private fun hidePause() {
        isPaused              = false
        pauseOverlay.visibility = View.GONE
    }

    // ── Crown / bezel — skip to next phase ───────────────────────────────────

    override fun onGenericMotionEvent(event: MotionEvent): Boolean {
        if (event.action == MotionEvent.ACTION_SCROLL) {
            skipPhase = true
            return true
        }
        return super.onGenericMotionEvent(event)
    }

    // ── Finish ────────────────────────────────────────────────────────────────

    private fun finishSession() {
        val elapsed = System.currentTimeMillis() - startMs
        // Capture post-session HR in background; pass result via SharedPrefs
        lifecycleScope.launch {
            val hrJson  = HealthSnapshot.capture(applicationContext)
            val hrAfter = hrJson?.let {
                try { org.json.JSONObject(it).optInt("hr", 0).takeIf { v -> v > 0 } }
                catch (_: Exception) { null }
            }
            showSummary(elapsed, hrAfter)
        }
    }

    private fun showSummary(elapsedMs: Long, hrAfter: Int?) {
        val intent = Intent(this, BreatheSummaryActivity::class.java).apply {
            putExtra(BreatheSummaryActivity.EXTRA_MODE_ID,    mode.id)
            putExtra(BreatheSummaryActivity.EXTRA_CYCLES,     totalCycles)
            putExtra(BreatheSummaryActivity.EXTRA_ELAPSED_MS, elapsedMs)
            hrBefore?.let { putExtra(BreatheSummaryActivity.EXTRA_HR_BEFORE, it) }
            hrAfter?.let  { putExtra(BreatheSummaryActivity.EXTRA_HR_AFTER,  it) }
        }
        startActivity(intent)
        finish()
    }

    // ── Haptics ───────────────────────────────────────────────────────────────

    private fun vibratePhaseStart(phase: Phase) = when (phase) {
        Phase.INHALE              -> vibrate(longArrayOf(0, 20))
        Phase.EXHALE              -> vibrate(longArrayOf(0, 20, 80, 20))
        Phase.HOLD1, Phase.HOLD2  -> { /* silence = cue */ }
    }

    private fun vibrate(pattern: LongArray) {
        try {
            val vibrator: Vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION") getSystemService(VIBRATOR_SERVICE) as Vibrator
            }
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
        } catch (_: Exception) {}
    }
}
