package com.moodbloom.app

import android.util.Log
import com.google.android.gms.wearable.ChannelClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * WearListenerService — phone-side Wear OS Data Layer receiver.
 *
 * Handles two transports:
 *
 *  MessageAPI  (/signal path)
 *    Mood taps from the watch. Small JSON envelopes delivered instantly.
 *    → WearPlugin.bridgeFromWatch() → Tauri "wear://signal" event
 *
 *  ChannelAPI  (/audio_channel path)
 *    Voice memo audio streams. Uses a binary framing protocol:
 *      [4 bytes BE int] metadata JSON length
 *      [N bytes]        metadata JSON (UTF-8)
 *      [remaining]      raw .m4a audio bytes
 *    Saves audio to filesDir/voice_memos_incoming/<id>.m4a, then calls
 *    WearPlugin.bridgeVoiceMemo() → Tauri "wear://voice_memo" event.
 */
class WearListenerService : WearableListenerService() {

    companion object {
        private const val TAG              = "WearListenerService"
        const val PATH_SIGNAL              = "/signal"
        const val PATH_VOICE_MEMO_META     = "/voice_memo"   // legacy metadata path (kept for compat)
        const val CHANNEL_AUDIO            = "/audio_channel"
        const val INCOMING_DIR             = "voice_memos_incoming"

        private fun nowIso8601(): String {
            val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
            sdf.timeZone = TimeZone.getTimeZone("UTC")
            return sdf.format(Date())
        }
    }

    private val ioScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun onDestroy() {
        super.onDestroy()
        ioScope.cancel()
    }

    // ── MessageAPI ────────────────────────────────────────────────────────────

    override fun onMessageReceived(event: MessageEvent) {
        Log.d(TAG, "Message received: path=${event.path} from=${event.sourceNodeId}")

        val payload = try {
            String(event.data, Charsets.UTF_8)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to decode message: ${e.message}")
            return
        }

        when (event.path) {
            PATH_SIGNAL          -> handleSignalMessage(event.sourceNodeId, payload)
            PATH_VOICE_MEMO_META -> Log.i(TAG, "Legacy /voice_memo message ignored — using ChannelAPI")
            else                 -> Log.w(TAG, "Unhandled path: ${event.path}")
        }
    }

    private fun handleSignalMessage(nodeId: String, rawJson: String) {
        val json = try { JSONObject(rawJson) } catch (e: Exception) {
            Log.e(TAG, "Malformed signal JSON: ${e.message}")
            return
        }

        val id        = json.optString("id").takeIf { it.isNotBlank() }
        val timestamp = json.optString("timestamp").takeIf { it.isNotBlank() }
        val type      = json.optString("type").takeIf { it.isNotBlank() }
        val payload   = json.optString("payload").takeIf { it.isNotBlank() }

        if (id == null || type == null || payload == null) {
            Log.e(TAG, "Signal missing required fields")
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

    // ── ChannelAPI (audio transfer) ───────────────────────────────────────────

    override fun onChannelOpened(channel: ChannelClient.Channel) {
        if (channel.path != CHANNEL_AUDIO) {
            Log.w(TAG, "Unexpected channel path: ${channel.path}")
            return
        }

        Log.i(TAG, "Audio channel opened from node=${channel.nodeId}")
        val channelClient = Wearable.getChannelClient(this)

        ioScope.launch {
            try {
                val inputStream = channelClient.getInputStream(channel).await()

                // Read all bytes (max ~3 min × 32 kbps ≈ 720 KB — fits in memory)
                val allBytes = inputStream.readBytes()
                inputStream.close()

                if (allBytes.size < 5) {
                    Log.e(TAG, "Channel data too short: ${allBytes.size} bytes")
                    return@launch
                }

                // Parse 4-byte big-endian metadata length header
                // Explicit Int type avoids Kotlin overload-resolution ambiguity on
                // downstream arithmetic (sliceArray bounds use metaLen as Int).
                val metaLen: Int = java.nio.ByteBuffer.wrap(allBytes, 0, 4)
                    .order(java.nio.ByteOrder.BIG_ENDIAN).int

                if (metaLen <= 0 || metaLen > allBytes.size - 4) {
                    Log.e(TAG, "Invalid metadata length: $metaLen (total=${allBytes.size})")
                    return@launch
                }

                val metaBytes  = allBytes.sliceArray(4 until 4 + metaLen)
                val audioBytes = allBytes.sliceArray(4 + metaLen until allBytes.size)
                val meta       = JSONObject(String(metaBytes, Charsets.UTF_8))

                val id          = meta.optString("id").takeIf { it.isNotBlank() }
                    ?: run { Log.e(TAG, "Missing id in audio metadata"); return@launch }
                val timestamp   = meta.optString("timestamp").takeIf { it.isNotBlank() } ?: nowIso8601()
                val durationMs  = meta.optLong("duration_ms", 0L)
                val healthJson  = meta.optString("health").takeIf { it.isNotBlank() }

                Log.i(TAG, "Audio received: id=$id duration=${durationMs}ms size=${audioBytes.size} bytes")

                // Save to filesDir/voice_memos_incoming/<id>.m4a
                val incomingDir = File(filesDir, INCOMING_DIR).also { it.mkdirs() }
                val outFile     = File(incomingDir, "$id.m4a")
                outFile.writeBytes(audioBytes)

                Log.i(TAG, "Audio saved: ${outFile.absolutePath}")

                // Send feedback haptic to watch
                try {
                    Wearable.getMessageClient(this@WearListenerService)
                        .sendMessage(channel.nodeId, "/feedback", "received".toByteArray())
                        .await()
                } catch (e: Exception) {
                    Log.w(TAG, "Feedback send failed: ${e.message}")
                }

                // Bridge to TypeScript via WearPlugin
                WearPlugin.getInstance()?.bridgeVoiceMemo(
                    id             = id,
                    timestamp      = timestamp,
                    durationMs     = durationMs,
                    healthJson     = healthJson,
                    incomingFile   = outFile.name,
                    nodeId         = channel.nodeId,
                ) ?: Log.w(TAG, "WearPlugin not ready — voice memo $id saved but not bridged yet")

            } catch (e: Exception) {
                Log.e(TAG, "Audio channel error: ${e.message}", e)
            } finally {
                try { channelClient.close(channel).await() } catch (_: Exception) {}
            }
        }
    }
}
