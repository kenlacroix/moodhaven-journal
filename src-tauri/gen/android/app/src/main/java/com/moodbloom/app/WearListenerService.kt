package com.moodbloom.app

import android.util.Log
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * WearListenerService — phone-side Wear OS Data Layer receiver
 *
 * Started by the Wear OS platform whenever a MessageAPI message arrives from a
 * paired watch, even when the phone app is in the background. Deserialises the
 * signal envelope and hands it off to WearPlugin → Tauri event → TypeScript.
 *
 * Signal flow:
 *   Watch → MessageAPI (/signal path) → onMessageReceived()
 *     → WearPlugin.bridgeFromWatch() → trigger("wear://signal")
 *       → useWearSignals hook → signalService.captureSignal() → SQLite
 */
class WearListenerService : WearableListenerService() {

    companion object {
        private const val TAG = "WearListenerService"

        const val PATH_SIGNAL     = "/signal"
        const val PATH_VOICE_MEMO = "/voice_memo"

        private fun nowIso8601(): String {
            val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
            sdf.timeZone = TimeZone.getTimeZone("UTC")
            return sdf.format(Date())
        }
    }

    override fun onMessageReceived(event: MessageEvent) {
        Log.d(TAG, "Message received: path=${event.path} from=${event.sourceNodeId}")

        // MessageEvent.data is the byte array (NOT rawData)
        val payload = try {
            String(event.data, Charsets.UTF_8)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to decode message bytes: ${e.message}")
            return
        }

        when (event.path) {
            PATH_SIGNAL     -> handleSignalMessage(event.sourceNodeId, payload)
            PATH_VOICE_MEMO -> handleVoiceMemoMessage(event.sourceNodeId, payload)
            else            -> Log.w(TAG, "Unhandled path: ${event.path}")
        }
    }

    private fun handleSignalMessage(nodeId: String, rawJson: String) {
        val json = try {
            org.json.JSONObject(rawJson)
        } catch (e: Exception) {
            Log.e(TAG, "Malformed signal JSON from $nodeId: ${e.message}")
            return
        }

        val id        = json.optString("id").takeIf { it.isNotBlank() }
        val timestamp = json.optString("timestamp").takeIf { it.isNotBlank() }
        val type      = json.optString("type").takeIf { it.isNotBlank() }
        val payload   = json.optString("payload").takeIf { it.isNotBlank() }

        if (id == null || type == null || payload == null) {
            Log.e(TAG, "Signal missing required fields: $rawJson")
            return
        }

        Log.i(TAG, "Watch signal received: id=$id type=$type")

        WearPlugin.getInstance()?.bridgeFromWatch(
            id        = id,
            timestamp = timestamp ?: nowIso8601(),
            type      = type,
            source    = "watch",
            payload   = payload,
            nodeId    = nodeId,
        ) ?: run {
            WearSignalBuffer.enqueue(rawJson)
            Log.w(TAG, "WearPlugin not ready; buffered signal $id")
        }
    }

    private fun handleVoiceMemoMessage(nodeId: String, rawJson: String) {
        // Phase 3: request audio via ChannelAPI, encrypt, store as attachment.
        Log.i(TAG, "Voice memo metadata from $nodeId — buffering for Phase 3")
        WearSignalBuffer.enqueue(rawJson)
    }
}
