import React, { useEffect, useMemo, useState } from 'react';
import { stillListSessions, stillGetSessionWithSamples, stillGetEffectStats } from '../../../lib/stillService';
import type { StillSession, StillActivationSample, StillEffectStats } from '../../../lib/stillService';
import { StillEffectCard } from './StillEffectCard';
import { generateLinePath, mapToChartCoordinates } from '../../../lib/utils/chartUtils';

interface SessionWithDelta {
  session: StillSession;
  pre: StillActivationSample | null;
  post: StillActivationSample | null;
  delta: number | null;
}

function protocolLabel(id: string): string {
  if (id === 'general_activation') return 'Everyday Settling';
  if (id === 'fake_danger') return 'Heightened State';
  return id.replace(/_/g, ' ');
}

function hourLabel(h: number): string {
  if (h < 6) return 'night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  return m > 0 ? `${m}m` : `${secs}s`;
}

interface Props {
  onBack: () => void;
}

const CHART_W = 400;
const CHART_H = 160;
const PAD = { top: 16, right: 12, bottom: 28, left: 32 };

export function StillSessionsView({ onBack }: Props): React.JSX.Element {
  const [rows, setRows] = useState<SessionWithDelta[]>([]);
  const [effectStats, setEffectStats] = useState<StillEffectStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // stillGetEffectStats failure is non-fatal — decouple so a migrated/restored
        // DB that lacks session_id data doesn't blank the entire session history.
        const [sessions, effect] = await Promise.all([
          stillListSessions(90),
          stillGetEffectStats().catch(() => null),
        ]);
        const enriched = await Promise.all(
          sessions.map(async (s) => {
            const detail = await stillGetSessionWithSamples(s.id);
            const samples = detail?.samples ?? [];
            const pre = samples.find((x) => x.phase === 'pre') ?? null;
            const post = samples.find((x) => x.phase === 'post') ?? null;
            const delta = pre && post ? pre.activation - post.activation : null;
            return { session: s, pre, post, delta };
          }),
        );
        if (!cancelled) {
          setRows(enriched.filter((r) => r.session.completed_at !== null));
          setEffectStats(effect);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    if (rows.length === 0) return null;
    const withDelta = rows.filter((r) => r.delta !== null);
    const avgDelta = withDelta.length
      ? withDelta.reduce((s, r) => s + (r.delta ?? 0), 0) / withDelta.length
      : null;

    const protocolCounts: Record<string, number> = {};
    for (const r of rows) {
      protocolCounts[r.session.protocol] = (protocolCounts[r.session.protocol] ?? 0) + 1;
    }
    const topProtocol = Object.entries(protocolCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const timeBuckets: Record<string, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };
    for (const r of rows) {
      const h = new Date(r.session.started_at).getHours();
      timeBuckets[hourLabel(h)]++;
    }

    return { avgDelta, protocolCounts, topProtocol, timeBuckets, total: rows.length };
  }, [rows]);

  // Last 30 days delta line chart data
  const last30 = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    return rows
      .filter((r) => r.delta !== null && new Date(r.session.started_at).getTime() >= cutoff)
      .sort((a, b) => new Date(a.session.started_at).getTime() - new Date(b.session.started_at).getTime());
  }, [rows]);

  const linePoints = useMemo(() => {
    if (last30.length < 2) return null;
    const prePoints = mapToChartCoordinates(
      last30.map((r) => ({ value: r.pre?.activation ?? 5 })),
      CHART_W, CHART_H, PAD, 1, 10,
    );
    const postPoints = mapToChartCoordinates(
      last30.map((r) => ({ value: r.post?.activation ?? 5 })),
      CHART_W, CHART_H, PAD, 1, 10,
    );
    return { pre: prePoints, post: postPoints };
  }, [last30]);

  const prePath = linePoints ? generateLinePath(linePoints.pre, true) : '';
  const postPath = linePoints ? generateLinePath(linePoints.post, true) : '';

  // Protocol bar chart
  const protocolEntries = stats
    ? Object.entries(stats.protocolCounts).sort((a, b) => b[1] - a[1])
    : [];
  const maxProto = protocolEntries.reduce((m, [, c]) => Math.max(m, c), 1);

  // Time of day bars
  const timeOrder = ['morning', 'afternoon', 'evening', 'night'] as const;
  const timeLabels: Record<string, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night' };
  const maxTime = stats ? Math.max(...Object.values(stats.timeBuckets), 1) : 1;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Loading sessions...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[#F3F0EA] dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 pt-6 pb-4">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
          aria-label="Back to StillHaven"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Session History</h1>
          {stats && (
            <p className="text-xs text-slate-400">{stats.total} completed session{stats.total !== 1 ? 's' : ''}</p>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center px-8 pb-16">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5c.75-3 3.75-6 8.25-6s7.5 3 8.25 6" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No sessions yet</p>
          <p className="text-xs text-slate-400 mt-1">Complete your first session to see patterns here.</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-5 px-5 py-2.5 rounded-full bg-[#F28C38] text-white text-sm font-semibold hover:bg-[#e07d2a] transition-colors"
          >
            Start a session
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-5 px-6 pb-8">
          {/* Stats summary strip */}
          {stats && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700">
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.total}</p>
                <p className="text-xs text-slate-400 mt-0.5">Sessions</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {stats.avgDelta !== null ? `−${stats.avgDelta.toFixed(1)}` : '—'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Avg drop</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-tight mt-1">
                  {stats.topProtocol ? protocolLabel(stats.topProtocol) : '—'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Top protocol</p>
              </div>
            </div>
          )}

          {/* StillHaven Effect — correlation card + protocol recommendation */}
          {effectStats && <StillEffectCard stats={effectStats} />}

          {/* Activation delta line chart — last 30 days */}
          {last30.length >= 2 && linePoints && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
                Activation — last 30 days
              </h2>
              <div className="flex items-center gap-4 mb-2">
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="w-6 h-0.5 bg-slate-300 inline-block" />
                  Before
                </span>
                <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <span className="w-6 h-0.5 bg-emerald-500 inline-block" />
                  After
                </span>
              </div>
              <svg
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                className="w-full"
                style={{ height: CHART_H }}
                aria-hidden="true"
              >
                {/* Y-axis labels */}
                {[1, 4, 7, 10].map((v) => {
                  const y = PAD.top + (CHART_H - PAD.top - PAD.bottom) * (1 - (v - 1) / 9);
                  return (
                    <text key={v} x={PAD.left - 6} y={y + 4} textAnchor="end" className="fill-slate-400" style={{ fontSize: 10 }}>
                      {v}
                    </text>
                  );
                })}
                {/* X-axis date labels */}
                {[0, Math.floor(last30.length / 2), last30.length - 1].map((i) => {
                  const x = PAD.left + (i / Math.max(1, last30.length - 1)) * (CHART_W - PAD.left - PAD.right);
                  return (
                    <text key={i} x={x} y={CHART_H - 4} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 9 }}>
                      {formatDate(last30[i].session.started_at)}
                    </text>
                  );
                })}
                {/* Pre (before) line */}
                <path d={prePath} fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                {/* Post (after) line */}
                <path d={postPath} fill="none" stroke="#10b981" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                {/* Post dots */}
                {linePoints.post.map((pt, i) => (
                  <circle key={i} cx={pt.x} cy={pt.y} r={3} fill="#10b981" />
                ))}
              </svg>
            </div>
          )}

          {/* Protocol frequency bar chart */}
          {protocolEntries.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Protocol frequency</h2>
              <div className="flex flex-col gap-2.5">
                {protocolEntries.map(([proto, count]) => (
                  <div key={proto} className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 w-32 shrink-0">{protocolLabel(proto)}</span>
                    <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#F28C38] rounded-full transition-all duration-500"
                        style={{ width: `${(count / maxProto) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300 w-5 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Time-of-day pattern */}
          {stats && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">When you settle</h2>
              <div className="flex gap-2 items-end h-20">
                {timeOrder.map((bucket) => {
                  const count = stats.timeBuckets[bucket] ?? 0;
                  const pct = count / maxTime;
                  return (
                    <div key={bucket} className="flex flex-col items-center gap-1 flex-1">
                      <span className="text-xs text-slate-400 font-medium">{count > 0 ? count : ''}</span>
                      <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-t-sm overflow-hidden" style={{ height: 48 }}>
                        <div
                          className="w-full bg-[#F28C38]/70 rounded-t-sm transition-all duration-500"
                          style={{ height: `${pct * 100}%`, marginTop: `${(1 - pct) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400">{timeLabels[bucket]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent sessions list */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Recent sessions</h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {rows.slice(0, 20).map((r) => (
                <div key={r.session.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                      {protocolLabel(r.session.protocol)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatDate(r.session.started_at)} · {formatDuration(r.session.duration_seconds)}
                    </p>
                  </div>
                  {r.delta !== null && (
                    <div className={`text-right shrink-0 ${r.delta > 0 ? 'text-emerald-600' : r.delta < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                      <p className="text-sm font-semibold">
                        {r.delta > 0 ? `−${r.delta}` : r.delta < 0 ? `+${Math.abs(r.delta)}` : '±0'}
                      </p>
                      <p className="text-[10px] text-slate-400">{r.pre?.activation} → {r.post?.activation}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
