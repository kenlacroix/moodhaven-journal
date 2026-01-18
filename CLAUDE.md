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
| Settings Panel | P2 | **Complete** | User preferences, AI config, appearance, privacy |
| AI Insights | P2 | In Progress | Privacy-focused AI insights (opt-in, OpenAI/local AI) |
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
