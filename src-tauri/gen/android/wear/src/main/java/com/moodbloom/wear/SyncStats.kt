package com.moodbloom.wear

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * SyncStats — lightweight SharedPreferences counters for the Sync page.
 * Tracks how many recordings were synced today and when the last sync occurred.
 */
object SyncStats {
    private const val PREFS         = "moodbloom_sync_stats"
    private const val KEY_LAST_SYNC = "last_sync_ms"
    private const val KEY_TODAY_DATE = "recordings_today_date"
    private const val KEY_TODAY_CNT  = "recordings_today_count"

    /** Call after a successful audio transfer. */
    fun recordSynced(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val today = todayKey()
        val storedDate  = prefs.getString(KEY_TODAY_DATE, "")
        val currentCount = if (storedDate == today) prefs.getInt(KEY_TODAY_CNT, 0) else 0
        prefs.edit()
            .putLong(KEY_LAST_SYNC, System.currentTimeMillis())
            .putString(KEY_TODAY_DATE, today)
            .putInt(KEY_TODAY_CNT, currentCount + 1)
            .apply()
    }

    /** How many recordings were synced today. */
    fun recordingsTodayCount(context: Context): Int {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return if (prefs.getString(KEY_TODAY_DATE, "") == todayKey())
            prefs.getInt(KEY_TODAY_CNT, 0)
        else 0
    }

    /** Human-readable time since last sync: "just now", "4m ago", "2h ago", "Mar 5", or "—". */
    fun lastSyncRelative(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val ms = prefs.getLong(KEY_LAST_SYNC, 0L)
        if (ms == 0L) return "—"
        val diff = System.currentTimeMillis() - ms
        return when {
            diff < 60_000L      -> "just now"
            diff < 3_600_000L   -> "${diff / 60_000}m ago"
            diff < 86_400_000L  -> "${diff / 3_600_000}h ago"
            else                -> SimpleDateFormat("MMM d", Locale.getDefault()).format(Date(ms))
        }
    }

    private fun todayKey(): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
}
