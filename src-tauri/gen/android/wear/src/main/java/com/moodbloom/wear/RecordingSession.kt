package com.moodbloom.wear

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.io.File
import java.time.Instant
import java.util.UUID

/**
 * RecordingSession — wraps a single MediaRecorder capture.
 *
 * Configured for optimal whisper.cpp input: 16 kHz mono AAC-LC at ~32 kbps
 * (~2.4 MB/10 min). Output lands in the app's cacheDir and is deleted after
 * successful transfer via [AudioTransferService].
 *
 * @param onAutoStop  Called on the main thread when MAX_DURATION_REACHED fires.
 *                    RecordFragment should call stop() when this is invoked.
 */
class RecordingSession(
    private val context: Context,
    private val onAutoStop: (() -> Unit)? = null,
) {
    companion object {
        private const val TAG = "RecordingSession"
        const val MAX_DURATION_MS = 10 * 60 * 1000  // 10 minutes (~2.4 MB at 32 kbps)
    }

    data class Result(
        val file: File,
        val durationMs: Long,
        val timestamp: String,
        val id: String,
    )

    private var recorder: MediaRecorder? = null
    private var outputFile: File? = null
    private var startMs: Long = 0L
    val id: String = UUID.randomUUID().toString()

    /** Returns true if recorder started successfully. */
    fun start(): Boolean {
        return try {
            val file = File(context.cacheDir, "voice_memo_${System.currentTimeMillis()}_$id.m4a")
            outputFile = file

            // Explicit val avoids Kotlin type-inference ambiguity inside apply blocks.
            val rec: MediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(context)
            } else {
                @Suppress("DEPRECATION") MediaRecorder()
            }
            rec.setAudioSource(MediaRecorder.AudioSource.MIC)
            rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            rec.setAudioSamplingRate(16_000)   // whisper.cpp optimal (16 kHz)
            // setAudioBitRate omitted — not in Wear SDK 34 stubs; AAC default is fine
            rec.setMaxDuration(MAX_DURATION_MS)
            rec.setOutputFile(file.absolutePath)
            rec.setOnInfoListener { _, what, _ ->
                if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) {
                    Handler(Looper.getMainLooper()).post { onAutoStop?.invoke() }
                }
            }
            rec.prepare()
            rec.start()
            recorder = rec

            startMs = System.currentTimeMillis()
            Log.i(TAG, "Recording started: ${file.name}")
            true
        } catch (e: Exception) {
            Log.e(TAG, "start() failed: ${e.message}", e)
            release()
            false
        }
    }

    /** Stop and return result, or null if nothing was captured. */
    fun stop(): Result? {
        return try {
            recorder?.apply { stop(); release() }
            recorder = null

            val file = outputFile ?: return null
            val durationMs = System.currentTimeMillis() - startMs

            if (!file.exists() || file.length() < 100L) {
                Log.w(TAG, "Recording too short or empty: ${file.length()} bytes")
                file.delete()
                return null
            }

            Log.i(TAG, "Recording done: ${file.name} duration=${durationMs}ms size=${file.length()}")
            Result(file = file, durationMs = durationMs, timestamp = Instant.now().toString(), id = id)
        } catch (e: Exception) {
            Log.e(TAG, "stop() failed: ${e.message}", e)
            release()
            null
        }
    }

    /** Discard the recording without producing a result. */
    fun discard() { release() }

    val isRecording: Boolean get() = recorder != null

    private fun release() {
        try { recorder?.release() } catch (_: Exception) {}
        recorder = null
        outputFile?.delete()
        outputFile = null
    }
}
