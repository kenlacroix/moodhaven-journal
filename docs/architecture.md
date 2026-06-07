# MoodHaven Journal — Architecture Reference

> **Version:** v1.6.0 (feat/cloud-sync-phase1) | **Last Updated:** 2026-06-06

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Technology Stack](#2-technology-stack)
3. [Directory Structure](#3-directory-structure)
4. [Data Model (SQLite Schema)](#4-data-model-sqlite-schema)
5. [Encryption Architecture](#5-encryption-architecture)
6. [Frontend Architecture](#6-frontend-architecture)
7. [Tauri Command Layer](#7-tauri-command-layer)
8. [Peer Sync Architecture](#8-peer-sync-architecture)
9. [Watch Companion Architecture](#9-watch-companion-architecture)
10. [Key Data Flows](#10-key-data-flows)
11. [Cloud Sync Architecture (Phase 1)](#11-cloud-sync-architecture-phase-1)

---

## 1. High-Level Overview

MoodHaven Journal is a **local-first desktop application** built on Tauri v2 (Rust backend) with a React/TypeScript frontend. All user data lives on-device in an encrypted SQLite database. No accounts, no mandatory cloud services.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        React Frontend (WebView)                      │
│  Components · Zustand Stores · Service Layer · TypeScript Types      │
│                                                                      │
│  Encryption happens here (WebCrypto API)                             │
│  Only ciphertext crosses the Tauri IPC boundary                      │
└───────────────────────────┬─────────────────────────────────────────┘
                            │  Tauri IPC (invoke / emit)
                            │  ~150 Tauri commands
┌───────────────────────────▼─────────────────────────────────────────┐
│                        Rust Backend (Tauri)                          │
│  Command handlers · Database (rusqlite) · Peer sync engine           │
│  mDNS discovery · Whisper.cpp sidecar · OS notifications            │
└─────────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────────┐
│                       Filesystem / OS                                │
│  moodhaven.db (SQLite, encrypted content)                            │
│  device.json · peer_key.bin · trusted_devices.json                  │
│  models/ (whisper.cpp model files)                                   │
│  voice_memos_incoming/ · media/                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Notes |
|:---|:---|:---|
| Desktop shell | Tauri 2 (Rust) | Native OS integration |
| Frontend | React 18 + TypeScript | Strict mode |
| Styling | TailwindCSS | Custom colour tokens |
| Rich text | TipTap | ProseMirror-based |
| State | Zustand | 4 stores |
| Database | SQLite via rusqlite (bundled) | Single file, no server |
| Encryption | AES-256-GCM + PBKDF2 | WebCrypto API |
| Peer identity | Ed25519 (ed25519-dalek) | Device signing key |
| Peer discovery | mDNS/DNS-SD (mdns-sd) | LAN auto-discovery |
| 2FA | totp-rs + native CTAP2/HID | TOTP + hardware keys |
| Charts | Custom SVG | No charting library |
| Logging | tauri-plugin-log + `src/lib/services/logger.ts` | Rotating file (prod), stderr (dev); `set_log_level` at runtime |
| Testing | Vitest + Testing Library | 1,283 tests |
| Build | Vite 8 + Tauri CLI | |

---

## 3. Directory Structure

```
moodbloom-tauri/
├── src/                        # React frontend
│   ├── App.tsx                 # Root: routing, lock screen, first-run wizard
│   ├── components/             # UI components by feature
│   │   ├── editor/             # RichTextEditor + EditorToolbar, EditorRecording, EditorLinkDialog, EditorIcons, EditorStyles.css
│   │   ├── journal/            # MoodSelector, TemplateSelector, EntryActionsMenu …
│   │   ├── layout/             # TopBar, Sidebar + SidebarHeader/Navigation/Books/Prompts, MainLayout
│   │   ├── peer-sync/          # DevicesTab + sub-components, PairingModal + sub-components
│   │   ├── search/             # SearchModal (Ctrl+K)
│   │   ├── sync/               # SyncDetailsModal
│   │   ├── voice-memo/         # VoiceMemoDraftCard, VoiceDraftEditor
│   │   ├── writing/            # AppearanceDrawer (font/size/tint/a11y)
│   │   ├── oura/               # OuraConnectionCard, HealthContextBadge
│   │   └── settings/           # SettingsPage tabs + Privacy sub-sections
│   ├── features/               # Full page views
│   │   ├── writing/            # WritingView (main editor)
│   │   ├── timeline/           # TimelineView (All Entries)
│   │   ├── calendar/           # CalendarPage
│   │   ├── insights/           # InsightsPage (AI + analytics)
│   │   └── onthisday/          # OnThisDayView
│   ├── hooks/                  # React hooks (business logic)
│   ├── stores/                 # Zustand stores
│   ├── lib/                    # Service modules + utilities
│   │   ├── services/           # IPC wrappers, crypto, sync, AI, STT, …
│   │   └── backend/            # Browser-mode IndexedDB backend
│   │       ├── browser.ts      # All IDB operations
│   │       ├── browser-invoke.ts  # invoke() shim routing Tauri commands → IDB
│   │       └── browser-stubs.ts   # No-op stubs for Tauri-only plugins
│   ├── types/                  # TypeScript type definitions
│   └── test/                   # Test setup and mocks
│
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── lib.rs              # Tauri builder + command registration
│   │   ├── commands/           # ~21 command modules (~150 commands)
│   │   ├── db/
│   │   │   └── mod.rs          # SQLite schema, migrations, Database struct
│   │   └── crypto/             # Rust-side crypto helpers (if any)
│   ├── capabilities/
│   │   └── default.json        # Tauri ACL — permitted commands + plugins
│   └── tauri.conf.json         # App metadata, window config, sidecar config
│
├── docs/                       # Architecture + planning docs
├── scripts/                    # Python tooling (ai_code_scan.py, etc.)
├── CLAUDE.md                   # AI assistant reference
├── CHANGELOG.md                # Version history
├── CONTRIBUTING.md             # Contributor guide
└── SECURITY.md                 # Security policy
```

---

## 4. Data Model (SQLite Schema)

The database lives at `{app_data_dir}/moodhaven.db`. Schema is created/migrated in `Database::new()` using `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE … ADD COLUMN` for additive migrations.

### Core Tables

```sql
journal_entries (
  id           TEXT PRIMARY KEY,
  content      TEXT NOT NULL,          -- AES-256-GCM ciphertext (JSON: {iv, data, salt})
  mood         INTEGER NOT NULL,       -- 1–5 (stored plaintext for analytics)
  privacy_mode INTEGER DEFAULT 0,      -- 0=Open 1=Mindful 2=Private
  location_weather TEXT,               -- JSON: {city, temp, weatherCode, unit}
  book_id      TEXT NOT NULL DEFAULT 'default',
  pinned       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,          -- ISO 8601 UTC
  updated_at   TEXT NOT NULL,          -- ISO 8601 UTC
  -- Time capsule columns (v0.7.5, additive migration)
  sealed_until       TEXT,             -- ISO 8601 UTC; NULL = not sealed or auto-anniversary
  capsule_type       TEXT,             -- 'letter' | 'vault' | 'anniversary'
  linked_original_id TEXT,             -- ID of entry this response is linked to
  unsealed_at        TEXT              -- ISO 8601 UTC; set by unseal_entry
)

books (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  emoji        TEXT NOT NULL DEFAULT '📔',
  color        TEXT NOT NULL DEFAULT '#8b5cf6',
  description  TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  settings     TEXT,                   -- JSON BookSettings blob
  created_at   TEXT NOT NULL
)

settings (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL
)
-- Key examples: password_hash, password_salt, totp_secret, webdav_url,
--               openai_api_key, oura_pat, app_settings (JSON blob)
```

### Tags

```sql
tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
)

entry_tags (
  entry_id TEXT REFERENCES journal_entries(id) ON DELETE CASCADE,
  tag_id   INTEGER REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
)
```

### Activity Tagging

```sql
activities (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  emoji         TEXT NOT NULL DEFAULT '🏷️',
  is_predefined INTEGER NOT NULL DEFAULT 0,   -- 1 = seeded at startup, cannot be deleted
  created_at    TEXT NOT NULL
)

entry_activities (
  entry_id    TEXT REFERENCES journal_entries(id) ON DELETE CASCADE,
  activity_id TEXT REFERENCES activities(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, activity_id)
)
```

15 activities are seeded on first launch (Exercise, Social, Work, Reading, Creative, Meditation, Good Sleep, Poor Sleep, Nature, Family, Cooking, Music, Learning, Travel, Gaming). Users can add up to 50 custom activities. `idx_entry_activities_entry` index on `entry_id` keeps correlated subquery cost constant.

### Authentication

```sql
two_factor_auth (
  id           INTEGER PRIMARY KEY,
  method       TEXT NOT NULL,           -- 'totp' | 'hardware_key'
  secret       TEXT,                    -- encrypted TOTP secret
  backup_codes TEXT,                    -- JSON array of hashed codes
  enabled      INTEGER DEFAULT 0,
  created_at   TEXT NOT NULL
)
```

### Health & Watch

```sql
oura_health_context (
  id           TEXT PRIMARY KEY,
  date         TEXT UNIQUE NOT NULL,    -- YYYY-MM-DD
  data         TEXT NOT NULL,           -- JSON HealthContext blob
  synced_at    TEXT NOT NULL
)

voice_memos (
  id           TEXT PRIMARY KEY,
  timestamp    TEXT NOT NULL,
  duration_ms  INTEGER NOT NULL,
  file_path    TEXT NOT NULL,           -- absolute path in app_data_dir
  health_json  TEXT,                    -- JSON health context at record time
  transcription TEXT,                   -- whisper.cpp output (populated async)
  entry_id     TEXT,                    -- set after linking to a journal entry
  created_at   TEXT NOT NULL,
  -- Phase 5 draft pipeline columns (v1.2.0, additive migration)
  context      TEXT,                    -- JSON biometric context chip (hr, steps, activity)
  inferred_mood INTEGER,                -- 1–5 auto-inferred via scoreContentMood; NULL = not yet inferred
  book_id      TEXT DEFAULT 'default',  -- target book when published as a journal entry
  reviewed     INTEGER NOT NULL DEFAULT 0  -- 0=pending, 1=reviewed (published or discarded)
)

signals (
  id           TEXT PRIMARY KEY,
  timestamp    TEXT NOT NULL,
  signal_type  TEXT NOT NULL,           -- 'mood_tap' | 'health_snapshot' | …
  source       TEXT NOT NULL,           -- 'wear_os' | 'oura' | 'manual'
  payload      TEXT NOT NULL,           -- AES-256-GCM ciphertext
  created_at   TEXT NOT NULL
)

signal_entry_links (
  signal_id    TEXT REFERENCES signals(id) ON DELETE CASCADE,
  entry_id     TEXT REFERENCES journal_entries(id) ON DELETE CASCADE,
  PRIMARY KEY (signal_id, entry_id)
)

still_signal_links (                -- v1.5.0 Wrist Loop
  session_id   TEXT NOT NULL REFERENCES still_sessions(id) ON DELETE CASCADE,
  signal_id    TEXT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, signal_id)
)
```

### Media

```sql
media_attachments (
  id           TEXT PRIMARY KEY,
  entry_id     TEXT REFERENCES journal_entries(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  file_path    TEXT NOT NULL,           -- encrypted file in app_data_dir/media/
  thumbnail_path TEXT,
  created_at   TEXT NOT NULL
)
```

### Sync

```sql
sync_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id     TEXT NOT NULL,
  action       TEXT NOT NULL,           -- 'created' | 'updated' | 'deleted'
  synced       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
)

peer_sync_state (
  peer_device_id TEXT PRIMARY KEY,
  last_sync_at   TEXT NOT NULL
)
```

---

## 5. Encryption Architecture

All encryption happens in the **frontend** using the WebCrypto API. The Rust backend stores and retrieves opaque encrypted blobs — it never sees plaintext journal content.

```
User Password
    │
    │  PBKDF2-HMAC-SHA256 (600,000 iterations + per-entry random salt)
    ▼
256-bit Encryption Key (never stored, lives in JS memory while unlocked)
    │
    ├──▶  Journal entry text  ──▶  AES-256-GCM  ──▶  SQLite `content` column
    │        (EncryptedContent: { iv: base64, data: base64, salt: base64 })
    │
    ├──▶  Signals payload     ──▶  AES-256-GCM  ──▶  SQLite `payload` column
    │
    ├──▶  Media file bytes    ──▶  AES-256-GCM  ──▶  {app_data}/media/ (encrypted file)
    │
    └──▶  Export file         ──▶  AES-256-GCM  ──▶  .moodhaven file
              (envelope: { format: 'moodhaven-encrypted-v1', payload: EncryptedData })
```

**Key properties:**
- Each entry has its own random 16-byte salt — compromising one key doesn't expose others.
- The same entry encrypted by device A can be decrypted by device B if they share the same password (enabling peer sync).
- Password verification uses a salted hash (`password_hash` + `password_salt` in `settings` table); the plaintext password is never stored.
- On lock or exit, the in-memory key is cleared.

**Stored unencrypted (intentional):**

| Field | Reason |
|:---|:---|
| `mood` (1–5) | Required for local analytics without decrypting every entry |
| `created_at`, `updated_at` | Required for calendar view, timeline ordering, and sync |
| `location_weather` | Opt-in; no journal content; required for weather chip |
| Tag names | Required for search index |
| `pinned` flag | Required for timeline ordering |
| `book_id` | Required for timeline filtering |

---

## 6. Frontend Architecture

### Stores (Zustand)

| Store | State | Notes |
|:---|:---|:---|
| `appStore` | `isInitialized`, `isUnlocked`, `theme` | Auth state machine |
| `settingsStore` | All user preferences | AI, appearance, privacy, journal, health |
| `booksStore` | `books[]`, `activeBookId` | Named journals |
| `peerSyncStore` | `identity`, `nearbyPeers`, `trustedDevices`, `isDiscovering` | Peer sync FSM |

### Hooks (Business Logic)

Hooks are the primary abstraction between stores/services and UI components. Each hook encapsulates one concern:

| Hook | Concern |
|:---|:---|
| `useJournal` | Entry CRUD, auto-save, tag sync |
| `useAnalytics` | Mood stats, streaks, day-of-week patterns |
| `useInsights` | AI insight generation, pattern nudges |
| `useJournalPrompts` | Context-aware writing prompts |
| `useCalendar` | Calendar data, daily timeline |
| `useOuraContext` | Oura health data, `buildHealthSummary()` |
| `usePeerSync` | Discovery, pairing, sync orchestration |
| `useWearVoiceMemos` | Incoming audio from Wear OS companion; post-transcription mood inference |
| `useVoiceMemoDrafts` | Draft list state, `publishDraft`, `discardDraft` |
| `useWearSignals` | Mood taps and health snapshots from watch |
| `useAudioRecorder` | Mic recording (STT input) |
| `useSpeechToText` | Model download, transcription |
| `useReminderScheduler` | Notification scheduling |
| `useUpdateCheck` | GitHub release polling |
| `useActivities` | Activity list, create/delete custom activities, sync entry links |
| `useActivityAnalytics` | Per-activity mood delta computation for correlation chart |

### Service Layer

Services (`src/lib/`) are thin IPC wrappers or pure-TS utilities. They do not hold state. Components use hooks; hooks call services.

```
Component
    │
    ▼
  Hook  (state + side effects)
    │
    ▼
 Service  (IPC calls or pure functions)
    │
    ▼
 Tauri invoke → Rust command
```

### View Routing

Navigation is handled by a `ViewType` enum in `appStore`. No URL routing library is used.

```
ViewType: writing | timeline | onthisday | insights | calendar | settings
```

Sidebar navigation order: **Write** (CTA) → **All Entries** → **On This Day** → **Insights** → **Calendar**

Settings is accessed via the gear icon in the Sidebar header, not a main nav item.

---

## 7. Tauri Command Layer

The full command reference is in [`docs/tauri-commands.md`](tauri-commands.md).

### Registration Pattern

New commands follow this pattern:

1. Define in `src-tauri/src/commands/<module>.rs`:
```rust
#[tauri::command]
pub async fn my_command(
    db: tauri::State<'_, Database>,
    param: String,
) -> Result<MyResponse, String> {
    // ...
}
```

2. Declare in `src-tauri/src/commands/mod.rs`:
```rust
pub mod my_module;
```

3. Register in `src-tauri/src/lib.rs` inside `invoke_handler!(...)`.

4. Add to `src-tauri/capabilities/default.json`:
```json
{ "identifier": "core:default:allow-my-command" }
```

5. Add IPC wrapper in `src/lib/myService.ts`:
```typescript
import { invoke } from '@tauri-apps/api/core';
export async function myCommand(param: string): Promise<MyResponse> {
  return invoke('my_command', { param });
}
```

### Database Access Pattern

The `Database` struct wraps a `Mutex<Connection>`. Rules:
- Lock, read/write, drop — don't hold across `await` or network calls.
- Never call a DB helper from inside another function that already holds the lock.
- Settings table is created lazily in each command via `ensure_settings_table()`.

---

## 8. Peer Sync Architecture

Full details: [`docs/peer-sync-security.md`](peer-sync-security.md)

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: Encrypted Sync Engine (TCP, port 44000–44999)     │
│  [4-byte length][12-byte nonce][AES-256-GCM(JSON payload)]  │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Secure Pairing                                    │
│  6-digit PIN + QR code → mutual device trust                │
│  trusted_devices.json persists accepted peers               │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Peer Discovery (background thread)                │
│  mDNS/DNS-SD: _moodhaven._tcp.local                          │
│  Tauri events: peer:discovered, peer:lost                   │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Device Identity                                   │
│  Ed25519 key pair in device.json + peer_key.bin             │
│  deviceId = first 16 hex chars of SHA-256(publicKey)        │
└─────────────────────────────────────────────────────────────┘
```

**Sync protocol (v2 summary):**
1. Device A connects to Device B's TCP port.
2. Plain `HELLO` / `Ok` exchange — both sides advertise ephemeral X25519 public keys.
3. Server issues a 32-byte Ed25519 challenge; client responds with `Auth { signature }` to prove device identity.
4. Session key derived: `SHA-256("moodhaven-sync-v2:" || X25519_shared || sorted(static_A, static_B))`.
5. Encrypted `MANIFEST` exchange — each side lists entry IDs + `updated_at`.
6. Four sync phases (Entries → Books → Signals → Settings), each with its own `Done` / `Ack`.
7. `peer_sync_state` table updated with `last_sync_at` for each peer.

Full wire protocol details (including v1 static fallback) in [`docs/peer-sync-security.md`](peer-sync-security.md).

---

## 9. Watch Companion Architecture

Full details: [`docs/watch-companion.md`](watch-companion.md)

The watch companion is a separate Wear OS app that acts as a **voice capture assistant**. It does not store journal entries directly — it forwards audio to the desktop app.

```
Wear OS Watch
    │  Mic recording (16 kHz mono AAC-LC, ≤10 min)
    │  ChannelAPI + 4-byte-header wire protocol
    ▼
Android Phone (WearListenerService)
    │  bridgeVoiceMemo() → writes to voice_memos_incoming/
    │  Broadcasts intent to Tauri WebView
    ▼
Tauri Desktop App
    │  useWearVoiceMemos hook picks up new files
    │  store_voice_memo command → moves to permanent storage
    │  transcribe_voice_memo → whisper.cpp sidecar → text
    │  User reviews and creates journal entry
```

---

## 10. Key Data Flows

### Entry Creation

```
WritingView (user types)
    │  scheduleAutoSave (debounced, 5-word minimum)
    ▼
crypto.ts: encryptData(content, password)
    │  → AES-256-GCM ciphertext
    ▼
invoke('create_journal_entry', { id, encrypted_content, mood, book_id, … })
    │
    ▼
Rust: journal.rs: create_journal_entry()
    │  → INSERT INTO journal_entries
    ▼
invoke('sync_entry_tags', { id, tags })
    │  → INSERT/DELETE entry_tags rows
```

### Unlock Flow

```
LockScreen: user enters password
    ▼
invoke('get_password_hash') → { hash, salt }
    ▼
crypto.ts: verifyPassword(password, hash, salt) → bool
    │  (if 2FA enabled → TOTP/hardware key verification)
    ▼
appStore.setState({ isUnlocked: true })
    │  key derived and held in memory
    ▼
All subsequent crypto operations use the in-memory key
```

### Peer Sync (auto-triggered)

```
mDNS: peer:discovered event
    ▼
usePeerSync: is peer trusted? (in trusted_devices.json)
    │  yes, and 30s cooldown elapsed?
    ▼
invoke('peer_sync_now', { peerDeviceId })
    │
    ▼
Rust: peer_sync_engine.rs
    1. TCP connect to peer's sync port
    2. HELLO exchange (verify device IDs)
    3. Derive transport key
    4. Encrypted MANIFEST exchange
    5. Send/receive missing entries (encrypted blobs)
    6. DONE / DONE_ACK
    7. UPDATE peer_sync_state
```

---

## 11. Cloud Sync Architecture (Phase 1)

> **Status:** feat/cloud-sync-phase1 — commands implemented; placeholder OAuth credentials. Not yet shipping.

Cloud sync Phase 1 adds Dropbox and Google Drive as optional backup destinations alongside the existing WebDAV path. All data is AES-256-GCM encrypted client-side before leaving the device — providers only ever see opaque blobs.

### Supported Providers

| Provider | Protocol | File location |
|:---|:---|:---|
| WebDAV | Direct HTTP (existing) | User-configured URL / `/MoodHaven/` subdirectory |
| Dropbox | OAuth 2.0 PKCE (RFC 8252) | `/Apps/MoodHaven/moodhaven-backup.moodhaven` |
| Google Drive | OAuth 2.0 PKCE (RFC 8252) | `appDataFolder` (hidden, app-only; `moodhaven-backup.moodhaven`) |

### OAuth 2.0 PKCE Flow

```
User clicks "Connect Dropbox / Google Drive"
    │
    ▼
Frontend: cloudProviderAuthStart(provider)
    │
    ▼
Rust: cloud_providers.rs — cloud_provider_auth_start
    │  1. Generate PKCE code_verifier (random 64 bytes, base64url)
    │  2. Derive code_challenge = BASE64URL(SHA-256(code_verifier))
    │  3. Bind ephemeral localhost TCP server on a random port
    │  4. Open browser: provider authorization URL with
    │       client_id, redirect_uri=http://localhost:{port}/oauth,
    │       code_challenge, code_challenge_method=S256, scope
    ▼
Browser (user grants permission)
    │  Provider redirects to http://localhost:{port}/oauth?code=...
    │
    ▼
Rust: localhost TCP server receives authorization code
    │  5. Exchange code + code_verifier for access_token + refresh_token
    │     (POST to provider token endpoint, Rust-side HTTP via reqwest)
    │  6. Store tokens in SQLite settings table:
    │       cloud_{provider}_access_token
    │       cloud_{provider}_refresh_token
    │       cloud_{provider}_expires_at
    │       cloud_{provider}_connected_at
    │  7. Close localhost server
    ▼
Frontend: token available; Connect button → Sync Now / Disconnect
```

### Upload Flow

```
Frontend: syncUpload(provider, password)
    │
    ├── exportData(password)         — serialize all entries as JSON
    │        ↓
    │   cloud ciphertext            — same AES-256-GCM envelope as .moodhaven export
    │
    ▼
cloudProviderUploadBlob(provider, blob)
    │
    ▼
Rust: cloud_provider_upload_blob
    │  1. Refresh token if expired (cloud_provider_refresh_token)
    │  2. Upload blob bytes to provider:
    │       Dropbox: POST /2/files/upload to /Apps/MoodHaven/moodhaven-backup.moodhaven
    │       GDrive:  multipart POST to googleapis.com/upload/drive/v3/files
    │                stored in appDataFolder (hidden, not visible to user)
    │  3. Store last_sync_at in settings table
```

### Download Flow

```
Frontend: syncDownload(provider, password)
    │
    ▼
cloudProviderDownloadBlob(provider)
    │
    ▼
Rust: cloud_provider_download_blob
    │  1. Refresh token if expired
    │  2. Download blob bytes:
    │       Dropbox: POST /2/files/download path=/Apps/MoodHaven/moodhaven-backup.moodhaven
    │       GDrive:  GET files/{id}/export (find file by name in appDataFolder first)
    │
    ▼
Frontend: encryptedImport(blob, password)
    │  Decrypt and merge into local SQLite (same import path as manual restore)
```

### Security Properties

- **Data in transit:** HTTPS (reqwest TLS) to provider APIs; never HTTP.
- **Data at rest on provider:** AES-256-GCM ciphertext only — same envelope as the manual `.moodhaven` export. Providers cannot read journal content.
- **Token storage:** OAuth tokens stored in the SQLite `settings` table. The access token row is not additionally encrypted (see gap below).
- **Scope minimality:**
  - Dropbox: `files.content.write` + `files.content.read` scoped to `/Apps/MoodHaven/`.
  - Google Drive: `drive.appdata` — hidden folder accessible only to this app.
- **PKCE (RFC 8252):** No client secret transmitted in the authorization request for Dropbox (public client). Google Drive uses a client secret stored as a compile-time constant (see gap below).

### Gaps (Phase 1)

| Gap | Impact | Tracking |
|:---|:---|:---|
| OAuth client credentials are compile-time placeholders (`DROPBOX_APP_KEY_PLACEHOLDER`, `GOOGLE_CLIENT_ID_PLACEHOLDER`) | Auth will fail until real credentials are registered and compiled in | Must be resolved before shipping |
| Google Drive client_secret stored as a compile-time constant in the binary | Anyone who extracts the binary can find the secret; mitigated by `drive.appdata` scope restriction | Phase 2: move to PKCE-only or env-injected at build time |
| OAuth access token stored unencrypted in SQLite `settings` table | Local attacker with DB access could use the token until it expires | Phase 2: encrypt with `secureStorage.ts` pattern |
| Manual sync only (no auto-sync) | User must tap "Sync Now" explicitly | By design for Phase 1; scheduled sync is Phase 2 |
| No backup rotation | Each sync overwrites the single `moodhaven-backup.moodhaven` file | Phase 2: versioned filenames or provider versioning |

### Key Files

| File | Purpose |
|:---|:---|
| `src-tauri/src/commands/cloud_providers.rs` | All 6 Tauri commands (auth, upload, download, status, disconnect, refresh) |
| `src/lib/services/cloudProvidersService.ts` | TypeScript IPC wrappers + `syncUpload`/`syncDownload` helpers |
| `src/components/settings/tabs/SyncTab.tsx` | Settings UI — provider picker, Connect/Disconnect, Sync Now |
| `src/types/settings.ts` | `CloudProvider`, `StorageBackend`, `CloudProviderStatus` types |
| `src/stores/settingsStore.ts` | `cloudProviders` state (connection status per provider) |

---

## Further Reading

| Document | Purpose |
|:---|:---|
| [`docs/peer-sync-security.md`](peer-sync-security.md) | Detailed security model for local peer sync (threat model, key derivation, wire format) |
| [`docs/speech-to-text.md`](speech-to-text.md) | STT architecture, model options, sidecar build instructions |
| [`docs/watch-companion.md`](watch-companion.md) | Wear OS companion app, audio transfer protocol, voice memo draft pipeline |
| [`docs/browser-pwa-mode.md`](browser-pwa-mode.md) | Browser / PWA build: IndexedDB backend, invoke shim, feature parity table |
| [`docs/howto-getting-started.md`](howto-getting-started.md) | First-run setup tutorial for new users |
| [`docs/howto-time-capsule.md`](howto-time-capsule.md) | Time capsule feature: sealing, reveal flow, anniversary reveals |
| [`docs/howto-stillhaven.md`](howto-stillhaven.md) | StillHaven bilateral stimulation: sessions, protocols, journal handoff |
| [`docs/tauri-commands.md`](tauri-commands.md) | Full reference for all ~164 Tauri commands |
| [`docs/threat-model.md`](threat-model.md) | Security threat model and mitigations |
