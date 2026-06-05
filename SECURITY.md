# Security Policy

## Supported Versions

| Version | Supported |
|:---|:---|
| 1.6.x (current) | ✅ Yes |
| 1.5.x | ✅ Yes (security fixes only) |
| < 1.5.0 | ❌ No |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report security issues privately via [GitHub Security Advisories](https://github.com/kenlacroix/moodhaven-journal/security/advisories/new).

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept (if safe to share)
- The version(s) affected

You can expect an acknowledgement within 48 hours and a patch or mitigation within 14 days for confirmed issues.

---

## Security Model

MoodHaven Journal is built on a **zero-knowledge, local-first** architecture:

- All journal content is encrypted with **AES-256-GCM** before being written to disk
- Encryption keys are derived from your password using **PBKDF2 (600,000 iterations)** — the key is never stored
- Password verification runs in the Rust backend (not the WebView) via the `verify_password` Tauri command, reducing the attack surface for unlock bypass
- The application cannot decrypt your data without your password; there is no master key or backdoor
- Optional cloud sync (WebDAV) sends only ciphertext — the server never sees plaintext
- Optional AI features send only aggregated, anonymised metadata — journal text is never transmitted

Full details are in [`.claude/docs/security.md`](.claude/docs/security.md) and [`docs/threat-model.md`](docs/threat-model.md).

### Two-Factor Authentication

TOTP provides an additional verification step during active sessions. As of v1.2.1, the TOTP seed is encrypted at rest using AES-256-GCM with a key derived from your password (same PBKDF2 stack as journal entries). Prior versions stored the TOTP seed as plaintext in the database; if you are upgrading from v1.1.x or earlier, re-enable TOTP after upgrading to re-encrypt the seed.

TOTP backup codes are stored as SHA-256 hashes — the plaintext codes are shown once and never stored.

### Development Model

MoodHaven Journal is built and maintained by a solo indie developer. The security model relies on established cryptographic primitives — AES-256-GCM, PBKDF2, Ed25519 — not proprietary systems. The codebase has **not been audited by an independent third-party security firm**. Security researchers are welcome to review the source and report findings via GitHub Security Advisories.

---

## Scope

The following are **in scope** for vulnerability reports:

- Encryption implementation (`src/lib/crypto.ts`, `src-tauri/src/`)
- Authentication bypass or 2FA weaknesses
- Data exfiltration or plaintext leakage
- SQL injection or command injection
- Path traversal in file operations
- Credential exposure (API keys, PATs, WebDAV passwords)
- Insecure IPC between the frontend and Tauri backend
- Peer sync transport vulnerabilities (device identity spoofing, unauthenticated sync, LWW timestamp forgery)

The following are **out of scope**:

- Vulnerabilities requiring physical access to an already-unlocked device
- Denial-of-service attacks against a local desktop application
- Social engineering attacks against users
- Issues in third-party dependencies that have no MoodHaven Journal-specific exploit path (please report those upstream)

---

## Known Design Trade-offs

These are intentional decisions, not vulnerabilities:

| Trade-off | Rationale |
|:---|:---|
| Session password held in JS memory | Unavoidable in a browser-context app; cleared on lock via `clearKeyCache()` |
| Mood level stored unencrypted | Required for local analytics to work without decrypting every entry |
| Entry timestamps stored unencrypted | Required for calendar view and timeline ordering |
| Weather/location stored unencrypted | Opt-in; contains no journal content |
| Hashtags stored unencrypted | Required for search index; tags are extracted keywords, not full sentences |
| Peer sync port is deterministic | Derived from device ID; convenience trade-off, not a secret |
| Per-entry PBKDF2 salt | Compromising one entry's key does not expose others — chosen over a single master key |
| Sync v1 fallback (no forward secrecy) | Backwards compatibility with pre-v2 peers; static key, no ephemeral exchange |
