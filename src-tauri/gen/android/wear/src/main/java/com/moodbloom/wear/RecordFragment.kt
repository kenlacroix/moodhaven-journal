package com.moodbloom.wear

import android.Manifest
import android.animation.ObjectAnimator
import android.content.pm.PackageManager
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

/**
 * RecordFragment — the primary watch page (page 1, default).
 *
 * Tap the large button to start/stop a voice recording.
 * Long-press while recording to discard.
 * Tapping 😊 navigates to the mood picker page.
 *
 * On resume, the audio queue is drained automatically if there are pending
 * transfers that failed while the phone was out of range.
 */
class RecordFragment : Fragment() {

    interface Callback {
        fun onNavigateToMoodPicker()
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    private lateinit var recordBtn: FrameLayout_compat
    private lateinit var recordIcon: TextView
    private lateinit var durationText: TextView
    private lateinit var statusText: TextView
    private lateinit var transferStatus: TextView
    private lateinit var queueBadge: TextView
    private lateinit var quickMoodBtn: View
    private lateinit var longPressHint: TextView

    // ── State ─────────────────────────────────────────────────────────────────

    private var session: RecordingSession? = null
    private var pulseAnimator: ObjectAnimator? = null
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
        recordBtn      = view.findViewById(R.id.recordBtn)
        recordIcon     = view.findViewById(R.id.recordIcon)
        durationText   = view.findViewById(R.id.durationText)
        statusText     = view.findViewById(R.id.statusText)
        transferStatus = view.findViewById(R.id.transferStatus)
        queueBadge     = view.findViewById(R.id.queueBadge)
        quickMoodBtn   = view.findViewById(R.id.quickMoodBtn)
        longPressHint  = view.findViewById(R.id.longPressHint)

        recordBtn.setOnClickListener { onRecordTap() }
        recordBtn.setOnLongClickListener { onRecordLongPress(); true }
        quickMoodBtn.setOnClickListener {
            (activity as? Callback)?.onNavigateToMoodPicker()
        }

        setIdleUI()
        refreshQueueBadge()
    }

    override fun onResume() {
        super.onResume()
        refreshQueueBadge()
        if (session == null) {
            lifecycleScope.launch {
                val sent = AudioTransferService.drainQueue(requireContext())
                if (sent > 0) refreshQueueBadge()
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        timerHandler.removeCallbacks(timerRunnable)
        pulseAnimator?.cancel()
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
        setRecordingUI()
    }

    private fun stopRecording() {
        val s = session ?: return
        session = null
        stopTimer()
        stopPulse()
        val result = s.stop()
        hapticTap(requireContext())

        if (result == null) { setIdleUI(); statusText.text = "Nothing captured"; return }

        setSendingUI()

        lifecycleScope.launch {
            // Capture health in background (non-blocking — times out after 10s)
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
                showSentUI(result.durationMs)
            } else {
                AudioQueue.enqueue(requireContext(), result, healthJson)
                showQueuedUI()
            }
            refreshQueueBadge()
        }
    }

    // ── UI helpers ────────────────────────────────────────────────────────────

    private fun setIdleUI() {
        recordBtn.isActivated = false
        recordIcon.text       = "🎙"
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
        // Show long-press hint briefly then hide
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

// Type alias so the compiler resolves R.id.recordBtn as a FrameLayout.
// WearableRecyclerView is a View; FrameLayout is also a View. We just need the
// isActivated setter, which lives on View — so any View subtype works.
private typealias FrameLayout_compat = android.view.View
