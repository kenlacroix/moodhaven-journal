package com.moodbloom.app

import android.content.Context
import android.util.Log
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject

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
 *   App foregrounds → WearPlugin.load() → drainBuffer() → trigger events
 */
@TauriPlugin
class WearPlugin(private val context: Context) : Plugin(context) {

    companion object {
        private const val TAG = "WearPlugin"

        /** Tauri event name consumed by useWearSignals hook */
        const val EVENT_SIGNAL = "wear://signal"

        /** Tauri event name for connection state changes */
        const val EVENT_CONNECTION = "wear://connection"

        @Volatile
        private var _instance: WearPlugin? = null

        /** Called by WearListenerService to forward a watch signal */
        fun getInstance(): WearPlugin? = _instance
    }

    // ── Plugin lifecycle ──────────────────────────────────────────────────────

    override fun load() {
        _instance = this
        Log.i(TAG, "WearPlugin loaded; draining buffer (${WearSignalBuffer.size} events)")
        drainBuffer()
    }

    // Called when the plugin is being destroyed (app going away)
    override fun onDestroy() {
        if (_instance === this) _instance = null
        super.onDestroy()
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

    /** Drain buffered signals that arrived before the plugin was ready */
    private fun drainBuffer() {
        val buffered = WearSignalBuffer.drain()
        for (rawJson in buffered) {
            try {
                val json = JSONObject(rawJson)
                bridgeFromWatch(
                    id = json.optString("id", java.util.UUID.randomUUID().toString()),
                    timestamp = json.optString("timestamp", java.time.Instant.now().toString()),
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

    // ── Tauri commands (called from TypeScript) ───────────────────────────────

    /**
     * Check whether a paired Wear OS device is currently reachable.
     * Queries Wearable NodeClient for connected nodes.
     */
    @Command
    fun wearCheckConnection(invoke: Invoke) {
        Wearable.getNodeClient(context).connectedNodes
            .addOnSuccessListener { nodes ->
                val connected = nodes.isNotEmpty()
                val firstNode = nodes.firstOrNull()

                val result = JSObject().apply {
                    put("connected", connected)
                    put("nodeId", firstNode?.id ?: "")
                    put("nodeName", firstNode?.displayName ?: "")
                    put("nodeCount", nodes.size)
                }

                // Emit a connection state event as well so the UI can react
                trigger(EVENT_CONNECTION, result)
                invoke.resolve(result)

                Log.i(TAG, "wearCheckConnection: connected=$connected nodes=${nodes.size}")
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "wearCheckConnection failed: ${e.message}")
                val result = JSObject().apply {
                    put("connected", false)
                    put("nodeId", "")
                    put("nodeName", "")
                    put("nodeCount", 0)
                    put("error", e.message ?: "Unknown error")
                }
                invoke.resolve(result)
            }
    }

    /**
     * Bridge a signal envelope received from the watch via the Data Layer.
     * Also usable for testing: TypeScript can call this directly to simulate
     * a watch event without a physical device.
     *
     * Args: id, timestamp, type, payload (all strings)
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
            timestamp = timestamp ?: java.time.Instant.now().toString(),
            type = type,
            source = "watch",
            payload = payload,
            nodeId = "simulated",
        )

        val result = JSObject().apply {
            put("emitted", true)
            put("id", id)
        }
        invoke.resolve(result)
    }

    /**
     * Return and clear all buffered signals that arrived while the plugin
     * was not yet initialised. TypeScript can call this on app foreground.
     */
    @Command
    fun wearFlushBuffer(invoke: Invoke) {
        val buffered = WearSignalBuffer.drain()
        val arr = JSArray()
        for (rawJson in buffered) {
            try {
                arr.put(JSONObject(rawJson))
            } catch (_: Exception) { /* skip malformed */ }
        }
        val result = JSObject()
        result.put("events", arr)
        result.put("count", buffered.size)
        invoke.resolve(result)
    }

    /**
     * Send a feedback message to the watch (haptic confirm, badge update, etc.)
     * Phase 3 will use Wearable.getMessageClient() to send to connected node.
     *
     * Args: nodeId (String), message (String — one of: "saved", "error", "prompt_ready")
     */
    @Command
    fun wearSendFeedback(invoke: Invoke) {
        val args = try { invoke.getArgs() } catch (_: Exception) { JSObject() }
        val nodeId = runCatching { args.getString("nodeId") }.getOrNull()
        val message = runCatching { args.getString("message") }.getOrNull() ?: "saved"

        if (nodeId.isNullOrBlank()) {
            // No node — resolve silently (watch may be disconnected)
            invoke.resolve(JSObject().apply { put("sent", false); put("reason", "no_node") })
            return
        }

        val data = message.toByteArray(Charsets.UTF_8)
        Wearable.getMessageClient(context)
            .sendMessage(nodeId, "/feedback", data)
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
