/**
 * useWristLoop — Wrist Loop feature (v1.5.0)
 *
 * Watches for 'still_trigger' signals arriving from the Wear OS companion.
 * When one arrives, it surfaces a `pendingTrigger` that the UI renders as a
 * dismissable banner. The user can accept (→ navigate to StillHaven) or dismiss.
 *
 * Usage:
 *   const { pendingTrigger, handleSignal, accept, dismiss } = useWristLoop({ onAccept });
 *   // Pass handleSignal as the onSignal callback to useWearSignals.
 */

import { useState, useCallback } from 'react';
import type { Signal } from '../types/signals';
import type { StillTriggerPayload } from '../types/signals';

export interface WristLoopTrigger {
  signalId: string;
  timestamp: string;
  protocol: 'general_activation' | 'fake_danger' | undefined;
}

interface UseWristLoopOptions {
  onAccept: (trigger: WristLoopTrigger) => void;
}

export function useWristLoop({ onAccept }: UseWristLoopOptions) {
  const [pendingTrigger, setPendingTrigger] = useState<WristLoopTrigger | null>(null);

  const handleSignal = useCallback((signal: Signal) => {
    if (signal.type !== 'still_trigger') return;
    const payload = signal.payload as StillTriggerPayload;
    setPendingTrigger({
      signalId: signal.id,
      timestamp: signal.timestamp,
      protocol: payload.protocol,
    });
  }, []);

  const accept = useCallback(() => {
    if (!pendingTrigger) return;
    onAccept(pendingTrigger);
    setPendingTrigger(null);
  }, [pendingTrigger, onAccept]);

  const dismiss = useCallback(() => {
    setPendingTrigger(null);
  }, []);

  return { pendingTrigger, handleSignal, accept, dismiss };
}
