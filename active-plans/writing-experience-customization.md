# Writing Experience Customization

**Status:** Designed (2026-05-27), not yet started
**Full design doc:** `~/.gstack/projects/kenlacroix-moodhaven-journal/ken-main-design-20260527-141928.md`

## Summary

Add an inline customization drawer to `WritingView` — typography (font, size, line-height, paragraph spacing), surface (background tint, writing width, focus mode), accessibility (text scale, high contrast, reduced motion, dyslexia profile). Day One-style live preview because the writing canvas itself is the preview. Curated palettes, no settings explosion.

## Approach

Approach A from the office-hours session: inline drawer in `WritingView`, 320px wide, toggled by toolbar icon + `⌘,` keybinding. CSS variables + `data-*` attributes on the WritingView root so the editor stays zero-cost on the typing path.

## Build order

1. Extend `AppearanceSettings` with `WritingAppearance` (additive migration)
2. Add `setWritingAppearance(patch)` to `useSettingsStore`
3. Bundle Iowan/JetBrains Mono/OpenDyslexic fonts; add `@font-face` rules
4. Add CSS variables + `data-*` wiring to `WritingView` root
5. Refactor `src/components/editor/RichTextEditor.tsx` (the TipTap editor — NOT `JournalEditor.tsx`, which is unused) to read from CSS vars. Currently uses `text-lg leading-[1.8]` in `editorProps.attributes.class` at line 143, plus an embedded `<style>` block with em-relative heading sizes that will inherit correctly.
6. Build `src/components/writing/AppearanceDrawer.tsx`
7. Wire toggle icon + keybinding (only active while WritingView focused)
8. One-time discoverability pulse on first visit after release
9. Tests: 17 cases total (12 unit + 3 E2E + 2 accessibility) — full plan at `~/.gstack/projects/kenlacroix-moodhaven-journal/ken-main-eng-review-test-plan-20260527-143000.md`. Includes WCAG AAA contrast check for high-contrast mode and FOUT/atomicity check for dyslexia profile.
10. Single source of truth for curated palettes: `src/types/writingAppearance.ts` exports `FONT_OPTIONS`, `TINT_OPTIONS`, `WIDTH_OPTIONS` as `const` arrays.

Effort: human ~1 week / CC+gstack ~30–60 min.

## Open questions resolved during design

- ~~High contrast = its own tint preset~~ **Eng review overrode:** SEPARATE AXIS, required for WCAG AAA conformance + `prefers-contrast: more` OS hook
- Bundled fonts: Source Serif 4 (~120KB) instead of Iowan (Apple-licensed, fallback only), JetBrains Mono Regular+Bold (~150KB), OpenDyslexic Regular (~80KB), all woff2 with Latin subset. Total ~350KB.
- CSS variables scoped to a `data-writing-prefs` wrapper *inside* WritingView (not on `:root`), so the chrome stays consistent
- **Drawer section labels** reworded for brand voice: "Type" / "Page" / "Reading support" (not "Typography / Surface / Accessibility")
- **Drawer slide animation** = `duration-300 ease-out` (matches DESIGN.md drawer spec, not `duration-200`)
- **Mobile drawer** = full-width bottom sheet on viewports <640px (iOS Mail pattern), swipe-down to dismiss; right-side overlay above that
- **Mood badges in high-contrast mode** keep their hue and gain a small icon + thicker border to preserve information for colorblind users (do not strip to monochrome)
- **Font choices in drawer** render each option in its own font with a 4-5 word preview (Day One pattern, "tasting menu" not Settings panel)
- **Tint swatches** show actual color squares, not the word "cream"
- **Width options** show tiny horizontal line-length diagrams
- **Presets** explicitly deferred to v1.1; data model reserves `writingPresets` slot now to avoid migration later
- Drawer is modeless (you can keep editing while it's open)
- Ambient sound options deferred to v2
- Per-book writing preferences deferred (device-global for v1)

## Reviews

- **Eng review:** ✓ Done 2026-05-27. 7 findings resolved into the design doc. Status: **CLEAR**.
- **Design review:** ✓ Done 2026-05-27. 7 passes, overall score 6/10 → 9/10. Section labels reworded for brand voice, font/tint/width rendering specified, mobile bottom-sheet pattern added, full interaction state table including font loading, high-contrast mood-color decision made, presets deferred to v1.1 with reserved data slot. Status: **CLEAR**.

## Next steps when picking this up

After `/plan-design-review`, you can begin implementation. Recommended order is the 10-step build sequence above.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 7 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 6/10 → 9/10, 7 decisions added |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** ENG + DESIGN CLEARED — ready to implement.
