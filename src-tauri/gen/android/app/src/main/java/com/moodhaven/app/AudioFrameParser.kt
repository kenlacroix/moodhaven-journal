package com.moodhaven.app

import android.util.Log
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * AudioFrameParser — single source of truth for the watch-to-phone audio framing protocol.
 *
 * Wire format (big-endian):
 *   [4 bytes]  metadata JSON length (unsigned int)
 *   [N bytes]  metadata JSON (UTF-8)
 *     Required fields: id (String), duration_ms (Long)
 *     Optional fields: timestamp (ISO-8601 String), health (JSON String)
 *   [remaining] raw .m4a audio bytes
 *
 * Both [WearListenerService] (background) and [WearPlugin] (foreground) use this
 * parser. A bug here affects both paths equally — and is easy to test in isolation.
 */
object AudioFrameParser {

    private const val TAG = "AudioFrameParser"

    data class AudioFrame(
        val id: String,
        val timestamp: String,
        val durationMs: Long,
        val healthJson: String?,
        val audioBytes: ByteArray,
    )

    /**
     * Parse a complete audio frame from [allBytes].
     *
     * Returns [AudioFrame] on success, or null with a logged error on failure.
     */
    fun parse(allBytes: ByteArray): AudioFrame? {
        if (allBytes.size < 5) {
            Log.e(TAG, "Frame too short: ${allBytes.size} bytes (minimum 5)")
            return null
        }

        val metaLen: Int = ByteBuffer.wrap(allBytes, 0, 4).order(ByteOrder.BIG_ENDIAN).int
        if (metaLen <= 0) {
            Log.e(TAG, "Invalid metadata length: $metaLen")
            return null
        }
        if (metaLen > WearProtocol.MAX_METADATA_BYTES) {
            Log.e(TAG, "Metadata length $metaLen exceeds ${WearProtocol.MAX_METADATA_BYTES} — rejecting frame")
            return null
        }
        if (metaLen > allBytes.size - 4) {
            Log.e(TAG, "Metadata length $metaLen overflows frame (total=${allBytes.size})")
            return null
        }

        val metaBytes = allBytes.sliceArray(4 until 4 + metaLen)
        val audioBytes = allBytes.sliceArray(4 + metaLen until allBytes.size)

        if (audioBytes.isEmpty()) {
            Log.e(TAG, "Frame contains no audio bytes (total=${allBytes.size} metaLen=$metaLen)")
            return null
        }

        val meta = try {
            JSONObject(String(metaBytes, Charsets.UTF_8))
        } catch (e: Exception) {
            Log.e(TAG, "Metadata JSON parse failed: ${e.message}")
            return null
        }

        val rawId = meta.optString("id").takeIf { it.isNotBlank() }
        if (rawId == null) {
            Log.e(TAG, "Frame missing required 'id' field")
            return null
        }
        // Sanitize id: only allow alphanumerics, hyphens, and underscores to prevent path traversal
        val id = rawId.replace(Regex("[^a-zA-Z0-9_-]"), "_")
        if (id != rawId) {
            Log.w(TAG, "id sanitized: '$rawId' → '$id'")
        }

        val timestamp = meta.optString("timestamp").takeIf { it.isNotBlank() } ?: nowIso8601()
        val durationMs = meta.optLong("duration_ms", 0L)
        val healthJson = meta.optString("health").takeIf { it.isNotBlank() }

        return AudioFrame(
            id = id,
            timestamp = timestamp,
            durationMs = durationMs,
            healthJson = healthJson,
            audioBytes = audioBytes,
        )
    }

    private fun nowIso8601(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date())
    }
}
