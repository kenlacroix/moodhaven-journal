/**
 * SubmergeOverlay — 2.5s transition from check-in screen to underwater scene.
 *
 * Phase timeline (D8/A):
 *   0–600ms   : page background dims; deep blue gradient rises from bottom
 *   600–1500ms: scene canvas mounts behind overlay (caller responsibility)
 *   1500–2500ms: overlay fades out; session is live
 *
 * Reduced-motion: collapses to a single 300ms fade.
 *
 * Usage: mount this component when the user taps "Start session". It calls
 * onComplete() at 2500ms (or 300ms in reduced-motion mode). The caller is
 * responsible for mounting <Underwater2D /> and starting the engine once
 * onComplete fires.
 */

import React, { useEffect, useState } from 'react';

const REDUCED_MOTION =
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

type Phase = 'rising' | 'holding' | 'fading' | 'done';

interface Props {
  onComplete: () => void;
}

export function SubmergeOverlay({ onComplete }: Props): React.JSX.Element | null {
  const [phase, setPhase] = useState<Phase>(REDUCED_MOTION ? 'fading' : 'rising');
  const [risePercent, setRisePercent] = useState(0);

  useEffect(() => {
    if (REDUCED_MOTION) {
      const t = setTimeout(() => {
        setPhase('done');
        onComplete();
      }, 300);
      return () => clearTimeout(t);
    }

    // Phase 1: gradient rises 0→100% over 600ms using rAF
    let start: number | null = null;
    let rafId = 0;

    function animateRise(ts: number): void {
      if (start === null) start = ts;
      const progress = Math.min((ts - start) / 600, 1);
      setRisePercent(progress * 100);
      if (progress < 1) {
        rafId = requestAnimationFrame(animateRise);
      } else {
        setPhase('holding');
      }
    }

    rafId = requestAnimationFrame(animateRise);

    return () => {
      cancelAnimationFrame(rafId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'holding') return;
    // T=600ms: hold briefly, then fade
    const t = setTimeout(() => setPhase('fading'), 900);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'fading') return;
    // T=1500ms: fade out over 1000ms → done at 2500ms
    const t = setTimeout(() => {
      setPhase('done');
      onComplete();
    }, 1000);
    return () => clearTimeout(t);
  }, [phase, onComplete]);

  if (phase === 'done') return null;

  const isReducedFade = REDUCED_MOTION;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 50 }}
      aria-hidden
    >
      {/* Dimming layer over page background */}
      <div
        className="absolute inset-0 bg-[rgba(243,240,234,0.6)]"
        style={{
          opacity: phase === 'fading' ? 0 : 1,
          transition: isReducedFade
            ? 'opacity 300ms ease'
            : phase === 'fading'
            ? 'opacity 1000ms ease'
            : 'none',
        }}
      />

      {/* Rising deep-blue gradient from bottom */}
      {!isReducedFade && (
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: `${risePercent}%`,
            background: 'linear-gradient(to top, #0a3a5a 40%, #1a6478 80%, transparent 100%)',
            opacity: phase === 'fading' ? 0 : 1,
            transition: phase === 'fading' ? 'opacity 1000ms ease' : 'none',
          }}
        />
      )}
    </div>
  );
}
