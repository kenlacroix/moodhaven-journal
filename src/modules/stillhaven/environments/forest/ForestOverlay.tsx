/**
 * ForestOverlay — 2.5s transition into the forest environment.
 * Mirrors the SubmergeOverlay phase timeline with forest-green colours.
 * Reduced-motion: collapses to a single 300ms fade.
 */

import React, { useEffect, useState } from 'react';

const REDUCED_MOTION =
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

type Phase = 'rising' | 'holding' | 'fading' | 'done';

interface Props { onComplete: () => void; }

export function ForestOverlay({ onComplete }: Props): React.JSX.Element | null {
  const [phase, setPhase] = useState<Phase>(REDUCED_MOTION ? 'fading' : 'rising');
  const [risePercent, setRisePercent] = useState(0);

  useEffect(() => {
    if (REDUCED_MOTION) {
      const t = setTimeout(() => { setPhase('done'); onComplete(); }, 300);
      return () => clearTimeout(t);
    }
    let start: number | null = null;
    let rafId = 0;
    function animateRise(ts: number) {
      if (start === null) start = ts;
      const progress = Math.min((ts - start) / 600, 1);
      setRisePercent(progress * 100);
      if (progress < 1) { rafId = requestAnimationFrame(animateRise); }
      else { setPhase('holding'); }
    }
    rafId = requestAnimationFrame(animateRise);
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'holding') return;
    const t = setTimeout(() => setPhase('fading'), 900);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'fading') return;
    const t = setTimeout(() => { setPhase('done'); onComplete(); }, 1000);
    return () => clearTimeout(t);
  }, [phase, onComplete]);

  if (phase === 'done') return null;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 50 }} aria-hidden>
      <div
        className="absolute inset-0 bg-[rgba(243,240,234,0.6)]"
        style={{
          opacity: phase === 'fading' ? 0 : 1,
          transition: REDUCED_MOTION ? 'opacity 300ms ease' : phase === 'fading' ? 'opacity 1000ms ease' : 'none',
        }}
      />
      {!REDUCED_MOTION && (
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: `${risePercent}%`,
            background: 'linear-gradient(to top, #060F08 40%, #1A3A1D 80%, transparent 100%)',
            opacity: phase === 'fading' ? 0 : 1,
            transition: phase === 'fading' ? 'opacity 1000ms ease' : 'none',
          }}
        />
      )}
      <div
        className="absolute inset-0 flex items-center justify-center px-8"
        style={{
          opacity: phase === 'holding' ? 1 : 0,
          transition: phase === 'holding' ? 'opacity 400ms ease' : phase === 'fading' ? 'opacity 800ms ease' : 'none',
        }}
      >
        <p className="text-white/80 text-sm text-center leading-relaxed max-w-xs font-light tracking-wide">
          Notice the quiet between sounds.
          <br />
          You don&apos;t have to go anywhere.
          <br />
          Just be here.
        </p>
      </div>
    </div>
  );
}
