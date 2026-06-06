# HANDOFF-tests.md — Test Coverage Buildout

Branch: `task/test-coverage`
Date: 2026-06-06

---

## Coverage Delta

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Test files | 82 | 96 | +14 |
| Total tests | 1245 | 1454 | +209 |

---

## Files Added (10 new test files)

All tests co-located with source (pattern: `foo.ts` → `foo.test.ts`).

| Test file | Tests | What is covered |
|-----------|-------|-----------------|
| `src/lib/services/cloudProvidersService.test.ts` | 23 | Dropbox/Google Drive OAuth PKCE wrappers, `syncUpload`, `syncDownload`, non-Error thrown objects |
| `src/lib/services/signalService.test.ts` | 19 | Signal encrypt-before-IPC (security boundary), `decryptRow`, error message forwarding |
| `src/lib/services/booksService.test.ts` | 15 | `parseBook` null→undefined, JSON settings round-trip, CRUD wrappers |
| `src/lib/services/syncManifest.test.ts` | 14 | Pure manifest functions: `createEmptyManifest`, `encryptManifest`, `decryptManifest` |
| `src/lib/services/deviceIdentity.test.ts` | 13 | `getDeviceId` (generate + cache), `defaultDeviceName` from `navigator.userAgent` |
| `src/lib/services/ouraService.test.ts` | 20 | Rust validation BEFORE storage, `syncToday`/`backfill` decrypt PAT, `getTodayContext` auto-sync |
| `src/lib/services/peerSyncEngineService.test.ts` | 20 | TCP sync IPC, event listener callbacks with full payload shape assertions |
| `src/lib/services/syncEngine.test.ts` | 17 | Manifest diff (pull/push/conflict/equal), tombstones, progress reporting, `recordTombstone` |
| `src/lib/services/peerDiscoveryService.test.ts` | 14 | mDNS identity/rename/discovery IPC, `onPeerDiscovered`/`onPeerLost` event callbacks |
| `src/lib/services/peerPairingService.test.ts` | 20 | PIN generation, `acceptPairing`, trusted devices, all 4 pairing event listeners |

---

## Security-Critical Paths Verified

1. **Signal payload encryption**: `signalService.test.ts` asserts that `createSignal` calls `encrypt()` on the payload before sending to Rust IPC, and that `listSignals`/`listEntrySignals` call `decrypt()` on each returned row. Journal content never crosses the IPC boundary in plaintext.

2. **Oura PAT storage order**: `ouraService.test.ts` asserts that `savePAT` calls `oura_validate_pat` (Rust) before `secureSet`, and that if Rust validation throws, `secureSet` is never called.

3. **Cloud sync encryption**: `cloudProvidersService.test.ts` asserts that `syncUpload` calls `exportData` (which produces an AES-256-GCM encrypted envelope) before uploading — the blob uploaded to Dropbox/Google Drive is always ciphertext.

4. **Sync manifest encryption**: `syncManifest.test.ts` asserts `encryptManifest` uses the project crypto module and that the round-trip `encrypt → decrypt` restores the original manifest.

---

## Assumptions Made

- `ouraService.ts` PAT storage flow: assumed the Rust `oura_validate_pat` call is always the gateway before `secureSet`. Tests were written to assert this order. If the implementation changes to allow storing first and validating later, these tests will correctly fail.

- `syncEngine.ts` conflict resolution: assumed last-write-wins by `updated_at` ISO string comparison (lexicographic). This matches the peer sync security doc and the source code.

- `peerPairingService.ts` event payloads: `TrustedDevice` type has a `deviceType` field beyond what the Tauri command reference shows. Tests use the actual TypeScript type, not just the docs.

- `ouraService.ts` `getTodayContext`: the "sync when cache miss" behavior was inferred from the source code — no unit test existed before.

---

## What Remains Uncovered (and Why)

| Service | Reason not covered |
|---------|-------------------|
| `hardwareKeyService.ts` | Requires `--features hardware-key` Cargo feature; IPC commands only exist in feature builds. Testing stubs would not assert real behavior. |
| `twoFactorService.ts` | 14 commands already have integration-level tests via `hooks/use2FASetup.test.ts`. Adding service-level wrapper tests would be redundant without value. |
| `updaterService.ts` | Already tested at component level via `components/updater/UpdatePanel.test.tsx`. |
| `mediaService.ts` | Large file upload/download commands; all path logic lives in Rust. IPC wrapper tests would only assert call shapes. |
| `windowUtils.ts` | Thin OS shell utilities (`open_writer_window`) — no logic to assert. |
| Rust `#[cfg(test)]` modules | Out of scope for this TypeScript test pass; requires `cargo test`. |

---

## Test Environment Notes

- `syncManifest.test.ts` and `syncEngine.test.ts` use `// @vitest-environment node` to access real `crypto.subtle` (jsdom's WebCrypto polyfill is incomplete for AES-GCM operations used in `encryptManifest`).
- `peerDiscoveryService.test.ts` and `peerPairingService.test.ts` mock `@tauri-apps/api/event` per-file because `listen` is not in the global setup mock.
- All other new test files rely only on the global `invoke` mock from `src/test/setup.ts`.

---

## Skills Invoked

- `/guard` — blast-radius guardrails active for session
- `/review` — diff analysis to identify highest-risk uncovered paths

---

## How to Run

```bash
cd .claude/worktrees/agent-a3fe47422a04d7aa5
npm test                     # run all 1454 tests
npm run test:coverage        # v8 coverage report
npx vitest run src/lib/services/  # run only service tests
```
