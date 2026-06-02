/**
 * Forest2D — 2D canvas bilateral session environment.
 *
 * Canvas layer (rAF loop, all refs — no React state in the hot path):
 *   - Background gradient: deep forest floor → canopy
 *   - Forest floor suggestion at bottom edge
 *   - Bilateral light shafts (warm green-gold, upper corners, 18° from vertical)
 *     Shaft intensity driven by engine tick events; decays each frame.
 *   - 8 leaf silhouettes drifting downward with lateral sway
 *   - 25 dust/spore particles slowly rising
 *
 * React layer: elapsed timer, pause overlay, control bar (same as Underwater2D).
 * Reduced-motion: shafts static at 60% opacity, leaves and particles frozen.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useBilateralEngine } from '../../hooks/useBilateralEngine';
import type { Side } from '../../engine/bilateralEngine';

interface Leaf {
  x: number;
  y: number;
  vy: number;       // downward speed px/s
  phase: number;    // for horizontal sway
  swayAmp: number;  // horizontal sway amplitude px
  w: number;        // leaf width px
  h: number;        // leaf height px
  angle: number;    // tilt radians
  opacity: number;
  active: boolean;
  waitUntil: number;
}

interface Spore {
  x: number;
  y: number;
  vy: number;    // upward (negative)
  phase: number;
  size: number;
  opacity: number;
}

const LEAF_COUNT = 8;
const SPORE_COUNT = 25;
const SHAFT_RISE = 0.95;
const SHAFT_DECAY = 0.05;
const SHAFT_HEIGHT_RATIO = 0.35;
const SHAFT_WIDTH_RATIO = 0.07;
const SHAFT_ANGLE_DEG = 18;
const FLOOR_START = 0.88;
const REDUCED_MOTION =
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

function rand(min: number, max: number) { return min + Math.random() * (max - min); }

function makeLeaf(w: number, h: number, stagger = false): Leaf {
  return {
    x: rand(0, w),
    y: stagger ? rand(-h * 0.1, h * 0.6) : -rand(10, 40),
    vy: rand(18, 32),
    phase: rand(0, Math.PI * 2),
    swayAmp: rand(14, 28),
    w: rand(8, 14),
    h: rand(4, 7),
    angle: rand(0, Math.PI),
    opacity: rand(0.3, 0.6),
    active: true,
    waitUntil: 0,
  };
}

function makeSpore(w: number, h: number): Spore {
  return {
    x: rand(0, w),
    y: rand(0, h),
    vy: rand(-10, -4),
    phase: rand(0, Math.PI * 2),
    size: rand(1.5, 3),
    opacity: rand(0.1, 0.22),
  };
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.00, '#060F08');
  grad.addColorStop(0.30, '#0E2312');
  grad.addColorStop(0.65, '#1A3A1D');
  grad.addColorStop(1.00, '#243E26');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Forest floor suggestion
  const floor = ctx.createLinearGradient(0, h * FLOOR_START, 0, h);
  floor.addColorStop(0, 'rgba(20, 10, 5, 0)');
  floor.addColorStop(1, 'rgba(20, 10, 5, 0.45)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, h * FLOOR_START, w, h * (1 - FLOOR_START));

  // Canopy darkening at top
  const canopy = ctx.createLinearGradient(0, 0, 0, h * 0.18);
  canopy.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
  canopy.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = canopy;
  ctx.fillRect(0, 0, w, h * 0.18);
}

function drawShaft(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  side: Side,
  intensity: number,
) {
  if (intensity < 0.01) return;
  const shaftH = h * SHAFT_HEIGHT_RATIO;
  const shaftW = w * SHAFT_WIDTH_RATIO;
  const angleRad = (SHAFT_ANGLE_DEG * Math.PI) / 180;
  const ox = side === 'L' ? 0 : w;
  const driftX = shaftH * Math.tan(angleRad) * (side === 'L' ? 1 : -1);
  const cx = ox + driftX;
  const hw0 = shaftW * 0.55;
  const hw1 = shaftW * 0.15;
  const [r, g, b] = [210, 235, 140] as const;
  const grad = ctx.createLinearGradient(ox, 0, cx, shaftH);
  grad.addColorStop(0, `rgba(${r},${g},${b},${(intensity * 0.65).toFixed(3)})`);
  grad.addColorStop(0.55, `rgba(${r},${g},${b},${(intensity * 0.22).toFixed(3)})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(ox - hw0, 0);
  ctx.lineTo(ox + hw0, 0);
  ctx.lineTo(cx + hw1, shaftH);
  ctx.lineTo(cx - hw1, shaftH);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawLeaf(ctx: CanvasRenderingContext2D, leaf: Leaf) {
  ctx.save();
  ctx.globalAlpha = leaf.opacity;
  ctx.fillStyle = '#2D6B35';
  ctx.translate(leaf.x, leaf.y);
  ctx.rotate(leaf.angle);
  ctx.beginPath();
  ctx.ellipse(0, 0, leaf.w, leaf.h, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSpore(ctx: CanvasRenderingContext2D, s: Spore) {
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(230, 225, 185, ${s.opacity.toFixed(3)})`;
  ctx.fill();
}

function formatElapsed(secs: number) {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

interface Props { onEnd: () => void; onPause: () => void; onResume: () => void; isAdapting?: boolean; }

export function Forest2D({ onEnd, onPause, onResume, isAdapting = false }: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { isRunning, isPaused, elapsedSeconds, lastTick, resumeEngine, stopEngine } = useBilateralEngine();

  const shaftL = useRef(REDUCED_MOTION ? SHAFT_RISE * 0.6 : 0);
  const shaftR = useRef(REDUCED_MOTION ? SHAFT_RISE * 0.6 : 0);
  const lastTickSide = useRef<Side | null>(null);
  const leavesRef = useRef<Leaf[]>([]);
  const sporesRef = useRef<Spore[]>([]);
  const rafId = useRef(0);
  const prevTs = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  useEffect(() => {
    if (!lastTick || REDUCED_MOTION) return;
    if (lastTick.side !== lastTickSide.current) {
      lastTickSide.current = lastTick.side;
      if (lastTick.side === 'L') shaftL.current = SHAFT_RISE;
      else shaftR.current = SHAFT_RISE;
    }
  }, [lastTick]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio ?? 1;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    sizeRef.current = { w, h, dpr };
    sporesRef.current = Array.from({ length: SPORE_COUNT }, () => makeSpore(w, h));
    leavesRef.current = Array.from({ length: LEAF_COUNT }, () => makeLeaf(w, h, true));
  }, []);

  useLayoutEffect(() => {
    resizeCanvas();
    const obs = new ResizeObserver(resizeCanvas);
    if (canvasRef.current) obs.observe(canvasRef.current);
    return () => obs.disconnect();
  }, [resizeCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function draw(ts: number) {
      const ctx = canvas!.getContext('2d');
      if (!ctx) return;
      const dt = Math.min(ts - prevTs.current, 50) / 1000;
      prevTs.current = ts;
      const { w, h, dpr } = sizeRef.current;
      if (w === 0 || h === 0) { rafId.current = requestAnimationFrame(draw); return; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      drawBackground(ctx, w, h);

      if (!REDUCED_MOTION) {
        for (const s of sporesRef.current) {
          s.y += s.vy * dt;
          s.phase += dt * 0.6;
          s.x += Math.sin(s.phase) * 0.3;
          if (s.y < -s.size) { s.y = h + s.size; s.x = rand(0, w); }
          drawSpore(ctx, s);
        }
      }

      if (!REDUCED_MOTION) {
        shaftL.current = Math.max(0, shaftL.current - SHAFT_DECAY);
        shaftR.current = Math.max(0, shaftR.current - SHAFT_DECAY);
      }
      drawShaft(ctx, w, h, 'L', shaftL.current);
      drawShaft(ctx, w, h, 'R', shaftR.current);

      const now = performance.now();
      for (const leaf of leavesRef.current) {
        if (!leaf.active) {
          if (now >= leaf.waitUntil) {
            leaf.x = rand(0, w);
            leaf.y = -rand(10, 30);
            leaf.active = true;
          }
          continue;
        }
        if (!REDUCED_MOTION) {
          leaf.y += leaf.vy * dt;
          leaf.phase += dt * 0.9;
          leaf.x += Math.sin(leaf.phase) * leaf.swayAmp * dt;
          leaf.angle += 0.4 * dt;
        }
        if (leaf.y > h + 20) {
          leaf.active = false;
          leaf.waitUntil = now + rand(4000, 12000);
        }
        drawLeaf(ctx, leaf);
      }

      rafId.current = requestAnimationFrame(draw);
    }

    prevTs.current = performance.now();
    rafId.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  const handlePause = useCallback(() => { onPause(); }, [onPause]);
  const handleResume = useCallback(() => { resumeEngine(); onResume(); }, [resumeEngine, onResume]);
  const handleEnd = useCallback(() => { stopEngine(); onEnd(); }, [stopEngine, onEnd]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#060F08]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ touchAction: 'none' }} />

      <div className="absolute top-4 left-5 select-none pointer-events-none flex items-center gap-2">
        <span className="text-white/60 text-sm tabular-nums font-medium">{formatElapsed(elapsedSeconds)}</span>
        {isAdapting && <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-pulse" title="Session adapting to biometrics" />}
      </div>

      {isPaused && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
          <p className="text-white/90 text-sm mb-4 font-medium tracking-wide">Paused</p>
          <button onClick={handleResume} className="px-6 py-2.5 rounded-full bg-white/20 border border-white/30 text-white text-sm font-medium hover:bg-white/30 transition-colors">Resume</button>
        </div>
      )}

      <div className="absolute bottom-0 inset-x-0 h-20 flex items-center justify-between px-6 bg-gradient-to-t from-black/50 to-transparent">
        {!isPaused && isRunning ? (
          <button onClick={handlePause} className="px-4 py-1.5 rounded-full border border-white/30 text-white/70 text-sm hover:bg-white/10 transition-colors">Pause</button>
        ) : <div />}
        <button onClick={handleEnd} className="px-5 py-2 rounded-full bg-white/15 border border-white/30 text-white/90 text-sm font-medium hover:bg-white/25 transition-colors">End session</button>
      </div>
    </div>
  );
}
