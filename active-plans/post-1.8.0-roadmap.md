# Post-1.8.0 Roadmap & Security Residuals

> **Status:** v1.8.0 is shipped (PR #133): the flagship SQLCipher encryption-at-rest fix
> is live, plus 6 PT9 hardening fixes. The 10-round self-pentest campaign (PT1–PT10, 65+
> targets, 41 vulns confirmed through PT7 + all fixed, PT8 SQLCipher-inert critical, PT9
> findings, PT10 live close-out) is **closed**: health 9.6/10, 1512 FE + 172 Rust tests
> green, independent `cso` audit at 0 CRITICAL / 0 HIGH. This doc synthesizes the post-1.8.0
> research into one prioritized roadmap, records the remaining security residuals, and
> indexes every staged artifact. It summarizes — full detail lives in the linked source docs.

---

## 1. Prioritized Post-1.8.0 Roadmap

Ordered by leverage for a solo, non-commercial portfolio project (signal-per-hour, not max infra).

### P0 — 1.8.1 updater: signature verification + security severity ✅ SHIPPED (1.8.1)
**Status:** minisign signature verification (self-contained `minisign-verify` crate, compile-time
`const` pubkey) + `severity` with the `current < 1.8.0 ⇒ security` non-skippable rule both shipped
in 1.8.1 (PRs #136/#137). Migration-progress UX emits remain open (P2 polish).

### P0 — 1.8.2 updater: seamless silent install ✅ SHIPPED (1.8.2)
**Status:** **Option A shipped.** Because MoodHaven installs per-user into `%LOCALAPPDATA%`, the
custom updater now runs the Windows NSIS installer silently (`/S`, no UAC) and relaunches the app
automatically; user data in `%APPDATA%` is untouched, so settings/DB carry over. Linux AppImage was
already in-place + silent. macOS still opens the DMG (silent install is notarization-gated — see the
code-signing phases below). Also fixed: `checksums.txt` now includes `.deb`/`.rpm`.

**Option B (future direction — adopt `tauri-plugin-updater`):** replace the custom GitHub-Releases
poller with `tauri-plugin-updater`, which verifies minisign natively and provides native
silent-install + relaunch across all three OSes (and removes the bespoke per-OS install code in
`updater.rs`). Bigger refactor: it expects a Tauri-shaped update manifest (vs. our
`latest-release.json` + `checksums.txt`), changes the asset/endpoint contract, and would re-home the
severity/`current < 1.8.0` security-nag logic. Worth doing when the per-OS install matrix (esp.
macOS notarized silent install) becomes the maintenance bottleneck. Keep Option A's custom flow until
then — it's working and fully under our control.

→ Original P0 analysis (now historical), retained for context:

The custom GitHub-Releases updater is strong on transport (HTTPS-only, host allowlist, 200 MB
cap, path-traversal guard) and verifies SHA-256 against `checksums.txt`, but:
- **Authenticity gap (the trust-anchor hole):** CI already signs every bundle (`.sig` via
  `TAURI_SIGNING_PRIVATE_KEY`) and the minisign pubkey is already in `tauri.conf.json`, but
  **nothing ever fetches or verifies the `.sig`**. SHA-256 + checksums travel the same channel
  as the binary → integrity only, not authenticity. Fix: download → SHA-256 → **minisign verify
  against a compile-time `const` pubkey** → install; abort+delete on any failure. Either wire up
  `tauri-plugin-updater` (verifies minisign natively, also fixes seamless install) or add the
  `minisign-verify` crate self-contained.
- **No "this is a security update" signal:** add `severity: security|recommended|optional` to
  `UpdateInfo` + `latest-release.json`, with a hard rule **`current < 1.8.0 ⇒ security`** and
  non-skippable framing — this is the biggest lever on getting the pre-1.8.0 plaintext-DB cohort
  to upgrade.
- **Migration UX:** the SQLCipher plaintext→encrypted migration runs synchronously inside
  `unlock_app` with no progress surfaced (frozen unlock; raw error on fail). Add
  `migration-start`/`migration-done`/`migration-failed` emits + a lock-screen indicator; never
  silently downgrade to plaintext (crash-safety in `db/mod.rs` is already excellent).

→ Source: `research-upgrade-mechanism.md`

### P0 — Test-automation gaps (cheap, lands in existing CI `cargo test`)
- **Upgrade-migration E2E (highest-value gap):** no test proves an old-version profile opens
  under the new binary with data intact and the plaintext→SQLCipher migration succeeding —
  the single riskiest release-time path (data loss). Add a Rust integration fixture (seed a
  plaintext N-1 DB → run N startup+`unlock_app` → assert encrypted + rows decrypt) in CI; add
  the real-binary upgrade round-trip + crash-replay (SIGKILL mid-export) to the live-lab harness.
- **Updater integrity unit tests (cheap):** `verify_sha256` / `fetch_checksum` have zero tests.
  Add `#[test]`s: good hash passes, flipped byte fails, missing `checksums.txt` → unverified
  (not failed), >200 MB rejected.
- **Password-mismatch sync invariant (cheap):** documented "no corruption" but not asserted —
  two temp DBs, different keys, run upsert, assert no crash/corruption.

→ Source: `research-test-plan.md`

### P1 — Code-signing phases (cost-gated; removes "unknown publisher" / Gatekeeper blocks)
Phased, in order. **Skip EV** — since March 2024 it no longer buys instant SmartScreen trust and
requires a business entity.
1. **Phase 0 ($0, ~1h):** keep minisign + checksums (done); add a "Verify your download" README/
   site section + unsigned-build disclaimer; optional Linux GPG detached `.asc` sigs.
2. **Phase 1 — Windows via Azure Trusted Signing (~$10/mo, highest ROI):** individual-eligible
   (self-employed US/CA), no USB token, Microsoft-trusted root, Tauri `signCommand` + `dotnet sign`.
   Removes "unknown publisher" instantly; SmartScreen reputation accrues organically with the same cert.
3. **Phase 2 — macOS Developer ID + notarize + staple ($99/yr):** the only path past Gatekeeper
   ("damaged / can't be opened"); CI scaffolding (`APPLE_*` env block) is already stubbed in
   `build.yml` — uncomment + add secrets + real Team ID.
4. **Phase 3 — reactive AV (as-needed):** VirusTotal each release; submit false positives to the
   specific flagging vendors (Microsoft MSRC first). Signed binaries clear far faster.

→ Source: `research-av-signing.md`

### P1 — VM golden-image snapshots + headless CI lane (the real "quick spin-up")
Full GUI auto-spin-up is the wrong target (a Tauri GUI needs a real desktop session). Instead:
- **Golden-image snapshots (~1 day, highest ROI):** bake green (Windows) + purple (Ubuntu) once
  into a known-good state (installed, throwaway DB, attacker pre-trusted), add a harness
  `--restore-clean` preflight (`virsh snapshot-revert`). Deterministic clean victim in ~5–15s,
  kills the drift problem `harness-monitor.sh` babysits, keeps full GUI fidelity. macOS stays a
  real opportunistic device (no snapshot).
- **Harden the headless CI lane (low effort):** `pentest.yml` already runs static+db+crypto on
  `ubuntu-latest`; add static-mode IPC/sync fuzzers and a 3-OS build matrix that builds the real
  artifact. This lane is the genuinely zero-VM, fully-on-demand part.
- **Optional (medium):** `tauri-driver` + WebdriverIO headless desktop smoke (launch → first-run →
  create password → write → lock → unlock) to move the biggest manual item into CI.
- **Explicitly skip:** Tauri-GUI-in-Docker, Vagrant/Quickemu from-scratch rebuilds, GUI automation
  on hosted Windows/macOS runners, cloud VMs.

→ Source: `research-vm-autospinup.md`

### P2 — Password-manager / passkey unlock (mostly "document + honesty", one real build later)
- **Ship now ($0, ~1–2h):** ✅ SHIPPED — `docs/howto-password-managers.md` documents the
  "save in your PM; copy-paste to unlock" workflow, states plainly that PM browser-extension
  **autofill into the native Tauri WebView is architecturally impossible**, and points at the
  existing clipboard-clear setting. An inline hint was added beneath the unlock field in
  `src/pages/LockScreen.tsx`, and the doc is indexed in `CLAUDE.md`.
- **Do NOT build:** a PM CLI/SDK bridge (Option D) — storing a PM PAT/service-account token
  on-device inverts the zero-knowledge threat model (worse than today's PIN/keyring).
- **Roadmap item (real engineering, ~1–2 wks):** promote the **existing native CTAP2 hardware-key
  path** (`hardware_key.rs`) from 2FA to a first-class unlock factor (enroll-while-unlocked → wrap
  the master password like PIN/biometric → lock-screen button → clear on reset). Market honestly
  as **physical FIDO2 key**, NOT "use your password manager's passkey" — PM software passkeys
  can't reach a native unlock (browser WebAuthn is broken in Tauri WebView per tauri#7926).

→ Source: `research-password-managers.md`

---

## 2. Security Residuals (open, honest gaps)

### GUI-gated live tests (require a desktop session / RDP on the lab; not yet live-proven)
- **Purple Linux at-rest re-validation** — app installed + binary-clean; needs GUI setup to
  confirm ciphertext-on-disk on Ubuntu the same way green (Windows) was confirmed.
- **Live E1 (pairing)** — re-run the pairing fuzzer against the running HEAD build.
- **Live E2 (memory forensics / zeroization dump)** — dump the running process, confirm
  key/password zeroization after lock now that the at-rest key is real.

These are 🔬 applied + reproduction-proven (committed, test-proven) — live re-validation pending.
The three blog pcap exhibit placeholders depend on a live PT9/PT10 capture run.

### Deferred LOW
- **TOTP / hardware-key `Zeroizing`** — wrap those secrets in `Zeroizing` (clear-on-lock already done elsewhere).
- **Restore-arm per-device scoping** — clear-on-lock is done; per-device targeting of the restore arm is pending.

→ Sources: `PT-campaign-final-report.md`, `blog-requirements.md`

---

## 3. Staged Artifact Index

| Artifact (path under `~/.claude/plans/`) | Summary | Status |
|---|---|---|
| `research-upgrade-mechanism.md` | Updater audit (~6.5/10): minisign-verify + severity flag + migration UX path to 10/10 | drafted |
| `research-av-signing.md` | Code-signing/AV phases: Azure Trusted Signing → Apple notarize → reactive AV (skip EV) | drafted |
| `research-password-managers.md` | PM/passkey unlock: document copy-paste now; native FIDO2 later; no PM-CLI bridge | drafted |
| `research-test-plan.md` | Release test surface beyond unit tests; P0/P1 gaps (upgrade E2E, updater integrity, smoke) | drafted |
| `research-vm-autospinup.md` | Victim-VM provisioning: golden-image snapshots + headless CI lane; skip Docker/Vagrant-GUI | drafted |
| `reconciliation/GHSA.md` | Draft GitHub Security Advisory for SQLCipher-inert (`>=1.7.0,<1.8.0`, CVSS 4.4 Moderate) | awaiting-user |
| `reconciliation/release-notes-security-section.md` | Drop-in v1.8.0 release-notes Security section (honest disclosure) | awaiting-user |
| `reconciliation/website-banner-and-post-update.md` | Site upgrade banner + edits to `how-moodhaven-protects-your-journal.mdx` | awaiting-user |
| `PT-campaign-final-report.md` | Final PT1–PT10 campaign report: outcomes, live validation (§10), honest tiers | drafted |
| `security-harness-design.md` | Harness + `cso` skill + multi-VM design/integration proposal (collaborator handoff) | drafted |
| `blog-requirements.md` | Finalization spec for the two blog posts (promote SQLCipher, fold PT9, tools section, exhibits) | drafted |
| `blog-final-technical.md` | Canonical technical blog post (10 rounds, `<details>` toggles, front-matter data block) | drafted |
| `blog-final-nontechnical.md` | Derived non-technical blog post ("broke my own app ten times") | drafted |
| `personal-site-security-post.md` | Personal-site version ("Red-Teaming My Own Encrypted Journaling App, Ten Rounds Deep") | drafted |
