/**
 * Sky2D — 2D canvas bilateral session environment.
 *
 * Canvas layer (rAF loop, all refs — no React state in the hot path):
 *   - Background gradient: deep night → violet → warm amber horizon
 *   - Bilateral horizon rays (warm amber-white, rising from lower L/R)
 *     Ray intensity driven by engine tick events; decays each frame.
 *   - 3 slow-drifting cloud shapes
 *   - 25 faint stars at top, some twinkling
 *
 * React layer: elapsed timer, pause overlay, control bar (same as Underwater2D).
 * Reduced-motion: rays static at 60% opacity, clouds and stars frozen.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useBilateralEngine } from '../../hooks/useBilateralEngine';
import type { Side } from '../../engine/bilateralEngine';

interface Cloud {
  x: number;
  y: number;
  speed: number;   // px/s rightward (negative = left)
  w: number;       // width px
  h: number;       // height px
  opacity: number;
  active: boolean;
  waitUntil: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  baseOpacity: number;
  phase: number;    // for twinkle
  twinkle: boolean; // some stars don't twinkle
}

const CLOUD_COUNT = 3;
const STAR_COUNT = 25;
const RAY_RISE = 0.95;
const RAY_DECAY = 0.05;
const RAY_HEIGHT_RATIO = 0.55;  // taller — from horizon up
const RAY_WIDTH_RATIO = 0.10;
const REDUCED_MOTION =
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

function rand(min: number, max: number) { return min + Math.random() * (max - min); }

function makeCloud(w: number, h: number, stagger = false): Cloud {
  return {
    x: stagger ? rand(-100, w + 100) : w + rand(40, 120),
    y: rand(h * 0.05, h * 0.35),
    speed: rand(4, 8),
    w: rand(80, 160),
    h: rand(22, 40),
    opacity: rand(0.08, 0.18),
    active: true,
    waitUntil: 0,
  };
}

function makeStar(w: number, h: number): Star {
  return {
    x: rand(0, w),
    y: rand(0, h * 0.45),
    size: rand(0.8, 2.2),
    baseOpacity: rand(0.2, 0.55),
    phase: rand(0, Math.PI * 2),
    twinkle: Math.random() < 0.6,
  };
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.00, '#080B1A');
  grad.addColorStop(0.25, '#111B3E');
  grad.addColorStop(0.50, '#2A1B5E');
  grad.addColorStop(0.72, '#5B3B9E');
  grad.addColorStop(0.88, '#9A6DC0');
  grad.addColorStop(0.96, '#C4822A');
  grad.addColorStop(1.00, '#E08030');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Horizon glow
  const glow = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, w * 0.7);
  glow.addColorStop(0, 'rgba(242, 140, 56, 0.18)');
  glow.addColorStop(1, 'rgba(242, 140, 56, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

function drawRay(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  side: Side,
  intensity: number,
) {
  if (intensity < 0.01) return;
  const rayH = h * RAY_HEIGHT_RATIO;
  const rayW = w * RAY_WIDTH_RATIO;
  // Rays rise from near the bottom L/R, fan inward+upward
  const ox = side === 'L' ? w * 0.08 : w * 0.92;
  const oy = h;
  const tipX = side === 'L' ? w * 0.38 : w * 0.62;
  const tipY = h - rayH;
  const hw0 = rayW * 0.12;
  const hw1 = rayW * 0.5;
  const [r, g, b] = [255, 218, 150] as const;
  const grad = ctx.createLinearGradient(ox, oy, tipX, tipY);
  grad.addColorStop(0, `rgba(${r},${g},${b},${(intensity * 0.5).toFixed(3)})`);
  grad.addColorStop(0.5, `rgba(${r},${g},${b},${(intensity * 0.2).toFixed(3)})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(ox - hw1, oy);
  ctx.lineTo(ox + hw1, oy);
  ctx.lineTo(tipX + hw0, tipY);
  ctx.lineTo(tipX - hw0, tipY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCloud(ctx: CanvasRenderingContext2D, cloud: Cloud) {
  ctx.save();
  ctx.globalAlpha = cloud.opacity;
  ctx.fillStyle = '#C4B5FD'; // brand primary 300 — soft violet cloud
  ctx.beginPath();
  ctx.ellipse(cloud.x, cloud.y, cloud.w / 2, cloud.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Second lobe for cloud shape
  ctx.beginPath();
  ctx.ellipse(cloud.x - cloud.w * 0.25, cloud.y + cloud.h * 0.1, cloud.w * 0.35, cloud.h * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cloud.x + cloud.w * 0.25, cloud.y + cloud.h * 0.15, cloud.w * 0.3, cloud.h * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStar(ctx: CanvasRenderingContext2D, star: Star, dt: number) {
  if (star.twinkle && !REDUCED_MOTION) {
    star.phase += dt * rand(0.5, 1.5);
  }
  const op = star.twinkle
    ? star.baseOpacity * (0.5 + 0.5 * Math.sin(star.phase))
    : star.baseOpacity;
  ctx.beginPath();
  ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${op.toFixed(3)})`;
  ctx.fill();
}

function formatElapsed(secs: number) {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

interface Props { onEnd: () => void; onPause: () => void; onResume: () => void; isAdapting?: boolean; }

export function Sky2D({ onEnd, onPause, onResume, isAdapting = false }: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { isRunning, isPaused, elapsedSeconds, lastTick, resumeEngine, stopEngine } = useBilateralEngine();

  const rayL = useRef(REDUCED_MOTION ? RAY_RISE * 0.6 : 0);
  const rayR = useRef(REDUCED_MOTION ? RAY_RISE * 0.6 : 0);
  const lastTickSide = useRef<Side | null>(null);
  const cloudsRef = useRef<Cloud[]>([]);
  const starsRef = useRef<Star[]>([]);
  const rafId = useRef(0);
  const prevTs = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  useEffect(() => {
    if (!lastTick || REDUCED_MOTION) return;
    if (lastTick.side !== lastTickSide.current) {
      lastTickSide.current = lastTick.side;
      if (lastTick.side === 'L') rayL.current = RAY_RISE;
      else rayR.current = RAY_RISE;
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
    cloudsRef.current = Array.from({ length: CLOUD_COUNT }, () => makeCloud(w, h, true));
    starsRef.current = Array.from({ length: STAR_COUNT }, () => makeStar(w, h));
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

      // Stars
      for (const star of starsRef.current) drawStar(ctx, star, dt);

      // Horizon rays (decay)
      if (!REDUCED_MOTION) {
        rayL.current = Math.max(0, rayL.current - RAY_DECAY);
        rayR.current = Math.max(0, rayR.current - RAY_DECAY);
      }
      drawRay(ctx, w, h, 'L', rayL.current);
      drawRay(ctx, w, h, 'R', rayR.current);

      // Clouds
      const now = performance.now();
      for (const cloud of cloudsRef.current) {
        if (!cloud.active) {
          if (now >= cloud.waitUntil) {
            cloud.x = w + rand(40, 120);
            cloud.y = rand(h * 0.05, h * 0.35);
            cloud.active = true;
          }
          continue;
        }
        if (!REDUCED_MOTION) cloud.x -= cloud.speed * dt;
        if (cloud.x < -(cloud.w + 50)) {
          cloud.active = false;
          cloud.waitUntil = now + rand(15000, 35000);
        }
        drawCloud(ctx, cloud);
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
    <div className="relative w-full h-full overflow-hidden bg-[#080B1A]">
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
