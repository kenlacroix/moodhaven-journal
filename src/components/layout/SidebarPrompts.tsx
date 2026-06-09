import { useState, useEffect, useCallback } from 'react';
import { UpdateBanner } from '../updater/UpdateBanner';
import { PeerSyncBadge } from '../peer-sync/PeerSyncBadge';
import type { UseUpdateCheckReturn } from '../../hooks/useUpdateCheck';
import { usePlatform } from '../../hooks/usePlatform';
import { getMoodTrend } from '../../lib/services/analyticsService';
import type { ViewType } from './Sidebar';

const MOOD_COLORS: Record<number, string> = {
  5: '#10b981',
  4: '#84cc16',
  3: '#eab308',
  2: '#f97316',
  1: '#ef4444',
};

function MoodSparkline({ collapsed }: { collapsed: boolean }) {
  const [points, setPoints] = useState<{ day: number; mood: number }[]>([]);

  useEffect(() => {
    getMoodTrend(7)
      .then((trend) => {
        const today = new Date();
        const data: { day: number; mood: number }[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          const iso = d.toISOString().slice(0, 10);
          const row = trend.find((t) => t.date === iso);
          data.push({ day: 6 - i, mood: row?.averageMood ?? 0 });
        }
        setPoints(data);
      })
      .catch(() => { /* silent — sparkline is decorative */ });
  }, []);

  if (collapsed || points.length === 0) return null;

  const filled = points.filter((p) => p.mood > 0);
  if (filled.length === 0) return null;

  const W = 120, H = 28, PAD = 2;
  const xs = points.map((_, i) => PAD + (i / 6) * (W - PAD * 2));
  const toY = (m: number) => m === 0 ? H - PAD : PAD + (1 - (m - 1) / 4) * (H - PAD * 2);

  const pathD = points.reduce((acc, p, i) => {
    if (p.mood === 0) return acc;
    const x = xs[i].toFixed(1);
    const y = toY(p.mood).toFixed(1);
    return acc === '' ? `M${x},${y}` : acc + ` L${x},${y}`;
  }, '');

  const lastFilled = [...points].reverse().find((p) => p.mood > 0);
  const lastColor = lastFilled ? MOOD_COLORS[Math.round(lastFilled.mood)] ?? '#8b5cf6' : '#8b5cf6';

  return (
    <div className="px-3 pb-2" aria-hidden="true">
      <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">7-day mood</p>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
        {pathD && (
          <path d={pathD} fill="none" stroke={lastColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
        )}
        {points.map((p, i) =>
          p.mood > 0 ? (
            <circle
              key={i}
              cx={xs[i]}
              cy={toY(p.mood)}
              r={2}
              fill={MOOD_COLORS[Math.round(p.mood)] ?? '#8b5cf6'}
            />
          ) : null
        )}
      </svg>
    </div>
  );
}

interface SidebarPromptsProps {
  collapsed: boolean;
  updateHook: UseUpdateCheckReturn;
  onNavigate: (view: ViewType) => void;
}

export function SidebarPrompts({ collapsed, updateHook, onNavigate }: SidebarPromptsProps) {
  const { isBrowser, canPeerSync } = usePlatform();

  const [showSupportPrompt, setShowSupportPrompt] = useState(() => {
    try {
      if (localStorage.getItem('mb_support_prompt_shown') === 'true') return false;
      const firstLaunch = localStorage.getItem('mb_first_launch_date');
      if (!firstLaunch) {
        localStorage.setItem('mb_first_launch_date', new Date().toISOString());
        return false;
      }
      const parsed = new Date(firstLaunch).getTime();
      if (isNaN(parsed)) return false;
      const daysSince = (Date.now() - parsed) / 86_400_000;
      return daysSince >= 30;
    } catch { return false; }
  });

  const dismissSupportPrompt = useCallback(() => {
    setShowSupportPrompt(false);
    try { localStorage.setItem('mb_support_prompt_shown', 'true'); } catch { /* ignore */ }
  }, []);

  const [showDownloadPrompt, setShowDownloadPrompt] = useState(() => {
    try { return localStorage.getItem('mh_web_download_prompt_dismissed') !== 'true'; }
    catch { return true; }
  });

  const dismissDownloadPrompt = useCallback(() => {
    setShowDownloadPrompt(false);
    try { localStorage.setItem('mh_web_download_prompt_dismissed', 'true'); } catch { /* ignore */ }
  }, []);

  return (
    <>
      {/* Peer sync badge — desktop + Android only */}
      {canPeerSync && (
        <div className="px-3 pb-1">
          <PeerSyncBadge
            collapsed={collapsed}
            onOpenDevices={() => onNavigate('settings')}
          />
        </div>
      )}

      {/* Update available banner */}
      <div className="px-3 pb-1">
        <UpdateBanner
          hook={updateHook}
          collapsed={collapsed}
          onOpenSettings={() => onNavigate('settings')}
        />
      </div>

      {/* One-time 30-day support prompt */}
      {showSupportPrompt && !collapsed && (
        <div className="mx-3 mb-2 p-3 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-violet-700 dark:text-violet-300 leading-snug">
              Enjoying MoodHaven Journal? A coffee helps keep it going.
            </p>
            <button
              type="button"
              onClick={dismissSupportPrompt}
              aria-label="Dismiss"
              className="flex-shrink-0 text-violet-400 hover:text-violet-600 dark:hover:text-violet-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <a
            href="https://buymeacoffee.com/moodbloom"
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismissSupportPrompt}
            className="mt-2 inline-block text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
          >
            Buy Me a Coffee ↗
          </a>
        </div>
      )}

      {/* Download desktop / Android app — browser only */}
      {isBrowser && showDownloadPrompt && !collapsed && (
        <div className="mx-3 mb-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-200 leading-snug">
              Get the full app
            </p>
            <button
              type="button"
              onClick={dismissDownloadPrompt}
              aria-label="Dismiss"
              className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug mb-2.5">
            Peer sync, speech-to-text, and hardware keys require the desktop app.
          </p>
          <div className="flex flex-col gap-1.5">
            <a
              href="https://github.com/kenlacroix/moodhaven-journal/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Desktop (Windows / macOS / Linux) ↗
            </a>
            <a
              href="https://github.com/kenlacroix/moodhaven-journal/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
              Android (phone + Wear OS) ↗
            </a>
          </div>
        </div>
      )}

      {/* 7-day mood sparkline */}
      {!isBrowser && <MoodSparkline collapsed={collapsed} />}

      {/* User Guide + Support links */}
      <div className={`px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800 space-y-2 ${collapsed ? 'flex flex-col items-center' : ''}`}>
        <a
          href="https://github.com/kenlacroix/moodhaven-journal#readme"
          target="_blank"
          rel="noopener noreferrer"
          title="User Guide"
          className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-violet-500 dark:hover:text-violet-400 transition-colors"
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          {!collapsed && <span>User Guide ↗</span>}
        </a>
        <a
          href="https://buymeacoffee.com/moodbloom"
          target="_blank"
          rel="noopener noreferrer"
          title="Support MoodHaven Journal"
          className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-pink-500 dark:hover:text-pink-400 transition-colors"
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 21.593c-.317-.139-6.75-3.756-6.75-8.543 0-2.784 2.238-5.05 5-5.05 1.174 0 2.248.414 3.087 1.098A4.986 4.986 0 0118.75 8c2.762 0 5 2.266 5 5.05 0 4.787-6.433 8.404-6.75 8.543a.75.75 0 01-.5 0z" />
          </svg>
          {!collapsed && <span>Support ♥</span>}
        </a>
      </div>
    </>
  );
}
