package com.moodbloom.app

import android.app.Activity
import android.util.Log
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * WearPlugin — Wear OS companion bridge
 *
 * Bridges the Wear OS Data Layer (MessageAPI) to the TypeScript/Rust layer
 * via Tauri events. The watch sends signal envelopes; this plugin emits them
 * as Tauri events ("wear://signal") which the useWearSignals hook listens for,
 * encrypts, and stores via signalService.captureSignal().
 *
 * Signal flow (happy path):
 *   Watch → MessageAPI → WearListenerService → bridgeFromWatch()
 *     → trigger("wear://signal", …) → useWearSignals → signalService → SQLite
 *
 * Signal flow (cold start / background):
 *   Watch → MessageAPI → WearListenerService → WearSignalBuffer.enqueue()
 *   App init → WearPlugin init block → drainBuffer() → trigger events
 */
@TauriPlugin
class WearPlugin(private val activity: Activity) : Plugin(activity) {

    companion object {
        private const val TAG = "WearPlugin"

        /** Tauri event name consumed by useWearSignals hook */
        const val EVENT_SIGNAL = "wear://signal"

        /** Tauri event name for voice memos received from the watch */
        const val EVENT_VOICE_MEMO = "wear://voice_memo"

        /** Tauri event name for connection state changes */
        const val EVENT_CONNECTION = "wear://connection"

        @Volatile
        private var _instance: WearPlugin? = null

        fun getInstance(): WearPlugin? = _instance

        private fun nowIso8601(): String {
            val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
            sdf.timeZone = TimeZone.getTimeZone("UTC")
            return sdf.format(Date())
        }
    }

    // Set singleton and drain any buffered events on plugin creation
    init {
        _instance = this
        Log.i(TAG, "WearPlugin init; draining buffer (${WearSignalBuffer.size} events)")
        drainBuffer()
    }

    // ── Bridge from WearListenerService ──────────────────────────────────────

    /**
     * Called by WearListenerService when a signal arrives from the watch.
     * Emits a Tauri event so the TypeScript layer can encrypt + store it.
     */
    fun bridgeFromWatch(
        id: String,
        timestamp: String,
        type: String,
        source: String,
        payload: String,
        nodeId: String,
    ) {
        val event = JSObject().apply {
            put("id", id)
            put("timestamp", timestamp)
            put("type", type)
            put("source", source)
            put("payload", payload)
            put("nodeId", nodeId)
        }
        trigger(EVENT_SIGNAL, event)
        Log.d(TAG, "Emitted $EVENT_SIGNAL: id=$id type=$type")
    }

    // ── Bridge from WearListenerService (voice memo) ─────────────────────────

    /**
     * Called by WearListenerService when a voice memo arrives via ChannelAPI.
     * Emits a Tauri event so the TypeScript layer can move the file to permanent
     * storage and record it in SQLite via store_voice_memo.
     */
    fun bridgeVoiceMemo(
        id: String,
        timestamp: String,
        durationMs: Long,
        healthJson: String?,
        incomingFile: String,
        nodeId: String,
    ) {
        val event = JSObject().apply {
            put("id", id)
            put("timestamp", timestamp)
            put("duration_ms", durationMs)
            healthJson?.let { put("health_json", it) }
            put("incoming_file", incomingFile)
            put("node_id", nodeId)
        }
        trigger(EVENT_VOICE_MEMO, event)
        Log.d(TAG, "Emitted $EVENT_VOICE_MEMO: id=$id duration=${durationMs}ms")
    }

    private fun drainBuffer() {
        val buffered = WearSignalBuffer.drain()
        for (rawJson in buffered) {
            try {
                val json = JSONObject(rawJson)
                bridgeFromWatch(
                    id = json.optString("id", java.util.UUID.randomUUID().toString()),
                    timestamp = json.optString("timestamp", nowIso8601()),
                    type = json.optString("type", "unknown"),
                    source = json.optString("source", "watch"),
                    payload = json.optString("payload", "{}"),
                    nodeId = json.optString("nodeId", ""),
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to replay buffered signal: ${e.message}")
            }
        }
    }

    // ── Tauri commands ────────────────────────────────────────────────────────

    /**
     * Check whether a paired Wear OS device is currently reachable.
     */
    @Command
    fun wearCheckConnection(invoke: Invoke) {
        Wearable.getNodeClient(activity).connectedNodes
            .addOnSuccessListener { nodes ->
                val connected = nodes.isNotEmpty()
                val firstNode = nodes.firstOrNull()
                val result = JSObject().apply {
                    put("connected", connected)
                    put("nodeId", firstNode?.id ?: "")
                    put("nodeName", firstNode?.displayName ?: "")
                    put("nodeCount", nodes.size)
                }
                trigger(EVENT_CONNECTION, result)
                invoke.resolve(result)
                Log.i(TAG, "wearCheckConnection: connected=$connected nodes=${nodes.size}")
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "wearCheckConnection failed: ${e.message}")
                invoke.resolve(JSObject().apply {
                    put("connected", false)
                    put("nodeId", "")
                    put("nodeName", "")
                    put("nodeCount", 0)
                    put("error", e.message ?: "Unknown error")
                })
            }
    }

    /**
     * Bridge a signal envelope. Also works as a test injection without a watch:
     * TypeScript can call this directly to simulate a watch event.
     *
     * Args: id, timestamp, type, payload (strings)
     */
    @Command
    fun wearBridgeSignal(invoke: Invoke) {
        val args = try { invoke.getArgs() } catch (_: Exception) { JSObject() }

        val id = runCatching { args.getString("id") }.getOrNull()
        val timestamp = runCatching { args.getString("timestamp") }.getOrNull()
        val type = runCatching { args.getString("type") }.getOrNull()
        val payload = runCatching { args.getString("payload") }.getOrNull()

        if (id.isNullOrBlank() || type.isNullOrBlank() || payload.isNullOrBlank()) {
            invoke.reject("wearBridgeSignal: missing required fields (id, type, payload)")
            return
        }

        bridgeFromWatch(
            id = id,
            timestamp = timestamp ?: nowIso8601(),
            type = type,
            source = "watch",
            payload = payload,
            nodeId = "simulated",
        )

        invoke.resolve(JSObject().apply {
            put("emitted", true)
            put("id", id)
        })
    }

    /**
     * Return and clear all buffered signals that arrived before the plugin
     * was ready. TypeScript can call this on app foreground.
     */
    @Command
    fun wearFlushBuffer(invoke: Invoke) {
        val buffered = WearSignalBuffer.drain()
        val arr = JSArray()
        for (rawJson in buffered) {
            try { arr.put(JSONObject(rawJson)) } catch (_: Exception) { }
        }
        invoke.resolve(JSObject().apply {
            put("events", arr)
            put("count", buffered.size)
        })
    }

    /**
     * Send a feedback message to the watch (haptic confirm, badge update).
     *
     * Args: nodeId (String), message (String — "saved" | "error" | "prompt_ready")
     */
    @Command
    fun wearSendFeedback(invoke: Invoke) {
        val args = try { invoke.getArgs() } catch (_: Exception) { JSObject() }
        val nodeId = runCatching { args.getString("nodeId") }.getOrNull()
        val message = runCatching { args.getString("message") }.getOrNull() ?: "saved"

        if (nodeId.isNullOrBlank()) {
            invoke.resolve(JSObject().apply { put("sent", false); put("reason", "no_node") })
            return
        }

        Wearable.getMessageClient(activity)
            .sendMessage(nodeId, "/feedback", message.toByteArray(Charsets.UTF_8))
            .addOnSuccessListener { msgId ->
                Log.d(TAG, "Feedback sent to $nodeId: msgId=$msgId")
                invoke.resolve(JSObject().apply { put("sent", true); put("messageId", msgId) })
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "Feedback send failed: ${e.message}")
                invoke.resolve(JSObject().apply { put("sent", false); put("reason", e.message) })
            }
    }
}
