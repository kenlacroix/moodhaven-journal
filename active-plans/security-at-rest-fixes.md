# Security: At-Rest Data Protection Fixes

**From:** Pentest 2 findings (T7, T8, T9, T10)
**Blog post:** `.claude/plans/blog-post-pentest-draft.md`
**Status (2026-06-05):** PR 1 complete (CI green, targeting v1.7.0). PR 2 not started — blocks release gate.

Two PRs, one logical group. PR 1 is done. PR 2 (peer_key.bin) is the remaining work before
cutting the security release tag.

---

## PR 1 — SQLCipher Migration (`security-sqlcipher`)

**Closes:** T7 (DB readable at rest), T8 (password hash exposed), T9 (lockout bypass moot)

### What changes

`src-tauri/Cargo.toml` — swap the rusqlite dependency:
```toml
# Before
rusqlite = { version = "0.31", features = ["bundled"] }

# After
rusqlite = { version = "0.31", features = ["bundled-sqlcipher-vendored-openssl"] }
```
`bundled-sqlcipher-vendored-openssl` compiles SQLCipher and OpenSSL from source — no system deps,
works on all three platforms without extra CI steps.

`src-tauri/src/db/mod.rs` — three changes:

**1. Key pragma on open.** After `Connection::open()`, set the key before any queries:
```rust
conn.execute_batch(&format!(
    "PRAGMA key = '{}';",
    hex::encode(derived_key_bytes)
))?;
```
The key is 32 bytes derived from the user's password via the same PBKDF2 already in use.
Use hex-encoding (64 chars) rather than raw bytes — SQLCipher's PRAGMA key treats the value
as a passphrase and applies its own KDF on top; using `PRAGMA hexkey` bypasses that second
KDF and gives deterministic behaviour.

**2. Migration detect-and-rekey.** Existing users have an unencrypted DB. Detect this on open:
```rust
// Try encrypted open first; if it fails, the DB is unencrypted (existing install)
fn open_database(path: &Path, key: Option<&[u8]>) -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open(path)?;
    if let Some(k) = key {
        conn.execute_batch(&format!("PRAGMA hexkey = '{}';", hex::encode(k)))?;
        // Probe: if this fails, DB is unencrypted or wrong key
        conn.execute_batch("SELECT count(*) FROM sqlite_master;")?;
    }
    Ok(conn)
}
```
When migration is needed (unencrypted DB + valid password on hand), call `sqlcipher_export`:
```sql
ATTACH DATABASE 'moodhaven_enc.db' AS encrypted KEY 'hexkey:...';
SELECT sqlcipher_export('encrypted');
DETACH DATABASE encrypted;
```
Then swap files and delete the plaintext original.

**3. Pre-password state.** On first launch there is no password yet. The DB at this point
contains only the schema — no journal entries, no password hash. Leave it unencrypted until
the user completes the first-run wizard and sets a password. At that point, call
`sqlcipher_export` to encrypt it and set a `db_encrypted = true` flag in a sidecar JSON file
(not in the DB itself — we need to read this flag before opening the DB).

### Key derivation

Reuse the existing PBKDF2 parameters already proven in the frontend (`crypto.ts`):
- PBKDF2-HMAC-SHA256
- 600,000 iterations
- Salt: read the `password_salt` from the settings table **before** encrypting, then
  store the same salt in the sidecar JSON so it's available before the DB can be opened

Do this on the Rust side with the `pbkdf2` crate (already in the tree for TOTP).

### Unlock flow change

Currently `unlock_app` just sets a boolean in memory. With SQLCipher it needs to also:
1. Derive the DB key from the supplied password
2. Re-open (or re-key) the connection with that key
3. If the key is wrong, return an error before setting `isUnlocked`

The `Database` struct needs to hold the derived key in memory for the session,
used for any new connections (writer window, etc.).

### Migration path for existing users

```
Launch after update
    │
    ├── sidecar JSON exists + db_encrypted = true → normal encrypted open
    │
    ├── sidecar JSON missing or db_encrypted = false
    │       ├── password_hash exists in DB → open unencrypted, prompt user to
    │       │   re-enter password to trigger migration, show one-time banner
    │       └── no password_hash → first-run wizard, encrypt on password set
```

### Files to touch

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Swap rusqlite feature flag |
| `src-tauri/src/db/mod.rs` | Key pragma, detect-and-rekey, migration |
| `src-tauri/src/commands/data_management.rs` | Pass key to unlock_app; re-open DB |
| `src-tauri/src/lib.rs` | Database state carries optional key bytes |
| `src/components/settings/tabs/PrivacyDataManagement.tsx` | One-time migration banner (if needed) |

### Acceptance criteria

> **Status (2026-06-05): PR #97 (`worktree-security-sqlcipher`) — all CI green. Merged into v1.7.0.**

- [x] Fresh install: DB created encrypted from first password set
- [x] Existing install: detect-and-rekey via `db_state.json` sidecar + `encrypt_in_place()` — migration banner path wired
- [ ] `sqlite3 moodhaven.db .tables` on the migrated file returns `Error: file is not a database` — runtime-only, verify post-merge QA
- [x] Wrong password: `unlock_app` returns error, app stays on lock screen
- [ ] Export/import still works (encrypted backup → decrypt in memory → re-encrypt for export) — needs QA run post-merge
- [x] All 1245 tests pass (CI: Frontend ×2, Rust ×3, Lint, Secret Scan — all green)
- [x] `cargo check` clean on Linux, Windows, macOS (CI confirmed)

---

## PR 2 — Encrypt peer_key.bin (`security-peer-key`)

**Status:** In progress — PR #103 (`worktree-security-peer-key`, commit `bf3b8d0`). CI running. Blocking gate: plan requires both PRs before cutting the security release tag.

**Closes:** T10 (Ed25519 private key readable at rest)

### The constraint

Peer discovery starts before the user unlocks. The current code loads `peer_key.bin` at startup
to register the mDNS service. If we encrypt it with the password-derived key, it can't be loaded
until after unlock.

**Decision: delay peer discovery start until after unlock.**

This is already architecturally sound — there's no value in broadcasting your device on the LAN
before the app is unlocked. Move `peer_discovery_start` from auto-start in `lib.rs` to be called
by `unlock_app`. The sync server (TCP listener) can also wait until unlock.

### What changes

**Encryption:** Use the OS credential store rather than the password-derived key:
- Windows: Windows Data Protection API (`DPAPI` / `CryptProtectData`) — encrypts with the
  OS user's login credentials, transparent to the user, survives reboots
- macOS: Keychain via `security` framework
- Linux: Secret Service via `libsecret` or fallback to file-based with `chmod 0600`

Rust crate: `keyring = "2"` — already handles all three platforms.

Store the 32-byte Ed25519 seed in the keyring under service name `com.moodhaven.app`,
username `peer_key`. Keep `peer_key.bin` as a fallback for systems where keyring is
unavailable (e.g., headless Linux), but apply `chmod 0600` on all platforms via the
`rustix` or `fs` crate.

**Migration:** On first launch after update, read `peer_key.bin` if it exists, store in
keyring, then delete `peer_key.bin`. If keyring unavailable, leave as file with `0600`.

### Files to touch

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `keyring` crate |
| `src-tauri/src/commands/peer_identity.rs` | Read/write via keyring; fallback to file |
| `src-tauri/src/lib.rs` | Move peer discovery start to post-unlock |
| `src-tauri/src/commands/data_management.rs` | Call `peer_discovery_start` from `unlock_app` |

### Acceptance criteria

- [ ] `peer_key.bin` no longer exists on disk after migration (keyring path)
- [ ] Device identity is stable across app restarts
- [ ] Peer discovery does not start until after successful unlock
- [ ] Fallback: on headless Linux without Secret Service, file is created with `0600`
- [ ] All 1245 tests pass

---

## Order of work

1. ✅ PR 1 done — SQLCipher merged (v1.7.0), closes T7/T8/T9
2. PR 2 next — no shared files with PR 1, can be built independently
3. Both must be done before cutting the security release tag — **PR 2 is the current blocker**
4. Blog post ships after both PRs land

## Not doing (out of scope for these PRs)

- Lockout file hardening — rendered moot by SQLCipher; log as a follow-up if desired
- UDP discovery plaintext — architectural, separate discussion
- HELLO handshake plaintext — same, separate discussion
