<div align="center">

<img src="src-tauri/icons/128x128.png" alt="MoodBloom" width="96" height="96">

# MoodBloom

**A calm, encrypted desktop journal with mood tracking, AI insights, and local peer sync**

[![Version](https://img.shields.io/badge/version-0.7.4-7c3aed?style=flat-square)](https://github.com/kenlacroix/moodhaven-journal/releases)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0ea5e9?style=flat-square)](#installation)
[![Tests](https://img.shields.io/badge/tests-450%20passing-22c55e?style=flat-square)](#tech-stack)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-ffd866?style=flat-square)](https://tauri.app)
[![Encryption](https://img.shields.io/badge/encryption-AES--256--GCM-ef4444?style=flat-square)](#security--privacy)

MoodBloom is a local-first desktop journaling app built on a zero-knowledge security model. Your entries are encrypted on your device with a key only you hold — no accounts, no cloud, no backdoors.

[Download](#installation) · [Build from Source](#building-from-source) · [Security Model](#security--privacy) · [Contributing](#contributing)

</div>

---

## What is MoodBloom?

MoodBloom combines structured mood tracking with free-form encrypted journaling. It stays out of your way while you write, surfaces patterns in your mood over time, and optionally enriches your reflection with AI-generated prompts — all while keeping your data entirely under your control.

**Core beliefs:**

- Your journal is private. No telemetry, no sync without your consent, no plaintext ever leaves your device.
- Writing should be frictionless. One click to open a new entry; auto-saves while you type.
- Insights should be honest. Every chart and statistic is computed locally from your own data.

---

## Features

### Writing & Journaling

- **Rich text editor** — Bold, italic, headings, blockquotes, and lists via TipTap
- **Mood auto-detection** — Infers mood from your writing as you type (threshold: 5 words); overridable at any time with a lock indicator
- **7 guided templates** — Gratitude, Happiness, Rest & Recovery, Grounding, Daily Reflection, Goals & Dreams, Free Write — each inserts styled prompt blockquotes into the editor
- **Multiple journals (Books)** — Organise entries into named, colour-coded journals; filter the timeline by book
- **Privacy modes per entry** — *Open* (full analysis), *Mindful* (local only, no AI), *Private* (no analysis at all)
- **Location & weather** — Optionally captures city, temperature, and weather condition at entry creation using Open-Meteo and Nominatim (no API key required)
- **Focus mode** — Hides the sidebar and toolbar, dims everything except the editor, enables typewriter scrolling
- **Hashtag auto-extraction** — Tags are automatically extracted from entry content on save
- **Pinned entries** — Pin important entries so they surface first in the timeline
- **Speech-to-Text** — Offline transcription via whisper.cpp sidecar with 3-layer formatting pipeline (local rules → Ollama → OpenAI BYOK); no audio ever leaves your device

### Mood & Analytics

- **5-level mood scale** — 😣 Struggling · 😕 Low · 😐 Neutral · 🙂 Good · 😊 Great
- **Calendar heatmap** — Monthly view colour-coded by average daily mood with 24-hour timeline view and mood distribution
- **Mood trend chart** — Rolling average line over any date range
- **Mood distribution** — Bar chart of how often each level appears
- **Streak tracking** — Current and longest consecutive journaling streaks
- **Day-of-week patterns** — See which days you tend to feel best
- **Journaling habits** — Entry frequency and time-of-day patterns
- **Sentiment & emotional trends** — Locally extracted from your writing, never sent anywhere

### AI Insights *(optional, disabled by default)*

- AI never receives your journal text — only anonymised metadata (mood scores, general patterns)
- Contextual writing prompts personalised to your recent mood trend
- Wellness observations and weekly reflection summaries
- Gratitude streak card, mood weather card, and weekly reflection card in the Insights view
- Works with OpenAI API (bring your own key) or a local Ollama instance

### Security & Authentication

- **AES-256-GCM** encryption for all journal content
- **PBKDF2** key derivation — 600,000 iterations; keys never stored
- **Zero-knowledge model** — server (or filesystem) sees only ciphertext; even the app has no backdoor
- **TOTP two-factor authentication** (Google Authenticator, Authy, etc.)
- **Native FIDO2 hardware key** support (YubiKey, etc.) via Rust CTAP2/HID — not browser WebAuthn
- **Recovery key** — optional 24-character offline recovery code generated at setup
- **Encrypted export** — `.moodbloom` backup files are AES-256-GCM encrypted before writing to disk

### Organisation & Search

- **Full-text search** — `Ctrl+K` / `⌘K` overlay with mood and date filters, keyboard navigation
- **On This Day** — Resurfaces entries from the same date in previous years
- **Entry actions** — Copy as Markdown, copy plain text, or delete any entry from the timeline
- **Multiple journals** — Create, rename, colour, and delete named books; each entry belongs to one book
- **Hashtag auto-extraction** — Tags indexed on save; surfaced in timeline

### Health Integration *(optional)*

- **Oura Ring** — Connects via personal access token; sleep score, readiness, and HRV surface as optional context while writing — raw biometrics are never sent to any AI

### Sync & Backup

- **Local peer sync** — Encrypted, zero-config LAN sync between your devices; no cloud server required (see [Peer Sync](#local-peer-sync) below)
- **Encrypted WebDAV sync** — Manual upload/download to any WebDAV server (Nextcloud, etc.); the server only ever receives ciphertext
- **Encrypted local export** — Password-protected `.moodbloom` files for offline archival
- **Sync details modal** — Shows storage type, entry count, last sync time, and upload/download controls

### Wear OS Companion *(beta)*

A voice-first companion app for Wear OS that lets you capture a voice reflection on your wrist before the thought fades, then have it waiting in MoodBloom when you sit down to write.

- **Record on your wrist** — Tap to record, tap to stop; up to 10 minutes of 16 kHz mono audio
- **Quick mood tag** — Tap an emoji mood before or after recording
- **Automatic transfer** — Audio transfers to your phone via Wear OS ChannelAPI; queued and retried if the phone is out of range
- **Local transcription** — Whisper.cpp on the desktop transcribes the memo; no audio leaves your devices
- **Breathe screen** *(Phase 2)* — Guided breathing before a reflection

See [docs/watch-companion.md](docs/watch-companion.md) for setup and architecture.

### Customisation

- **Dark / Light / System** theme
- **Configurable reminders** — Desktop notification at a time of your choosing
- **Temperature unit** — Celsius or Fahrenheit for weather display
- **Auto-title toggle** — Optionally suppress automatic entry title generation
- **Factory reset** — Wipes all data and settings with confirmation

---

## Local Peer Sync

MoodBloom can sync directly between your devices on a local network — no cloud accounts, no configuration, no third-party servers.

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: Encrypted Sync Engine                             │
│  TCP transport · AES-256-GCM payload · LWW conflict resolve │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Secure Pairing                                    │
│  QR code or PIN exchange → trusted_devices.json             │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Peer Discovery                                    │
│  mDNS/DNS-SD (_moodbloom._tcp.local) · zero config          │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Device Identity                                   │
│  Ed25519 key pair · stable deviceId per device              │
└─────────────────────────────────────────────────────────────┘
```

**How it works:**
1. Each device generates a permanent Ed25519 identity on first launch.
2. Devices broadcast and discover each other on the LAN via mDNS automatically.
3. Pairing is done once via QR code or PIN — only paired (trusted) devices sync.
4. Sync is encrypted end-to-end: transport key derived from both device public keys; entries carry per-entry salts so any same-password device can decrypt them directly.
5. Conflicts are resolved with last-write-wins (LWW) per entry.

**Privacy guarantees:** Sync never leaves the LAN. No relay server, no cloud involvement. Sync port range: 44000–44999 (deterministic per device ID).

To manage paired devices, open **Settings → Devices**.

---

## Screenshots

> Screenshots coming soon. Pull requests with screenshots are welcome!

---

## Installation

### Download a Release

Grab the latest build from the [Releases](https://github.com/kenlacroix/moodhaven-journal/releases) page:

| Platform | Installer | Minimum Version |
|:---|:---|:---|
| **Windows** | `MoodBloom_0.7.4_x64-setup.exe` | Windows 10 |
| **macOS** | `MoodBloom_0.7.4_x64.dmg` | macOS 10.15 Catalina |
| **Linux** | `moodbloom_0.7.4_amd64.AppImage` | Any modern distro |
| **Linux (Debian)** | `moodbloom_0.7.4_amd64.deb` | Ubuntu 22.04+ |

### First Launch

1. The setup wizard opens automatically.
2. Create a password (8+ characters). **Write it down — there is no recovery without it unless you generate a recovery key.**
3. Optionally generate a recovery key — store it somewhere safe offline.
4. Optionally enable 2FA (TOTP app or hardware key).
5. Start writing.

---

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) 1.77+

### Linux (Ubuntu / Debian)

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev

# Optional: native FIDO2 hardware key support
sudo apt install -y libudev-dev

git clone https://github.com/kenlacroix/moodhaven-journal.git
cd moodhaven-journal
npm install
npm run tauri build
```

### macOS

```bash
xcode-select --install

git clone https://github.com/kenlacroix/moodhaven-journal.git
cd moodhaven-journal
npm install
npm run tauri build
```

### Windows

Install [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/downloads/) with the **Desktop development with C++** workload, then:

```powershell
git clone https://github.com/kenlacroix/moodhaven-journal.git
cd moodhaven-journal
npm install
npm run tauri build
```

### Development Mode

```bash
npm install
npm run tauri:dev    # Hot-reload dev server
```

### Build with Hardware Key Support

```bash
cd src-tauri
cargo build --release --features hardware-key
```

> **Note:** Requires `libudev-dev` on Linux at compile time and `libudev1` at runtime.

---

## Getting Started

### Creating Entries

Open MoodBloom and start typing — a new entry begins automatically. The mood indicator updates as you write after 5 words. To override, click any mood dot and it locks.

**Quick entry tips:**

- Use a **template** (Templates button, or `Ctrl+T`) for guided prompts — each prompt appears as a styled blockquote you can write under or delete.
- Toggle **focus mode** (the `⊙` button in the toolbar) to eliminate all distractions.
- Your entry auto-saves every few seconds. No save button needed.

### Organising with Books

Books are named journals — think Work, Personal, Travel, Therapy. Each has an emoji and colour.

- Create a book from the **My Books** section in the sidebar.
- The currently selected book is used for new entries.
- Filter the **All Entries** timeline to a single book by clicking it in the sidebar.

### Viewing Your History

| View | What it shows |
|:---|:---|
| **All Entries** | Chronological timeline with search, mood filter, and date range filter |
| **On This Day** | Entries from this exact date in previous years |
| **Insights** | AI-generated prompts and observations + full local analytics |
| **Calendar** | Monthly mood heatmap with 24-hour daily timeline |

### Search

Press `Ctrl+K` (or `⌘K` on macOS) anywhere in the app to open full-text search. Filter by mood level or date range, navigate results with arrow keys, and press `Enter` to open an entry.

---

## Keyboard Shortcuts

| Shortcut | Action |
|:---|:---|
| `Ctrl+K` / `⌘K` | Open search |
| `Ctrl+Enter` | Save and close entry |
| `Ctrl+T` | Open template picker |
| `Ctrl+F` | Toggle focus mode |
| `Ctrl+Shift+L` | Lock journal |

---

## Security & Privacy

### Zero-Knowledge Architecture

MoodBloom uses a zero-knowledge security model: all encryption happens in your browser context before any data touches the filesystem or network. The app itself has no master key and cannot decrypt your entries without your password.

```
Your Password
    │
    │  PBKDF2 (600,000 iterations + random salt)
    ▼
Encryption Key (256-bit, never stored)
    │
    ├──▶  Journal entry content  ──▶  AES-256-GCM  ──▶  SQLite (ciphertext only)
    │
    ├──▶  Export file payload   ──▶  AES-256-GCM  ──▶  .moodbloom file (ciphertext only)
    │
    └──▶  Peer sync payload     ──▶  AES-256-GCM  ──▶  LAN transport (ciphertext only)
```

**What is stored unencrypted:**

- Mood level (integer 1–5) — required for analytics
- Entry timestamp — required for calendar and timeline
- Weather/location data — opt-in; captured at entry creation
- App preferences — non-sensitive settings only
- Hashtags — extracted on save for search

**What is never stored:**

- Your password (only a salted hash for verification)
- Encryption keys
- Journal text in plaintext

### Recovery Options

| Situation | Recovery |
|:---|:---|
| Forgot password, no recovery key | **Unrecoverable.** Must factory reset. |
| Forgot password, have recovery key | Enter the 24-character recovery code on the lock screen. |
| Lost hardware key, have password | Disable 2FA via password on the lock screen. |
| Lost hardware key, lost password | **Unrecoverable.** Must factory reset. |

### Cloud Sync

When using WebDAV sync, your data is encrypted client-side before upload. The WebDAV server receives only ciphertext — even if the server is compromised, your entries cannot be read.

### AI Privacy

When AI features are enabled, MoodBloom **never** sends journal text to any external service. Only aggregated, anonymised metadata is used:

| Sent to AI | Never sent |
|:---|:---|
| Mood scores (numbers only) | Actual journal text |
| Entry frequency patterns | Specific events or situations |
| Time-of-day preferences | Names, places, personal details |
| Sentiment classification | Direct quotes or excerpts |

---

## Recent Changes

**v0.7.4** — Sidebar header icon size consistency
**v0.7.3** — SetupScreen decomposition, CI security audits (`cargo deny` + `cargo audit`), four STT hardening fixes, 450 tests
**v0.7.2** — 3-layer transcript formatting pipeline (L1 local rules / L2 Ollama / L3 OpenAI BYOK), transcript preview overlay, mic permission modals
**v0.7.1** — STT foundation: whisper sidecar commands, timestamped transcription, formatting settings
**v0.7.0** — Encrypted peer sync engine (TCP manifest-diff, AES-GCM, LWW conflict resolution)

Full history: [CHANGELOG.md](CHANGELOG.md)

---

## Version History

| Version | Highlights |
|:---|:---|
| **v0.7.4** | Sidebar header icon size consistency |
| **v0.7.3** | SetupScreen decomposition, CI security audits, STT hardening (4 fixes), 450 tests |
| **v0.7.2** | STT transcript formatting pipeline (L1/L2/L3), mic permission modals, CI whisper build |
| **v0.7.1** | STT pipeline foundation — whisper sidecar commands, timestamped transcription, formatting settings |
| **v0.7.0** | Encrypted peer sync engine (TCP, AES-GCM, LWW), auto-sync on peer discovery |
| **v0.6.1** | QR/PIN pairing, trusted devices, deterministic sync ports |
| **v0.6.0** | Ed25519 device identity, mDNS peer discovery, Settings → Devices tab |
| **v0.5.0** | Major polish sprint — timeline, calendar, writing view, insights, hashtags, pinning |
| **v0.4.0** | Multiple journals (Books), merged Insights, Sync Details Modal, sidebar redesign |
| **v0.3.2** | Journal templates (7 guided templates) |
| **v0.3.1** | Encrypted export/import (`.moodbloom`), factory reset |
| **v0.3.0** | First-run setup wizard |
| **v0.2.2** | Settings page tabs and search |
| **v0.2.1** | Fixed: app freeze on entry save (Rust mutex deadlock) |
| **v0.2.0** | Calendar heatmap, analytics dashboard, privacy-first AI insights |
| **v0.1.0** | Initial release: mood tracking and encrypted journaling |

---

## Tech Stack

| Layer | Technology |
|:---|:---|
| **Desktop shell** | [Tauri 2](https://tauri.app) (Rust) |
| **Frontend** | React 18 + TypeScript + TailwindCSS |
| **Rich text** | [TipTap](https://tiptap.dev) |
| **State** | [Zustand](https://zustand-demo.pmnd.rs) |
| **Database** | SQLite via [rusqlite](https://github.com/rusqlite/rusqlite) (bundled) |
| **Encryption** | AES-256-GCM + PBKDF2 (WebCrypto API) |
| **Peer identity** | Ed25519 ([ed25519-dalek](https://github.com/dalek-cryptography/curve25519-dalek)) |
| **Peer discovery** | mDNS/DNS-SD ([mdns-sd](https://github.com/keepsimple1/mdns-sd)) |
| **2FA** | [totp-rs](https://github.com/constantoine/totp-rs) + native CTAP2/HID |
| **Charts** | Custom SVG (no charting library dependency) |
| **Testing** | [Vitest](https://vitest.dev) + Testing Library (450 tests) |
| **Build** | Vite 5 + `npm run tauri build` |

---

## Beta Testing

MoodBloom is in public beta. The core feature set is complete and stable — the app is used daily in production. What beta testers can help with:

- **Try the full setup flow** — First-run wizard, password, 2FA, recovery key
- **Write entries and use Books** — Does auto-save, mood detection, and templates behave as expected?
- **Test on your OS** — Especially Windows and macOS (primary dev is on Linux)
- **Exercise peer sync** — If you have two machines on the same LAN, try pairing and syncing
- **Break it** — Edge cases, unusual input, rapid navigation, large entry counts

File issues at [GitHub Issues](https://github.com/kenlacroix/moodhaven-journal/issues). Screenshots are always appreciated.

---

## Contributing

Contributions are welcome. Areas where help is especially appreciated:

- **Security audit** — Review the encryption implementation in `src/lib/crypto.ts` and `src-tauri/src/db/`
- **Accessibility** — WCAG 2.1 AA compliance improvements
- **Internationalisation** — Translation support
- **UI/UX** — Designs, mockups, and screenshots
- **Documentation** — Guides and tutorials

Please open an issue to discuss significant changes before opening a PR. For security vulnerabilities, open a private advisory on GitHub.

### Development Setup

```bash
git clone https://github.com/kenlacroix/moodhaven-journal.git
cd moodhaven-journal
npm install
npm run tauri:dev
```

```bash
npm test                          # Run 450 tests
npm run typecheck                 # TypeScript strict check
cd src-tauri && cargo check       # Rust compilation check
```

See [CLAUDE.md](CLAUDE.md) for architectural decisions, security guidelines, and development conventions. Additional documentation:

| Document | Purpose |
|:---|:---|
| [CHANGELOG.md](CHANGELOG.md) | Full version history |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contributor guide |
| [docs/architecture.md](docs/architecture.md) | Data model, component map, key data flows |
| [docs/peer-sync-security.md](docs/peer-sync-security.md) | Peer sync threat model and protocol |
| [docs/tauri-commands.md](docs/tauri-commands.md) | Complete Tauri command reference (~96 commands) |
| [docs/speech-to-text.md](docs/speech-to-text.md) | STT architecture and usage |
| [docs/watch-companion.md](docs/watch-companion.md) | Wear OS companion app guide |

---

## License

[MIT](LICENSE) — © MoodBloom contributors

---

<div align="center">
<sub>Built with care for people who write to understand themselves.</sub>
</div>
