# HANDOFF: Accessibility & UX-Correctness Pass

**Branch:** `task/accessibility-pass`
**Date:** 2026-06-05
**Tests:** 1337 passing (90 files) — no regressions

---

## What Changed

### Commits (5 total on this branch)

| Hash | Scope | Summary |
|------|-------|---------|
| `de4f74d` | Modals | `role="dialog"`, `aria-modal`, `aria-labelledby` on EditorLinkDialog, NewBookModal, TagManagerModal, SyncDetailsModal |
| `3dcaf2b` | Buttons / errors | `aria-label` on icon-only buttons; `role="alert"` on error paragraphs (LockScreen, SealEntryModal, DevicesThisDevice, SearchModal) |
| `83d0635` | EditorToolbar | `aria-label` + `aria-pressed` on ToolbarBtn; `aria-expanded` + `aria-controls` on formatting toggle; `aria-label` on MicButton / cancel recording button |
| `b700b27` | EmojiPicker / AdvancedSection | `aria-label` + `aria-pressed` on category tabs and emoji grid buttons; `aria-expanded` + `aria-controls` on AdvancedSection toggle |
| `726f4c9` | VoiceDraftEditor | `role="dialog"`, `aria-modal`, `aria-labelledby` on full-screen draft editor overlay |

### Per-file detail

**EditorLinkDialog.tsx** — `role="dialog"` on panel, `aria-hidden` on backdrop (siblings), `id` on h2, decorative SVG `aria-hidden`.

**NewBookModal.tsx** — Full ARIA modal pattern: `role="dialog"`, `aria-modal`, tablist/tab/tabpanel roles on tab switcher, `role="group"` + `aria-pressed` on emoji and color pickers, `role="alert"` on error, `aria-label="Close"` on close button.

**TagManagerModal.tsx** — `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-label="Close"`.

**SyncDetailsModal.tsx** — `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-label="Close"`.

**WritingView.tsx** — `role="group"` + `aria-label` on mood dot container and privacy segmented control; `aria-pressed` on each mode button; `aria-label` replaced `title` on mood dots, attach, tags, auto-mood emoji, and mobile toolbar buttons; decorative `#` span and SVGs marked `aria-hidden`.

**SearchModal.tsx** — `aria-label` on search input and clear button; decorative search icon `aria-hidden`.

**SealEntryModal.tsx** — `role="alert"` on error paragraph (already had `role="dialog"` from prior work).

**DevicesThisDevice.tsx** — `role="alert"` on rename error paragraph.

**LockScreen.tsx** — `role="alert"` on all password/biometric error paragraphs (4 locations).

**EditorToolbar.tsx** — `aria-label` + `aria-pressed` on every `ToolbarBtn`; `aria-expanded` + `aria-controls="editor-toolbar-row"` on formatting toggle; chevron SVG `aria-hidden`; `aria-label` on `MicButton` (dynamic per state); `aria-label="Cancel recording"` on cancel button; `id="editor-toolbar-row"` on controlled div.

**EmojiPicker.tsx** — `aria-label` + `aria-pressed` on each `CategoryTab`; `aria-label="Insert {emoji}"` on each emoji grid button; `focus-visible:ring-2` on all interactive elements.

**AdvancedSection.tsx** (new file) — `aria-expanded` + `aria-controls` on toggle button; chevron `aria-hidden`; `id` on collapsible content div.

**VoiceDraftEditor.tsx** — `role="dialog"`, `aria-modal`, `aria-labelledby` on inner panel; `id` on h2; close SVG `aria-hidden`; `onClick` stopPropagation on panel (backdrop click-outside preserved).

---

## What Was Already Correct (no changes needed)

- `MoodSelector` — `aria-label`, `aria-pressed`, `focus-visible:ring` already present
- `SidebarItem` — `aria-current` already applied
- `AppearanceDrawer` — full focus management, `role="dialog"`, `aria-live` region
- `PairingModal` — `role="dialog"`, `aria-modal`, `aria-label` already in place
- `CloudConsentModal` — `role="alertdialog"`, `aria-modal`, `aria-labelledby`
- `MicrophoneBlockedModal` / `MicrophonePermissionModal` — both already annotated
- `DaySelector` — `aria-pressed` in place
- `globals.css` — universal `prefers-reduced-motion` rule covers all CSS animations
- StillHaven environment renderers — check `window.matchMedia('(prefers-reduced-motion: reduce)')` for JS audio/visual loops

---

## Verification Method

Audit was performed by static analysis (grep + code reading) rather than a live axe/Lighthouse run, because the app is a Tauri desktop shell with no accessible browser URL. The checks covered:

1. Every `fixed inset-0` overlay → verified `role="dialog"` or `role="alertdialog"` on the focusable panel
2. Every icon-only button → verified `aria-label` present
3. Every error message that appears dynamically → verified `role="alert"` or `aria-live`
4. Every toggle/pressed button → verified `aria-pressed` attribute
5. Every collapsible section → verified `aria-expanded` + `aria-controls`/`id` pair
6. Every group of related controls (segmented control, picker) → verified `role="group"` + `aria-label`
7. Decorative SVGs and presentational elements → verified `aria-hidden="true"`
8. Focus-visible ring pattern (`focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500`) applied consistently to all interactive elements modified in this pass

---

## Issues Requiring Design Decisions

These were noted but not changed — they need product/UX input:

1. **Color picker label granularity** (`NewBookModal`): Color buttons now use the raw TailwindCSS color name (e.g., "violet") as `aria-label`. A descriptive English name ("Purple") would read better for screen-reader users. Decision: rename the label strings to human-readable color names, or derive them from the hex value.

2. **Lockout countdown timer** (`LockScreen`): The "Try again in N seconds" countdown updates every second. It currently sits inside a static `role="alert"` paragraph. Consider wrapping the countdown in a dedicated `<span aria-live="polite" aria-atomic="true">` so the timer announces periodically without over-announcing on every tick.

3. **WritingView heading fade** (`WritingView`): The greeting/date heading block fades to `opacity-25 pointer-events-none` once `wordCount >= 20`. The `pointer-events-none` makes it unfocusable, which is intentional (it's decorative at that point), but it remains in the DOM. This is acceptable — no screen-reader action needed — but worth documenting so future contributors understand why it has no focus target.

---

## Assumptions Made

- `prefers-reduced-motion` is fully handled by the existing CSS universal rule; no JS animation paths were missed except StillHaven environments (already handled in their renderer code).
- The `SealEntryModal` outer div uses `role="dialog"` directly on the backdrop (not a nested panel pattern) — this is valid since there is no separate visual backdrop element; the dismiss behavior is on `e.currentTarget === e.target`.
- `AdvancedSection` is a new component untracked at the start of this session; it was treated as within scope for this pass since it shipped new interactive elements.

---

## Skills Invoked

- `frontend-design` (accessibility audit focus: WCAG compliance, keyboard navigation, screen reader support)

---

## What's Left / Not Done

- **Axe/Lighthouse baseline score**: Not captured — requires a running browser instance. Recommended follow-up: run `axe-core` in browser-mode (`npm run dev:web`) and record the pre/post violation count.
- **Focus trap in modals**: None of the modals implement a full focus trap (Tab cycling within the modal). This is a WCAG 2.1 AA best-practice for dialogs. The modals do have ESC-to-close and auto-focus on open, but Tab can escape to background content. Implementing a focus trap (e.g., `focus-trap-react`) is a separate, higher-effort task.
- **TimeCapsuleRevealModal**: Not audited in this pass. It likely already follows the pattern since it was written alongside `SealEntryModal`, but should be spot-checked.
- **Settings tabs** (`SettingsPage`): The main settings page uses a custom tab pattern. The tab trigger buttons should have `role="tab"`, `aria-selected`, and `aria-controls` for full ARIA tabs conformance.
- **Colour contrast**: Not audited. The design system uses standard Tailwind slate/violet tokens; contrast is likely acceptable but has not been formally measured against WCAG 4.5:1 text / 3:1 UI component thresholds.
