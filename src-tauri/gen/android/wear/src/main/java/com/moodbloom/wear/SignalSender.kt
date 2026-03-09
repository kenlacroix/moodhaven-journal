package com.moodbloom.wear

import android.content.Context
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

/**
 * Sends mood-tap signal envelopes to the paired phone via Wear OS MessageAPI.
 *
 * Signal format (JSON on /signal path) matches WearListenerService expectations:
 *   { id, timestamp, type:"mood_tap", payload:"{\"mood\":N}" }
 *
 * If the phone is unreachable, the signal is saved to [OfflineQueue] and
 * retried automatically the next time [drainAndSend] is called (on app open).
 */
object SignalSender {

    private const val TAG = "MoodBloomWear"
    private const val SIGNAL_PATH = "/signal"

    /**
     * Send a mood tap signal to all connected phone nodes.
     * Returns true if sent to at least one node; false if queued for later.
     */
    suspend fun sendMoodTap(context: Context, moodLevel: Int): Boolean =
        withContext(Dispatchers.IO) {
            val sent = trySend(context, UUID.randomUUID().toString(), Instant.now().toString(), moodLevel)
            if (!sent) {
                OfflineQueue.enqueue(context, moodLevel)
                Log.i(TAG, "Phone unreachable — mood=$moodLevel queued (total=${OfflineQueue.size(context)})")
            }
            sent
        }

    /**
     * Replay all queued offline signals. Call this on app resume when a
     * phone connection is detected. Re-queues any that still fail.
     * Returns the number of signals successfully delivered.
     */
    suspend fun drainAndSend(context: Context): Int =
        withContext(Dispatchers.IO) {
            val pending = OfflineQueue.drain(context)
            if (pending.isEmpty()) return@withContext 0

            val nodes = try {
                Tasks.await(Wearable.getNodeClient(context).connectedNodes)
            } catch (e: Exception) {
                Log.w(TAG, "drainAndSend: no nodes — re-queuing ${pending.size} signals")
                pending.forEach { OfflineQueue.enqueue(context, it.moodLevel) }
                return@withContext 0
            }

            if (nodes.isEmpty()) {
                pending.forEach { OfflineQueue.enqueue(context, it.moodLevel) }
                return@withContext 0
            }

            var sent = 0
            for (p in pending) {
                val ok = trySend(context, p.id, p.timestamp, p.moodLevel)
                if (ok) sent++ else OfflineQueue.enqueue(context, p.moodLevel)
            }
            Log.i(TAG, "drainAndSend: sent $sent/${pending.size}")
            sent
        }

    // ── Internal ──────────────────────────────────────────────────────────────

    private fun buildEnvelope(id: String, timestamp: String, moodLevel: Int): ByteArray {
        val envelope = JSONObject().apply {
            put("id", id)
            put("timestamp", timestamp)
            put("type", "mood_tap")
            put("payload", JSONObject().put("mood", moodLevel).toString())
        }
        return envelope.toString().toByteArray(Charsets.UTF_8)
    }

    /** Returns true if the message was queued by the local Data Layer for at least one node. */
    private fun trySend(context: Context, id: String, timestamp: String, moodLevel: Int): Boolean {
        return try {
            val nodes = Tasks.await(Wearable.getNodeClient(context).connectedNodes)
            if (nodes.isEmpty()) {
                Log.w(TAG, "trySend: no connected nodes")
                return false
            }
            val bytes = buildEnvelope(id, timestamp, moodLevel)
            val msgClient = Wearable.getMessageClient(context)
            Log.i(TAG, "Sending mood_tap mood=$moodLevel to ${nodes.size} node(s)")
            for (node in nodes) {
                val msgId = Tasks.await(msgClient.sendMessage(node.id, SIGNAL_PATH, bytes))
                Log.i(TAG, "Sent mood=$moodLevel → ${node.displayName} (${node.id}) msgId=$msgId")
            }
            true
        } catch (e: Exception) {
            Log.e(TAG, "trySend failed: ${e.message}")
            false
        }
    }
}
