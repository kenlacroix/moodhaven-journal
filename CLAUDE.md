# MoodBloom - AI Assistant Documentation

> This document provides context and guidelines for AI assistants (Claude) working on the MoodBloom project.

## Project Overview

**MoodBloom** is a cross-platform desktop application for mood tracking and journaling with AI-powered insights. Built with Tauri (Rust backend) + React + TypeScript + TailwindCSS.

**Target Platforms:** Windows, Linux, macOS

---

## 1. Feature Planning

### Core Features

| Feature | Priority | Status | Description |
|---------|----------|--------|-------------|
| Mood Entry | P0 | **Complete** | Log daily mood with 5-level scale (emoji, color) |
| Journal Entry | P0 | **Complete** | Encrypted journaling with mood association |
| Calendar View | P1 | **Complete** | Visual calendar showing mood trends by day |
| Analytics Dashboard | P1 | **Complete** | Charts: distribution, trends, streaks, weekly patterns |
| Settings Panel | P2 | **Complete** | Tabbed settings with search, data management |
| AI Insights | P2 | **Complete** | Privacy-focused AI insights (opt-in, OpenAI/local AI) |
| First-Run Wizard | P2 | **Complete** | Welcome, password setup, storage selection, import |
| Export/Import | P2 | **Complete** | Encrypted backup and restore functionality |
| Journal Templates | P2 | **Complete** | 7 templates: Gratitude, Happiness, Rest, etc. |
| Factory Reset | P2 | **Complete** | Complete data wipe with confirmation |
| 2FA Support | P2 | **Complete** | TOTP + native FIDO2 hardware key (not WebAuthn browser APIs) |
| Recovery Key | P2 | **Complete** | Optional recovery key generation during setup |
| Reminders | P3 | Planned | Configurable notification reminders |

### Feature Implementation Guidelines

When implementing features:
1. Start with the data model in `src/types/`
2. Create Tauri commands in `src-tauri/src/commands/`
3. Build React components in `src/features/<feature-name>/`
4. Add state management in `src/stores/`
5. Connect UI to backend via `src/lib/tauri.ts`

### Feature Request Template

```markdown
## Feature: [Name]
**Priority:** P0/P1/P2/P3
**User Story:** As a user, I want to [action] so that [benefit].

### Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

### Technical Considerations
- Data model changes:
- Backend commands needed:
- UI components:

### Security Considerations
- [ ] Data encrypted at rest?
- [ ] No sensitive data in logs?
```

---

## 2. Security Guidance

### Zero-Knowledge Security Model

MoodBloom implements a zero-knowledge security architecture where user data is encrypted client-side with keys derived from the user's password. This means:

**Core Principles:**
- **No Backdoors:** There are no master keys, admin passwords, or recovery mechanisms that bypass encryption.
- **Password-Derived Keys:** All encryption keys are derived from the user's password using PBKDF2 (600,000 iterations).
- **Client-Side Encryption:** Data is encrypted before storage. The backend never sees plaintext data.
- **No Password Storage:** Only a salted hash is stored for password verification. The password itself is never stored.

**Two Paths from Locked State:**
1. **Unlock with Password (+2FA):** Enter correct password (and 2FA if enabled) to decrypt and access data.
2. **Erase & Start Fresh:** Securely delete all data and reset the app. No password required. Available via "Forgot password?" on lock screen.

**Optional Recovery Key:**
- Users can opt-in to generate a recovery key during setup.
- The recovery key is a 24-character code (XXXX-XXXX-XXXX-XXXX-XXXX-XXXX).
- It encrypts a copy of the user's password for recovery purposes (key escrow).
- The recovery key is shown only once and must be stored securely by the user.
- This is the ONLY way to recover access if the password is forgotten.

**Hardware Security Key (Native FIDO2):**
- Optional second factor using YubiKey or similar FIDO2 devices.
- Uses native Rust CTAP2/HID libraries, NOT browser WebAuthn APIs.
- Browser WebAuthn does not work in Tauri WebView - this is by design.
- Hardware key acts as a local unlock factor, NOT password recovery.
- Both password AND hardware key are required when enabled.
- If password is lost, data is still unrecoverable (hardware key doesn't bypass encryption).
- Implementation: `src-tauri/src/commands/hardware_key.rs` + `src/lib/hardwareKeyService.ts`
- **Feature Flag:** This feature is optional and requires the `hardware-key` cargo feature.
- **Build with feature:** `cargo build --features hardware-key`
- **Build Requirements (compile-time):**
  - Linux: `sudo apt-get install libudev-dev`
  - macOS: No additional dependencies
  - Windows: No additional dependencies
- **Runtime Requirements:**
  - Linux: `libudev1` (checked at runtime, shows install instructions if missing)
  - macOS: No additional dependencies (uses IOKit)
  - Windows: No additional dependencies (uses native HID APIs)
- **UI Behavior:** If feature is not compiled in OR runtime dependencies are missing, the UI displays platform-specific installation instructions.

**Important Security Notices:**
- **Forgotten passwords cannot be recovered** (unless recovery key was generated).
- There is no email reset, cloud recovery, or master key.
- Users must understand and accept this when setting up the app.

### Data Protection Principles

1. **Local-First:** All user data stays on device. No cloud sync by default.
2. **Encryption at Rest:** Journal entries and mood data must be encrypted.
3. **No Telemetry:** No analytics or tracking without explicit user consent.
4. **Minimal Permissions:** Request only necessary system permissions.

### Security Checklist for New Features

- [ ] Sensitive data encrypted before storage
- [ ] No hardcoded secrets or keys
- [ ] User input sanitized (prevent injection attacks)
- [ ] File paths validated (prevent path traversal)
- [ ] Error messages don't leak sensitive information
- [ ] Tauri commands use proper permission scopes

### Tauri Security Configuration

```json
// tauri.conf.json security settings
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self'",
      "dangerousDisableAssetCspModification": false
    }
  }
}
```

### Forbidden Patterns

```typescript
// NEVER do this:
eval(userInput);                          // Code injection
fs.readFile(userProvidedPath);            // Path traversal
localStorage.setItem('key', password);    // Unencrypted secrets
console.log(userData);                    // Sensitive data in logs
```

---

## 3. UI/UX Guidelines

### Design Principles

1. **Calm & Welcoming:** Soft colors, gentle animations, no harsh contrasts
2. **Accessibility First:** WCAG 2.1 AA compliance minimum
3. **Responsive:** Works on various window sizes (min 800x600)
4. **Keyboard Navigable:** All features accessible via keyboard
5. **Dark/Light Mode:** System preference detection + manual toggle

### Color Palette

```css
/* TailwindCSS color tokens */
:root {
  /* Primary - Calming blue/purple */
  --color-primary-50: #f5f3ff;
  --color-primary-500: #8b5cf6;
  --color-primary-900: #4c1d95;

  /* Mood colors */
  --mood-excellent: #10b981;  /* green */
  --mood-good: #84cc16;       /* lime */
  --mood-neutral: #eab308;    /* yellow */
  --mood-low: #f97316;        /* orange */
  --mood-bad: #ef4444;        /* red */
}
```

### Component Patterns

```tsx
// Consistent component structure
interface ComponentProps {
  // Required props first
  value: string;
  onChange: (value: string) => void;
  // Optional props with defaults
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  className?: string;
}

export function Component({
  value,
  onChange,
  variant = 'primary',
  disabled = false,
  className
}: ComponentProps) {
  return (
    <div className={cn('base-styles', variantStyles[variant], className)}>
      {/* content */}
    </div>
  );
}
```

### Animation Guidelines

- Use `transition-all duration-200` for micro-interactions
- Use `duration-300` for page transitions
- Respect `prefers-reduced-motion` media query
- Avoid animations that could trigger motion sickness

---

## 4. Encryption Implementation

### Overview

MoodBloom uses AES-256-GCM encryption for all sensitive data stored locally.

### Encryption Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User Master Password                  │
└─────────────────────┬───────────────────────────────────┘
                      │ Argon2id KDF
                      ▼
┌─────────────────────────────────────────────────────────┐
│                    Master Key (256-bit)                  │
└─────────────────────┬───────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  Data Key (DEK) │     │  Backup Key     │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│ Journal Entries │     │ Encrypted Export│
│   Mood Data     │     │                 │
└─────────────────┘     └─────────────────┘
```

### Rust Encryption Example

```rust
// src-tauri/src/crypto/mod.rs
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce
};
use argon2::{Argon2, password_hash::SaltString};

pub struct CryptoManager {
    cipher: Aes256Gcm,
}

impl CryptoManager {
    /// Derive key from password using Argon2id
    pub fn from_password(password: &str, salt: &[u8]) -> Result<Self, CryptoError> {
        let argon2 = Argon2::default();
        let mut key = [0u8; 32];

        argon2.hash_password_into(
            password.as_bytes(),
            salt,
            &mut key
        )?;

        let cipher = Aes256Gcm::new_from_slice(&key)?;
        Ok(Self { cipher })
    }

    /// Encrypt data with random nonce
    pub fn encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
        let nonce_bytes: [u8; 12] = rand::random();
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = self.cipher.encrypt(nonce, plaintext)?;

        // Prepend nonce to ciphertext
        let mut result = nonce_bytes.to_vec();
        result.extend(ciphertext);
        Ok(result)
    }

    /// Decrypt data (nonce is first 12 bytes)
    pub fn decrypt(&self, data: &[u8]) -> Result<Vec<u8>, CryptoError> {
        if data.len() < 12 {
            return Err(CryptoError::InvalidData);
        }

        let (nonce_bytes, ciphertext) = data.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);

        self.cipher.decrypt(nonce, ciphertext)
            .map_err(|_| CryptoError::DecryptionFailed)
    }
}
```

### TypeScript Interface

```typescript
// src/lib/crypto.ts
import { invoke } from '@tauri-apps/api/core';

export async function encryptData(data: string): Promise<Uint8Array> {
  return invoke('encrypt_data', { data });
}

export async function decryptData(encrypted: Uint8Array): Promise<string> {
  return invoke('decrypt_data', { encrypted });
}

export async function initializeEncryption(password: string): Promise<boolean> {
  return invoke('init_encryption', { password });
}

export async function verifyPassword(password: string): Promise<boolean> {
  return invoke('verify_password', { password });
}
```

### Key Storage

- **Never** store the master password
- Store password-derived salt in app config
- Use OS keychain for session key caching (optional)
- Clear keys from memory on app lock/close

---

## 5. AI Journaling Features

### AI Integration Philosophy

1. **Privacy First:** Never send actual journal content to external APIs
2. **Metadata Only:** Send only aggregated mood data, sentiment summaries, general tone
3. **Opt-In:** AI features disabled by default, require explicit user consent
4. **Transparent:** Clear disclosure of what data is processed and how
5. **Pro Feature:** AI insights planned as premium/paid feature for monetization
6. **User Choice:** Support both OpenAI API (BYOK) and local AI (Ollama) for maximum privacy

### Privacy-Preserving AI Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User's Journal Entry                      │
│              (NEVER sent to external APIs)                   │
└─────────────────────┬───────────────────────────────────────┘
                      │ Local Processing Only
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Local Metadata Extraction                       │
│  - Mood value (1-5)                                         │
│  - General sentiment (positive/negative/neutral)            │
│  - Word count, entry frequency                              │
│  - Time patterns (morning/evening)                          │
│  - Emotional keywords (locally extracted, not content)      │
└─────────────────────┬───────────────────────────────────────┘
                      │ Anonymized metadata only
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    OpenAI API                                │
│  Receives: "User has 3.2 avg mood, declining trend,         │
│            writes mostly evenings, frequent anxiety words"   │
│  Returns: Personalized prompts, wellness suggestions         │
└─────────────────────────────────────────────────────────────┘
```

### What Gets Sent to AI (Allowed)

- Mood scores (numerical values only)
- General sentiment classification (positive/negative/neutral)
- Entry frequency patterns (e.g., "writes daily", "inconsistent")
- Time-of-day patterns (e.g., "mostly evening entries")
- Aggregated statistics (averages, trends, streaks)
- Extracted emotional categories (e.g., "anxiety-related", "gratitude-focused")

### What NEVER Gets Sent (Forbidden)

- Actual journal text content
- Specific events or situations described
- Names, places, or identifiable information
- Direct quotes or excerpts
- Personal details or context

### Planned AI Features

#### 5.1 Contextual Journal Prompts
```typescript
interface AIPromptRequest {
  recentMoodAverage: number;
  moodTrend: 'improving' | 'stable' | 'declining';
  dominantEmotions: string[];  // e.g., ['anxious', 'hopeful']
  entryFrequency: 'daily' | 'weekly' | 'sporadic';
  preferredTime: 'morning' | 'afternoon' | 'evening';
}

interface JournalPrompt {
  id: string;
  text: string;
  category: 'gratitude' | 'reflection' | 'goals' | 'emotions' | 'self-care';
  reasoning: string;  // Why this prompt was suggested
}
```

#### 5.2 Wellness Insights
```typescript
interface WellnessInsight {
  type: 'observation' | 'suggestion' | 'celebration';
  message: string;
  basedOn: string;  // e.g., "Your 7-day mood trend"
  actionable: boolean;
}

// Example: "Your mood tends to be higher on days you journal in the morning.
// Consider making morning journaling a habit."
```

#### 5.3 Weekly Reflection Prompts
```typescript
interface WeeklyReflection {
  weekSummary: {
    moodRange: [number, number];
    averageMood: number;
    entryCount: number;
  };
  reflectionPrompts: string[];  // AI-generated based on week's patterns
  suggestedFocus: string;       // Area to focus on next week
}
```

### Implementation: OpenAI Integration

```typescript
// src/lib/aiService.ts
interface AIConfig {
  apiKey: string;           // User provides their own key OR uses app subscription
  model: 'gpt-4o-mini';     // Cost-effective model for prompts
  maxTokens: 500;           // Limit response size
}

interface MetadataSummary {
  periodDays: number;
  moodStats: {
    average: number;
    trend: 'up' | 'down' | 'stable';
    distribution: Record<1|2|3|4|5, number>;
  };
  patterns: {
    bestDayOfWeek: string;
    worstDayOfWeek: string;
    preferredTime: string;
    consistency: 'high' | 'medium' | 'low';
  };
  emotionalIndicators: string[];  // Locally extracted, not content
}

async function generateInsights(metadata: MetadataSummary): Promise<WellnessInsight[]>;
async function generatePrompts(metadata: MetadataSummary): Promise<JournalPrompt[]>;
```

### AI Settings Store

```typescript
// src/stores/aiSettingsStore.ts
interface AISettings {
  enabled: boolean;                    // Master toggle (default: false)
  apiKeySource: 'user' | 'subscription' | null;
  userApiKey: string | null;           // Encrypted storage
  features: {
    contextualPrompts: boolean;
    wellnessInsights: boolean;
    weeklyReflections: boolean;
  };
  consent: {
    agreedToTerms: boolean;
    consentDate: Date | null;
    dataUsageUnderstood: boolean;
  };
  subscription: {
    tier: 'free' | 'pro' | null;
    validUntil: Date | null;
  };
}
```

### Monetization Strategy

| Tier | AI Features | Price |
|------|-------------|-------|
| Free | None (all local analytics) | $0 |
| Pro | Full AI insights, prompts, weekly reflections | TBD |
| BYOK | User provides own OpenAI key | $0 (user pays OpenAI) |

---

## 6. Development Tasks

### Current Sprint

<!-- Update this section as development progresses -->

```markdown
## Sprint: Phase 4 (Polish & Release Prep)
Duration: Week 5

### Completed
- [x] Project structure setup
- [x] Tauri + React + TypeScript scaffolding
- [x] TailwindCSS configuration
- [x] Basic window and navigation
- [x] Data models definition
- [x] SQLite database with triggers
- [x] AES-256-GCM encryption module (PBKDF2, 600k iterations)
- [x] Mood entry UI (5-level emoji scale)
- [x] Journal editor with encryption
- [x] Calendar view with mood heatmap
- [x] Analytics dashboard (charts, streaks, patterns)
- [x] Settings panel (AI, appearance, privacy)
- [x] Privacy-first AI insights (metadata-only)
- [x] Local sentiment/emotion extraction
- [x] Bug fix: Journal save freeze (v0.2.1)
- [x] First-run wizard (welcome, password, storage)
- [x] Export/import functionality
- [x] Settings page improvements (tabs, search)
- [x] Journal templates (7 templates)
- [x] Factory reset function

### In Progress
- [ ] Cross-platform build testing
- [ ] User documentation

### Blocked
- None

### Upcoming
- [ ] 2FA support (optional)
- [ ] Cloud storage backends (Dropbox, WebDAV)
- [ ] Reminders/notifications
```

### Known Issues (Fixed)

| Issue | Version Fixed | Description |
|-------|---------------|-------------|
| Journal save freeze | v0.2.1 | App would become unresponsive when saving entries due to Rust Mutex deadlock |

### Technical Notes

#### Journal Save Freeze Fix (v0.2.1)
- **Root Cause:** `std::sync::Mutex` in Rust is non-reentrant. `create_entry` and `update_entry` were acquiring the database mutex lock, then calling `get_entry` which tried to acquire the same lock, causing a deadlock.
- **Solution:** Modified both functions to query directly using the existing connection instead of calling separate functions that acquire new locks.
- **Files Changed:** `src-tauri/src/db/mod.rs`

### Task Templates

#### Bug Report
```markdown
## Bug: [Title]
**Severity:** Critical/High/Medium/Low
**Reproducible:** Always/Sometimes/Rare

### Steps to Reproduce
1.
2.
3.

### Expected Behavior

### Actual Behavior

### Environment
- OS:
- App Version:

### Screenshots/Logs
```

#### Implementation Task
```markdown
## Task: [Title]
**Type:** Feature/Enhancement/Refactor/Chore
**Estimated Complexity:** S/M/L/XL

### Description

### Technical Approach

### Files to Modify
-

### Testing Plan
- [ ] Unit tests
- [ ] Integration tests
- [ ] Manual testing

### Definition of Done
- [ ] Code complete
- [ ] Tests passing
- [ ] No TypeScript errors
- [ ] Reviewed
```

### Code Quality Standards

1. **TypeScript:** Strict mode, no `any` types
2. **Testing:** Unit tests for utilities, integration tests for features
3. **Linting:** ESLint + Prettier, pre-commit hooks
4. **Commits:** Conventional commits format (`feat:`, `fix:`, `chore:`)
5. **PR Size:** Max 400 lines changed per PR

### Build & Release Checklist

```markdown
## Release v[X.Y.Z]

### Pre-Release
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] CHANGELOG updated
- [ ] Version bumped in package.json and Cargo.toml
- [ ] Security audit (npm audit, cargo audit)

### Build
- [ ] Windows build successful
- [ ] macOS build successful
- [ ] Linux build successful

### Post-Release
- [ ] GitHub release created
- [ ] Release notes published
- [ ] Download links verified
```

---

## 7. Cross-Platform Build Guide

### Prerequisites

All platforms require:
- Node.js 18+ and npm
- Rust toolchain (rustup, cargo)
- Platform-specific build tools (see below)

### Linux Build

```bash
# Install dependencies (Ubuntu/Debian)
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Optional: For hardware key support (FIDO2/YubiKey)
sudo apt install -y libudev-dev

# Build (standard, without hardware key support)
npm install
npm run tauri build

# Build with hardware key support enabled
cd src-tauri && cargo build --release --features hardware-key

# Output: src-tauri/target/release/bundle/
# - AppImage: moodbloom_x.x.x_amd64.AppImage
# - Debian: moodbloom_x.x.x_amd64.deb
```

### Windows Build

```powershell
# Install dependencies
# - Visual Studio Build Tools 2022 with "Desktop development with C++"
# - WebView2 Runtime (usually pre-installed on Windows 10/11)

# Build
npm install
npm run tauri build

# Output: src-tauri/target/release/bundle/
# - MSI installer: moodbloom_x.x.x_x64_en-US.msi
# - NSIS installer: moodbloom_x.x.x_x64-setup.exe
```

### macOS Build

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Build
npm install
npm run tauri build

# Output: src-tauri/target/release/bundle/
# - .app bundle: MoodBloom.app
# - DMG installer: MoodBloom_x.x.x_x64.dmg

# For universal binary (Intel + Apple Silicon):
npm run tauri build -- --target universal-apple-darwin
```

### Code Signing

#### Windows
Set environment variables before building:
```powershell
$env:TAURI_PRIVATE_KEY = "path/to/private-key.pem"
$env:TAURI_KEY_PASSWORD = "your-password"
```

#### macOS
```bash
# Notarization (requires Apple Developer account)
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="XXXXXXXXXX"
```

### Build Troubleshooting

| Issue | Solution |
|-------|----------|
| Rust compilation errors | Run `rustup update` |
| WebKit not found (Linux) | Install `libwebkit2gtk-4.1-dev` |
| `libudev` not found (Linux) | Install `libudev-dev` OR build without hardware key feature |
| Hardware key feature fails | Either install `libudev-dev` or omit `--features hardware-key` |
| Code signing failed | Check certificate/key paths |
| Bundle too large | Enable `strip = true` in Cargo.toml (already configured) |

### Release Checklist

```markdown
## Pre-Release
- [ ] Version bumped in package.json, Cargo.toml, tauri.conf.json
- [ ] CLAUDE.md updated with changes
- [ ] `npm run typecheck` passes
- [ ] `cargo check` passes
- [ ] Test on clean install

## Build & Test
- [ ] Linux: AppImage works on Ubuntu 22.04+
- [ ] Windows: MSI installs on Windows 10/11
- [ ] macOS: DMG installs on macOS 10.15+

## Release
- [ ] Create GitHub release with changelog
- [ ] Upload platform binaries
- [ ] Verify download links work
```

---

## Quick Reference

### Common Commands

```bash
# Development
npm run tauri dev          # Start dev server with hot reload

# Building
npm run tauri build        # Build for current platform

# Testing
npm test                   # Run tests
npm run typecheck          # Check TypeScript

# Linting
npm run lint               # Run ESLint
npm run lint:fix           # Fix auto-fixable issues
```

### Key Files

| File | Purpose |
|------|---------|
| `src-tauri/tauri.conf.json` | Tauri app configuration |
| `src-tauri/Cargo.toml` | Rust dependencies |
| `src/App.tsx` | React app root |
| `src/stores/` | Global state management |
| `src/lib/tauri.ts` | Tauri IPC wrappers |

### Useful Links

- [Tauri v2 Docs](https://v2.tauri.app/)
- [React Docs](https://react.dev/)
- [TailwindCSS Docs](https://tailwindcss.com/docs)
- [Rust Book](https://doc.rust-lang.org/book/)

---

*Last Updated: January 2026*
