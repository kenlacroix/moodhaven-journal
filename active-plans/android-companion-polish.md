# Android Companion Polish (next release)

> **Status (2026-06-06):** QA code-review pass complete (PR #119, merged). P0/P1 Android bugs fixed. Design-review pass and E2E voice-memo test still outstanding before version bump.
> **History:** Originally seeded as `v1.1.0-android.md` on the (since-closed) draft PR #71. v1.1.0 ended up shipping StillHaven instead, so this work moved to "next time we touch Android."

---

## Already done (kept for posterity)

- ✅ **WEAR-002** — Aligned `applicationId` in phone + wear `build.gradle.kts` (both `com.moodhaven.app`). Done in commit `a4ab1a7` during the v1.0 cycle.
- ✅ **PS-004** — SHA-256 checksums for AAB artifacts in `latest-release.json`. Done in PR #58. Script: `scripts/update-latest-release-json.cjs` and `scripts/generate-checksums.cjs`.
- ✅ **Wear OS brand alignment Phase A** — landed in commit `e479091` (2026-05-27). Brand colors registered, theme switched, label fixed (`MoodBloom` → `MoodHaven`). See `active-plans/wear-os-brand-alignment.md` for Phases B/C/D queued.

---

## Outstanding QA

- [x] Code-review QA pass on phone app — P0/P1 fixed in PR #119 (2026-06-06)
  - P0: ChannelCallback GC leak → promoted to instance field, unregistered in onDestroy
  - P0: InputStream not closed on exception → wrapped in `.use {}`
  - P1: MoodComplicationService hardcoded "MoodBloom" strings → "MoodHaven"
  - P2: BiometricPlugin key alias + dialog title rebrand
- [ ] Live device QA pass on phone app (manual test)
- [ ] Run `/qa` on wear app — fix all P0/P1 findings
- [ ] Run `/design-review` on wear app — colors, spacing, motion consistent with desktop (now feasible after Wear Phase A landed)
- [ ] Final `/design-review` pass after fixes

---

## Release gate (when this lands as a version bump)

- [x] Both `build.gradle.kts` show `applicationId = "com.moodhaven.app"`
- [ ] Wear + phone `/qa` reports: zero P0/P1 issues
- [ ] Wear + phone `/design-review` reports: consistent with desktop
- [ ] Android E2E: voice memo record on watch → transfer to phone → transcription on desktop
- [ ] Version bump in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `VERSION` (single commit, all four)
- [ ] `CHANGELOG.md` entry for the version
- [ ] `/review` → `/ship` → merge to `main`
- [ ] Tag the version; `tauri-action` ships installers + AAB
- [ ] `TAG=vX.Y.Z node scripts/update-latest-release-json.cjs` to refresh the website pointer

---

## Out of scope

- **StillHaven** — already shipped in v1.1.0.
- **P1–P4 Android polish** — already shipped in `fix/android-companion-polish` (see roadmap Decision Log 2026-04-08).
- **WP-001–004 web port phase 2** — deferred post-v1.0 (LAN sync bridge daemon, whisper.wasm STT, WebAuthn in browser).

---

## Dependencies

- Wear OS Phase B + C from `active-plans/wear-os-brand-alignment.md` should ideally land before the design-review check, so the wear app is in its final brand state.
