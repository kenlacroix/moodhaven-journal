import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Underwater2D } from './environments/underwater/Underwater2D';
import { SubmergeOverlay } from './environments/underwater/SubmergeOverlay';
import { useBilateralEngine } from './hooks/useBilateralEngine';
import { ActivationDial } from './components/ActivationDial';
import { ProtocolPicker } from './components/ProtocolPicker';
import { HrvInput } from './components/HrvInput';
import { AbandonedSessionPrompt } from './components/AbandonedSessionPrompt';
import { WelcomeCard } from './components/WelcomeCard';
import {
  stillCreateSession,
  stillRecordActivation,
  stillCompleteSession,
  stillAbandonSession,
  stillListSessions,
  stillGetSessionWithSamples,
  type StillSession,
  type StillActivationSample,
} from '../../lib/stillService';
import { getStatus, getContext } from '../../lib/services/ouraService';
import type { OuraHealthContext } from '../../types/oura';
import { biometricToSpeed } from './engine/bioMapping';
import { useStillBioFeedback } from '../../hooks/useStillBioFeedback';
import { renderSessionTemplate } from './handoff';
import type { EngineConfig } from './engine/bilateralEngine';

const WELCOME_SEEN_KEY = 'mb_still_welcome_seen';

// Map protocol + pre-activation level to a starting engine speed.
// general_activation: calm baseline (0.8 Hz); fake_danger: higher arousal (1.2 Hz).
// Activation level shifts the multiplier: 7–10 adds +20%, 1–3 subtracts 15%.
function deriveEngineConfig(protocol: string, preActivation: number): Partial<EngineConfig> {
  const base = protocol === 'fake_danger' ? 1.2 : 0.8;
  const mod = preActivation >= 7 ? 1.2 : preActivation <= 3 ? 0.85 : 1.0;
  return { speedHz: Math.min(2.0, Math.max(0.5, base * mod)) };
}

type SceneState =
  | 'loading'
  | 'welcome'
  | 'abandoned-prompt'
  | 'check-in'
  | 'submerging'
  | 'live'
  | 'check-out'
  | 'summary';

interface CheckInData {
  protocol: string | null;
  preActivation: number | null;
}

interface CheckOutData {
  postActivation: number | null;
  hrv: number | null;
  note: string;
}

interface SummaryData {
  preActivation: number;
  postActivation: number;
  durationSeconds: number;
  session: StillSession;
  preSample: StillActivationSample;
  postSample: StillActivationSample;
}

interface StillViewProps {
  onHandoff?: (html: string) => void;
}

export function StillView({ onHandoff }: StillViewProps): React.JSX.Element {
  const [scene, setScene] = useState<SceneState>('loading');
  const [abandonedSession, setAbandonedSession] = useState<StillSession | null>(null);
  const [checkIn, setCheckIn] = useState<CheckInData>({ protocol: null, preActivation: null });
  const [checkOut, setCheckOut] = useState<CheckOutData>({ postActivation: null, hrv: null, note: '' });
  const [summary, setSummary] = useState<SummaryData | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const sessionStartRef = useRef<number>(0);
  const sessionRowRef = useRef<StillSession | null>(null);
  const preSampleRef = useRef<StillActivationSample | null>(null);
  const ouraCtxRef = useRef<Pick<OuraHealthContext, 'readinessScore' | 'stressSummary'> | null>(null);
  const [ouraConnected, setOuraConnected] = useState(false);
  const protocolSpeedRef = useRef<number>(1.0);
  const [protocolHints, setProtocolHints] = useState<Record<string, { count: number; avgDelta: number | null }>>({});

  const { startEngine, stopEngine } = useBilateralEngine();

  const { isAdapting } = useStillBioFeedback({
    enabled: scene === 'live',
    baseSpeed: protocolSpeedRef.current,
  });

  // Detect abandoned sessions on mount; show welcome card on first ever visit
  useEffect(() => {
    const welcomeSeen = localStorage.getItem(WELCOME_SEEN_KEY) === 'true';
    stillListSessions(1)
      .then((sessions) => {
        const s = sessions[0];
        if (s && s.completed_at === null && s.abandoned_at === null) {
          setAbandonedSession(s);
          setScene('abandoned-prompt');
        } else if (!welcomeSeen) {
          setScene('welcome');
        } else {
          setScene('check-in');
        }
      })
      .catch(() => {
        const welcomeSeen = localStorage.getItem(WELCOME_SEEN_KEY) === 'true';
        setScene(welcomeSeen ? 'check-in' : 'welcome');
      });
  }, []);

  // Load last-7-days protocol stats for the check-in hint.
  useEffect(() => {
    if (scene !== 'check-in') return;
    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    stillListSessions(30)
      .then(async (sessions) => {
        const recent = sessions.filter(
          (s) => s.completed_at !== null && s.started_at >= cutoff,
        );
        const counts: Record<string, { count: number; deltas: number[] }> = {};
        await Promise.all(
          recent.map(async (s) => {
            const detail = await stillGetSessionWithSamples(s.id);
            const samples = detail?.samples ?? [];
            const pre = samples.find((x) => x.phase === 'pre');
            const post = samples.find((x) => x.phase === 'post');
            if (!counts[s.protocol]) counts[s.protocol] = { count: 0, deltas: [] };
            counts[s.protocol].count++;
            if (pre && post) counts[s.protocol].deltas.push(pre.activation - post.activation);
          }),
        );
        const hints: Record<string, { count: number; avgDelta: number | null }> = {};
        for (const [proto, { count, deltas }] of Object.entries(counts)) {
          hints[proto] = {
            count,
            avgDelta: deltas.length ? deltas.reduce((s, d) => s + d, 0) / deltas.length : null,
          };
        }
        setProtocolHints(hints);
      })
      .catch(() => { /* silent — hints are decorative */ });
  }, [scene]);

  // Pre-fetch Oura status + today's context when the check-in screen appears.
  // Stored in a ref so handleStart stays synchronous (AudioContext gesture constraint).
  useEffect(() => {
    if (scene !== 'check-in') return;
    const today = new Date().toISOString().slice(0, 10);
    getStatus()
      .then((status) => {
        if (!status.connected) return Promise.resolve(null);
        setOuraConnected(true);
        return getContext(today);
      })
      .then((ctx) => {
        if (ctx) ouraCtxRef.current = ctx;
      })
      .catch(() => { /* Oura not available in this environment — graceful fallback */ });
  }, [scene]);

  const handleDiscardAbandoned = useCallback(async () => {
    if (abandonedSession) {
      await stillAbandonSession({ id: abandonedSession.id, abandonedAt: new Date().toISOString() })
        .catch(() => {/* silent */});
    }
    setAbandonedSession(null);
    setScene('check-in');
  }, [abandonedSession]);

  const handleResumeAbandoned = useCallback(() => {
    if (!abandonedSession) return;
    sessionIdRef.current = abandonedSession.id;
    sessionStartRef.current = Date.now() - abandonedSession.duration_seconds * 1000;
    setScene('check-out');
  }, [abandonedSession]);

  const handleWelcomeDone = useCallback(() => {
    localStorage.setItem(WELCOME_SEEN_KEY, 'true');
    setScene('check-in');
  }, []);

  // Called synchronously in onClick — required for AudioContext.resume()
  const handleStart = useCallback(() => {
    const { protocol, preActivation } = checkIn;
    if (!protocol || preActivation === null) return;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    sessionIdRef.current = id;
    sessionStartRef.current = Date.now();

    // Fire-and-forget DB writes — engine must start synchronously
    stillCreateSession({
      id,
      protocol,
      environment: 'underwater',
      bilateralMode: 'audio',
      durationSeconds: 0,
      startedAt: now,
    }).then((sess) => {
      sessionRowRef.current = sess;
      return stillRecordActivation({ sessionId: id, phase: 'pre', activation: preActivation });
    }).then((sample) => {
      preSampleRef.current = sample;
    }).catch(() => {/* silent — data loss here is acceptable vs blocking the session */});

    // MUST remain synchronous — AudioContext requires user gesture.
    // Protocol + activation level determine starting rhythm speed; Oura data refines it.
    const config = deriveEngineConfig(protocol, preActivation);
    if (ouraCtxRef.current && typeof config.speedHz === 'number') {
      config.speedHz = biometricToSpeed(ouraCtxRef.current, config.speedHz);
    }
    protocolSpeedRef.current = config.speedHz ?? 1.0;
    startEngine(config);
    setScene('submerging');
  }, [checkIn, startEngine]);

  const handleSubmergeComplete = useCallback(() => setScene('live'), []);

  const handleEnd = useCallback(() => {
    stopEngine();
    setScene('check-out');
  }, [stopEngine]);

  const handleSaveCheckOut = useCallback(async () => {
    const { postActivation, hrv, note } = checkOut;
    if (postActivation === null) return;

    const id = sessionIdRef.current;
    if (!id) return;

    const durationSeconds = Math.round((Date.now() - sessionStartRef.current) / 1000);
    const now = new Date().toISOString();

    let postSample: StillActivationSample | null = null;
    try {
      postSample = await stillRecordActivation({
        sessionId: id,
        phase: 'post',
        activation: postActivation,
        hrvManual: hrv ?? null,
        hrvSource: hrv !== null ? 'manual' : null,
        note: note.trim() || null,
      });
      await stillCompleteSession({ id, completedAt: now, durationSeconds });
    } catch {
      // best-effort; don't block the user from seeing summary
    }

    const effectivePre = checkIn.preActivation ?? postActivation;
    // Build synthetic samples for handoff if DB writes failed
    const preSample: StillActivationSample = preSampleRef.current ?? {
      id: 0, session_id: id, phase: 'pre', activation: effectivePre,
      hrv_manual: null, hrv_source: null, note: null,
      sampled_at: new Date().toISOString(),
    };
    const postSampleFinal: StillActivationSample = postSample ?? {
      id: 0, session_id: id, phase: 'post', activation: postActivation,
      hrv_manual: hrv ?? null, hrv_source: hrv !== null ? 'manual' : null,
      note: note.trim() || null, sampled_at: now,
    };

    setSummary({
      preActivation: effectivePre,
      postActivation,
      durationSeconds,
      session: sessionRowRef.current
        ? { ...sessionRowRef.current, duration_seconds: durationSeconds }
        : {
            id, protocol: checkIn.protocol ?? 'general_activation',
            environment: 'underwater', bilateral_mode: 'audio',
            duration_seconds: durationSeconds, started_at: now,
            completed_at: now, abandoned_at: null, created_at: now,
          },
      preSample,
      postSample: postSampleFinal,
    });
    setScene('summary');
  }, [checkOut, checkIn.preActivation, checkIn.protocol]);

  const handleRestart = useCallback(() => {
    sessionIdRef.current = null;
    setCheckIn({ protocol: null, preActivation: null });
    setCheckOut({ postActivation: null, hrv: null, note: '' });
    setSummary(null);
    setScene('check-in');
  }, []);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (scene === 'loading') {
    return <div className="flex items-center justify-center h-full" />;
  }

  // ── Welcome ───────────────────────────────────────────────────────────────
  if (scene === 'welcome') {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 overflow-y-auto py-8">
        <WelcomeCard onBegin={handleWelcomeDone} />
      </div>
    );
  }

  // ── Abandoned session prompt ──────────────────────────────────────────────
  if (scene === 'abandoned-prompt' && abandonedSession) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AbandonedSessionPrompt
          session={abandonedSession}
          onResume={handleResumeAbandoned}
          onDiscard={handleDiscardAbandoned}
        />
      </div>
    );
  }

  // ── Check-in ─────────────────────────────────────────────────────────────
  if (scene === 'check-in') {
    const canStart = checkIn.protocol !== null && checkIn.preActivation !== null;
    return (
      <div className="flex flex-col items-center justify-center h-full gap-8 px-6 max-w-lg mx-auto">
        <ProtocolPicker
          value={checkIn.protocol}
          onChange={(protocol) => setCheckIn((c) => ({ ...c, protocol }))}
          hints={protocolHints}
        />
        <ActivationDial
          value={checkIn.preActivation}
          onChange={(preActivation) => setCheckIn((c) => ({ ...c, preActivation }))}
          label="How wound up do you feel right now?"
        />
        <button
          type="button"
          disabled={!canStart}
          onClick={handleStart}
          className="px-8 py-3 rounded-full bg-[#F28C38] text-white text-sm font-semibold shadow
                     hover:bg-[#e07c28] transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          Begin session
        </button>
        {ouraConnected && (
          <p className="text-xs text-neutral-400 text-center">
            Session pace adapted using today&apos;s Oura readiness
          </p>
        )}
        {!ouraConnected && import.meta.env.VITE_TARGET !== 'web' && (
          <p className="text-xs text-neutral-400 text-center">
            Connect Oura Ring in Settings to adapt session pace to your readiness
          </p>
        )}
        <p className="text-[11px] text-neutral-300 text-center max-w-xs leading-relaxed">
          Wellness tool only — not a substitute for professional mental health care.
          Not suitable during dissociation, flashbacks, or acute crisis.
        </p>
      </div>
    );
  }

  // ── Check-out ─────────────────────────────────────────────────────────────
  if (scene === 'check-out') {
    const canSave = checkOut.postActivation !== null;
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 px-6 max-w-lg mx-auto">
        <ActivationDial
          value={checkOut.postActivation}
          onChange={(postActivation) => setCheckOut((c) => ({ ...c, postActivation }))}
          label="How do you feel now?"
        />
        <HrvInput
          value={checkOut.hrv}
          onChange={(hrv) => setCheckOut((c) => ({ ...c, hrv }))}
        />
        <div className="flex flex-col gap-1.5 w-full max-w-xs">
          <label className="text-xs text-neutral-400 text-center">
            What shifted, if anything? <span className="text-neutral-300">(optional)</span>
          </label>
          <textarea
            value={checkOut.note}
            onChange={(e) => setCheckOut((c) => ({ ...c, note: e.target.value }))}
            placeholder="A word or two is fine…"
            rows={2}
            maxLength={280}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700
                       placeholder:text-neutral-300 resize-none focus:outline-none focus:ring-2 focus:ring-[#F28C38]/40
                       focus:border-[#F28C38]/60 transition-colors"
          />
        </div>
        <button
          type="button"
          disabled={!canSave}
          onClick={handleSaveCheckOut}
          className="px-8 py-3 rounded-full bg-[#F28C38] text-white text-sm font-semibold shadow
                     hover:bg-[#e07c28] transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          Save
        </button>
      </div>
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  if (scene === 'summary' && summary) {
    const delta = summary.preActivation - summary.postActivation;
    const mins = Math.floor(summary.durationSeconds / 60);
    const secs = summary.durationSeconds % 60;
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 px-6 max-w-sm mx-auto text-center">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Session complete</p>
          <p className="text-lg font-semibold text-neutral-800">
            {mins}:{String(secs).padStart(2, '0')} minutes
          </p>
        </div>
        <div className="flex gap-6">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-2xl font-bold text-neutral-700">{summary.preActivation}</span>
            <span className="text-xs text-neutral-400">before</span>
          </div>
          <div className="flex items-center text-neutral-300 text-xl">→</div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-2xl font-bold text-neutral-700">{summary.postActivation}</span>
            <span className="text-xs text-neutral-400">after</span>
          </div>
        </div>
        {delta !== 0 && (
          <p className="text-sm text-neutral-500">
            {delta > 0 ? `${delta} point${delta !== 1 ? 's' : ''} lower` : `${Math.abs(delta)} point${Math.abs(delta) !== 1 ? 's' : ''} higher`}
          </p>
        )}
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {onHandoff && (
            <button
              type="button"
              onClick={() => {
                const html = renderSessionTemplate(summary.session, summary.preSample, summary.postSample);
                onHandoff(html);
              }}
              className="w-full px-6 py-2.5 rounded-full bg-[#F28C38] text-white text-sm font-semibold shadow hover:bg-[#e07c28] transition-colors"
            >
              Write about it
            </button>
          )}
          <button
            type="button"
            onClick={handleRestart}
            className="w-full px-6 py-2.5 rounded-full border border-neutral-200 text-neutral-600 text-sm hover:bg-neutral-50 transition-colors"
          >
            New session
          </button>
        </div>
      </div>
    );
  }

  // ── Submerging + live ─────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full">
      {(scene === 'submerging' || scene === 'live') && (
        <Underwater2D
          onEnd={handleEnd}
          onPause={() => {/* isPaused managed inside stillStore */}}
          onResume={() => {/* resumeEngine called inside Underwater2D */}}
          isAdapting={isAdapting}
        />
      )}
      {scene === 'submerging' && (
        <SubmergeOverlay onComplete={handleSubmergeComplete} />
      )}
    </div>
  );
}
