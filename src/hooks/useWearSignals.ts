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
import { createSignal } from '../lib/signalService';
import type {
  SignalType,
  SignalSource,
  SignalPayload,
  Signal,
  WatchSignalMessage,
} from '../types/signals';

// ── Event payload shape (matches WearPlugin.bridgeFromWatch) ──────────────────

interface WearSignalEvent {
  id: string;
  timestamp: string;
  type: string;
  source: string;
  /** Plaintext JSON payload — encrypted here before DB insertion */
  payload: string;
  nodeId: string;
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
  /** Called on error (validation failure, encryption error, etc.) */
  onError?: (error: string) => void;
  /** If false, the listener is not attached (e.g., while locked) */
  enabled?: boolean;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWearSignals({
  password,
  onSignal,
  onError,
  enabled = true,
}: UseWearSignalsOptions) {
  const onSignalRef = useRef(onSignal);
  const onErrorRef = useRef(onError);

  useEffect(() => { onSignalRef.current = onSignal; }, [onSignal]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // ── "wear://signal" event listener ─────────────────────────────────────────

  useEffect(() => {
    if (!enabled || !password) return;

    let unlisten: UnlistenFn | null = null;

    (async () => {
      unlisten = await listen<WearSignalEvent>('wear://signal', async (event) => {
        const { id, timestamp, type, source, payload } = event.payload;

        // Validate required fields
        if (!id || !type || !payload) {
          onErrorRef.current?.(`Invalid watch signal envelope: missing id/type/payload`);
          return;
        }

        // Parse plaintext payload (watch sends unencrypted; phone encrypts)
        let parsedPayload: SignalPayload;
        try {
          parsedPayload = JSON.parse(payload) as SignalPayload;
        } catch {
          onErrorRef.current?.(`Watch signal payload is not valid JSON: ${payload.slice(0, 80)}`);
          return;
        }

        // Encrypt + store via signal service
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

          // Auto-acknowledge: send haptic "saved" pulse back to the watch.
          // Skip for simulated signals (test injection from TypeScript).
          const nodeId = event.payload.nodeId;
          if (nodeId && nodeId !== 'simulated') {
            invoke('plugin:wear|wearSendFeedback', { nodeId, message: 'saved' })
              .catch(() => { /* non-critical — watch may have moved away */ });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          onErrorRef.current?.(`Failed to store watch signal: ${msg}`);
        }
      });
    })();

    return () => {
      unlisten?.();
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
