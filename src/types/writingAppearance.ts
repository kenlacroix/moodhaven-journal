/**
 * Writing Appearance — types and curated palette.
 *
 * Single source of truth for the WritingView customization drawer. The drawer
 * reads option labels and previews from the *_OPTIONS arrays; CSS reads via
 * `data-writing-*` attributes; the union types are derived from the same
 * arrays so changes propagate everywhere.
 *
 * See active-plans/writing-experience-customization.md for the full plan.
 */

// ──────────────────────────────────────────────────────────────────────────
// Curated palettes — each option is rendered in the drawer with its own
// preview text / swatch / diagram. Adding/removing entries here updates the
// drawer, the CSS variable cascade, and the type union all at once.
// ──────────────────────────────────────────────────────────────────────────

export const FONT_OPTIONS = [
  {
    value: 'inter',
    label: 'Inter',
    preview: 'A clean, modern start.',
    stack: "'Inter', system-ui, -apple-system, sans-serif",
  },
  {
    value: 'iowan',
    label: 'Source Serif',
    preview: 'The quiet ground beneath us.',
    // Iowan Old Style is Apple-licensed and cannot be bundled — used as a
    // local() fallback for Mac users. Source Serif 4 is the bundled choice.
    stack: "'Iowan Old Style', 'Source Serif 4', Charter, Georgia, serif",
  },
  {
    value: 'jetbrains-mono',
    label: 'JetBrains Mono',
    preview: 'system status: ok',
    stack: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  {
    value: 'opendyslexic',
    label: 'OpenDyslexic',
    preview: 'Easier on the eyes.',
    stack: "'OpenDyslexic', 'Inter', system-ui, sans-serif",
  },
  {
    value: 'system',
    label: 'System',
    preview: 'Your platform default.',
    stack: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  },
] as const;
export type FontChoice = typeof FONT_OPTIONS[number]['value'];

export const SIZE_OPTIONS = [
  { value: 'sm', label: 'Small', rem: 1.0 },
  { value: 'md', label: 'Medium', rem: 1.125 },
  { value: 'lg', label: 'Large', rem: 1.25 },
  { value: 'xl', label: 'Extra large', rem: 1.5 },
] as const;
export type SizeChoice = typeof SIZE_OPTIONS[number]['value'];

export const LINE_HEIGHT_OPTIONS = [
  { value: 'tight', label: 'Tight', ratio: 1.4 },
  { value: 'relaxed', label: 'Relaxed', ratio: 1.7 },
  { value: 'airy', label: 'Airy', ratio: 2.0 },
] as const;
export type LineHeightChoice = typeof LINE_HEIGHT_OPTIONS[number]['value'];

export const PARAGRAPH_SPACING_OPTIONS = [
  { value: 'compact', label: 'Compact', em: 0.5 },
  { value: 'standard', label: 'Standard', em: 1.0 },
  { value: 'generous', label: 'Generous', em: 1.5 },
] as const;
export type ParagraphSpacingChoice = typeof PARAGRAPH_SPACING_OPTIONS[number]['value'];

export const TINT_OPTIONS = [
  { value: 'cream', label: 'Cream', hex: '#F3F0EA' }, // brand cream from DESIGN.md
  { value: 'paper', label: 'Paper', hex: '#FBFAF7' },
  { value: 'sage', label: 'Sage', hex: '#F2F5F1' },
  { value: 'dusk', label: 'Dusk', hex: '#E9E6F0' },
  { value: 'night', label: 'Night', hex: '#1A1820' },
] as const;
export type TintChoice = typeof TINT_OPTIONS[number]['value'];

export const WIDTH_OPTIONS = [
  { value: 'narrow', label: 'Narrow', px: 560 },
  { value: 'standard', label: 'Standard', px: 672 }, // matches existing max-w-2xl
  { value: 'wide', label: 'Wide', px: 800 },
  { value: 'full', label: 'Full', px: 1200 },
] as const;
export type WidthChoice = typeof WIDTH_OPTIONS[number]['value'];

export type ReducedMotionPreference = 'auto' | 'on' | 'off';

// ──────────────────────────────────────────────────────────────────────────
// Shape
// ──────────────────────────────────────────────────────────────────────────

export interface WritingAppearance {
  fontFamily: FontChoice;
  fontSize: SizeChoice;
  lineHeight: LineHeightChoice;
  paragraphSpacing: ParagraphSpacingChoice;
  backgroundTint: TintChoice;
  writingWidth: WidthChoice;
  focusMode: boolean;
  /** Multiplier applied to font size: 0.8 – 2.0. WCAG requires 200% reflow. */
  textScale: number;
  /** Separate WCAG axis. Defaults from `prefers-contrast: more` on first run. */
  highContrast: boolean;
  /** `auto` honors `prefers-reduced-motion`. Manual override otherwise. */
  reducedMotion: ReducedMotionPreference;
  /**
   * Single toggle that swaps to OpenDyslexic, increases line/letter spacing.
   * Applied atomically — see active-plans/writing-experience-customization.md
   * for the loading semantics (hold profile-on until font ready).
   */
  dyslexiaProfile: boolean;
}

export function createDefaultWritingAppearance(): WritingAppearance {
  return {
    fontFamily: 'inter',
    fontSize: 'md',
    lineHeight: 'relaxed',
    paragraphSpacing: 'standard',
    backgroundTint: 'cream',
    writingWidth: 'standard',
    focusMode: false,
    textScale: 1.0,
    highContrast: false,
    reducedMotion: 'auto',
    dyslexiaProfile: false,
  };
}

/** Clamp text scale to the WCAG-meaningful range. */
export function clampTextScale(value: number): number {
  if (Number.isNaN(value)) return 1.0;
  return Math.min(2.0, Math.max(0.8, value));
}
