package com.moodbloom.wear

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

/**
 * OfflineQueue — persists unsent mood signals to SharedPreferences.
 *
 * When the phone is unreachable, [SignalSender] enqueues the signal here
 * instead of discarding it. On the next app launch (or when connectivity
 * is restored), [drainAndSend] replays all pending entries in order.
 *
 * Storage: a JSON array in SharedPreferences key "offline_queue".
 * Max capacity: 50 entries (oldest dropped if exceeded).
 */
object OfflineQueue {

    private const val TAG = "OfflineQueue"
    private const val PREFS_NAME = "moodbloom_offline"
    private const val KEY_QUEUE = "offline_queue"
    private const val MAX_ENTRIES = 50

    data class PendingSignal(
        val id: String,
        val timestamp: String,
        val moodLevel: Int,
    )

    fun enqueue(context: Context, moodLevel: Int) {
        val entry = PendingSignal(
            id = UUID.randomUUID().toString(),
            timestamp = Instant.now().toString(),
            moodLevel = moodLevel,
        )
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val updated = ArrayDeque(load(prefs))
        if (updated.size >= MAX_ENTRIES) updated.removeFirst()
        updated.addLast(entry)
        save(prefs, updated)
        Log.i(TAG, "Queued signal mood=${moodLevel} (queue size=${updated.size})")
    }

    fun size(context: Context): Int {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return load(prefs).size
    }

    /**
     * Remove and return all queued signals. Caller is responsible for
     * re-enqueuing on failure (use [enqueue] if send fails mid-drain).
     */
    fun drain(context: Context): List<PendingSignal> {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val all = load(prefs)
        if (all.isEmpty()) return emptyList()
        prefs.edit().remove(KEY_QUEUE).apply()
        Log.i(TAG, "Drained ${all.size} queued signal(s)")
        return all
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private fun load(prefs: android.content.SharedPreferences): List<PendingSignal> {
        val raw = prefs.getString(KEY_QUEUE, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { i ->
                val obj = arr.optJSONObject(i) ?: return@mapNotNull null
                PendingSignal(
                    id = obj.optString("id"),
                    timestamp = obj.optString("timestamp"),
                    moodLevel = obj.optInt("mood", 3),
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse offline queue: ${e.message}")
            emptyList()
        }
    }

    private fun save(prefs: android.content.SharedPreferences, entries: List<PendingSignal>) {
        val arr = JSONArray()
        for (e in entries) {
            arr.put(JSONObject().apply {
                put("id", e.id)
                put("timestamp", e.timestamp)
                put("mood", e.moodLevel)
            })
        }
        prefs.edit().putString(KEY_QUEUE, arr.toString()).apply()
    }
}
