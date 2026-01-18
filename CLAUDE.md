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
| Mood Entry | P0 | Planned | Log daily mood with customizable scales (1-10, emoji, color) |
| Journal Entry | P0 | Planned | Rich text journaling with mood association |
| Calendar View | P1 | Planned | Visual calendar showing mood trends |
| Analytics Dashboard | P1 | Planned | Charts and insights on mood patterns |
| AI Insights | P2 | Planned | AI-generated observations from journal entries |
| Export/Import | P2 | Planned | Backup and restore data |
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

1. **Privacy First:** All AI processing should be optional
2. **Local Processing Preferred:** Use local models when possible
3. **Transparent:** Users should know when AI is used
4. **User Control:** Easy opt-out, data deletion

### Planned AI Features

#### 5.1 Mood Pattern Analysis
```typescript
interface MoodAnalysis {
  period: 'week' | 'month' | 'year';
  averageMood: number;
  trend: 'improving' | 'stable' | 'declining';
  patterns: {
    dayOfWeek: Record<string, number>;  // Mon-Sun averages
    timeOfDay: Record<string, number>;  // Morning/Afternoon/Evening
  };
  insights: string[];  // AI-generated observations
}
```

#### 5.2 Journal Prompts
```typescript
interface JournalPrompt {
  id: string;
  text: string;
  category: 'gratitude' | 'reflection' | 'goals' | 'emotions';
  contextual: boolean;  // Based on recent moods
}

// Generate contextual prompts based on mood history
async function generatePrompts(recentMoods: MoodEntry[]): Promise<JournalPrompt[]>;
```

#### 5.3 Sentiment Analysis
```typescript
interface SentimentResult {
  score: number;        // -1 to 1
  magnitude: number;    // 0 to 1 (intensity)
  keywords: string[];   // Extracted emotional keywords
  suggestedMood: number; // 1-10 scale suggestion
}

// Analyze journal entry sentiment
async function analyzeEntry(text: string): Promise<SentimentResult>;
```

#### 5.4 Weekly Summary Generation
```typescript
interface WeeklySummary {
  weekStart: Date;
  weekEnd: Date;
  moodSummary: string;      // AI-generated paragraph
  highlights: string[];     // Positive moments extracted
  challenges: string[];     // Difficult moments
  suggestions: string[];    // Wellness suggestions
}
```

### AI Implementation Options

| Option | Pros | Cons | Privacy |
|--------|------|------|---------|
| Local LLM (Ollama) | Full privacy, offline | Requires setup, slower | Excellent |
| Claude API | High quality | Requires internet, cost | Good (with consent) |
| On-device ML | Fast, private | Limited capabilities | Excellent |

### AI Feature Toggle

```typescript
// src/stores/settingsStore.ts
interface AISettings {
  enabled: boolean;
  provider: 'local' | 'claude' | 'none';
  features: {
    moodAnalysis: boolean;
    journalPrompts: boolean;
    sentimentAnalysis: boolean;
    weeklySummary: boolean;
  };
  dataConsent: {
    allowCloudProcessing: boolean;
    consentDate: Date | null;
  };
}
```

---

## 6. Development Tasks

### Current Sprint

<!-- Update this section as development progresses -->

```markdown
## Sprint: Foundation Setup
Duration: Week 1-2

### Completed
- [ ] Project structure setup
- [ ] Tauri + React + TypeScript scaffolding
- [ ] TailwindCSS configuration
- [ ] Basic window and navigation

### In Progress
- [ ] Data models definition
- [ ] SQLite database setup
- [ ] Encryption module

### Blocked
- None

### Upcoming
- [ ] Mood entry UI
- [ ] Basic journal editor
```

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
