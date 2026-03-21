# MoodBloom — Design & Product TODOs

> Tracked items from `/plan-design-review` and other review passes.
> Resolved items are moved to the relevant plan file or CHANGELOG.

---

## Design System

### D-001: Create DESIGN.md (design source of truth)
**What:** Run `/design-consultation` to produce `DESIGN.md` — a single document specifying MoodBloom's design system: color tokens, typography scale, spacing, motion, component vocabulary.
**Why:** Every design review currently infers conventions by grepping the codebase. Without a stated system, reviewers guess, engineers guess, and visual inconsistency accumulates silently.
**Pros:** All future `/plan-design-review` and `/design-review` passes become significantly more precise. New contributors have a reference. AI-assisted UI work is better calibrated.
**Cons:** Takes ~30 min with `/design-consultation`; may surface existing inconsistencies that feel like new work.
**Context:** Flagged during STT Transcript Formatting design review (2026-03-21). No DESIGN.md has ever existed in this repo.
**Depends on:** None — run `/design-consultation` at any time.
**Effort:** human ~4h / CC+gstack ~30min

---

## STT Transcript Formatting (follow-up from PR: transcript-formatting)

### D-002: Pin amber design token for 'formatting' state
**What:** Grep for existing amber Tailwind token usage in the codebase, then specify the exact token (e.g. `amber-400`, `amber-500`) for the new `'formatting'` MicButton state and quick-capture toggle.
**Why:** The plan specifies amber as the color but doesn't pin a token. The implementing engineer will pick arbitrarily, risking visual clash with other amber usage (e.g. bookmark icons, warning badges).
**Pros:** Ensures the amber formatting state feels intentional and cohesive rather than accidentally different from nearby amber elements.
**Cons:** Tiny scope — 5-minute task.
**Context:** Identified during STT design review Pass 2 (interaction states). The quick-capture toggle is also amber when active — both must match.
**Depends on:** D-001 (DESIGN.md) — ideally token is pinned in the design system, not just the plan.
**Effort:** human ~30min / CC+gstack ~5min

### D-003: Spec the voice memos empty state
**What:** Define the empty-state copy and primary action for the voice memos panel in WritingView — the screen a brand-new STT user sees before their first recording.
**Why:** Voice journaling is a new behavior for MoodBloom users. Without an onboarding-style empty state, users who enable STT and see a blank panel have no signal about what to do next.
**Pros:** Converts a moment of confusion into a moment of invitation. Follows the design principle "empty states are features."
**Cons:** Requires copywriting + small component work.
**Context:** Identified during STT design review Pass 3 (user journey). The plan adds the voice memo list UI but never specifies its empty state.
**Depends on:** STT Transcript Formatting PR must ship first.
**Effort:** human ~2h / CC+gstack ~15min

---
