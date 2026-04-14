# MoodHaven Journal — Transparency Manifest

> This document describes what MoodHaven Journal does and does not do with user data.
> It is unsigned and unverified — users are encouraged to audit the source code directly.
> Source: https://github.com/kenlacroix/moodhaven-journal

---

## Data Storage

- All journal entries are stored locally in an AES-256-GCM encrypted SQLite database.
- The encryption key is derived from the user's password using PBKDF2 (600,000 iterations, random salt per entry).
- The plaintext password is never stored. Only a salted hash is kept for verification.
- No data is written to any external service without explicit user action.

## What Leaves Your Device

| Data | When | Destination | Condition |
|:-----|:-----|:------------|:----------|
| Encrypted journal blobs | Manual or scheduled WebDAV sync | User-configured server | User must enable WebDAV in Settings |
| Encrypted journal blobs | Peer sync | Another trusted device on your LAN | User must pair devices |
| Anonymised metadata (mood averages, frequency) | AI insights | OpenAI API or local Ollama | User must enable AI and provide API key |
| Audio for transcription | Speech-to-text L3 | OpenAI API | User must grant explicit cloud consent |

Journal text content is **never** sent to any external API under any circumstances.

## What Never Leaves Your Device

- Journal entry text (content)
- Encryption keys
- Your password
- Recovery key
- 2FA secrets (TOTP, hardware key credentials)
- WebDAV credentials
- Oura Ring personal access token
- Any raw audio beyond your local file system

## Telemetry

None. MoodHaven Journal does not collect:
- Usage statistics
- Crash reports
- Error logs (beyond the local rotating log file)
- Analytics events
- Device fingerprints

## Accounts

None required. There is no registration, no login, no cloud account, and no subscription tied to an identity.

## AI Insights

AI features are opt-in and disabled by default. When enabled:

- Only anonymised metadata is sent: mood scores, sentiment classification, entry frequency, time-of-day patterns.
- Journal text is extracted locally and **never** transmitted.
- Users must provide their own OpenAI API key (BYOK) or run a local Ollama instance.
- A local-only tier is available with no external network calls.

## Speech-to-Text

Transcription is performed locally using the whisper.cpp sidecar binary. No audio leaves the device unless the user explicitly enables the OpenAI L3 formatting layer, which requires separate consent.

## Peer Sync

Peer sync uses mDNS for LAN discovery and AES-256-GCM encrypted TCP for data transfer. Sync is limited to trusted (paired) devices on the local network. No relay servers are involved.

## Source Code

MoodHaven Journal is open source. The full source is available for audit at:
https://github.com/kenlacroix/moodhaven-journal

---

*This manifest was last updated for v0.9.3. To verify current behaviour, read the source.*
