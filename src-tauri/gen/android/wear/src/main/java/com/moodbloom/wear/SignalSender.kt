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
 * The phone's WearListenerService receives this and calls
 * WearPlugin.bridgeFromWatch() → Tauri event → TypeScript encrypts + stores.
 */
object SignalSender {

    private const val TAG = "MoodBloomWear"
    private const val SIGNAL_PATH = "/signal"

    /**
     * Send a mood tap signal to all connected phone nodes.
     * Returns true if the message was queued for at least one node.
     * Runs on IO dispatcher; safe to call from a coroutine.
     */
    suspend fun sendMoodTap(context: Context, moodLevel: Int): Boolean =
        withContext(Dispatchers.IO) {
            try {
                val nodes = Tasks.await(
                    Wearable.getNodeClient(context).connectedNodes
                )

                if (nodes.isEmpty()) {
                    Log.w(TAG, "No connected nodes — phone not reachable")
                    return@withContext false
                }

                val envelope = JSONObject().apply {
                    put("id", UUID.randomUUID().toString())
                    put("timestamp", Instant.now().toString())
                    put("type", "mood_tap")
                    // payload is a JSON string (the phone layer wraps it in EncryptedContent)
                    put("payload", JSONObject().put("mood", moodLevel).toString())
                }

                val bytes = envelope.toString().toByteArray(Charsets.UTF_8)
                val msgClient = Wearable.getMessageClient(context)

                Log.i(TAG, "Sending mood_tap to ${nodes.size} node(s)")
                for (node in nodes) {
                    val msgId = Tasks.await(msgClient.sendMessage(node.id, SIGNAL_PATH, bytes))
                    Log.i(TAG, "Sent mood_tap mood=$moodLevel → ${node.displayName} (${node.id}) msgId=$msgId")
                }

                true
            } catch (e: Exception) {
                Log.e(TAG, "sendMoodTap failed: ${e.message}", e)
                false
            }
        }
}
