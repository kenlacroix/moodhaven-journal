"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ExternalLink } from "lucide-react";

export interface StatItem {
  label: string;
  value: string;
  href?: string;
}

/** Match purely numeric strings, with optional comma-thousands separators. */
function isAnimatable(value: string): boolean {
  return /^\d[\d,]*$/.test(value);
}

function parseNumeric(value: string): number {
  return parseInt(value.replace(/,/g, ""), 10);
}

function formatWithCommas(n: number, template: string): string {
  // Preserve comma formatting from the original string
  const hasCommas = template.includes(",");
  const formatted = n.toLocaleString("en-US");
  return hasCommas ? formatted : String(n);
}

function useCountUp(
  target: number,
  active: boolean,
  reducedMotion: boolean,
  duration = 800
): number {
  const [current, setCurrent] = useState(reducedMotion ? target : 0);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    if (reducedMotion) {
      setCurrent(target);
      return;
    }

    startTimeRef.current = null;

    function tick(timestamp: number) {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(eased * target));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [active, target, duration, reducedMotion]);

  return current;
}

function AnimatedValue({
  value,
  active,
  reducedMotion,
}: {
  value: string;
  active: boolean;
  reducedMotion: boolean;
}) {
  const animatable = isAnimatable(value);
  const target = animatable ? parseNumeric(value) : 0;
  const count = useCountUp(target, active && animatable, reducedMotion);

  if (!animatable) return <>{value}</>;
  return <>{formatWithCommas(count, value)}</>;
}

export default function AnimatedStatsStrip({ stats }: { stats: StatItem[] }) {
  const reducedMotion = useReducedMotion() ?? false;
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (reducedMotion) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reducedMotion]);

  return (
    <div ref={ref} className="bg-primary-950 text-primary-200 py-3 overflow-x-auto">
      <ul className="flex items-center justify-center gap-5 md:gap-10 min-w-max mx-auto px-4 text-xs font-mono">
        {stats.map((stat, i) => (
          <li key={i} className="flex items-center gap-1.5 shrink-0">
            <span className="font-bold text-white">
              <AnimatedValue value={stat.value} active={inView} reducedMotion={reducedMotion} />
            </span>
            <span className="text-primary-400">{stat.label}</span>
            {stat.href && (
              <a
                href={stat.href}
                className="text-primary-600 hover:text-primary-300 transition-colors"
                aria-label={`View ${stat.label}`}
              >
                <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
              </a>
            )}
            {i < stats.length - 1 && (
              <span className="ml-4 text-primary-700" aria-hidden="true">·</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
