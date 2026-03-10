package com.moodbloom.wear

import android.content.Context
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File

/**
 * AudioTransferService — streams audio files from watch to phone via ChannelAPI.
 *
 * Wire protocol (single channel, path = "/audio_channel"):
 *   [4 bytes BE int] = metadata JSON length
 *   [N bytes]        = metadata JSON (UTF-8)
 *   [remaining]      = raw .m4a audio bytes
 *
 * The phone's WearListenerService.onChannelOpened() reads this format,
 * saves the audio to its filesDir/voice_memos_incoming/, then emits a
 * Tauri event so the TypeScript layer can store it permanently.
 */
object AudioTransferService {

    private const val TAG          = "AudioTransfer"
    private const val CHANNEL_PATH = "/audio_channel"

    /**
     * Transfer a single audio file to the first connected phone node.
     * Returns true if the channel was opened and all bytes were written.
     * Caller should delete the local file on true; re-queue on false.
     */
    suspend fun transfer(context: Context, pending: AudioQueue.PendingAudio): Boolean =
        withContext(Dispatchers.IO) {
            val file = File(pending.filePath)
            if (!file.exists()) {
                Log.w(TAG, "Audio file missing: ${pending.filePath}")
                return@withContext false
            }

            val nodes = try {
                Tasks.await(Wearable.getNodeClient(context).connectedNodes)
            } catch (e: Exception) {
                Log.e(TAG, "getConnectedNodes: ${e.message}")
                return@withContext false
            }

            if (nodes.isEmpty()) {
                Log.w(TAG, "No connected nodes")
                return@withContext false
            }

            val node = nodes.first()
            Log.i(TAG, "Transferring ${pending.id} (${file.length()} bytes) → ${node.displayName}")

            val channelClient = Wearable.getChannelClient(context)
            val channel = try {
                Tasks.await(channelClient.openChannel(node.id, CHANNEL_PATH))
            } catch (e: Exception) {
                Log.e(TAG, "openChannel failed: ${e.message}")
                return@withContext false
            }

            return@withContext try {
                val out = Tasks.await(channelClient.getOutputStream(channel))

                // Build metadata JSON
                val meta = JSONObject().apply {
                    put("id",          pending.id)
                    put("timestamp",   pending.timestamp)
                    put("duration_ms", pending.durationMs)
                    put("file_size",   file.length())
                    pending.healthJson?.let { put("health", it) }
                }.toString().toByteArray(Charsets.UTF_8)

                // Write 4-byte big-endian metadata length
                val len = meta.size
                out.write(byteArrayOf(
                    (len shr 24).toByte(),
                    (len shr 16).toByte(),
                    (len shr  8).toByte(),
                     len.toByte(),
                ))

                // Write metadata, then audio
                out.write(meta)
                file.inputStream().use { it.copyTo(out, bufferSize = 8_192) }
                out.flush()
                out.close()

                Tasks.await(channelClient.close(channel))
                Log.i(TAG, "Transfer complete: ${pending.id}")
                true
            } catch (e: Exception) {
                Log.e(TAG, "Stream error: ${e.message}", e)
                try { channelClient.close(channel) } catch (_: Exception) {}
                false
            }
        }

    /**
     * Try to transfer all queued audio files in order.
     * Re-queues anything that fails. Returns count of successes.
     */
    suspend fun drainQueue(context: Context): Int {
        val pending = AudioQueue.drain(context)
        if (pending.isEmpty()) return 0

        var sent = 0
        val failed = mutableListOf<AudioQueue.PendingAudio>()

        for (item in pending) {
            if (transfer(context, item)) {
                sent++
                try { File(item.filePath).delete() } catch (_: Exception) {}
            } else {
                failed.add(item)
            }
        }

        if (failed.isNotEmpty()) AudioQueue.requeue(context, failed)
        Log.i(TAG, "drainQueue: $sent/${pending.size} transferred")
        return sent
    }
}
