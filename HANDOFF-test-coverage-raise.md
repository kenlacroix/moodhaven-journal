# HANDOFF: task/test-coverage-raise

## Branch
`task/test-coverage-raise` — based on `main` (3cd3a60)  
Draft PR: https://github.com/kenlacroix/moodhaven-journal/pull/99

## What changed

### Rust tests (+46 new tests across 3 files)

| File | New tests | What's covered |
|------|-----------|----------------|
| `peer_sync_engine/crypto.rs` | 11 | AES-GCM round-trip, tamper detection, wrong-key rejection, short-frame guard, unique nonce, ECDH mutual derivation + error paths |
| `peer_sync_engine/protocol.rs` | 10 | Port formula (range, determinism, known values), Msg serialization (eph_pub omitted when None, NotTrusted/Auth round-trips) |
| `peer_sync_engine/conflict.rs` | +31 (kept 5 existing) | `parse_peer_timestamp` clock-skew guard, `db_upsert_entry` / `db_upsert_book` LWW, `db_insert_signal_if_new` idempotency, `merge_settings_json` credential isolation, `db_upsert_setting` far-future rejection |

### TypeScript tests (+54 new tests, 4 new files)

| File | Tests | What's covered |
|------|-------|----------------|
| `signalService.test.ts` | 17 | **Security contract**: payload encrypted before IPC (raw plaintext must never appear in Rust call), decryption on read-back, wrong password throws, IPC arg shapes |
| `syncEngine.test.ts` | 16 | LWW pull/push/skip, tombstone propagation, partial sync (Wear OS offline reconnect), first sync, connection failure, progress callbacks, recordTombstone |
| `syncManifest.test.ts` | 11 | encrypt/decrypt round-trip, unique IV, wrong password throws, EncryptedData blob shape |
| `deviceIdentity.test.ts` | 10 | getDeviceId (existing/new), persist on first use, getDeviceName fallback, setDeviceName trim |

## Coverage delta

| Metric | Before | After | Δ |
|--------|--------|-------|---|
| Statements | 32.53% | 35.51% | +2.98% |
| Branches | 25.52% | 27.47% | +1.95% |
| Functions | 29.32% | 30.92% | +1.60% |
| Lines | 33.10% | 36.32% | +3.22% |

TypeScript: 1283 → 1337 tests (86 → 90 files)  
Rust: baseline → 139 total tests

## All tests green

```
npm test → 90 files passed, 1337 tests passed
cargo test → 139 passed, 0 failed
```

## Assumptions made

1. The `@vitest/coverage-v8` devDependency was not previously installed; added it (the `test:coverage` script in package.json already referenced it).
2. The syncEngine tests mock `syncManifest` and `crypto` for speed (real PBKDF2 is 100–500 ms per call). Real crypto is tested in `syncManifest.test.ts` and `crypto.test.ts`.
3. The syncManifest tests use `// @vitest-environment node` (same as `crypto.test.ts`) because jsdom's WebCrypto is incomplete.
4. `parse_peer_timestamp` is private in `conflict.rs` but accessible from the `#[cfg(test)] mod tests` child module (standard Rust visibility rules).
5. The `JournalEntryRow` stub in Rust tests omits `status`, `session_id`, `word_count` fields (they are `Option` and default to `None`).

## Highest-risk paths still uncovered and why

| Path | Why uncovered |
|------|---------------|
| Peer TCP sync engine (`connection.rs`, `mod.rs`) | Requires real TCP sockets and two processes; no integration test harness exists yet |
| STT sidecar (`speech_to_text.rs`) | Requires `whisper-cli` binary; not available in CI without a full sidecar build step |
| Full WebDAV integration | Would need a real WebDAV server; mocked at the boundary instead |
| `booksService.ts`, `mediaService.ts`, etc. | IPC-thin wrappers with no logic; coverage would only verify arg names, not behavior |
| UI components (0% coverage) | Intentional per project test strategy; `testing.md` documents these as future work |
| Rust `db_upsert_entry` with tags | `db_upsert_tags` path covered by the entry upsert tests but tag COUNT not verified; low risk since tags are non-sensitive metadata |

## Skills invoked

- None of the named skills matched this task (no `/code-review`, `/health`, etc. were triggered).
- Used `cargo test --package moodhaven-journal` for Rust, `npm test` for TypeScript.
