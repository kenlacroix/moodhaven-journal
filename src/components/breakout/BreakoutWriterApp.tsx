/**
 * BreakoutWriterApp — standalone writer window shell.
 *
 * Loaded when the window URL contains `?mode=writer`.
 * Because each Tauri WebView is an independent JS context the encryption key
 * (derived by WebCrypto in crypto.ts) is NOT available here — the user must
 * re-unlock with their password.  The same SQLite database is used, so any
 * entry saved here is immediately visible in the main window's timeline.
 *
 * States:
 *   loading  → checking if a password exists
 *   unlocking → password prompt
 *   writing  → slim topbar + WritingView
 */

import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { hasPassword, unlockJournal } from '../../lib/journalService';
import { useSettingsStore } from '../../stores/settingsStore';
import { WritingView } from '../../pages/WritingView';

// Ref type for the imperative save handle exposed by WritingView
type SaveHandle = (() => Promise<void>) | null;

type Phase = 'loading' | 'unlocking' | 'writing';

// ── Theme helpers ─────────────────────────────────────────────────────────────

const THEME_ICONS = {
  light: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1.5M12 19.5V21M4.22 4.22l1.06 1.06M18.72 18.72l1.06 1.06M3 12h1.5M19.5 12H21M4.22 19.78l1.06-1.06M18.72 5.28l1.06-1.06M12 7.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z" />
    </svg>
  ),
  dark: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  ),
  system: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 7.409A2.25 2.25 0 012.25 5.493V5.25" />
    </svg>
  ),
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function BreakoutWriterApp() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<SaveHandle>(null);

  const theme = useSettingsStore((s) => s.settings.appearance.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const distractionFree = useSettingsStore((s) => s.distractionFree);
  const savingState = useSettingsStore((s) => s.savingState);
  const lastAutoSaved = useSettingsStore((s) => s.lastAutoSaved);

  // Bootstrap: load settings, then try the one-shot session bridge so the user
  // doesn't have to re-enter their password when opening from the main window.
  useEffect(() => {
    const init = async () => {
      await loadSettings();

      // Attempt to retrieve a password deposited by the main window.
      const bridgedPw = await invoke<string | null>('retrieve_session_password').catch(() => null);
      if (bridgedPw) {
        const ok = await unlockJournal(bridgedPw).catch(() => false);
        if (ok) { setPhase('writing'); return; }
      }

      // Fall back to manual unlock if bridge had nothing or password was wrong.
      const setup = await hasPassword().catch(() => false);
      setPhase(setup ? 'unlocking' : 'writing');
    };
    init();
  }, [loadSettings]);

  // Auto-focus password input when unlock phase begins
  useEffect(() => {
    if (phase === 'unlocking') {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [phase]);

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    const ok = await unlockJournal(password).catch(() => false);
    setBusy(false);
    if (ok) {
      setPhase('writing');
    } else {
      setError('Incorrect password. Please try again.');
      setPassword('');
      inputRef.current?.focus();
    }
  };

  const handleClose = async () => {
    // Flush any pending auto-save before closing so nothing is lost.
    // Use try/catch — saveRef.current may be null if WritingView never mounted.
    try { await saveRef.current?.(); } catch { /* ignore */ }
    try { await getCurrentWindow().close(); } catch { /* ignore */ }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center animate-pulse">
          <span className="text-white text-lg font-bold">M</span>
        </div>
      </div>
    );
  }

  // ── Unlock screen ──────────────────────────────────────────────────────────
  if (phase === 'unlocking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="w-full max-w-sm space-y-6">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
              <span className="text-white text-xl font-bold">M</span>
            </div>
            <div className="text-center">
              <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">MoodHaven Writer</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Enter your journal password to continue</p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleUnlock} className="space-y-3">
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              disabled={busy}
              autoComplete="current-password"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm"
            />

            {error && (
              <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={!password || busy}
              className="w-full py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {busy ? 'Unlocking…' : 'Unlock'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Writing screen ─────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-white dark:bg-slate-900">
      {/* Slim topbar — hidden in distraction-free mode */}
      {!distractionFree && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 h-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-100 dark:border-slate-800">
          {/* Left: label + save indicator */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400 dark:text-slate-500 select-none">Write</span>

            {/* Save state indicator */}
            {savingState === 'saving' && (
              <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving…
              </span>
            )}
            {savingState === 'saved' && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-500 dark:text-emerald-400 animate-cloud-saved">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M8 15l2 2 4.5-4.5" />
                </svg>
                Saved
              </span>
            )}
            {/* Persistent quiet indicator once an entry has been saved */}
            {savingState === 'idle' && lastAutoSaved && (
              <span className="flex items-center gap-1 text-[11px] text-slate-300 dark:text-slate-600">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M8 15l2 2 4.5-4.5" />
                </svg>
                {new Date(lastAutoSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          <div className="flex items-center gap-0.5">
            {/* Theme cycle */}
            <button
              type="button"
              onClick={cycleTheme}
              title="Cycle theme"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {THEME_ICONS[theme]}
            </button>
            {/* Return / close */}
            <button
              type="button"
              onClick={handleClose}
              title="Close writer window"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
              Return
            </button>
          </div>
        </div>
      )}

      {/* Writing area fills remaining height */}
      <div className="flex-1 min-h-0 overflow-auto bg-slate-50 dark:bg-slate-950">
        <WritingView saveRef={saveRef} />
      </div>
    </div>
  );
}
