package com.moodbloom.app

import android.util.Log
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * WearSignalBuffer — in-process offline queue for watch signals
 *
 * Signals received by WearListenerService when WearPlugin is not yet
 * initialised (e.g., app cold-starting in background) are stored here.
 * WearPlugin drains the buffer on its first event-listener registration.
 *
 * All access is thread-safe via ConcurrentLinkedQueue.
 */
object WearSignalBuffer {

    private const val TAG = "WearSignalBuffer"
    private const val MAX_BUFFER = 200          // cap to avoid unbounded growth

    private val queue: ConcurrentLinkedQueue<String> = ConcurrentLinkedQueue()

    /** Add a raw JSON signal envelope to the buffer */
    fun enqueue(rawJson: String) {
        if (queue.size >= MAX_BUFFER) {
            val dropped = queue.poll()
            Log.w(TAG, "Buffer full — dropped oldest signal: ${dropped?.take(60)}")
        }
        queue.add(rawJson)
        Log.d(TAG, "Buffered signal (queue size=${queue.size})")
    }

    /** Drain all buffered signals and return them as a list */
    fun drain(): List<String> {
        val result = mutableListOf<String>()
        while (queue.isNotEmpty()) {
            queue.poll()?.let { result.add(it) }
        }
        Log.d(TAG, "Drained ${result.size} buffered signals")
        return result
    }

    /** Number of buffered signals */
    val size: Int get() = queue.size
}
