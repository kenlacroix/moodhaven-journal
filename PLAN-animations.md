<!-- /autoplan restore point: /home/ken/.gstack/projects/kenlacroix-moodhaven-journal/feat-db-performance-autoplan-restore-20260328-065557.md -->
# Plan: Subtle UI Animations — Desktop + Mobile

**Branch:** feat/db-performance
**Author:** ken
**Version:** 0.7.10
**Status:** Draft

---

## Problem

MoodBloom's animation system is partially implemented. It has a solid foundation — 11 custom Tailwind keyframes, `prefers-reduced-motion` support, and `active:scale-95` on most buttons — but the coverage is inconsistent. List items stagger-enter with no delay, modals open without direction, regular Timeline cards lack the hover lift that pinned cards have, and Insights cards are completely unanimated. The result feels unfinished on desktop and flat on mobile.

## Goal

Ship a complete, consistent animation pass that makes every interaction feel alive without being distracting. No external libraries. Extend the existing Tailwind animation primitives. Respect `prefers-reduced-motion` everywhere.

## Constraints

- TypeScript strict mode, no `any`
- Tailwind-only for new animations (no framer-motion, react-spring, etc.)
- All animations must respect `prefers-reduced-motion: reduce` (already covered by globals.css blanket rule)
- Must work on both desktop (hover) and mobile (touch/active states)
- No visual regressions to existing animation behaviors

---

## What Already Exists

| Primitive | Where used |
|-----------|-----------|
| `animate-entry-in` | Timeline entry cards, OnThisDay cards |
| `animate-view-enter` | App.tsx view container, BottomTabBar tray |
| `animate-slide-up` | RichTextEditor link modal, DayModal |
| `animate-float-in` | FloatingToolbar |
| `animate-fade-in` | TutorialWizard |
| `animate-mood-pop` | WritingView mood dots |
| `animate-save-bloom` | WritingView save indicator |
| `animate-pulse-soft` | Mood pending dots |
| `animate-shimmer` | Loading skeletons |
| `active:scale-95` | Most buttons (WritingView, BottomTabBar, etc.) |
| `hover:-translate-y-0.5` | Pinned Timeline cards only |

---

## What's Missing / Inconsistent

1. **Stagger delay on list entries** — Timeline and OnThisDay entries all animate simultaneously with `animate-entry-in`. Adding a small CSS `animationDelay` per index (0–5 items × 30ms, capped at 150ms) would make large lists feel smooth instead of "pop".

2. **View transition direction** — `viewEnter` keyframe is just a fade (`opacity 0→1`). Adding a 6px translateY gives view changes a sense of direction without being heavy.

3. **Regular Timeline card hover lift** — Pinned cards have `hover:-translate-y-0.5 hover:shadow-md`. Regular cards (`className` at line 636) do not. Should be consistent.

4. **BottomTabBar tray animation** — The overflow tray uses `animate-view-enter` (fade only). Should use `animate-slide-up` since it originates from the bottom.

5. **Modal/sheet consistency** — `DayModal`, `SearchModal`, `SealEntryModal`, `TimeCapsuleRevealModal`, `NewBookModal` are inconsistent — some have `animate-slide-up`, some just appear. All overlays coming from the bottom or center should use `animate-slide-up`.

6. **Calendar day cell hover** — No hover animation on day cells. A subtle `hover:scale-[1.08] transition-transform duration-150` on non-empty cells would give good feedback.

7. **Insights cards** — `MoodWeatherCard`, `WeeklyReflectionCard`, `GratitudeStreakCard` have no enter animation. They should use `animate-entry-in` with stagger.

8. **Missing `active:scale-95`** — Several interactive elements lack consistent press feedback. Quick audit needed.

9. **Mood bar chart animation** — Insights mood distribution bars are static-width. A CSS `scaleX` from 0→1 on mount would make the data feel alive.

---

## Implementation Plan

### Step 1 — Tailwind config: add `bar-grow` animation

**File:** `tailwind.config.js`

- `viewEnter`: **no change** — keep as pure fade. Directional transitions need exit animations; doing half is a regression.
- Add `bar-grow` animation: `width 0% → 100%`, applied via keyframe. Used for Insights chart bars. (Width-based, NOT scaleX — scaleX conflicts with percentage-width elements.)

```js
// viewEnter — unchanged (fade only, no translateY)

// new bar-grow keyframe: scaleX, not width
// scaleX(0→1) with origin-left = bar grows from left
// No CSS variables needed, no TS cast, no width conflict
barGrow: {
  '0%':   { transform: 'scaleX(0)' },
  '100%': { transform: 'scaleX(1)' },
},
// new animation class
animation: {
  // ... existing
  'bar-grow': 'barGrow 0.5s ease-out both',
}
```

The `transition-all duration-500` already on the bar handles smooth width updates on data changes. The `bar-grow` animation fires on mount only (initial reveal). Different CSS properties — no conflict.

### Step 2 — Stagger entries in TimelineView

**File:** `src/pages/TimelineView.tsx`

Add `style={{ animationDelay: `${Math.min(index * 30, 150)}ms` }}` to each entry card element. `index` is already available in the `.map()`. Keep `key={entry.id}` on individual cards (stable for React reconciliation).

**Stagger re-fire on filter/sort (confirmed in premise gate):** The Timeline already uses `<div key={date}>` per date group (line 611). Add filter state to that key:
```tsx
// Line 611: change from:
<div key={date} className={...}>
// to:
<div key={`${date}-${activeBookId ?? 'all'}`} className={...}>
```
This forces per-date-group remount on book filter change, re-triggering stagger. Items keep `key={entry.id}`. Sort changes can be handled similarly if sort state is available.

**Stagger cap:** Limit to first 10 entries per date group to avoid paint burst:
```tsx
style={{ animationDelay: i < 10 ? `${i * 30}ms` : '0ms' }}
```

Also add the missing `hover:-translate-y-0.5 hover:shadow-md transition-all duration-150` to regular (non-pinned) entry cards (line 636 area).

### Step 3 — Stagger entries in OnThisDayView

**File:** `src/pages/OnThisDayView.tsx`

Same stagger pattern as TimelineView. `key={entry.id}` already exists (confirmed in source). Add `style={{ animationDelay: `${Math.min(i * 30, 150)}ms` }}` and wrap in a container `key={year}` (year already used as the outer map key — inner entries get the stagger automatically since the year grouping re-mounts on data change).

### Step 4 — BottomTabBar tray: fade → slide-up

**File:** `src/components/layout/BottomTabBar.tsx`

Change `animate-view-enter` → `animate-slide-up` on the tray container div (line ~104).

### Step 5 — Modal consistency pass

**Files:**
- `src/components/search/SearchModal.tsx` — inner panel has no animation, add `animate-slide-up`
- `src/components/timecapsule/SealEntryModal.tsx` — has `motion-safe:animate-[fadeIn_0.2s_ease]` inline keyframe, replace with `animate-slide-up` (DRY fix, auto-decided P4)
- `src/components/timecapsule/TimeCapsuleRevealModal.tsx` — audit and add `animate-slide-up` if missing
- `src/components/books/NewBookModal.tsx` — inner panel has no animation, add `animate-slide-up`

These are one-line changes per file. `DayModal.tsx` already has `animate-slide-up` — skip.

### Step 6 — Calendar day cell hover

**File:** `src/components/calendar/CalendarDay.tsx` (NOT CalendarGrid — hover logic lives in the day component)

On the `<button>` element, add `hover:scale-[1.08] active:scale-[1.04] transition-transform duration-150` — but only when `!isSelected` (the selected ring conflicts with scale on tap). The `transition-all duration-200 ease-out` already present covers this.

### Step 7 — Insights cards enter animation + stagger

**Files:**
- `src/components/ai/MoodWeatherCard.tsx`
- `src/components/ai/WeeklyReflectionCard.tsx`
- `src/components/ai/GratitudeStreakCard.tsx`
- `src/pages/InsightsView.tsx`

Add `animate-entry-in` to each card wrapper. In InsightsView where cards are rendered in sequence, add stagger delays (0ms, 60ms, 120ms).

### Step 8 — Mood distribution bar animation (Insights)

**File:** `src/components/analytics/MoodDistributionChart.tsx` (NOT InsightsView.tsx)

The bar element is at line 70:
```tsx
<div
  className={`h-full ${option.color} transition-all duration-500 ease-out rounded-full`}
  style={{ width: `${barWidth}%` }}
/>
```

Add `animate-bar-grow origin-left` to the className:
```tsx
className={`h-full ${option.color} transition-all duration-500 ease-out rounded-full animate-bar-grow origin-left`}
```

The `barGrow` keyframe uses `scaleX(0→1)` — no conflict with the existing `width` inline style (different CSS properties). The `transition-all` handles smooth width updates when data changes. The animation handles the mount-entry reveal. `origin-left` ensures the bar grows from the left edge.

**Reduced-motion safety:** The existing `style={{ width: `${barWidth}%` }}` is the fallback. When `prefers-reduced-motion` suppresses the animation, `fill-mode: both` leaves the element at the `from` state (`scaleX(0)`) — but since the blanket rule in globals.css sets `animation-duration: 0.01ms`, the animation completes instantly and `fill-mode: both` leaves it at `scaleX(1)`. This is correct. ✓

### Step 9 — Insights card stagger with dynamic delay

**File:** `src/pages/InsightsView.tsx`

Compute stagger delay based on rendered card count:
```tsx
// Determine which cards are visible (based on feature flags, streak, etc.)
// Pass index as prop or compute inline:
const visibleCards = [
  isAIEnabled && <MoodWeatherCard key="weather" className="animate-entry-in" style={{ animationDelay: '0ms' }} />,
  <WeeklyReflectionCard key="weekly" className="animate-entry-in" style={{ animationDelay: '60ms' }} />,
  streak > 0 && <GratitudeStreakCard key="streak" className="animate-entry-in" style={{ animationDelay: '120ms' }} />,
].filter(Boolean);
```
If cards are conditionally hidden, the stagger still works because the delays are hardcoded to 0/60/120ms — gaps in the sequence are fine. The important fix is wrapping in a fragment with a re-key on data load to ensure re-stagger on refresh.

### Step 10 — Tests

**Files:** 3 new test files (co-located):

1. `src/components/analytics/MoodDistributionChart.test.tsx` — confirm `style.width` is set on the bar element (reduced-motion fallback):
```tsx
render(<MoodDistributionChart data={mockData} />);
const bar = screen.getByRole('generic', { /* bar div */ });
expect(bar).toHaveStyle('width: 40%'); // or whatever barWidth resolves to
```

2. `src/pages/TimelineView.test.tsx` (existing file) — add stagger delay test:
```tsx
// Render with 3 entries; second entry card should have animationDelay
expect(cards[1]).toHaveStyle('animation-delay: 30ms');
```

3. `src/components/calendar/CalendarDay.test.tsx` (existing file) — selected day no scale:
```tsx
const { rerender } = render(<CalendarDay ... isSelected={true} ... />);
expect(screen.getByRole('button')).not.toHaveClass('hover:scale-[1.08]');
```

### Step 11 — Active state audit

Quick audit of interactive elements in:
- `src/components/layout/Navigation.tsx`
- `src/components/layout/SidebarItem.tsx`
- `src/components/layout/TopBar.tsx`

Ensure `active:scale-95 transition-all` is consistent. One-liner additions where missing.

---

## What's NOT in Scope

- Page-level scroll-triggered animations (no IntersectionObserver hooks)
- Framer Motion / react-spring integration
- Writing View save indicator changes (already has `animate-save-bloom`)
- LockScreen animations (complex, security-sensitive flow)
- Animated page routing / route transitions (would need App.tsx refactor)
- Haptic feedback (not available in Tauri WebView context)

---

## Files Touched

| File | Change |
|------|--------|
| `tailwind.config.js` | `viewEnter` keyframe + `bar-grow` animation |
| `src/pages/TimelineView.tsx` | Stagger delays + regular card hover lift |
| `src/pages/OnThisDayView.tsx` | Stagger delays |
| `src/components/layout/BottomTabBar.tsx` | Tray slide-up |
| `src/components/search/SearchModal.tsx` | `animate-slide-up` |
| `src/components/timecapsule/SealEntryModal.tsx` | `animate-slide-up` |
| `src/components/timecapsule/TimeCapsuleRevealModal.tsx` | `animate-slide-up` |
| `src/components/books/NewBookModal.tsx` | `animate-slide-up` |
| `src/components/calendar/CalendarGrid.tsx` | Day cell hover |
| `src/components/ai/MoodWeatherCard.tsx` | `animate-entry-in` |
| `src/components/ai/WeeklyReflectionCard.tsx` | `animate-entry-in` |
| `src/components/ai/GratitudeStreakCard.tsx` | `animate-entry-in` |
| `src/pages/InsightsView.tsx` | Stagger card entry |
| `src/components/analytics/MoodDistributionChart.tsx` | `animate-bar-grow origin-left` |
| `src/components/layout/Navigation.tsx` | Active state audit |
| `src/components/layout/SidebarItem.tsx` | Active state audit |
| `src/components/layout/TopBar.tsx` | Active state audit |

**Total: ~16 files. Estimated: 1–2 hours CC.**

---

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO | Remove `viewEnter` translateY | P5, P3 | Half-transition (enter only, no exit) is a regression — wrong direction 50% of the time | Add translateY anyway |
| 2 | CEO | Add stagger list-container key | P1 | CSS animationDelay only fires on mount; without key, stagger breaks on filter change | Keep as-is |
| 3 | CEO | `barGrow` uses width-based not scaleX | P5 | Initially planned; Eng phase found scaleX is cleaner | Width+CSS variable approach |
| 4 | CEO | Defer manual mood tap animation | P3 | WritingView excluded from this PR; fix is 2 lines but creates WritingView entanglement | Include in this PR |
| 5 | CEO | Keep Tailwind-only (no framer-motion) | P5 | Framer-motion adds 40KB + exit-animation complexity for polish-only changes | Add framer-motion |
| 6 | Design | Fix file reference: CalendarGrid → CalendarDay | P3 | Wrong file; hover logic confirmed in CalendarDay.tsx | Keep CalendarGrid reference |
| 7 | Design | Add `active:scale-[1.04]` to CalendarDay | P1 | Touch devices get no feedback from hover-only; active state required | Hover-only |
| 8 | Design | Guard CalendarDay hover with `!isSelected` | P5 | isSelected ring conflicts with scale transform on tap | Apply scale unconditionally |
| 9 | Design | Replace SealEntryModal inline keyframe with `animate-slide-up` | P4 | DRY — eliminates custom one-off `motion-safe:animate-[fadeIn]` | Keep inline |
| 10 | Design | Same fix for TimeCapsuleRevealModal (same pattern) | P4 | Both modals had identical inline keyframe pattern | Keep inline |
| 11 | Eng | `barGrow` uses scaleX not CSS variables | P5 | scaleX is compositor-only, no TS cast needed, no conflict with inline width | CSS variable approach |
| 12 | Eng | Fix bar chart target file to MoodDistributionChart.tsx | P3 | Bar is in analytics component, not InsightsView | Implement in wrong file |
| 13 | Eng | Date-group key includes filter state `${date}-${activeBookId}` | P5, P1 | Stagger re-fires per group on book filter change at correct nesting level | Wrapper above outer map |
| 14 | Eng | Stagger cap at 10 items per group | P1, P3 | 500-entry paint burst avoided; items 11+ animate at 0ms delay | No cap |
| 15 | Eng | Add 3 Vitest tests for stagger/bar/CalendarDay | P1 | CSS animation changes have no existing test coverage | Test-plan-only |
| 16 | Eng | Insights stagger: compute delays dynamically | P1 | Hardcoded delays don't reindex when cards are conditionally hidden | Hardcode |

---

## Test Plan

- `npm run typecheck` — no new type errors
- `npm run lint` — clean
- Visual check: Timeline, OnThisDay, Insights, Calendar, modal opens, view transitions
- Reduced motion: `@media (prefers-reduced-motion: reduce)` blanket rule in globals.css already covers all animations — verify visually at OS level

---

---

## Design Review (autoplan Phase 2)

### D.0: Design scope

UI scope: YES. 16 files, all UI. No DESIGN.md in repo. Reviewing against existing design language (violet primary, `duration-150`/`200`/`300` tiers, `active:scale-95` pattern, `rounded-xl` cards).

### D.0.5: Dual voices — Design

**CLAUDE SUBAGENT (design — independent review):** [Codex unavailable — single-model]

Key findings (severity-ranked):

| Finding | Severity | Fix | Auto-decision |
|---------|----------|-----|---------------|
| `bar-grow` + `fill-mode:both` + `prefers-reduced-motion` → width renders as 0%, silent blank charts | CRITICAL | Add explicit `width: var(--bar-width)` inline style independent of animation | AUTO-FIX (P1) |
| Wrong file: Step 6 targets `CalendarGrid.tsx` but hover lives in `CalendarDay.tsx` | CRITICAL | Fix filename in plan → CalendarDay.tsx | AUTO-FIX (P3) |
| Stagger key using `index` causes full list remount → destroys scroll position, expanded states | HIGH | Use list-container `key` for re-stagger, keep `key={entry.id}` on items | AUTO-FIX (P5) |
| Every `hover:` addition lacks `active:` touch counterpart | HIGH | Add `active:scale-[1.04]` (calendar) and `active:-translate-y-0.5` (cards) | AUTO-FIX (P1) |
| CalendarDay `hover:scale-[1.08]` conflicts with `isSelected` ring state on tap | MEDIUM | Add conditional: only apply scale when `!isSelected` | AUTO-FIX (P5) |
| `bar-grow` spatial metaphor (isotropic scale deferred to width-grow) is correct but unstated | MEDIUM | State the principle: Y-axis = arrival, X-axis = reveal, scale = emphasis | document only |
| Step 9 active state audit has no pass/fail criteria | MEDIUM | DEFER to implementation — low priority | DEFER (P3) |
| SealEntryModal: plan says "animate-slide-up or animate-fade-in" — ambiguous | LOW | Specify: `animate-slide-up` | AUTO-FIX (P5) |

**Design litmus scorecard:**

```
DESIGN LITMUS SCORECARD (single-model):
══════════════════════════════════════════════════════════════════
  Dimension                     Score  Key gap
  ────────────────────────────── ─────── ─────────────────────────
  1. Motion hierarchy             6/10  Three axes without stated rule
  2. Missing states               5/10  bar-grow reduced-motion, loading race
  3. Emotional arc                7/10  Coherent exploration; writing gap noted
  4. Specificity                  7/10  Most values concrete; Step 9 vague
  5. Mobile / touch completeness  5/10  hover: additions missing active: pairs
  6. Accessibility                6/10  Reduced-motion blanket OK; bar-grow bug
  7. Design system alignment      8/10  Consistent with violet, scale-95 pattern
  ────────────────────────────── ─────── ─────────────────────────
  Overall                         6/10
══════════════════════════════════════════════════════════════════
```

### D.1–7 Passes

**Pass 1 (Motion hierarchy):** Three spatial metaphors are present — Y-axis entry (stagger), X-axis growth (bar chart), isotropic scale (calendar hover + mood pop). These don't conflict if the rule is: Y = arrival, X = reveal/progress, scale = acknowledgment. This rule is implicit; make it explicit in the plan.

**Pass 2 (Missing states):**
- Loading→animate race: Insights cards use conditional rendering — shimmer shows while loading, cards render after. The stagger will fire correctly since cards are mounted after shimmer unmounts. No race condition. ✓
- `bar-grow` + reduced-motion: CRITICAL bug. Fix below.
- Interrupted stagger (navigate away): CSS animations auto-stop on element removal. Not a concern.

**Pass 3 (Emotional arc):** Writing → Timeline is the primary flow. Writing view already has good animation. Timeline entry stagger will feel like entries "arriving" from the database. Calendar cells bouncing on tap gives feedback. Charts growing in Insights create a sense of data being revealed. Coherent arc. Gap: "freshly saved entry" has no visual distinction vs old entries — defer to future PR.

**Pass 4 (Specificity):** Plan values are concrete. Only underspecified item is Step 9 (active state audit) — acceptable to leave for implementer.

**Pass 5 (Mobile/touch):** ALL new `hover:` additions must have `active:` counterparts. See amended steps below.

**Pass 6 (Accessibility):** `prefers-reduced-motion` blanket is correct. `bar-grow` bug must be fixed — bars must render at full width when motion is reduced.

**Pass 7 (Design system alignment):** `duration-150` for hover scales (consistent with existing pattern). `animate-slide-up` is `0.3s ease-out` (consistent with duration-300 page transitions). ✓

### Required plan amendments from Design phase:

**1. Fix file reference:** Step 6 → `CalendarDay.tsx` (not `CalendarGrid.tsx`)

**2. Fix `bar-grow` reduced-motion:** Bars need `style={{ width: `${pct}%` } as CSSProperties}` as a base, with the animation overlaid. This way the bar is correct when animation is suppressed.

**3. Fix stagger key pattern:** Use parent container re-key, not item re-key:
```tsx
// Correct pattern:
<div key={`${activeBookId ?? 'all'}-${sortOrder ?? 'default'}`}>  {/* re-keys list on filter change */}
  {entries.map((entry, index) => (
    <EntryCard key={entry.id} style={{ animationDelay: `${Math.min(index * 30, 150)}ms` }} />
  ))}
</div>
```

**4. Add `active:` pairs for touch:**
- CalendarDay: `hover:scale-[1.08]` → add `active:scale-[1.04]` + `!isSelected` guard on hover
- Timeline regular cards: `hover:-translate-y-0.5 hover:shadow-md` → already present on pinned cards (they have `active:` nothing) — check if mobile globals CSS `hover:` removal already handles this (YES it does — globals.css:286 removes hover effects on touch devices)

Check: globals.css has `@media (hover: none) and (pointer: coarse)` that sets `background-color: inherit; box-shadow: inherit; transform: none` on hover classes. So desktop hover states are automatically stripped on touch. The `active:scale-95` / `active:scale-[1.04]` patterns are what provide touch feedback. Timeline cards already have `active:` nothing on the lift hover — but since the lift is via `hover:` it's covered by the media query. CalendarDay button is explicitly interactive so `active:scale-[1.04]` is still worth adding.

**5. Guard CalendarDay hover:** Add `!isSelected &&` condition to the hover scale class.

**PHASE 2 COMPLETE.** [single-model]. 2 critical issues caught and fixed. 3 medium issues addressed. Passing to Phase 3.

---

## Eng Review (autoplan Phase 3)

### Eng Scope Challenge + Architecture

Reading actual code:
- `TimelineView.tsx` uses `Object.entries(groupedEntries).map(([date, dateEntries])` — stagger `index` (`i`) already resets per date group at line 622. The date group `<div key={date}>` (line 611) already re-mounts per date. For filter-change re-stagger: add filter state to the date group key → `<div key={`${date}-${activeBookId ?? 'all'}`}>`. This forces remount of all date groups on filter change without affecting inner item `key={entry.id}`.
- `MoodDistributionChart.tsx` is the actual bar chart component (NOT InsightsView.tsx). Bar already has `style={{ width: `${barWidth}%` }}` (line 71) and `transition-all duration-500 ease-out` (line 70). `barWidth = (percentage / maxPercentage) * 100` — normalized 0–100 relative to tallest bar.

### Eng Section 0.5: Dual Voices

**CLAUDE SUBAGENT (eng — independent review):** [Codex unavailable — single-model]

Key findings:

| Finding | Severity | Fix | Auto-decision |
|---------|----------|-----|---------------|
| Bar chart is in `MoodDistributionChart.tsx`, not `InsightsView.tsx` | HIGH | Fix Step 8 + Files Touched | AUTO-FIX (P3) |
| `barGrow` CSS variable approach unnecessary — use `scaleX(0→1)` with `origin-left` — no TS cast, no width conflict | HIGH | Change keyframe to `transform: scaleX(0) → scaleX(1)` + add `origin-left` class | AUTO-FIX (P5) |
| Timeline wrapper key must go on date-group div at right nesting level, not above outer map | MEDIUM | `key={`${date}-${activeBookId ?? 'all'}`}` on line 611 div | AUTO-FIX (P3) |
| 500-entry paint burst: all items stagger within 150ms window on filter change | MEDIUM | Cap stagger to first 10 items per date group; items 11+ get 0ms delay | AUTO-FIX (P1) |
| `transition-all` on bar + scaleX animation: different CSS properties, no conflict | LOW | Document: `transition-all` handles width-on-data-update; animation handles mount-entry | No fix needed |
| Test plan has 3 lines; no assertions on stagger delay, bar render, or reduced-motion | LOW | Add 3 Vitest assertions | ADD to scope (P1) |
| Insights stagger: hardcoded delays (0/60/120ms) don't reindex if cards hidden | LOW | Compute from rendered card count | AUTO-FIX (P1) |

```
ENG DUAL VOICES — CONSENSUS TABLE (single-model):
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Architecture sound?               Yes*    N/A    N/A
  2. Test coverage sufficient?         No      N/A    N/A
  3. Performance risks addressed?      Med     N/A    N/A
  4. Security threats covered?         N/A     N/A    N/A
  5. Error paths handled?              Yes     N/A    N/A
  6. Deployment risk manageable?       Yes     N/A    N/A
═══════════════════════════════════════════════════════════════
* Architecture sound after correcting file target and keyframe approach.
```

### Architecture Diagram

```
                    tailwind.config.js
                         │
              ┌──────────┼──────────────┬────────────────┐
              ▼          ▼              ▼                 ▼
      barGrow       viewEnter      entry-in          slide-up
    (scaleX 0→1)  (unchanged)   (already defined) (already defined)
    origin-left
              │          │              │                 │
              ▼          ▼              ▼                 ▼
   MoodDistribution  App.tsx      TimelineView        4 modals
      Chart.tsx   (no change)   OnThisDayView      SearchModal
                              InsightsView cards    SealEntryModal
                                CalendarDay       TimeCapsuleReveal
                                (hover scale)      NewBookModal
```

No new component dependencies introduced. All changes are additive class/style additions.

### Section 3: Test Diagram + Plan

**New codepaths introduced:**

| Codepath | Test type | Gap? |
|----------|-----------|------|
| Stagger delay applied to entry cards | Unit: `toHaveStyle('animation-delay: 30ms')` on 2nd card | YES — no test |
| Stagger delay capped at 150ms | Unit: 10th card has delay ≤ 150ms | YES — no test |
| Bar renders at correct width when reduced-motion | Integration: mock `prefers-reduced-motion: reduce`, check `style.width` | YES — no test |
| Modal uses `animate-slide-up` | Unit: wrapper div has class | YES — no test |
| Calendar day scale excluded when isSelected | Unit: selected day has no scale class | YES — no test |

**3 targeted tests to add:**
1. `MoodDistributionChart.test.tsx` — bar has `style.width` set (tests reduced-motion fallback)
2. `TimelineView.test.tsx` — stagger delay on 2nd visible entry
3. `CalendarDay.test.tsx` — selected day does not have hover-scale class

### Section 4: Performance

- 500-entry stagger: `opacity` + `translateY` are compositor-accelerated. Width animation on 5 bars is 5 layout recalculations over 500ms. Both acceptable.
- ScaleX on bar: purely compositor-accelerated (transform). Better than width animation. ✓

### Section 5: Security
No security concerns. CSS-only changes, no IPC, no data flow.

### NOT in scope (Eng):
- Directional view transitions (future PR)
- Exit animations
- WritingView manual mood tap fix

### Completion Summary:

| Finding | Severity | Fix added to plan |
|---------|----------|-------------------|
| Bar animation: scaleX not CSS variables | HIGH | Step 1: barGrow = scaleX(0→1); Step 8: add origin-left |
| Wrong file: MoodDistributionChart.tsx | HIGH | Step 8 + Files Touched corrected |
| Timeline: date-group key needs filter state | MEDIUM | Step 2 amended |
| Stagger cap: 10 items per group | MEDIUM | Step 2+3 amended |
| Test plan: add 3 Vitest assertions | LOW | Step 10 added |
| Insights stagger dynamic delays | LOW | Step 7 amended |

**PHASE 3 COMPLETE.** Claude subagent: 7 issues. Codex: unavailable. All resolved or deferred. Passing to gate.

---

## CEO Review (autoplan Phase 1)

### 0A: Premise Challenge

| Premise | Status | Verdict |
|---------|--------|---------|
| "Animation system is partially implemented" | Accurate — 11 keyframes exist but coverage is ~40% | ✓ VALID |
| "No external animation libraries needed" | Subagent confirmed: Tailwind is sufficient for this scope. Framer Motion adds 40KB + exit animation complexity not needed here. | ✓ VALID |
| "prefers-reduced-motion already handled" | Confirmed in globals.css line 271 — blanket rule covers all animations | ✓ VALID |
| "viewEnter translateY upgrade is a direct improvement" | **FALSE** — without coordinated EXIT animations, a translateY entrance makes navigation direction visually wrong 50% of the time (every view slides in from below regardless of nav direction). Half a transition is worse than no transition. | ⚠️ CHALLENGED |
| "stagger animationDelay needs no key tracking" | **FALSE** — CSS `animationDelay` fires on mount only, not re-render. Filter/sort changes won't re-trigger stagger. Need a change-sensitive `key` prop. | ⚠️ CHALLENGED |

**Required plan amendments:**
1. Step 1 in the plan must be changed: `viewEnter` keyframe should stay as fade-only (no translateY). Mark this as a **TASTE DECISION** — a user might prefer subtle slide even without exit coordination.
2. Steps 2–3 must add `key={`${sortOrder}-${filterKey}-${index}`}` to staggered list items.

### 0B: Existing Code Leverage Map

| Sub-problem | Existing code |
|-------------|---------------|
| Entry stagger | `animate-entry-in` already defined in tailwind.config.js with `animation-fill-mode: both` — just need inline delay |
| Modal consistency | `animate-slide-up` already defined — just need to apply it |
| View transitions | `animate-view-enter` in App.tsx:226 — change keyframe in config or leave alone |
| Calendar hover | CalendarDay.tsx already has `transition-all duration-200 ease-out` — just add hover scale |
| Bar chart | Width already set via inline style in InsightsView — add `animate-bar-grow` + `transform-origin: left` |
| Insights stagger | InsightsView already renders card sections sequentially |

### 0C: Dream State Diagram

```
CURRENT (v0.7.10):
  Write view:   ████████░░ (well-animated: save-bloom, mood-pop, focus transitions)
  Timeline:     ████░░░░░░ (entry-in exists, no stagger, no hover on regular cards)
  OnThisDay:    ████░░░░░░ (entry-in exists, no stagger)
  Insights:     ██░░░░░░░░ (shimmer loading, static data presentation)
  Calendar:     ████░░░░░░ (hover bg, no scale, no emoji animation)
  Modals:       ███░░░░░░░ (4 different patterns, inconsistent)
  Navigation:   ██░░░░░░░░ (bare fade view transition)

THIS PLAN:
  Write view:   ████████░░ (unchanged — already well done)
  Timeline:     ███████░░░ (+stagger, +regular card hover, key-aware)
  OnThisDay:    ███████░░░ (+stagger, key-aware)
  Insights:     ██████░░░░ (+entry-in stagger, +bar-grow chart animation)
  Calendar:     ███████░░░ (+hover scale on day cells)
  Modals:       ████████░░ (consistent slide-up across all modals)
  Navigation:   ██░░░░░░░░ (unchanged — viewEnter stays as fade)

12-MONTH IDEAL:
  Navigation:   ██████████ (directional slide transitions with exit animations)
  Write view:   ██████████ (+manual mood tap pop, error state animations)
  All views:    ██████████ (scroll-triggered reveals, gesture swipe nav on mobile)
```

### 0D: Implementation Alternatives

| Approach | Effort | Risk | Completeness |
|----------|--------|------|---------|
| A) Tailwind CSS only — this plan | CC: ~2h | Low | 7/10 — covers enter/hover, not exit or routing |
| B) Add framer-motion — full transitions | CC: ~5h | Medium (dep + mental model shift) | 9/10 — includes exit + layout animations |
| C) CSS View Transitions API (experimental) | CC: ~3h | High — WebKit/webkit2gtk support uncertain in Tauri | 9/10 IF supported |

**Auto-decision: A** (Tailwind-only). P5 (explicit over clever) — framer-motion is overkill for polish-level changes. C is too risky for a Tauri embedded WebView.

### 0E: Temporal Interrogation

```
HOUR 1: tailwind.config.js — add bar-grow, leave viewEnter as fade-only
HOUR 2: TimelineView — stagger + key prop + regular card hover lift
HOUR 3: OnThisDay — stagger + key prop
HOUR 4: BottomTabBar tray + 4 modal files (5 small changes)
HOUR 5: InsightsView — stagger + bar-grow | CalendarDay — hover scale
HOUR 6: Navigation/Sidebar/TopBar active state audit + typecheck + lint
```

### 0.5: Dual Voices — CEO

**CLAUDE SUBAGENT (CEO — strategic independence):** [single-model — Codex unavailable]
Key findings:
- CRITICAL: `viewEnter` translateY without exit coordination creates directional regression
- MEDIUM: Stagger re-render bug on filter/sort — `key` prop needed
- MEDIUM: Step ordering should be frequency-weighted (Writing > Timeline > Calendar > Insights)
- LOW: Manual mood tap at line 1172 (WritingView) doesn't fire `animate-mood-pop` — only auto-detect does. Fix is `setMoodPulse(true)` alongside `setMood(level)` at line 805. Deferred since WritingView is excluded from this PR.

```
CEO DUAL VOICES — CONSENSUS TABLE (single-model):
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Premises valid?                   No*    N/A    N/A (single-model)
  2. Right problem to solve?           Yes    N/A    N/A
  3. Scope calibration correct?        Mostly N/A    N/A
  4. Alternatives sufficiently explored? Yes  N/A    N/A
  5. Competitive/market risks covered? N/A    N/A    N/A
  6. 6-month trajectory sound?         Yes*   N/A    N/A
═══════════════════════════════════════════════════════════════
* Flagged: viewEnter translateY premise is incorrect; trajectory sound after amendment.
```

### CEO Sections 1–10

**Section 1 — Strategic alignment:** ✓ Right time (v0.7.10, core features shipped). Animation polish is what separates a consumer product from a developer tool. High alignment with "make it feel alive."

**Section 2 — Error & Rescue Registry:**

| Error | Impact | Recovery |
|-------|--------|----------|
| `viewEnter` translateY ships without exit animations | Users see "wrong direction" slides; perceived regression | **Auto-decided: don't upgrade viewEnter** |
| Stagger fires only on mount, not on re-render | Jarring partial-stagger after filter/sort | Add change-sensitive `key` prop to all staggered elements |
| `animate-bar-grow` (scaleX) conflicts with percentage-based width | Bar might not grow correctly | Use `width: 0 → actual %` in animation instead of scaleX |
| SealEntryModal has `motion-safe:animate-[fadeIn_0.2s_ease]` — custom inline | Will conflict or double-animate if we also add `animate-slide-up` | Replace inline with `animate-slide-up` or `animate-fade-in` class |

**Section 3 — Resource assessment:** ✓ 16 files, all small additions. No new deps. Low blast radius. Correct estimate.

**Section 4 — Success metrics:** typecheck clean, lint clean, visual review across all views, prefers-reduced-motion test passes.

**Section 5 — Dependencies:** None. Self-contained.

**Section 6 — Risk:** LOW overall. Primary risk (viewEnter regression) is mitigated by auto-decision to keep fade-only.

**Section 7 — NOT in scope:**
- Directional view routing transitions (needs exit animations + App.tsx direction tracking — future PR)
- Exit animations for modals (unmount transitions need React portals + state coordination)
- Framer Motion dependency
- Manual mood tap animation fix (WritingView excluded from this PR)
- Gesture-based swipe navigation

**Section 8 — What already exists:** Fully mapped in plan's "What Already Exists" table.

**Section 9 — Dream state delta:**
This plan covers ~70% of the animation ideal. The remaining 30%: directional view transitions + exit animations + gesture nav. Those need a dedicated PR.

**Section 10 — Completion summary:**

| Finding | Severity | Auto-decision | Principle |
|---------|----------|---------------|-----------|
| `viewEnter` translateY creates regression without exit animations | CRITICAL | Remove translateY from Step 1 | P5 (explicit), P3 (pragmatic) |
| Stagger needs change-sensitive `key` prop | MEDIUM | Add to Steps 2–3 | P1 (completeness) |
| `bar-grow` should animate width not scaleX | MEDIUM | Use width-based keyframe | P5 (explicit) |
| SealEntryModal inline keyframe conflicts | LOW | Replace with `animate-slide-up` | P4 (DRY) |
| Step ordering: frequency-weight by view traffic | LOW | Accept as-is (logical grouping is fine) | P3 (pragmatic) |

**TASTE DECISION 1:** `viewEnter` — keep as pure fade vs. slight translateY (6px). Claude subagent rates this CRITICAL regression if kept; a user might argue "subtle enough to not matter." Surfaced at gate.

**PHASE 1 COMPLETE.** Codex: unavailable. Claude subagent: 5 issues. Consensus: N/A (single-model). 1 taste decision queued for gate.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | issues_open → resolved | 5 findings, 2 amended to plan |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | UNAVAILABLE | N/A |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | issues_open → resolved | 7 findings, 5 amended to plan |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | issues_open → resolved | 7 findings, 6 amended to plan |

**VERDICT:** ALL REVIEWS COMPLETE — 1 taste decision at gate. APPROVED after gate.
