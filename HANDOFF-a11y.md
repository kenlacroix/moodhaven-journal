# Accessibility Pass — Handoff Notes

**Branch:** `task/accessibility`  
**Base:** `feat/cloud-sync-phase1`  
**Tests:** 1290 passing (was 1245 — +45 new a11y regression tests)  
**Date:** 2026-06-06

---

## What Changed (11 commits)

### 1. EditorToolbar (`src/components/editor/EditorToolbar.tsx`)
- CollapsibleToolbar toggle: `title` → `aria-label`, added `aria-expanded`, `aria-controls="editor-toolbar-buttons"`
- Expandable wrapper: added `id="editor-toolbar-buttons"`
- Button row: added `role="toolbar" aria-label="Text formatting"`
- `ToolbarBtn`: `title` → `aria-label`, added `aria-pressed={isActive}`
- `MicButton`: `title` → `aria-label`
- Cancel recording and QuickCaptureToggle: `title` → `aria-label`

### 2. SidebarHeader (`src/components/layout/SidebarHeader.tsx`)
- Settings button: `title` → `aria-label` + `aria-current={currentView === 'settings' ? 'page' : undefined}`
- Sync/save button: `title` → `aria-label` (dynamic string)

### 3. Sidebar + SidebarNavigation (`src/components/layout/`)
- `<aside>`: added `aria-label="Main navigation"` for landmark identification
- `<nav>`: added `aria-label="Application views"`

### 4. PairingModal (`src/components/peer-sync/PairingModal.tsx`)
- Modal root: `aria-label` → `aria-labelledby="pairing-modal-title"`, h2 gets matching `id`
- Close button: added `type="button"`, improved `aria-label`
- Tab switcher: `role="tablist" aria-label="Pairing method"`
- Tab buttons: `role="tab"`, `aria-selected`, `aria-controls`, `id`, `tabIndex` roving
- Tab content: `role="tabpanel"`, `id`, `aria-labelledby`, `hidden` attribute (not unmounted)

### 5. SealEntryModal (`src/components/timecapsule/SealEntryModal.tsx`)
- Modal: `aria-labelledby="seal-modal-title"`, h2 gets `id`
- Capsule type buttons: added `aria-pressed={capsuleType === type}`
- Error paragraph: added `role="alert"`

### 6. TimeCapsuleRevealModal (`src/components/timecapsule/TimeCapsuleRevealModal.tsx`)
- Modal: `aria-labelledby="capsule-reveal-title"`, label `<p>` gets `id`
- Error paragraph: added `role="alert"`

### 7. PrivacyTab (`src/components/settings/tabs/PrivacyTab.tsx`)
- All 4 inline modal overlays: added `role="dialog" aria-modal="true"` + aria labels
- Warning SVG in disable-2FA confirm: `aria-hidden="true"`

### 8. SettingsPage + SpeechToTextTab + DevicesTab
- Export password modal: `role="dialog" aria-modal="true" aria-labelledby`, `id` on h3
- Password input: sr-only `<label>`, `id`, `aria-describedby` on error
- Error paragraph: `id` + `role="alert"`
- Lockout div: `role="status"`, SVG `aria-hidden="true"`
- Search input: type `"search"`, sr-only `<label>`, `id`
- Clear search button: `aria-label="Clear search"`, SVG `aria-hidden="true"`
- Settings nav: added `aria-label="Settings sections"` to `role="tablist"` element
- `SpeechToTextTab`: added `id="panel-speech" role="tabpanel"`
- `DevicesTab`: added `id="panel-devices" role="tabpanel"` to inner div

### 9. MoodSelector (`src/components/journal/MoodSelector.tsx`)
- Label `<label>` → `<p id="mood-selector-label">` (no associated form control)
- Mood button container: added `role="group" aria-labelledby="mood-selector-label"`

### 10. WritingView + globals.css — reducedMotion wiring
- `WritingView.tsx`: added `data-writing-reduced-motion={...}` on `data-writing-prefs` div
- `globals.css`: new rule `[data-writing-prefs][data-writing-reduced-motion='true'] * { animation-duration: 0.01ms; transition-duration: 0.01ms; }` — the user-controlled reduced-motion setting now actually fires

### 11. Regression tests (3 files, +45 tests)
- `MoodSelector.test.tsx`: accessibility describe block — `role="group"` with accessible label
- `SealEntryModal.test.tsx`: dialog labelling, `aria-pressed`, `role="alert"` on error
- `Sidebar.test.tsx`: aside landmark, collapse toggle `aria-label`, settings button

---

## What Was NOT Fixed (requires design decisions)

- **Color contrast**: Not audited. The existing mood color tokens (`#84cc16` good, `#eab308` neutral) are likely to fail WCAG AA 4.5:1 for small text. This needs a designer to approve replacements.
- **Focus trap in modals**: No focus-trap library was added. The existing modals close on Escape, but Tab key can still escape the modal overlay. A proper `focus-trap-react` integration would be a separate PR.
- **`axe-core` baseline**: `npx @axe-core/cli` was not run against a live dev server — the app requires Tauri IPC which is unavailable in the browser dev server without mocking. Axe would need to run inside the Tauri WebView (e.g., via `@tauri-apps/api/event` injection or a Playwright/WebDriver integration).

---

## Assumptions Made

- `<aside aria-label="Main navigation">` is correct even though `<aside>` is a `complementary` landmark — the label disambiguates it from other complementary regions.
- PairingModal tab content kept in DOM via `hidden` attribute (not unmounted) to preserve `aria-controls` references. This is the ARIA spec-correct approach but adds a minor DOM weight tradeoff.
- `reducedMotion` CSS rule used `!important` to override TailwindCSS `transition-*` utilities. This is intentional — user preference must win over utility classes.

---

## Skills Invoked

- `/guard` — blast-radius guardrails active throughout (edit boundary: worktree dir)
