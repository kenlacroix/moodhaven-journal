package com.moodbloom.wear

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * MoodHistory — stores the last [MAX] mood taps on the watch.
 *
 * Written on every successful send (or queue) so the history screen
 * always reflects what the user has tapped, regardless of phone state.
 */
object MoodHistory {

    private const val PREFS_NAME = "moodbloom_history"
    private const val KEY_HISTORY = "mood_history"
    private const val MAX = 10

    data class Entry(
        val moodLevel: Int,
        val timestamp: String,   // ISO-8601
    ) {
        val mood: MoodItem get() = MOODS.firstOrNull { it.level == moodLevel } ?: MOODS[2]

        /** e.g. "Today 09:14" or "Mon 21:32" */
        fun displayTime(): String = try {
            val instant = Instant.parse(timestamp)
            val local = instant.atZone(ZoneId.systemDefault())
            val now = java.time.LocalDate.now(ZoneId.systemDefault())
            if (local.toLocalDate() == now) {
                "Today " + local.format(DateTimeFormatter.ofPattern("HH:mm"))
            } else {
                local.format(DateTimeFormatter.ofPattern("EEE HH:mm"))
            }
        } catch (_: Exception) { "—" }
    }

    fun record(context: Context, moodLevel: Int) {
        val entry = Entry(moodLevel = moodLevel, timestamp = Instant.now().toString())
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val existing = load(prefs)
        val updated = (listOf(entry) + existing).take(MAX)
        save(prefs, updated)
    }

    fun load(context: Context): List<Entry> {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return load(prefs)
    }

    private fun load(prefs: android.content.SharedPreferences): List<Entry> {
        val raw = prefs.getString(KEY_HISTORY, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { i ->
                val obj = arr.optJSONObject(i) ?: return@mapNotNull null
                val level = obj.optInt("mood", -1).takeIf { it in 1..5 } ?: return@mapNotNull null
                Entry(moodLevel = level, timestamp = obj.optString("timestamp", Instant.now().toString()))
            }
        } catch (_: Exception) { emptyList() }
    }

    private fun save(prefs: android.content.SharedPreferences, entries: List<Entry>) {
        val arr = JSONArray()
        for (e in entries) {
            arr.put(JSONObject().apply {
                put("mood", e.moodLevel)
                put("timestamp", e.timestamp)
            })
        }
        prefs.edit().putString(KEY_HISTORY, arr.toString()).apply()
    }
}
