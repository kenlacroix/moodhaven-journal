/**
 * AppearanceDrawer — Day One-style customization surface for the writing view.
 *
 * Sits as a slide-out overlay on the right side of WritingView (lg+),
 * narrower on md, and as a full-width bottom sheet on small viewports.
 * Reads + writes the `appearance.writing` settings via setWritingAppearance.
 *
 * Modeless: the editor stays interactive while the drawer is open — the
 * whole point is live preview as the user tweaks.
 *
 * Plan: active-plans/writing-experience-customization.md
 */

import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  FONT_OPTIONS,
  SIZE_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  PARAGRAPH_SPACING_OPTIONS,
  TINT_OPTIONS,
  WIDTH_OPTIONS,
  createDefaultWritingAppearance,
} from '../../types/writingAppearance';

interface AppearanceDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Element to restore focus to on close (typically the toggle button). */
  returnFocusTo?: HTMLElement | null;
}

export function AppearanceDrawer({ open, onClose, returnFocusTo }: AppearanceDrawerProps) {
  const writing = useSettingsStore((s) => s.settings.appearance.writing);
  const setWritingAppearance = useSettingsStore((s) => s.setWritingAppearance);

  const drawerRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);

  // Imperatively set/remove `inert` so keyboard focus cannot reach the closed drawer.
  // (aria-hidden alone only hides from AT; inert also blocks focus.)
  useEffect(() => {
    const el = drawerRef.current as HTMLElement | null;
    if (!el) return;
    if (open) el.removeAttribute('inert');
    else el.setAttribute('inert', '');
  }, [open]);

  // Close on Esc + restore focus
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    // Move focus into drawer on open
    const t = setTimeout(() => firstFocusableRef.current?.focus(), 50);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
      // Return focus to the toggle (or wherever invoked from)
      returnFocusTo?.focus();
    };
  }, [open, onClose, returnFocusTo]);

  const reset = () => setWritingAppearance(createDefaultWritingAppearance());

  return (
    <>
      {/* Backdrop — invisible click target on sm so tapping outside closes the bottom sheet.
       * On lg+ the drawer is modeless and there's no backdrop. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`sm:hidden fixed inset-0 z-40 bg-black/20 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      <aside
        ref={drawerRef}
        role="dialog"
        aria-label="Writing appearance settings"
        aria-modal="false"
        aria-hidden={!open}
        className={`fixed z-50 bg-white dark:bg-slate-900 shadow-2xl
          /* sm: bottom sheet */
          inset-x-0 bottom-0 max-h-[80vh] rounded-t-2xl
          /* md+: right side panel */
          md:inset-x-auto md:bottom-auto md:right-0 md:top-0 md:h-full md:max-h-none
          md:w-[280px] md:rounded-none md:rounded-l-2xl
          lg:w-[320px]
          flex flex-col
          transition-transform duration-300 ease-out
          motion-reduce:transition-none
          ${open
            ? 'translate-y-0 md:translate-x-0'
            : 'translate-y-full md:translate-y-0 md:translate-x-full'}
        `}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-slate-100">
            Writing appearance
          </h2>
          <button
            ref={firstFocusableRef}
            type="button"
            onClick={onClose}
            aria-label="Close appearance drawer"
            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </header>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7" aria-live="polite">

          {/* ── Type ───────────────────────────────────────────────────────── */}
          <section aria-labelledby="drawer-section-type">
            <SectionHeader id="drawer-section-type" icon={<IconType />}>Type</SectionHeader>

            <Label>Font</Label>
            <div className="space-y-1.5">
              {FONT_OPTIONS.map((opt) => {
                const selected = writing.fontFamily === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setWritingAppearance({ fontFamily: opt.value })}
                    aria-pressed={selected}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors min-h-[44px]
                      ${selected
                        ? 'border-violet-400 bg-violet-50 dark:border-violet-500 dark:bg-violet-950/40'
                        : 'border-neutral-200 dark:border-slate-700 hover:bg-neutral-50 dark:hover:bg-slate-800'
                      }`}
                  >
                    <div className="text-xs font-medium text-neutral-500 dark:text-slate-400">{opt.label}</div>
                    <div
                      className="text-[15px] text-neutral-900 dark:text-slate-100 mt-0.5"
                      style={{ fontFamily: opt.stack }}
                    >
                      {opt.preview}
                    </div>
                  </button>
                );
              })}
            </div>

            <Label className="mt-5">Size</Label>
            <SegmentedGroup
              ariaLabel="Font size"
              value={writing.fontSize}
              options={SIZE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(v) => setWritingAppearance({ fontSize: v as typeof writing.fontSize })}
            />

            <Label className="mt-5">Line height</Label>
            <SegmentedGroup
              ariaLabel="Line height"
              value={writing.lineHeight}
              options={LINE_HEIGHT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(v) => setWritingAppearance({ lineHeight: v as typeof writing.lineHeight })}
            />

            <Label className="mt-5">Paragraph spacing</Label>
            <SegmentedGroup
              ariaLabel="Paragraph spacing"
              value={writing.paragraphSpacing}
              options={PARAGRAPH_SPACING_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(v) => setWritingAppearance({ paragraphSpacing: v as typeof writing.paragraphSpacing })}
            />
          </section>

          {/* ── Page ───────────────────────────────────────────────────────── */}
          <section aria-labelledby="drawer-section-page">
            <SectionHeader id="drawer-section-page" icon={<IconPage />}>Page</SectionHeader>

            <Label>Background</Label>
            <div className="grid grid-cols-5 gap-2">
              {TINT_OPTIONS.map((opt) => {
                const selected = writing.backgroundTint === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setWritingAppearance({ backgroundTint: opt.value })}
                    aria-pressed={selected}
                    aria-label={opt.label}
                    title={opt.label}
                    className={`aspect-square rounded-lg border-2 transition-all min-h-[44px]
                      ${selected
                        ? 'border-violet-500 ring-2 ring-violet-200 dark:ring-violet-900'
                        : 'border-neutral-200 dark:border-slate-700 hover:border-neutral-400 dark:hover:border-slate-500'
                      }`}
                    style={{ backgroundColor: opt.hex }}
                  />
                );
              })}
            </div>

            <Label className="mt-5">Width</Label>
            <div className="space-y-1.5">
              {WIDTH_OPTIONS.map((opt) => {
                const selected = writing.writingWidth === opt.value;
                // Width preview: short line gets larger as width grows; visual analogue.
                const lineWidthPct = Math.min(100, (opt.px / 1200) * 100);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setWritingAppearance({ writingWidth: opt.value })}
                    aria-pressed={selected}
                    className={`w-full px-3 py-2.5 rounded-lg border transition-colors min-h-[44px] flex items-center gap-3
                      ${selected
                        ? 'border-violet-400 bg-violet-50 dark:border-violet-500 dark:bg-violet-950/40'
                        : 'border-neutral-200 dark:border-slate-700 hover:bg-neutral-50 dark:hover:bg-slate-800'
                      }`}
                  >
                    <span className="text-sm text-neutral-900 dark:text-slate-100 w-20 text-left">{opt.label}</span>
                    <span aria-hidden="true" className="flex-1 h-1 bg-neutral-300 dark:bg-slate-600 rounded-full overflow-hidden">
                      <span className="block h-full bg-neutral-500 dark:bg-slate-400" style={{ width: `${lineWidthPct}%` }} />
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5">
              <ToggleRow
                label="Focus mode"
                description="Dim everything except the active paragraph"
                checked={writing.focusMode}
                onChange={(v) => setWritingAppearance({ focusMode: v })}
              />
            </div>
          </section>

          {/* ── Reading support ────────────────────────────────────────────── */}
          <section aria-labelledby="drawer-section-a11y">
            <SectionHeader id="drawer-section-a11y" icon={<IconEye />}>Reading support</SectionHeader>

            <Label>Text scale: {Math.round(writing.textScale * 100)}%</Label>
            <input
              type="range"
              min={0.8}
              max={2.0}
              step={0.1}
              value={writing.textScale}
              onChange={(e) => setWritingAppearance({ textScale: Number(e.target.value) })}
              aria-label="Text scale"
              aria-valuetext={`${Math.round(writing.textScale * 100)} percent`}
              className="w-full accent-violet-600 dark:accent-violet-400 min-h-[44px]"
            />

            <div className="mt-5 space-y-3">
              <ToggleRow
                label="High contrast"
                description="Maximum contrast text and borders (WCAG AAA)"
                checked={writing.highContrast}
                onChange={(v) => setWritingAppearance({ highContrast: v })}
              />
              <ToggleRow
                label="Reduce motion"
                description={
                  writing.reducedMotion === 'auto'
                    ? 'Following your system setting'
                    : writing.reducedMotion === 'on'
                      ? 'Animations minimized'
                      : 'Animations on'
                }
                checked={writing.reducedMotion === 'on'}
                onChange={(v) => setWritingAppearance({ reducedMotion: v ? 'on' : 'auto' })}
              />
              <ToggleRow
                label="Dyslexia profile"
                description="Switches to OpenDyslexic with extra line and letter spacing"
                checked={writing.dyslexiaProfile}
                onChange={(v) => setWritingAppearance({ dyslexiaProfile: v })}
              />
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="px-5 py-3 border-t border-neutral-100 dark:border-slate-800">
          <button
            type="button"
            onClick={reset}
            className="text-xs text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-slate-100 underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"
          >
            Reset to defaults
          </button>
        </footer>
      </aside>
    </>
  );
}

// ── Small primitives ──────────────────────────────────────────────────────

function SectionHeader({ id, icon, children }: { id: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 id={id} className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-500 dark:text-slate-400 mb-3">
      <span className="text-neutral-400 dark:text-slate-500" aria-hidden="true">{icon}</span>
      {children}
    </h3>
  );
}

function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-xs font-medium text-neutral-600 dark:text-slate-400 mb-2 ${className}`}>{children}</div>;
}

interface SegmentedGroupProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  ariaLabel: string;
}

function SegmentedGroup({ value, options, onChange, ariaLabel }: SegmentedGroupProps) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex gap-1 bg-neutral-100 dark:bg-slate-800 rounded-lg p-1">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={`flex-1 text-xs px-2 py-1.5 rounded-md transition-colors min-h-[36px]
              ${selected
                ? 'bg-white dark:bg-slate-700 text-neutral-900 dark:text-slate-100 shadow-sm'
                : 'text-neutral-600 dark:text-slate-400 hover:text-neutral-900 dark:hover:text-slate-200'
              }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 min-h-[44px]"
    >
      <span className="flex-1">
        <span className="block text-sm text-neutral-900 dark:text-slate-100">{label}</span>
        <span className="block text-[11px] text-neutral-500 dark:text-slate-400 mt-0.5">{description}</span>
      </span>
      <span
        aria-hidden="true"
        className={`relative inline-block w-9 h-5 rounded-full transition-colors flex-shrink-0
          ${checked ? 'bg-violet-600' : 'bg-neutral-300 dark:bg-slate-600'}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform
            ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
        />
      </span>
    </button>
  );
}

// ── Icons (inline SVG to avoid an icon dependency) ───────────────────────

function IconType() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function IconPage() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="13" y2="16" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
