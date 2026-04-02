package com.moodbloom.app

import android.util.Log
import org.json.JSONObject
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
import java.io.File
import java.time.Instant

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
        private const val TAG = "WearListenerService"
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
            WearProtocol.PATH_SIGNAL          -> handleSignalMessage(event.sourceNodeId, payload)
            WearProtocol.PATH_VOICE_MEMO_META -> Log.i(TAG, "Legacy /voice_memo message ignored — using ChannelAPI")
            else                              -> Log.w(TAG, "Unhandled path: ${event.path}")
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
            timestamp = timestamp ?: Instant.now().toString(),
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
        if (channel.path != WearProtocol.CHANNEL_AUDIO) {
            Log.w(TAG, "Unexpected channel path: ${channel.path}")
            return
        }

        Log.i(TAG, "Audio channel opened from node=${channel.nodeId}")
        val channelClient = Wearable.getChannelClient(this)

        ioScope.launch {
            var outFile: File? = null
            try {
                val inputStream = channelClient.getInputStream(channel).await()
                val allBytes = inputStream.readBytes()
                inputStream.close()

                val frame = AudioFrameParser.parse(allBytes) ?: return@launch

                Log.i(TAG, "Audio received: id=${frame.id} duration=${frame.durationMs}ms size=${frame.audioBytes.size} bytes")

                val incomingDir = File(filesDir, WearProtocol.INCOMING_DIR).also { it.mkdirs() }
                outFile = File(incomingDir, "${frame.id}.m4a")
                outFile.writeBytes(frame.audioBytes)
                Log.i(TAG, "Audio saved: ${outFile.absolutePath}")

                try {
                    Wearable.getMessageClient(this@WearListenerService)
                        .sendMessage(channel.nodeId, WearProtocol.PATH_FEEDBACK, "received".toByteArray())
                        .await()
                } catch (e: Exception) {
                    Log.w(TAG, "Feedback send failed: ${e.message}")
                }

                WearPlugin.getInstance()?.bridgeVoiceMemo(
                    id           = frame.id,
                    timestamp    = frame.timestamp,
                    durationMs   = frame.durationMs,
                    healthJson   = frame.healthJson,
                    incomingFile = outFile.name,
                    nodeId       = channel.nodeId,
                ) ?: Log.w(TAG, "WearPlugin not ready — voice memo ${frame.id} saved but not bridged yet")

            } catch (e: Exception) {
                Log.e(TAG, "Audio channel error: ${e.message}", e)
                outFile?.delete()  // clean up partial file on failure
            } finally {
                try { channelClient.close(channel).await() } catch (_: Exception) {}
            }
        }
    }
}
