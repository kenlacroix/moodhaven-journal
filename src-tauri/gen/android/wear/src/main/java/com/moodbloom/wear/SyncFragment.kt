package com.moodbloom.wear

import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * SyncFragment — page 4 (rightmost).
 *
 * Phase 2 additions:
 *  • Recordings today count (from SyncStats)
 *  • Last sync relative time (from SyncStats)
 *  • Voice memo queue and mood signal queue shown separately
 *  • Sync now also drains voice memo queue
 */
class SyncFragment : Fragment() {

    private lateinit var connectionDot:      View
    private lateinit var connectionStatus:   TextView
    private lateinit var phoneName:          TextView
    private lateinit var recordingsTodayText: TextView
    private lateinit var lastSyncText:       TextView
    private lateinit var voiceQueueCount:    TextView
    private lateinit var moodQueueCount:     TextView
    private lateinit var retryBtn:           TextView

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View = inflater.inflate(R.layout.fragment_sync, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        connectionDot      = view.findViewById(R.id.connectionDot)
        connectionStatus   = view.findViewById(R.id.connectionStatus)
        phoneName          = view.findViewById(R.id.phoneName)
        recordingsTodayText = view.findViewById(R.id.recordingsTodayText)
        lastSyncText       = view.findViewById(R.id.lastSyncText)
        voiceQueueCount    = view.findViewById(R.id.voiceQueueCount)
        moodQueueCount     = view.findViewById(R.id.moodQueueCount)
        retryBtn           = view.findViewById(R.id.retryBtn)

        retryBtn.setOnClickListener { drainQueues() }
        refreshData()
    }

    override fun onResume() {
        super.onResume()
        refreshData()
    }

    private fun refreshData() {
        updateCounters()
        checkConnection()
    }

    private fun updateCounters() {
        val ctx         = requireContext()
        val voiceQ      = AudioQueue.size(ctx)
        val moodQ       = OfflineQueue.size(ctx)
        val totalQ      = voiceQ + moodQ
        val recToday    = SyncStats.recordingsTodayCount(ctx)
        val lastSync    = SyncStats.lastSyncRelative(ctx)

        val recLabel = if (recToday == 1) "1 recording" else "$recToday recordings"
        recordingsTodayText.text = recLabel
        lastSyncText.text        = lastSync
        voiceQueueCount.text     = "$voiceQ"
        moodQueueCount.text      = "$moodQ"

        retryBtn.visibility = if (totalQ > 0) View.VISIBLE else View.GONE
        retryBtn.text = "↑ Sync now"
    }

    private fun checkConnection() {
        connectionStatus.text = "Checking…"
        connectionDot.background?.setTint(Color.GRAY)

        lifecycleScope.launch {
            val nodes = runCatching {
                withContext(Dispatchers.IO) {
                    Tasks.await(Wearable.getNodeClient(requireContext()).connectedNodes)
                }
            }.getOrNull()

            if (nodes.isNullOrEmpty()) {
                connectionDot.background?.setTint(Color.parseColor("#EF4444"))
                connectionStatus.text = "Disconnected"
                phoneName.text        = "Phone not reachable"
            } else {
                connectionDot.background?.setTint(Color.parseColor("#10B981"))
                connectionStatus.text = "Connected"
                phoneName.text        = nodes.first().displayName
            }
        }
    }

    private fun drainQueues() {
        retryBtn.text      = "Syncing…"
        retryBtn.isEnabled = false

        lifecycleScope.launch {
            // Drain voice memos
            val voiceSent = AudioTransferService.drainQueue(requireContext())
            if (voiceSent > 0) {
                repeat(voiceSent) { SyncStats.recordSynced(requireContext()) }
            }
            // Drain mood signals
            SignalSender.drainAndSend(requireContext())

            updateCounters()
            retryBtn.isEnabled = true
            val total = voiceSent
            retryBtn.text = if (total > 0) "✓ Sent $total" else "↑ Sync now"
        }
    }
}
