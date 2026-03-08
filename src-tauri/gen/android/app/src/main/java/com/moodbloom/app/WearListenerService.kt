package com.moodbloom.app

import android.util.Log
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject

/**
 * WearListenerService — phone-side Wear OS Data Layer receiver
 *
 * This service is started by the Wear OS platform whenever a MessageAPI
 * message arrives from a paired watch, even when the phone app is in the
 * background. It deserialises the signal envelope and hands it off to
 * WearPlugin so it can be emitted as a Tauri event to the WebView.
 *
 * Signal flow:
 *   Watch → MessageAPI (/signal path) → WearListenerService.onMessageReceived()
 *     → WearPlugin.bridgeFromWatch() → Tauri event "wear://signal"
 *       → useWearSignals hook → signalService.captureSignal() → SQLite
 *
 * Registered in AndroidManifest.xml with BIND_LISTENER intent filter.
 */
class WearListenerService : WearableListenerService() {

    companion object {
        private const val TAG = "WearListenerService"

        /** MessageAPI path the watch sends signals on */
        const val PATH_SIGNAL = "/signal"

        /** MessageAPI path for voice memo metadata (large audio transferred via DataAPI) */
        const val PATH_VOICE_MEMO = "/voice_memo"

        /** MessageAPI path for watch requesting a feedback acknowledgement */
        const val PATH_ACK = "/ack"
    }

    override fun onMessageReceived(event: MessageEvent) {
        Log.d(TAG, "Message received: path=${event.path} from=${event.sourceNodeId}")

        val payload = try {
            String(event.rawData, Charsets.UTF_8)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to decode message bytes: ${e.message}")
            return
        }

        when (event.path) {
            PATH_SIGNAL -> handleSignalMessage(event.sourceNodeId, payload)
            PATH_VOICE_MEMO -> handleVoiceMemoMessage(event.sourceNodeId, payload)
            else -> Log.w(TAG, "Unhandled path: ${event.path}")
        }
    }

    // ── Signal message ────────────────────────────────────────────────────────

    private fun handleSignalMessage(nodeId: String, rawJson: String) {
        val json = try {
            JSONObject(rawJson)
        } catch (e: Exception) {
            Log.e(TAG, "Malformed signal JSON from $nodeId: ${e.message}")
            return
        }

        val id = json.optString("id").takeIf { it.isNotBlank() }
        val timestamp = json.optString("timestamp").takeIf { it.isNotBlank() }
        val type = json.optString("type").takeIf { it.isNotBlank() }
        val payloadStr = json.optString("payload").takeIf { it.isNotBlank() }

        if (id == null || type == null || payloadStr == null) {
            Log.e(TAG, "Signal missing required fields: $rawJson")
            return
        }

        Log.i(TAG, "Watch signal: id=$id type=$type source=watch")

        // Hand off to WearPlugin → Tauri event → TypeScript layer
        WearPlugin.getInstance()?.bridgeFromWatch(
            id = id,
            timestamp = timestamp ?: java.time.Instant.now().toString(),
            type = type,
            source = "watch",
            payload = payloadStr,
            nodeId = nodeId,
        ) ?: run {
            // Plugin not yet initialised — buffer the event for later flush
            WearSignalBuffer.enqueue(rawJson)
            Log.w(TAG, "WearPlugin not ready; buffered signal $id")
        }
    }

    // ── Voice memo metadata message ───────────────────────────────────────────

    private fun handleVoiceMemoMessage(nodeId: String, rawJson: String) {
        // Phase 3: request audio file from watch via ChannelAPI and forward to
        // signalService as a voice_memo signal with an attachment id.
        // For now, log and buffer the metadata.
        Log.i(TAG, "Voice memo metadata received from $nodeId — buffering for Phase 3")
        WearSignalBuffer.enqueue(rawJson)
    }
}
