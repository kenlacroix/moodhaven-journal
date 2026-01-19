# MoodBloom

A calm, secure mood tracking and journaling app for your desktop.

**MoodBloom** is a privacy-first desktop application for mood tracking and journaling. Your entries are encrypted locally, never leave your device without your consent, and optional AI features respect your privacy by design.

![Version](https://img.shields.io/badge/version-0.3.3-violet)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

### Core Features
- **Mood Tracking** - Log your daily mood with a simple 5-level emoji scale
- **Encrypted Journaling** - Write freely knowing your entries are encrypted with AES-256-GCM
- **Calendar View** - Visual calendar showing your mood patterns across days and weeks
- **Analytics Dashboard** - Charts, trends, streaks, and weekly mood patterns
- **Dark/Light Mode** - Automatic system detection or manual toggle

### Privacy & Security
- **Local-First Storage** - All data stays on your device in an encrypted SQLite database
- **Strong Encryption** - AES-256-GCM with PBKDF2 key derivation (600,000 iterations)
- **No Telemetry** - Zero tracking, analytics, or data collection
- **Export/Backup** - Encrypted backup files you fully control
- **Factory Reset** - Complete data wipe when needed

### Journal Templates
MoodBloom includes 7 guided writing templates:
- **Gratitude** - Focus on the positives
- **Happiness** - Capture joyful moments
- **Rest & Recovery** - Reflect on self-care
- **Grounding** - Find calm through mindfulness
- **Daily Reflection** - Review your day
- **Goals & Dreams** - Plan your future
- **Free Write** - Unstructured journaling

### Optional AI Features (Privacy-First)
- AI insights that **never send your actual journal text**
- Only anonymized metadata (mood scores, patterns) shared when enabled
- Support for OpenAI API (bring your own key) or local AI (Ollama)
- Completely optional - disabled by default

---

## Installation

### Download Pre-Built Releases

Download the latest release for your platform from the [Releases](https://github.com/yourusername/moodbloom/releases) page:

| Platform | File | Notes |
|----------|------|-------|
| **Windows** | `MoodBloom_x.x.x_x64-setup.exe` | Windows 10/11 |
| **macOS** | `MoodBloom_x.x.x_x64.dmg` | macOS 10.15+ |
| **Linux** | `moodbloom_x.x.x_amd64.AppImage` | Most distributions |
| **Linux (Debian)** | `moodbloom_x.x.x_amd64.deb` | Ubuntu, Debian, etc. |

### Build from Source

#### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) toolchain
- Platform-specific dependencies (see below)

#### Linux (Ubuntu/Debian)
```bash
# Install system dependencies
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Clone and build
git clone https://github.com/yourusername/moodbloom.git
cd moodbloom
npm install
npm run tauri build
```

#### Windows
1. Install [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/downloads/) with "Desktop development with C++"
2. WebView2 Runtime is usually pre-installed on Windows 10/11

```powershell
git clone https://github.com/yourusername/moodbloom.git
cd moodbloom
npm install
npm run tauri build
```

#### macOS
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Clone and build
git clone https://github.com/yourusername/moodbloom.git
cd moodbloom
npm install
npm run tauri build
```

---

## Getting Started

### First Run
1. **Launch MoodBloom** - The setup wizard will guide you through initial configuration
2. **Create a Password** - This encrypts all your journal entries (8+ characters required)
3. **Choose Storage** - Local storage is recommended and fully secure
4. **Optional: Import Backup** - Restore from a previous MoodBloom backup file

> **Important:** Remember your password! Without it, your encrypted entries cannot be recovered.

### Daily Use

#### Creating an Entry
1. Open MoodBloom
2. Select your current mood using the emoji scale
3. Optionally choose a **journal template** to guide your writing
4. Write your thoughts in the editor
5. Click **Save Entry** or press `Ctrl+Enter`

#### Viewing Your History
- **Calendar View** - See your mood patterns visually across the month
- **Entry List** - Browse all your past entries
- **Analytics** - View trends, streaks, and patterns

#### Using Templates
1. Click **Templates** button when creating a new entry
2. Choose a template that fits your current needs
3. The template prompts will guide your reflection
4. Edit or add to the suggested structure as desired

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Save entry |
| `Ctrl+N` | New entry |
| `Ctrl+,` | Open settings |
| `Arrow Keys` | Navigate settings tabs |

---

## Settings

Access settings via the gear icon in the navigation.

### General
- **Appearance** - Light/Dark mode or system default
- **Language** - Interface language selection

### Privacy
- **Data Management** - Export backups, factory reset
- **AI Processing** - Enable/disable AI features

### AI Features
- **API Configuration** - Enter your OpenAI API key (optional)
- **Local AI** - Configure Ollama for fully offline AI (optional)
- **Feature Toggles** - Enable specific AI features

### About
- Version information
- Links to documentation and support

---

## Data & Privacy

### What's Encrypted
- All journal entry content
- Mood data associated with entries
- Backup export files

### What's Stored Locally
- Encrypted entries in SQLite database
- Settings preferences (unencrypted, non-sensitive)
- Encryption salt (no password stored)

### AI Privacy (When Enabled)
When you opt into AI features, MoodBloom uses a **metadata-only** approach:

**Sent to AI:**
- Mood scores (numbers only)
- General patterns (e.g., "writes daily", "mood improving")
- Time-of-day preferences

**Never sent:**
- Actual journal text
- Specific events or situations
- Names, places, or personal details

---

## Backup & Restore

### Creating a Backup
1. Go to **Settings** > **Privacy** > **Data Management**
2. Click **Export Data**
3. Enter your encryption password
4. Save the `.moodbloom` file to a safe location

### Restoring from Backup
1. During first run, choose **Import Existing Backup**
2. Or go to **Settings** > **Privacy** > **Data Management** > **Import**
3. Select your `.moodbloom` backup file
4. Enter the password used when the backup was created

---

## Version History

### v0.3.3 (Current)
- Comprehensive user documentation
- Cross-platform build guide
- Updated developer documentation

### v0.3.2
- Added 7 journal templates for guided writing
- Template selector in journal editor

### v0.3.1
- Added export/import functionality with encrypted backups
- Added factory reset with confirmation

### v0.3.0
- Added first-run setup wizard
- Storage backend selection (local, cloud coming soon)

### v0.2.2
- Settings page refactored with tabs and search
- Added data management section

### v0.2.1
- Fixed critical bug: app freeze when saving entries

### v0.2.0
- Added calendar view with mood heatmap
- Added analytics dashboard
- Added AI insights (privacy-first)

### v0.1.0
- Initial release
- Mood tracking and encrypted journaling

---

## Tech Stack

- **Frontend:** React 18 + TypeScript + TailwindCSS
- **Desktop:** Tauri 2 (Rust backend)
- **Database:** SQLite with encryption
- **Encryption:** AES-256-GCM, PBKDF2
- **State:** Zustand

---

## Contributing

Contributions are welcome! Areas where help is appreciated:
- UI/UX improvements
- Security audits
- Accessibility enhancements
- Documentation and translations

Please open an issue to discuss changes before submitting a PR.

---

## License

MIT License - See [LICENSE](LICENSE) for details.

---

## Support

- **Issues:** [GitHub Issues](https://github.com/yourusername/moodbloom/issues)
- **Documentation:** See [CLAUDE.md](CLAUDE.md) for technical details

---

*MoodBloom - A calm space for your thoughts.*
