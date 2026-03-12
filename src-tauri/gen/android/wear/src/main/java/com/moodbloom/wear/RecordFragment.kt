package com.moodbloom.wear

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import android.Manifest
import android.content.pm.PackageManager

/**
 * RecordFragment — primary watch page (page 1, default).
 *
 * Phase 2 additions:
 *  • ArcProgressView fills during recording (10-minute indicator)
 *  • quickMoodBtn replaced by [😊 Mood] [🧘 Breathe] shortcuts row
 *  • SyncStats.recordSynced() called on successful transfer
 */
class RecordFragment : Fragment() {

    interface Callback {
        fun onNavigateToMoodPicker()
        fun onNavigateToBreathe()
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    private lateinit var recordBtn:        View
    private lateinit var recordIcon:       TextView
    private lateinit var durationText:     TextView
    private lateinit var statusText:       TextView
    private lateinit var transferStatus:   TextView
    private lateinit var queueBadge:       TextView
    private lateinit var longPressHint:    TextView
    private lateinit var arcProgress:      ArcProgressView

    // ── State ─────────────────────────────────────────────────────────────────

    private var session: RecordingSession? = null
    private var pulseAnimator: ObjectAnimator? = null
    private var arcAnimator: ValueAnimator? = null
    private val timerHandler = Handler(Looper.getMainLooper())
    private var recordStartMs = 0L

    private val timerRunnable = object : Runnable {
        override fun run() {
            val s = (System.currentTimeMillis() - recordStartMs) / 1000
            durationText.text = "%d:%02d".format(s / 60, s % 60)
            timerHandler.postDelayed(this, 500)
        }
    }

    // ── Permission request ────────────────────────────────────────────────────

    private val requestMic = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (grants[Manifest.permission.RECORD_AUDIO] == true) {
            startRecording()
        } else {
            statusText.text = "Mic permission needed"
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?,
    ): View = inflater.inflate(R.layout.fragment_record, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        recordBtn          = view.findViewById(R.id.recordBtn)
        recordIcon         = view.findViewById(R.id.recordIcon)
        durationText       = view.findViewById(R.id.durationText)
        statusText         = view.findViewById(R.id.statusText)
        transferStatus     = view.findViewById(R.id.transferStatus)
        queueBadge         = view.findViewById(R.id.queueBadge)
        longPressHint      = view.findViewById(R.id.longPressHint)
        arcProgress        = view.findViewById(R.id.arcProgress)

        recordBtn.setOnClickListener { onRecordTap() }
        recordBtn.setOnLongClickListener { onRecordLongPress(); true }

        setIdleUI()
        refreshQueueBadge()
    }

    override fun onResume() {
        super.onResume()
        refreshQueueBadge()
        if (session == null) {
            lifecycleScope.launch {
                val sent = AudioTransferService.drainQueue(requireContext())
                if (sent > 0) {
                    SyncStats.recordSynced(requireContext())
                    refreshQueueBadge()
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        timerHandler.removeCallbacks(timerRunnable)
        pulseAnimator?.cancel()
        arcAnimator?.cancel()
    }

    // ── Button actions ────────────────────────────────────────────────────────

    private fun onRecordTap() {
        if (session?.isRecording == true) stopRecording() else startRecording()
    }

    private fun onRecordLongPress() {
        if (session?.isRecording != true) return
        hapticTap(requireContext())
        session?.discard()
        session = null
        stopTimer()
        stopPulse()
        stopArc()
        setIdleUI()
        statusText.text = "Discarded"
        view?.postDelayed({ if (isAdded) setIdleUI() }, 1_500)
    }

    // ── Recording lifecycle ───────────────────────────────────────────────────

    private fun startRecording() {
        val perms = mutableListOf<String>()
        if (!hasPerm(Manifest.permission.RECORD_AUDIO)) perms += Manifest.permission.RECORD_AUDIO
        if (perms.isNotEmpty()) { requestMic.launch(perms.toTypedArray()); return }

        val s = RecordingSession(requireContext(), onAutoStop = { stopRecording() })
        if (!s.start()) { statusText.text = "Mic unavailable"; return }

        session = s
        hapticTap(requireContext())
        recordStartMs = System.currentTimeMillis()
        startTimer()
        startPulse()
        startArc()
        setRecordingUI()
    }

    private fun stopRecording() {
        val s = session ?: return
        session = null
        stopTimer()
        stopPulse()
        stopArc()
        val result = s.stop()
        hapticTap(requireContext())

        if (result == null) { setIdleUI(); statusText.text = "Nothing captured"; return }

        setSendingUI()

        lifecycleScope.launch {
            val healthJson = withContext(Dispatchers.IO) {
                runCatching { HealthSnapshot.capture(requireContext()) }.getOrNull()
            }

            val pending = AudioQueue.PendingAudio(
                id         = result.id,
                filePath   = result.file.absolutePath,
                durationMs = result.durationMs,
                timestamp  = result.timestamp,
                healthJson = healthJson,
            )

            val sent = AudioTransferService.transfer(requireContext(), pending)

            if (sent) {
                runCatching { result.file.delete() }
                SyncStats.recordSynced(requireContext())
                showSentUI(result.durationMs)
            } else {
                AudioQueue.enqueue(requireContext(), result, healthJson)
                showQueuedUI()
            }
            refreshQueueBadge()
        }
    }

    // ── Arc animation ─────────────────────────────────────────────────────────

    private fun startArc() {
        arcAnimator?.cancel()
        arcProgress.progress = 0f
        arcAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration    = RecordingSession.MAX_DURATION_MS.toLong()
            interpolator = android.view.animation.LinearInterpolator()
            addUpdateListener { arcProgress.progress = it.animatedValue as Float }
            start()
        }
    }

    private fun stopArc() {
        arcAnimator?.cancel()
        arcAnimator = null
        arcProgress.progress = 0f
    }

    // ── UI helpers ────────────────────────────────────────────────────────────

    private fun setIdleUI() {
        recordBtn.isActivated     = false
        recordIcon.text           = "🎙"
        durationText.visibility   = View.GONE
        statusText.text           = "Tap to record"
        transferStatus.visibility = View.GONE
        longPressHint.visibility  = View.GONE
    }

    private fun setRecordingUI() {
        recordBtn.isActivated     = true
        recordIcon.text           = "⏹"
        durationText.visibility   = View.VISIBLE
        durationText.text         = "0:00"
        statusText.text           = "Recording…"
        transferStatus.visibility = View.GONE
        longPressHint.visibility  = View.VISIBLE
        view?.postDelayed({ if (isAdded) longPressHint.visibility = View.GONE }, 2_000)
    }

    private fun setSendingUI() {
        recordBtn.isActivated     = false
        recordIcon.text           = "🎙"
        durationText.visibility   = View.GONE
        statusText.text           = "Sending…"
        transferStatus.visibility = View.GONE
        longPressHint.visibility  = View.GONE
    }

    private fun showSentUI(durationMs: Long) {
        val s = durationMs / 1000
        statusText.text           = "✓ Sent"
        durationText.visibility   = View.VISIBLE
        durationText.text         = "%d:%02d".format(s / 60, s % 60)
        transferStatus.visibility = View.VISIBLE
        transferStatus.text       = "Saved to phone"
        view?.postDelayed({ if (isAdded) setIdleUI() }, 2_500)
    }

    private fun showQueuedUI() {
        statusText.text           = "Saved for later"
        transferStatus.visibility = View.VISIBLE
        transferStatus.text       = "Syncs when phone is near"
        view?.postDelayed({ if (isAdded) setIdleUI() }, 2_500)
    }

    private fun refreshQueueBadge() {
        val count = AudioQueue.size(requireContext())
        queueBadge.visibility = if (count > 0) View.VISIBLE else View.GONE
        if (count > 0) queueBadge.text = "● $count queued"
    }

    // ── Timer ─────────────────────────────────────────────────────────────────

    private fun startTimer() {
        timerHandler.removeCallbacks(timerRunnable)
        timerHandler.post(timerRunnable)
    }

    private fun stopTimer() {
        timerHandler.removeCallbacks(timerRunnable)
    }

    // ── Pulse animation ───────────────────────────────────────────────────────

    private fun startPulse() {
        pulseAnimator?.cancel()
        pulseAnimator = ObjectAnimator.ofFloat(recordBtn, "scaleX", 1f, 1.07f).apply {
            duration    = 650
            repeatCount = ObjectAnimator.INFINITE
            repeatMode  = ObjectAnimator.REVERSE
            addUpdateListener { recordBtn.scaleY = recordBtn.scaleX }
            start()
        }
    }

    private fun stopPulse() {
        pulseAnimator?.cancel()
        pulseAnimator = null
        recordBtn.scaleX = 1f
        recordBtn.scaleY = 1f
    }

    // ── Permission helper ─────────────────────────────────────────────────────

    private fun hasPerm(p: String) =
        ContextCompat.checkSelfPermission(requireContext(), p) == PackageManager.PERMISSION_GRANTED
}
