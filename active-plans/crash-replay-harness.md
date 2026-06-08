# Crash-Replay Test Harness (the credibility anchor)

> **Status:** Plan / not started — *do not build yet.* This doc is the build spec.
> **Branch:** `test/crash-replay-harness` (own branch + PR, planning committed first).
> **Parent epic:** [`change-password.md`](change-password.md) §7. Built **first**, against the
> **existing** crash-safe migration (`encrypt_in_place`), then reused by `change_master_password`.
> **Why this exists:** the SIGKILL crash-replay test *output* is the credibility anchor for the
> change-password blog post — the same role the packet captures played in the self-pentest series.
> Grounded in a full read of `src-tauri/src/db/mod.rs` (`encrypt_in_place` + existing crash tests).

---

## 1. Goal

A reusable harness that **proves a crash mid-re-encryption never loses data and never leaves a
half-state** — for any operation that rewrites the encrypted DB. Build it now against the operation
that already exists and is already crash-safe (`encrypt_in_place`, the plaintext→SQLCipher
migration), turning today's two ad-hoc tests into a **complete, named phase matrix**, and add a
**literal `kill -9` subprocess harness** on top. When `change_master_password` lands, it plugs into
the same harness with zero new infrastructure.

**The one invariant, stated once:** after a crash at any boundary and the next startup recovery, the
database is **either fully in the pre-operation state OR fully in the post-operation state — never a
mix, never unreadable, never empty.** Every test asserts exactly this.

---

## 2. Two complementary layers

| Layer | Mechanism | Runs in | Role |
|---|---|---|---|
| **A. State-injection** | construct the exact on-disk intermediate state a crash leaves, boot, assert recovery | `cargo test` (existing CI lane) | the convention already used in `db/mod.rs`; fast, deterministic, the regression net |
| **B. Literal SIGKILL** | spawn a real process, `kill -9` it *at* a boundary, relaunch, assert recovery | `scripts/crash-replay.sh` (separate CI target / manual) | the credibility anchor — a genuinely killed process, real `db_state.json`/WAL/tmp on disk, exit code 137 |

Layer A is what `pentest.yml` / `cargo test` already does (see `startup_recovery_preserves_original_when_tmp_is_corrupt`, `apply_key_promotes_valid_pending_tmp_after_verification`). We **generalize and complete** it. Layer B is new and is the blog material.

---

## 3. The real crash boundaries (from `encrypt_in_place`)

`encrypt_in_place(key, salt_b64)` in `db/mod.rs` already has documented crash-safety. Its boundaries,
with the exact on-disk state and the required recovery outcome:

| # | Boundary (after…) | code | On-disk state | Recovery must yield |
|---|---|---|---|---|
| B0 | before salt pre-write | ln 459 | plaintext db, no `db_state` salt | **old** (plaintext intact) |
| B1 | salt written, `encrypted:false` | ln 459–465 | plaintext db + salt, no tmp | **old** (salt-only is harmless; migration re-runs) |
| B2 | `sqlcipher_export` to tmp | ln 477 | plaintext db + **valid** `moodhaven_enc.db` + salt | **new**, via key-verified promotion in `apply_key` |
| B2′ | export **interrupted** (truncated tmp) | ln 477 mid-write | plaintext db + **corrupt** tmp + salt | **old** — corrupt tmp must NOT clobber original (the SQLC-004 data-loss guard) |
| B3 | `encrypted:true` written | ln 496–502 | valid tmp + `encrypted:true` | **new** (promotion completes) |
| B4 | conn → in-memory placeholder | ln 504–511 | same on disk | **new** |
| B5 | WAL/SHM removed | ln 516–525 | same | **new** |
| B6 | rename tmp → final | ln 564–566 (unix) / 531–562 (win) | encrypted db at final path | **new** (fully migrated) |
| B6′ | rename **interrupted** (win: original moved to backup, tmp not yet in place) | ln 540–555 | `moodhaven_old.db` + tmp | **old or new**, never lost — backup-restore path |

B2′ and B6′ are the dangerous ones and already have partial coverage. The matrix makes all of B0–B6
explicit and named.

---

## 4. Layer A — state-injection harness (`cargo test`)

### 4.1 New test-support module: `db/crash_replay.rs` (`#[cfg(test)]`)

Reusable helpers, so each boundary test is ~10 lines instead of ~40:

- `fn seed_plaintext_db(dir, rows: &[(&str,&str)]) -> PathBuf` — real `Database::new` (full schema +
  migrations) with known journal rows. (Mirrors the seeding in the existing tests.)
- `fn inject_valid_tmp(db_path, key, salt_b64)` / `fn inject_corrupt_tmp(db_path, salt_b64)` —
  produce the B2 / B2′ on-disk state.
- `fn write_state(db_path, encrypted, salt)` — thin wrapper over `write_db_state`.
- **The invariant assertions (the heart):**
  - `assert_old_intact(db_path, expected_rows)` — opens **without** a key, all rows match.
  - `assert_new_intact(db_path, key, expected_rows)` — opens **with** the key, all rows match.
  - `assert_recovered_old_xor_new(db_path, key, expected_rows)` — exactly one of the above holds;
    the file is never simultaneously broken/empty/half.
- `fn boot(db_path) -> Database` / `fn boot_and_apply_key(db_path, key)` — drive `Database::new`
  (startup recovery) and the `apply_key` deferred-promotion path.

### 4.2 Complete the migration phase matrix

One named `#[test]` per boundary in §3 (B0–B6, B2′, B6′), each: seed → inject boundary state →
boot/recover → assert the required outcome. The two existing tests fold into this matrix (B2′ and B2
respectively) using the shared helpers — no behavior change, just consolidation + the missing
boundaries filled in. Output reads as a clean checklist:

```
test db::crash_replay::migration::b0_before_salt_write ... ok
test db::crash_replay::migration::b1_salt_written_no_tmp ... ok
test db::crash_replay::migration::b2_valid_tmp_promotes ... ok
test db::crash_replay::migration::b2p_corrupt_tmp_preserves_original ... ok
...
test db::crash_replay::migration::b6p_rename_interrupted_backup_restore ... ok
```

### 4.3 Forward-looking `change_master_password` matrix (placeholders)

`#[ignore = "pending change_master_password (active-plans/change-password.md)"]` stubs, one per
future boundary from `change-password.md` §4 (inner-txn pre-commit, post-commit/pre-media,
mid-media-swap, post-media/pre-rekey, post-rekey/pre-marker-clear). Each names its expected
old-XOR-new outcome. Writing the test names before the feature is itself a strong blog beat
("the crash tests existed before the code").

---

## 5. Layer B — literal SIGKILL subprocess harness (the anchor)

### 5.1 `crash_point!` macro (debug-only, zero-cost in release)

A tiny macro placed at each boundary inside the crash-safe operation:

```rust
// fires only in debug builds AND only when MH_CRASH_POINT matches; compiles to nothing in release
crash_point!("encrypt.after_export");
```

Behavior when armed (debug + env match):
- **park mode (default):** create the readiness file `$MH_CRASH_READY` then block forever
  (`loop { sleep }`). The process is parked *exactly* at the boundary, dangerous step not yet done —
  the parent then sends a real `SIGKILL`. This makes the kill **deterministic** (no timing race) while
  remaining a genuine external `kill -9`.
- **abort mode (`MH_CRASH_MODE=abort`):** `std::process::abort()` — for environments where the parent
  can't signal (immediate uncatchable crash, no unwinding/flush; equivalent crash semantics).

Gating: `#[cfg(debug_assertions)]` body; in release the macro expands to `()`. Belt-and-suspenders:
also no-op unless `MH_CRASH_POINT` is set, so even a debug build is inert in normal use. **No release
behavior change whatsoever.**

Placed in `encrypt_in_place` at B1, B2, B3, B5, B6 (the points where a crash leaves a distinct
on-disk state). Same macro is later dropped into `change_master_password` at its phase boundaries —
that's the whole reuse story.

### 5.2 `examples/crash_probe.rs`

A cargo **example** (not bundled in the app) exposing two subcommands over the crate's public API:
- `crash_probe seed <dir>` — build a seeded plaintext DB with a known sentinel row.
- `crash_probe migrate <dir> <password>` — run the real unlock/`encrypt_in_place` path (honoring
  `MH_CRASH_POINT`).
- `crash_probe verify <dir> <password>` — boot (startup recovery) + assert `old XOR new` and that the
  sentinel row survives; exit 0 on the invariant holding, non-zero otherwise.

### 5.3 `scripts/crash-replay.sh`

For each boundary in a list:
1. fresh temp profile → `crash_probe seed`.
2. `MH_CRASH_POINT=<b> crash_probe migrate &` → wait for `$MH_CRASH_READY` → `kill -9 $!` →
   confirm exit status `137` (SIGKILL).
3. `crash_probe verify` → record PASS/FAIL.
4. print a table — **this table is the blog exhibit**:

```
boundary                    killed   recovered   sentinel
encrypt.after_salt          SIGKILL  old         intact
encrypt.after_export        SIGKILL  new         intact
encrypt.after_state_true    SIGKILL  new         intact
encrypt.before_rename       SIGKILL  old         intact
encrypt.after_rename        SIGKILL  new         intact
→ 5/5 boundaries: data survived a kill -9 at every step
```

### 5.4 Platform note

`kill -9` semantics are Linux/macOS. The park-and-kill harness runs on the Linux CI lane (and macOS
locally). On Windows the same boundaries are covered by Layer A state-injection (which already
exercises the Windows-specific backup-restore rename path B6′). Document this split; don't fake
Windows SIGKILL.

---

## 6. What this PR builds vs. defers

**This branch/PR (`test/crash-replay-harness`) — when we build it:**
- `crash_point!` macro (debug-only) + its placement in `encrypt_in_place`.
- `db/crash_replay.rs` state-injection harness + complete migration matrix (Layer A).
- `examples/crash_probe.rs` + `scripts/crash-replay.sh` (Layer B) proven against the migration.
- CI: migration matrix in the existing `cargo test`; `crash-replay.sh` as a Linux CI step (or `make`
  target) that fails the build if any boundary loses data.
- The `change_master_password` placeholder matrix (ignored tests).

**Deferred to the change-password feature PR:**
- `crash_point!` placements inside `change_master_password` + un-ignoring its matrix + adding its
  boundaries to `crash-replay.sh`.

**Right now (this commit): planning only.** No code.

---

## 7. Risks & mitigations

- **Instrumenting production code** (`crash_point!` in `encrypt_in_place`) — mitigated by
  double-gating (`cfg(debug_assertions)` + env), expands to nothing in release; add a release-build
  assertion/test that the macro is inert.
- **Non-determinism of literal kill** — solved by park-and-kill (readiness file), not sleep-then-kill.
- **Test flakiness from leftover temp profiles / WAL handles** — each case uses a fresh temp dir and
  cleans up; mirror the existing tests' `remove_dir_all`.
- **Scope creep into the feature** — this branch only touches the *existing* migration op; the
  feature op is explicitly deferred.

---

## 8. Definition of done (for the build PR, later)

- All §3 boundaries have a green Layer-A test; the two existing tests are folded in.
- `scripts/crash-replay.sh` exits 0 with every boundary `recovered ∈ {old,new}` and `sentinel intact`,
  and prints the exhibit table.
- Release build proven to compile the macro to a no-op (no `MH_CRASH_*` effect).
- `change_master_password` placeholder matrix present and `#[ignore]`d with descriptive names.
- The exhibit table + the `cargo test` matrix output captured for the blog (`change-password.md` §11).
