import React from 'react';
import type { StillSession } from '../../../lib/stillService';

interface Props {
  session: StillSession;
  onResume: () => void;
  onDiscard: () => void;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function AbandonedSessionPrompt({ session, onResume, onDiscard }: Props): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-4 max-w-sm mx-auto text-center">
      <p className="text-sm font-semibold text-neutral-700">You have an incomplete session</p>
      <p className="text-xs text-neutral-500">
        Started {fmtDate(session.started_at)} — no check-out was recorded.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onResume}
          className="px-5 py-2 rounded-full bg-[#F28C38] text-white text-sm font-semibold hover:bg-[#e07c28] transition-colors"
        >
          Record check-out
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="px-5 py-2 rounded-full border border-neutral-200 text-neutral-600 text-sm hover:bg-neutral-50 transition-colors"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
