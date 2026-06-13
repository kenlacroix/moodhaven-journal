/**
 * Underwater2D — 2D canvas bilateral session environment.
 *
 * Canvas layer (rAF loop, all refs — no React state in the hot path):
 *   - Background gradient: cobalt → teal
 *   - Sand suggestion at bottom edge
 *   - Bilateral light rays (gold, upper corners, 20° from vertical)
 *     Ray intensity driven by engine tick events; decays each frame.
 *   - 4 ambient fish silhouettes drifting right→left at ~10px/s
 *   - 40 caustic particles (pre-allocated, pooled on exit)
 *
 * React layer (always-visible control bar, pause overlay):
 *   - Elapsed timer top-left; Pause + End session buttons at bottom always showing
 *   - isPaused: semi-transparent overlay + resume button
 *
 * Reduced-motion: both rays static at 60% opacity, fish and particles frozen.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';
import { useBilateralEngine } from '../../hooks/useBilateralEngine';
import type { Side } from '../../engine/bilateralEngine';
import { REDUCED_MOTION, rand } from '../canvasUtils';
import { SessionChrome } from '../SessionChrome';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Fish {
  x: number;
  y: number;
  speed: number;   // px/s; ~10 with small variance
  scale: number;   // 0.7–1.3
  opacity: number; // 0.35–0.65
  active: boolean;
  waitUntil: number; // ms timestamp; fish respawns after exiting
}

interface Particle {
  x: number;
  y: number;
  vy: number;      // upward drift (negative, px/s)
  phase: number;   // for horizontal sway sine
  size: number;    // 2–4 px
  opacity: number; // 0.12–0.28
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FISH_COUNT = 4;
const PARTICLE_COUNT = 40;
const RAY_RISE = 0.95;      // intensity rises to this on tick
const RAY_DECAY = 0.055;    // per frame at 60fps → ~300ms full fade
const RAY_HEIGHT_RATIO = 0.30;
const RAY_WIDTH_RATIO = 0.08;
const RAY_ANGLE_DEG = 20;
const SAND_START = 0.90;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFish(canvasW: number, canvasH: number, staggerX = false): Fish {
  return {
    x: staggerX ? rand(0, canvasW) : canvasW + rand(40, 100),
    y: rand(canvasH * 0.25, canvasH * 0.75),
    speed: rand(8, 13),
    scale: rand(0.7, 1.3),
    opacity: rand(0.35, 0.65),
    active: true,
    waitUntil: 0,
  };
}

function makeParticle(canvasW: number, canvasH: number): Particle {
  return {
    x: rand(0, canvasW),
    y: rand(0, canvasH),
    vy: rand(-12, -6),
    phase: rand(0, Math.PI * 2),
    size: rand(2, 4),
    opacity: rand(0.12, 0.28),
  };
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.00, '#0a3a5a');
  grad.addColorStop(0.45, '#1a6478');
  grad.addColorStop(0.80, '#2a8499');
  grad.addColorStop(1.00, '#2a8499');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Sand suggestion
  const sand = ctx.createLinearGradient(0, h * SAND_START, 0, h);
  sand.addColorStop(0, 'rgba(172, 148, 106, 0)');
  sand.addColorStop(1, 'rgba(172, 148, 106, 0.28)');
  ctx.fillStyle = sand;
  ctx.fillRect(0, h * SAND_START, w, h * (1 - SAND_START));
}

function drawRay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  side: Side,
  intensity: number,
): void {
  if (intensity < 0.01) return;

  const rayH = h * RAY_HEIGHT_RATIO;
  const rayW = w * RAY_WIDTH_RATIO;
  const angleRad = (RAY_ANGLE_DEG * Math.PI) / 180;

  // Corner origin
  const ox = side === 'L' ? 0 : w;
  const oy = 0;

  // Beam centre drifts inward as it descends
  const driftX = rayH * Math.tan(angleRad) * (side === 'L' ? 1 : -1);
  const cx = ox + driftX;

  const hw0 = rayW * 0.6; // half-width at origin (wider)
  const hw1 = rayW * 0.18; // half-width at bottom (narrower)

  const [r, g, b] = [244, 210, 122] as const;
  const grad = ctx.createLinearGradient(ox, oy, cx, oy + rayH);
  grad.addColorStop(0, `rgba(${r},${g},${b},${(intensity * 0.75).toFixed(3)})`);
  grad.addColorStop(0.6, `rgba(${r},${g},${b},${(intensity * 0.3).toFixed(3)})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(ox - hw0, oy);
  ctx.lineTo(ox + hw0, oy);
  ctx.lineTo(cx + hw1, oy + rayH);
  ctx.lineTo(cx - hw1, oy + rayH);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFish(
  ctx: CanvasRenderingContext2D,
  fish: Fish,
): void {
  const { x, y, scale, opacity } = fish;
  const bw = 38 * scale; // body half-length
  const bh = 10 * scale; // body half-height

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = '#0a3a5a';
  ctx.translate(x, y);

  // Body ellipse (fish faces left)
  ctx.beginPath();
  ctx.ellipse(0, 0, bw, bh, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tail: fan out to the right
  ctx.beginPath();
  ctx.moveTo(bw * 0.75, 0);
  ctx.lineTo(bw * 1.35, -bh * 1.1);
  ctx.lineTo(bw * 1.35, bh * 1.1);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${p.opacity.toFixed(3)})`;
  ctx.fill();
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  onEnd: () => void;
  onPause: () => void;
  onResume: () => void;
  isAdapting?: boolean;
}

export function Underwater2D({ onEnd, onPause, onResume, isAdapting = false }: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { isRunning, isPaused, elapsedSeconds, lastTick, resumeEngine, stopEngine } = useBilateralEngine();

  // ── rAF state (all refs — no re-renders from drawing loop) ──────────────
  const rayL = useRef(REDUCED_MOTION ? RAY_RISE * 0.6 : 0);
  const rayR = useRef(REDUCED_MOTION ? RAY_RISE * 0.6 : 0);
  const lastTickSide = useRef<Side | null>(null);
  const fishRef = useRef<Fish[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const rafId = useRef<number>(0);
  const prevTimestamp = useRef<number>(0);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  // ── Control bar: always visible ──────────────────────────────────────────
  // (tap-to-reveal removed — End button must always be discoverable)

  // ── Sync lastTick → ray intensity ────────────────────────────────────────
  useEffect(() => {
    if (!lastTick || REDUCED_MOTION) return;
    if (lastTick.side !== lastTickSide.current) {
      lastTickSide.current = lastTick.side;
      if (lastTick.side === 'L') rayL.current = RAY_RISE;
      else rayR.current = RAY_RISE;
    }
  }, [lastTick]);

  // ── Canvas resize ────────────────────────────────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio ?? 1;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    sizeRef.current = { w, h, dpr };

    // Re-init particles and fish after resize (positions are relative)
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () =>
      makeParticle(w, h),
    );
    fishRef.current = Array.from({ length: FISH_COUNT }, () =>
      makeFish(w, h, true /* stagger initial x */),
    );
  }, []);

  useLayoutEffect(() => {
    resizeCanvas();
    const obs = new ResizeObserver(resizeCanvas);
    if (canvasRef.current) obs.observe(canvasRef.current);
    return () => obs.disconnect();
  }, [resizeCanvas]);

  // ── rAF draw loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function draw(timestamp: number): void {
      const ctx = canvas!.getContext('2d');
      if (!ctx) return;

      const dtMs = Math.min(timestamp - prevTimestamp.current, 50); // clamp at 50ms
      const dt = dtMs / 1000; // seconds
      prevTimestamp.current = timestamp;

      const { w, h, dpr } = sizeRef.current;
      if (w === 0 || h === 0) {
        rafId.current = requestAnimationFrame(draw);
        return;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background
      drawBackground(ctx, w, h);

      // Caustic particles
      if (!REDUCED_MOTION) {
        for (const p of particlesRef.current) {
          p.y += p.vy * dt;
          p.phase += dt * 0.8;
          p.x += Math.sin(p.phase) * 0.4;
          if (p.y < -p.size) {
            p.y = h + p.size;
            p.x = rand(0, w);
          }
          drawParticle(ctx, p);
        }
      }

      // Light rays (decay each frame)
      if (!REDUCED_MOTION) {
        rayL.current = Math.max(0, rayL.current - RAY_DECAY);
        rayR.current = Math.max(0, rayR.current - RAY_DECAY);
      }
      drawRay(ctx, w, h, 'L', rayL.current);
      drawRay(ctx, w, h, 'R', rayR.current);

      // Fish
      const now = performance.now();
      for (const fish of fishRef.current) {
        if (!fish.active) {
          if (now >= fish.waitUntil) {
            fish.x = w + rand(40, 120);
            fish.y = rand(h * 0.2, h * 0.78);
            fish.active = true;
          }
          continue;
        }
        if (!REDUCED_MOTION) {
          fish.x -= fish.speed * dt;
        }
        if (fish.x < -60 * fish.scale) {
          fish.active = false;
          fish.waitUntil = now + rand(8000, 20000);
        }
        drawFish(ctx, fish);
      }

      rafId.current = requestAnimationFrame(draw);
    }

    prevTimestamp.current = performance.now();
    rafId.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId.current);
  }, []); // intentionally empty — all mutable state lives in refs

  // ── Pause / resume wiring ─────────────────────────────────────────────────
  const handlePause = useCallback(() => {
    onPause();
  }, [onPause]);

  const handleResume = useCallback(() => {
    resumeEngine();
    onResume();
  }, [resumeEngine, onResume]);

  const handleEnd = useCallback(() => {
    stopEngine();
    onEnd();
  }, [stopEngine, onEnd]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0a3a5a]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: 'none' }}
      />

      <SessionChrome
        elapsedSeconds={elapsedSeconds}
        isAdapting={isAdapting}
        isPaused={isPaused}
        isRunning={isRunning}
        onPause={handlePause}
        onResume={handleResume}
        onEnd={handleEnd}
      />
    </div>
  );
}
