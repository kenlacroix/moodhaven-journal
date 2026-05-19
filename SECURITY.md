# Security Policy

## Supported Versions

| Version | Supported |
|:---|:---|
| 0.9.x (current) | ✅ Yes |
| 0.8.x | ✅ Yes (security fixes only) |
| < 0.8.0 | ❌ No |

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
- As of v0.9.0, password verification runs in the Rust backend (not the WebView) via the `verify_password` Tauri command, reducing the attack surface for unlock bypass
- The application cannot decrypt your data without your password; there is no master key or backdoor
- Optional cloud sync (WebDAV) sends only ciphertext — the server never sees plaintext
- Optional AI features send only aggregated, anonymised metadata — journal text is never transmitted

Full details are in [`CLAUDE.md`](CLAUDE.md) under **Section 2: Security Guidance**.

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
- Peer sync transport vulnerabilities (device identity spoofing, unauthenticated sync)

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
| Session password held in JS memory | Unavoidable in a browser-context app; cleared on lock/exit |
| Mood level stored unencrypted | Required for local analytics to work without decrypting every entry |
| Entry timestamps stored unencrypted | Required for calendar view and timeline ordering |
| Weather/location stored unencrypted | Opt-in; contains no journal content |
| Hashtags stored unencrypted | Required for search index; tags are extracted keywords, not full sentences |
| Peer sync port is deterministic | Derived from device ID; convenience trade-off, not a secret |
