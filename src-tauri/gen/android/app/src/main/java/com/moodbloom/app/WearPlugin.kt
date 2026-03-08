package com.moodbloom.app

import android.content.Context
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import app.tauri.plugin.JSObject
import org.json.JSONObject

/**
 * WearPlugin — Wear OS companion bridge scaffold
 *
 * Phase 1 (current): shell only — plumbing registered, no live watch code yet.
 * Phase 2: wire up Wearable.getMessageClient() / DataClient for real device comms.
 *
 * Signal flow:
 *   Watch UI → Wear OS Data Layer (MessageAPI / DataAPI)
 *     → WearListenerService (phone side, Phase 2)
 *       → WearPlugin.bridgeSignal()
 *         → Tauri invoke("create_signal") on TypeScript layer
 *           → Rust → SQLite
 *
 * The watch NEVER writes to SQLite directly and never handles encryption.
 * All intelligence, validation, and storage happens in the Rust core.
 */
@TauriPlugin
class WearPlugin(private val context: Context) : Plugin(context) {

    /**
     * Check whether a paired Wear OS device is currently reachable.
     * Phase 2 will query Wearable.getNodeClient() for connected nodes.
     */
    @Command
    fun wearCheckConnection(invoke: Invoke) {
        val result = JSObject()
        // Phase 1 stub — always reports not connected until Data Layer is wired
        result.put("connected", false)
        result.put("nodeId", null)
        result.put("phase", "scaffold")
        invoke.resolve(result)
    }

    /**
     * Bridge a signal envelope received from the watch via the Data Layer
     * into the TypeScript signal pipeline.
     *
     * Expected args:
     *   id        String  — UUID generated on the watch
     *   timestamp String  — ISO-8601 UTC timestamp
     *   type      String  — SignalType (mood_tap, check_in, voice_memo, …)
     *   payload   String  — JSON plaintext payload (TypeScript will encrypt)
     *
     * Phase 2: WearListenerService calls this after receiving a MessageAPI event.
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

        // Phase 1 stub: echo the envelope back so TypeScript can observe it.
        // Phase 2: emit a Tauri event ("wear://signal") that the TypeScript layer
        //          listens for, then calls signalService.createSignal().
        val result = JSObject()
        result.put("id", id)
        result.put("timestamp", timestamp ?: java.time.Instant.now().toString())
        result.put("type", type)
        result.put("source", "watch")
        result.put("payload", payload)
        result.put("phase", "scaffold")
        invoke.resolve(result)
    }

    /**
     * Request buffered watch events that accumulated while the phone was offline.
     * Phase 2: query WearListenerService's local buffer / DataAPI snapshot.
     */
    @Command
    fun wearFlushBuffer(invoke: Invoke) {
        val result = JSObject()
        result.put("events", org.json.JSONArray())
        result.put("phase", "scaffold")
        invoke.resolve(result)
    }

    /**
     * Send a feedback message to the watch (e.g., confirm a signal was saved,
     * trigger a haptic, or push a "reflection ready" notification).
     * Phase 2: Wearable.getMessageClient().sendMessage(nodeId, "/feedback", data)
     */
    @Command
    fun wearSendFeedback(invoke: Invoke) {
        val args = try { invoke.getArgs() } catch (_: Exception) { JSObject() }
        val result = JSObject()
        result.put("sent", false)
        result.put("phase", "scaffold")
        invoke.resolve(result)
    }
}
