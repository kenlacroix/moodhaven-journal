package com.moodbloom.wear

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * AudioQueue — persists pending audio transfer jobs to SharedPreferences.
 *
 * When the phone is unreachable after recording, the job is stored here.
 * On the next app open (onResume), [AudioTransferService.drainQueue] replays
 * all pending entries in order. Entries whose local files no longer exist are
 * silently discarded on drain.
 */
object AudioQueue {

    private const val TAG = "AudioQueue"
    private const val PREFS = "moodbloom_audio_queue"
    private const val KEY   = "audio_queue"

    data class PendingAudio(
        val id: String,
        val filePath: String,
        val durationMs: Long,
        val timestamp: String,
        val healthJson: String?,
    )

    fun enqueue(context: Context, result: RecordingSession.Result, healthJson: String? = null) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val updated = load(prefs) + PendingAudio(
            id          = result.id,
            filePath    = result.file.absolutePath,
            durationMs  = result.durationMs,
            timestamp   = result.timestamp,
            healthJson  = healthJson,
        )
        save(prefs, updated)
        Log.i(TAG, "Queued audio ${result.id} (queue=${updated.size})")
    }

    fun size(context: Context): Int =
        load(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)).size

    /**
     * Drain the queue, discarding entries whose audio files are missing.
     * Caller must re-enqueue any that fail to transfer.
     */
    fun drain(context: Context): List<PendingAudio> {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val all   = load(prefs).filter { File(it.filePath).exists() }
        prefs.edit().remove(KEY).apply()
        if (all.isNotEmpty()) Log.i(TAG, "Draining ${all.size} queued audio file(s)")
        return all
    }

    fun requeue(context: Context, items: List<PendingAudio>) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        save(prefs, items)
    }

    // ── Serialisation ─────────────────────────────────────────────────────────

    private fun load(prefs: android.content.SharedPreferences): List<PendingAudio> {
        val raw = prefs.getString(KEY, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { i ->
                val o = arr.optJSONObject(i) ?: return@mapNotNull null
                PendingAudio(
                    id         = o.optString("id"),
                    filePath   = o.optString("path"),
                    durationMs = o.optLong("duration", 0L),
                    timestamp  = o.optString("timestamp"),
                    healthJson = o.optString("health").takeIf { it.isNotEmpty() },
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Parse error: ${e.message}")
            emptyList()
        }
    }

    private fun save(prefs: android.content.SharedPreferences, items: List<PendingAudio>) {
        val arr = JSONArray()
        items.forEach { p ->
            arr.put(JSONObject().apply {
                put("id",       p.id)
                put("path",     p.filePath)
                put("duration", p.durationMs)
                put("timestamp", p.timestamp)
                put("health",   p.healthJson ?: "")
            })
        }
        prefs.edit().putString(KEY, arr.toString()).apply()
    }
}
