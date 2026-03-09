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
 * SyncFragment — rightmost swipe page.
 * Shows phone connection status, pending queue count, last logged mood,
 * and a "Sync now" button that drains the offline queue.
 */
class SyncFragment : Fragment() {

    private lateinit var connectionDot: View
    private lateinit var connectionStatus: TextView
    private lateinit var phoneName: TextView
    private lateinit var queueCount: TextView
    private lateinit var lastLogged: TextView
    private lateinit var retryBtn: TextView

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View = inflater.inflate(R.layout.fragment_sync, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        connectionDot    = view.findViewById(R.id.connectionDot)
        connectionStatus = view.findViewById(R.id.connectionStatus)
        phoneName        = view.findViewById(R.id.phoneName)
        queueCount       = view.findViewById(R.id.queueCount)
        lastLogged       = view.findViewById(R.id.lastLogged)
        retryBtn         = view.findViewById(R.id.retryBtn)

        retryBtn.setOnClickListener { drainQueue() }
        refreshData()
    }

    override fun onResume() {
        super.onResume()
        refreshData()
    }

    private fun refreshData() {
        updateQueueUI()
        updateLastLogged()
        checkConnection()
    }

    private fun updateQueueUI() {
        val count = OfflineQueue.size(requireContext())
        queueCount.text = "$count"
        retryBtn.visibility = if (count > 0) View.VISIBLE else View.GONE
    }

    private fun updateLastLogged() {
        val latest = MoodHistory.load(requireContext()).firstOrNull()
        lastLogged.text = if (latest != null) {
            "${latest.mood.emoji} ${latest.mood.label} · ${latest.displayTime()}"
        } else "—"
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

            if (nodes == null || nodes.isEmpty()) {
                connectionDot.background?.setTint(Color.parseColor("#EF4444"))
                connectionStatus.text = "Disconnected"
                phoneName.text = "Phone not reachable"
            } else {
                connectionDot.background?.setTint(Color.parseColor("#10B981"))
                connectionStatus.text = "Connected"
                phoneName.text = nodes.first().displayName
            }
        }
    }

    private fun drainQueue() {
        retryBtn.text = "Syncing…"
        retryBtn.isEnabled = false

        lifecycleScope.launch {
            val sent = SignalSender.drainAndSend(requireContext())
            updateQueueUI()
            updateLastLogged()
            retryBtn.isEnabled = true
            if (sent > 0) retryBtn.text = "✓ Sent $sent"
            else retryBtn.text = "↑ Sync now"
        }
    }
}
