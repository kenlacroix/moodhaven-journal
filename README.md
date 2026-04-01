<div align="center">

<img src="src-tauri/icons/128x128.png" alt="MoodHaven Journal" width="96" height="96">

<h1>MoodHaven Journal</h1>

<p><strong>A calm, encrypted desktop journal with mood tracking, AI insights, and local peer sync</strong></p>

<p>
<a href="https://github.com/kenlacroix/moodhaven-journal/releases"><img src="https://img.shields.io/badge/version-0.7.13-7c3aed?style=flat-square" alt="Version"></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" alt="License"></a>
<a href="#installation"><img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0ea5e9?style=flat-square" alt="Platform"></a>
<a href="#tech-stack"><img src="https://img.shields.io/badge/tests-585%20passing-22c55e?style=flat-square" alt="Tests"></a>
<a href="https://tauri.app"><img src="https://img.shields.io/badge/built%20with-Tauri%202-ffd866?style=flat-square" alt="Built with Tauri"></a>
<a href="#security--privacy"><img src="https://img.shields.io/badge/encryption-AES--256--GCM-ef4444?style=flat-square" alt="Encryption"></a>
</p>

<p>MoodHaven Journal is a local-first desktop journaling app built on a zero-knowledge security model. Your entries are encrypted on your device with a key only you hold — no accounts, no cloud, no backdoors.</p>

<p><a href="#installation">Download</a> · <a href="#building-from-source">Build from Source</a> · <a href="#security--privacy">Security Model</a> · <a href="#contributing">Contributing</a></p>

</div>

---

## What is MoodHaven Journal?

MoodHaven Journal combines structured mood tracking with free-form encrypted journaling. It stays out of your way while you write, surfaces patterns in your mood over time, and optionally enriches your reflection with AI-generated prompts — all while keeping your data entirely under your control.

**Core beliefs:**

- Your journal is private. No telemetry, no sync without your consent, no plaintext ever leaves your device.
- Writing should be frictionless. One click to open a new entry; auto-saves while you type.
- Insights should be honest. Every chart and statistic is computed locally from your own data.

---

## Screenshots

| Writing View | Calendar |
|:---:|:---:|
| ![Writing view — mood selector and rich text editor](docs/screenshots/writing-view.png) | ![Calendar — monthly mood heatmap](docs/screenshots/calendar-view.png) |

| On This Day | Settings |
|:---:|:---:|
| ![On This Day — past entries resurface by date](docs/screenshots/on-this-day-view.png) | ![Settings — appearance, privacy, sync, AI, and more](docs/screenshots/settings-view.png) |

---

## Features

| Write | Track |
|:---|:---|
| Rich text editor (bold, italic, headings, lists) | 5-level mood scale with auto-detection as you type |
| 7 guided templates (Gratitude, Goals, Free Write…) | Calendar heatmap and mood trend charts |
| Multiple journals (Books) with colour-coding | Streak tracking and day-of-week patterns |
| Privacy mode per entry (Open / Mindful / Private) | Sentiment and emotional trends — computed locally |
| Focus mode — hides UI, enables typewriter scroll | Insights view with AI prompts *(opt-in, metadata only)* |
| Speech-to-text via offline whisper.cpp sidecar | On This Day — resurfaces past entries by date |
| Location & weather context at entry creation | Full-text search with mood and date filters (`Ctrl+K`) |

| Protect | Sync |
|:---|:---|
| AES-256-GCM encryption, PBKDF2 key derivation | Local peer sync over LAN — no cloud server needed |
| Zero-knowledge: app never sees your plaintext | Encrypted WebDAV backup (Nextcloud, etc.) |
| TOTP 2FA and native FIDO2 hardware key support | Encrypted `.moodhaven` export for offline archival |
| Optional 24-character offline recovery key | Wear OS companion for wrist voice capture *(beta)* |

---

## Installation

### Download a Release

Grab the latest build from the [Releases](https://github.com/kenlacroix/moodhaven-journal/releases) page:

| Platform | Installer | Minimum Version |
|:---|:---|:---|
| **Windows** | `MoodHaven_0.7.13_x64-setup.exe` | Windows 10 |
| **macOS** | `MoodHaven_0.7.13_x64.dmg` | macOS 10.15 Catalina |
| **Linux** | `moodhaven_0.7.13_amd64.AppImage` | Any modern distro |
| **Linux (Debian)** | `moodhaven_0.7.13_amd64.deb` | Ubuntu 22.04+ |

### First Launch

1. The setup wizard opens automatically.
2. Create a password (8+ characters). **Write it down — there is no recovery without it unless you generate a recovery key.**
3. Optionally generate a recovery key — store it somewhere safe offline.
4. Optionally enable 2FA (TOTP app or hardware key).
5. Start writing.

---

## Getting Started

### Creating Entries

Open MoodHaven Journal and start typing — a new entry begins automatically. The mood indicator updates as you write after 5 words. To override, click any mood dot and it locks.

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

MoodHaven Journal uses a zero-knowledge security model: all encryption happens in your browser context before any data touches the filesystem or network. The app itself has no master key and cannot decrypt your entries without your password.

```
Your Password
    │
    │  PBKDF2 (600,000 iterations + random salt)
    ▼
Encryption Key (256-bit, never stored)
    │
    ├──▶  Journal entry content  ──▶  AES-256-GCM  ──▶  SQLite (ciphertext only)
    │
    ├──▶  Export file payload   ──▶  AES-256-GCM  ──▶  .moodhaven file (ciphertext only)
    │
    └──▶  Peer sync payload     ──▶  AES-256-GCM  ──▶  LAN transport (ciphertext only)
```

**What is stored unencrypted:** mood level (for analytics), entry timestamp (for calendar), weather/location (opt-in), app preferences, hashtags (for search).

**What is never stored:** your password, encryption keys, journal text in plaintext.

### Recovery Options

| Situation | Recovery |
|:---|:---|
| Forgot password, no recovery key | **Unrecoverable.** Must factory reset. |
| Forgot password, have recovery key | Enter the 24-character recovery code on the lock screen. |
| Lost hardware key, have password | Disable 2FA via password on the lock screen. |

### AI Privacy

When AI features are enabled, MoodHaven Journal **never** sends journal text to any external service — only aggregated, anonymised metadata (mood scores, entry frequency, time-of-day patterns, sentiment classification).

Full security model: [.claude/docs/security.md](.claude/docs/security.md)

---

## Local Peer Sync

MoodHaven Journal can sync directly between your devices on a local network — no cloud accounts, no configuration, no third-party servers.

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: Encrypted Sync Engine                             │
│  TCP transport · AES-256-GCM payload · LWW conflict resolve │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Secure Pairing                                    │
│  QR code or PIN exchange → trusted_devices.json             │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Peer Discovery                                    │
│  mDNS/DNS-SD (_moodhaven._tcp.local) · zero config           │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Device Identity                                   │
│  Ed25519 key pair · stable deviceId per device              │
└─────────────────────────────────────────────────────────────┘
```

Pair once via QR code or PIN in **Settings → Devices**. After that, devices sync automatically when they see each other on the LAN.

Full protocol details: [docs/peer-sync-security.md](docs/peer-sync-security.md)

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
npm run tauri dev    # Hot-reload dev server
```

### Build with Hardware Key Support

```bash
cd src-tauri
cargo build --release --features hardware-key
```

> **Note:** Requires `libudev-dev` on Linux at compile time and `libudev1` at runtime.

Full cross-platform build guide: [docs/build.md](docs/build.md)

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
| **Testing** | [Vitest](https://vitest.dev) + Testing Library (585 tests) |
| **Build** | Vite 5 + `npm run tauri build` |

---

## Beta Testing

MoodHaven Journal is in public beta. The core feature set is complete and stable — the app is used daily in production. What beta testers can help with:

- **Try the full setup flow** — First-run wizard, password, 2FA, recovery key
- **Write entries and use Books** — Does auto-save, mood detection, and templates behave as expected?
- **Test on your OS** — Especially Windows and macOS (primary dev is on Linux)
- **Exercise peer sync** — If you have two machines on the same LAN, try pairing and syncing
- **Break it** — Edge cases, unusual input, rapid navigation, large entry counts

File issues at [GitHub Issues](https://github.com/kenlacroix/moodhaven-journal/issues). Screenshots are always appreciated.

---

## Contributing

Contributions are welcome. Areas where help is especially appreciated:

- **Security audit** — Review the encryption implementation in `src/lib/services/crypto.ts` and `src-tauri/src/db/`
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
npm run tauri dev
```

```bash
npm test                          # Run 585 tests
npm run typecheck                 # TypeScript strict check
cd src-tauri && cargo check       # Rust compilation check
```

See [CLAUDE.md](CLAUDE.md) for architectural decisions, security guidelines, and development conventions. Additional documentation: [docs/architecture.md](docs/architecture.md) · [docs/tauri-commands.md](docs/tauri-commands.md) · [docs/peer-sync-security.md](docs/peer-sync-security.md) · [CHANGELOG.md](CHANGELOG.md)

---

## Recent Changes

**v0.7.13** — Selective export with tag/mood/date filters and live entry count, `EntryStateBadge` with optimistic UI and `thinking/complete/revisit` states, date comparison fix for filtered exports, credentials stripped from filtered backup files, tags sourced from all books in export picker, 585 tests
**v0.7.12** — ISO week utilities (`getISOWeekStart`, `countEntriesThisWeek`), 8 new tests for SelectiveExportPanel, `motion-safe:` prefixed on mood-pop animation
**v0.7.11** — UI micro-animations: bar-grow on mood distribution chart, slide-up modals and drawers, staggered entry card cascades, scale tap targets on sidebar/nav/calendar, filter-change re-stagger on Timeline, 6 new tests
**v0.7.10** — SQLite WAL mode + cache pragmas, `get_full_analytics_bundle` for single-round-trip Insights load, `get_insights_metadata` for instant Tier A stats, `mood_daily_stats` trigger-maintained cache, tiered Insights page loading
**v0.7.9** — Structured logger with runtime log level selector, `tauri-plugin-log` integration, Open Log Folder in Settings, 15 new tests
**v0.7.8** — ESLint rule blocking string concatenation in logger calls
**v0.7.7** — Rebrand from MoodBloom to MoodHaven Journal: updated app identifier, database filename, mDNS service type, sync protocol keys, WebDAV directory, export format, and FIDO2 RP_ID

Full history: [CHANGELOG.md](CHANGELOG.md)

---

## License

[MIT](LICENSE) — © MoodHaven Journal contributors

---

<div align="center">
<sub>Built with care for people who write to understand themselves.</sub>
</div>
