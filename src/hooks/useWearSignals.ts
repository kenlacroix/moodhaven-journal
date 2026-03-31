/**
 * useWearSignals — Wear OS signal bridge hook
 *
 * Listens for the Tauri "wear://signal" event emitted by WearPlugin (Android)
 * whenever a watch sends a signal via the MessageAPI. On receipt, the hook:
 *   1. Validates the envelope
 *   2. Parses the plaintext payload (the watch never encrypts — phone does)
 *   3. Calls signalService.createSignal() to encrypt + store in SQLite
 *   4. Calls an optional onSignal callback for UI feedback
 *
 * Also exposes:
 *   - checkConnection()  : query connected Wear OS nodes
 *   - simulateSignal()   : inject a test signal without a physical watch
 *   - sendFeedback()     : send a haptic/badge confirmation back to the watch
 */

import { useEffect, useCallback, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { createSignal } from '../lib/services/signalService';
import type {
  SignalType,
  SignalSource,
  SignalPayload,
  Signal,
  WatchSignalMessage,
} from '../types/signals';
import type { VoiceMemo } from '../lib/services/voiceMemoService';

// ── Event payload shapes ──────────────────────────────────────────────────────

interface WearSignalEvent {
  id: string;
  timestamp: string;
  type: string;
  source: string;
  /** Plaintext JSON payload — encrypted here before DB insertion */
  payload: string;
  nodeId: string;
}

/** Matches WearPlugin.bridgeVoiceMemo payload */
interface WearVoiceMemoEvent {
  id: string;
  timestamp: string;
  duration_ms: number;
  health_json?: string;
  /** Filename only (e.g. "abc123.m4a") in the incoming staging dir */
  incoming_file: string;
  node_id: string;
}

interface WearConnectionState {
  connected: boolean;
  nodeId: string;
  nodeName: string;
  nodeCount: number;
  error?: string;
}

// ── Hook options ──────────────────────────────────────────────────────────────

interface UseWearSignalsOptions {
  /** Session password — required for signal encryption */
  password: string;
  /** Called after a signal is successfully stored */
  onSignal?: (signal: Signal) => void;
  /** Called after a voice memo is successfully stored */
  onVoiceMemo?: (memo: VoiceMemo) => void;
  /** Called on error (validation failure, encryption error, etc.) */
  onError?: (error: string) => void;
  /** If false, the listener is not attached (e.g., while locked) */
  enabled?: boolean;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWearSignals({
  password,
  onSignal,
  onVoiceMemo,
  onError,
  enabled = true,
}: UseWearSignalsOptions) {
  const onSignalRef = useRef(onSignal);
  const onVoiceMemoRef = useRef(onVoiceMemo);
  const onErrorRef = useRef(onError);

  useEffect(() => { onSignalRef.current = onSignal; }, [onSignal]);
  useEffect(() => { onVoiceMemoRef.current = onVoiceMemo; }, [onVoiceMemo]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // ── "wear://signal" event listener ─────────────────────────────────────────

  useEffect(() => {
    if (!enabled || !password) return;

    let unlisten: UnlistenFn | null = null;
    let unlistenMemo: UnlistenFn | null = null;

    (async () => {
      // Signal listener
      unlisten = await listen<WearSignalEvent>('wear://signal', async (event) => {
        const { id, timestamp, type, source, payload } = event.payload;

        if (!id || !type || !payload) {
          onErrorRef.current?.(`Invalid watch signal envelope: missing id/type/payload`);
          return;
        }

        let parsedPayload: SignalPayload;
        try {
          parsedPayload = JSON.parse(payload) as SignalPayload;
        } catch {
          onErrorRef.current?.(`Watch signal payload is not valid JSON: ${payload.slice(0, 80)}`);
          return;
        }

        try {
          const signal = await createSignal(
            password,
            id,
            timestamp || new Date().toISOString(),
            type as SignalType,
            (source || 'watch') as SignalSource,
            parsedPayload,
          );
          onSignalRef.current?.(signal);

          const nodeId = event.payload.nodeId;
          if (nodeId && nodeId !== 'simulated') {
            invoke('plugin:wear|wearSendFeedback', { nodeId, message: 'saved' })
              .catch(() => { /* non-critical */ });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          onErrorRef.current?.(`Failed to store watch signal: ${msg}`);
        }
      });

      // Voice memo listener
      unlistenMemo = await listen<WearVoiceMemoEvent>('wear://voice_memo', async (event) => {
        const { id, timestamp, duration_ms, health_json, incoming_file } = event.payload;

        if (!id || !incoming_file) {
          onErrorRef.current?.(`Invalid voice_memo event: missing id or incoming_file`);
          return;
        }

        try {
          const memo = await invoke<VoiceMemo>('store_voice_memo', {
            id,
            timestamp: timestamp || new Date().toISOString(),
            durationMs: duration_ms ?? 0,
            healthJson: health_json ?? null,
            incomingFile: incoming_file,
          });
          onVoiceMemoRef.current?.(memo);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          onErrorRef.current?.(`Failed to store voice memo: ${msg}`);
        }
      });
    })();

    return () => {
      unlisten?.();
      unlistenMemo?.();
    };
  }, [enabled, password]);

  // ── Commands ────────────────────────────────────────────────────────────────

  /** Check whether a Wear OS device is currently paired and reachable */
  const checkConnection = useCallback(async (): Promise<WearConnectionState> => {
    return invoke<WearConnectionState>('plugin:wear|wearCheckConnection');
  }, []);

  /**
   * Simulate a watch signal from the TypeScript layer — useful for testing
   * without a physical Wear OS device. Calls wearBridgeSignal on the plugin
   * which triggers the same "wear://signal" event path as a real watch.
   */
  const simulateSignal = useCallback(async (msg: WatchSignalMessage): Promise<void> => {
    await invoke('plugin:wear|wearBridgeSignal', {
      id: msg.id,
      timestamp: msg.timestamp,
      type: msg.type,
      payload: JSON.stringify(msg.payload),
    });
  }, []);

  /**
   * Send a feedback acknowledgement back to the watch (haptic, badge update).
   * @param nodeId  The watch node ID from WearConnectionState
   * @param message One of "saved" | "error" | "prompt_ready"
   */
  const sendFeedback = useCallback(async (
    nodeId: string,
    message: 'saved' | 'error' | 'prompt_ready',
  ): Promise<{ sent: boolean }> => {
    return invoke<{ sent: boolean }>('plugin:wear|wearSendFeedback', { nodeId, message });
  }, []);

  return { checkConnection, simulateSignal, sendFeedback };
}
