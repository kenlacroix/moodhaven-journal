# Tauri Command Reference

> **Version:** v1.3.1.0 | **Total commands:** ~147
>
> This document lists all `#[tauri::command]` functions exposed by MoodHaven Journal's Rust backend.
> Commands are registered in `src-tauri/src/lib.rs` and permitted in `src-tauri/capabilities/default.json`.

All commands are called from TypeScript via:
```typescript
import { invoke } from '@tauri-apps/api/core';
const result = await invoke('command_name', { param: value });
```

Parameter names in TypeScript use **camelCase**; Rust receives them as **snake_case** (Tauri handles conversion).

**Lock guards (v0.9.0+):** Many commands require the session to be unlocked. Calling them before `unlock_app` returns `"Session is locked"`. Affected sections: Analytics, Settings (`get_setting`, `set_setting`, `get_all_settings`), Oura Ring, Time Capsule. `factory_reset` explicitly does **not** require unlock (it is the "forgot password" escape hatch).

---

## Index

- [Journal Entries](#journal-entries)
- [Books (Named Journals)](#books-named-journals)
- [Settings](#settings)
- [Analytics](#analytics)
- [Data Management](#data-management)
- [Two-Factor Authentication](#two-factor-authentication)
- [Hardware Key (FIDO2)](#hardware-key-fido2)
- [Oura Ring](#oura-ring)
- [Media Attachments](#media-attachments)
- [Speech-to-Text](#speech-to-text)
- [Signals (Watch Events)](#signals-watch-events)
- [Voice Memos](#voice-memos)
- [Peer Identity](#peer-identity)
- [Peer Discovery](#peer-discovery)
- [Peer Pairing](#peer-pairing)
- [Peer Sync Engine](#peer-sync-engine)
- [Multi-Device Sync Helpers](#multi-device-sync-helpers)
- [Update Manager](#update-manager)
- [Session Bridge](#session-bridge)
- [Writer Window](#writer-window)
- [StillHaven](#stillhaven)
- [Logging](#logging)

---

## Journal Entries

**Source:** `src-tauri/src/commands/journal.rs`
**IPC wrappers:** `src/lib/journalService.ts`

---

### `check_password_exists`

Check whether the user has completed initial setup (password stored).

```typescript
invoke('check_password_exists') → Promise<boolean>
```

---

### `store_password_hash`

Store the password verification hash and salt during setup.

```typescript
invoke('store_password_hash', {
  hash: string,   // PBKDF2 hash of the password
  salt: string,   // base64 salt
}) → Promise<void>
```

---

### `get_password_hash`

Retrieve the stored password hash and salt for verification.

```typescript
invoke('get_password_hash') → Promise<{ hash: string; salt: string } | null>
```

---

### `verify_password`

Verify a password against the stored PBKDF2 hash. Runs entirely in Rust — the hash never leaves the backend. Uses PBKDF2-HMAC-SHA-256 with 600,000 iterations and standard base64-encoded salt, matching the frontend `hashPassword` parameters exactly.

Returns `true` on match, `false` on mismatch. Returns an error (not `false`) on empty password or invalid salt encoding — callers should treat errors as a failed unlock, not a soft mismatch.

```typescript
invoke('verify_password', {
  password: string,
}) → Promise<boolean>
```

---

### `create_journal_entry`

Create a new encrypted journal entry.

```typescript
invoke('create_journal_entry', {
  id: string,
  encryptedContent: {
    iv: string,       // base64 AES-GCM nonce
    data: string,     // base64 ciphertext
    salt: string,     // base64 PBKDF2 salt
  },
  mood: number,                      // 1–5
  privacyMode?: number,              // 0=Open 1=Mindful 2=Private
  locationWeather?: string,          // JSON string or null
  bookId?: string,                   // defaults to 'default'
}) → Promise<JournalEntryRow>
```

---

### `get_journal_entry`

Get a single entry by ID (returns encrypted content).

```typescript
invoke('get_journal_entry', { id: string }) → Promise<JournalEntryRow | null>
```

---

### `get_all_journal_entries`

Get all entries, newest first.

```typescript
invoke('get_all_journal_entries', { limit?: number }) → Promise<JournalEntryRow[]>
```

---

### `get_journal_entries_by_date`

Get entries within an inclusive date range.

```typescript
invoke('get_journal_entries_by_date', {
  startDate: string,   // ISO 8601 date string
  endDate: string,
}) → Promise<JournalEntryRow[]>
```

---

### `update_journal_entry`

Update an existing entry's content and mood.

```typescript
invoke('update_journal_entry', {
  id: string,
  encryptedContent: EncryptedContent,
  mood: number,
  privacyMode?: number,
}) → Promise<JournalEntryRow>
```

---

### `delete_journal_entry`

Delete an entry and all associated tags, signals, and media.

```typescript
invoke('delete_journal_entry', { id: string }) → Promise<boolean>
```

---

### `patch_entry_location_weather`

Retroactively attach location/weather data to a saved entry (used when geolocation resolves after the first auto-save).

```typescript
invoke('patch_entry_location_weather', {
  id: string,
  locationWeather: string,   // JSON string
}) → Promise<void>
```

---

### `patch_entry_pinned`

Toggle the pinned/favourite state of an entry.

```typescript
invoke('patch_entry_pinned', {
  id: string,
  pinned: boolean,
}) → Promise<void>
```

---

### `patch_entry_status`

Set the thinking/completion state of an entry. Used by `EntryStateBadge` to cycle between states.

```typescript
invoke('patch_entry_status', {
  id: string,
  status: 'thinking' | 'complete' | 'revisit',
}) → Promise<void>
```

---

### `sync_entry_tags`

Replace all tags for an entry (called after each save to update the tag index).

```typescript
invoke('sync_entry_tags', {
  id: string,
  tags: string[],
}) → Promise<void>
```

---

### `get_book_tags`

Get all unique tags used within a specific book.

```typescript
invoke('get_book_tags', { bookId: string }) → Promise<string[]>
```

---

### `get_mood_statistics`

Get per-day mood statistics for a date range (used in analytics charts).

```typescript
invoke('get_mood_statistics', {
  startDate: string,
  endDate: string,
}) → Promise<Array<{ date: string; avgMood: number; count: number }>>
```

---

### `get_overall_statistics`

Get overall statistics: average mood and total entry count.

```typescript
invoke('get_overall_statistics') → Promise<[number, number]>
// [averageMood, totalEntries]
```

---

## Books (Named Journals)

**Source:** `src-tauri/src/commands/books.rs`
**IPC wrappers:** `src/lib/booksService.ts`

---

### `list_books`

List all books ordered by `sort_order`.

```typescript
invoke('list_books') → Promise<Book[]>
```

---

### `create_book`

Create a new named journal.

```typescript
invoke('create_book', {
  name: string,
  emoji: string,
  color: string,           // hex colour, e.g. '#8b5cf6'
  description?: string,
  settings?: string,       // JSON BookSettings blob
}) → Promise<Book>
```

---

### `update_book`

Update a book's metadata.

```typescript
invoke('update_book', {
  id: string,
  name: string,
  emoji: string,
  color: string,
  description?: string,
  settings?: string,
}) → Promise<void>
```

---

### `delete_book`

Delete a book. All entries in the book are reassigned to the `'default'` book. The `'default'` book cannot be deleted.

```typescript
invoke('delete_book', { id: string }) → Promise<void>
```

---

## Settings

**Source:** `src-tauri/src/commands/settings.rs`
**IPC wrappers:** `src/lib/settingsService.ts`

Settings are stored in the `settings` SQLite table as key-value pairs. The key `app_settings` stores the full settings JSON blob.

---

### `get_setting`

Get a setting value by key.

```typescript
invoke('get_setting', { key: string }) → Promise<string | null>
```

---

### `set_setting`

Set a setting value.

```typescript
invoke('set_setting', { key: string, value: string }) → Promise<void>
```

---

### `delete_setting`

Delete a setting.

```typescript
invoke('delete_setting', { key: string }) → Promise<void>
```

---

### `get_all_settings`

Get all settings as key-value pairs.

```typescript
invoke('get_all_settings') → Promise<Array<{ key: string; value: string }>>
```

---

### `get_app_version`

Get the app version string from `Cargo.toml`.

```typescript
invoke('get_app_version') → Promise<string>
// e.g. "0.7.0"
```

---

## Analytics

**Source:** `src-tauri/src/commands/analytics.rs`

---

### `get_mood_distribution`

Get the count of entries at each mood level (1–5).

```typescript
invoke('get_mood_distribution') → Promise<Array<{ mood: number; count: number }>>
```

---

### `get_streak_stats`

Get streak statistics.

```typescript
invoke('get_streak_stats') → Promise<{
  currentStreak: number,
  longestStreak: number,
  totalDays: number,
}>
```

---

### `get_day_of_week_stats`

Get average mood by day of week (0=Sunday, 6=Saturday).

```typescript
invoke('get_day_of_week_stats') → Promise<Array<{ dayOfWeek: number; avgMood: number; count: number }>>
```

---

### `get_monthly_mood_data`

Get mood data for all days in a specific month (used by the calendar heatmap).

```typescript
invoke('get_monthly_mood_data', {
  year: number,
  month: number,   // 1–12
}) → Promise<Array<{ date: string; avgMood: number; count: number }>>
```

---

### `get_full_analytics_bundle`

Fetch all analytics data in a single DB call (replaces 5 parallel IPC calls). Requires unlock.

```typescript
invoke('get_full_analytics_bundle', {
  trendDays: number,   // number of days for trend data window
}) → Promise<{
  averageMood: number,
  totalEntries: number,
  streakStats: { currentStreak: number; longestStreak: number; totalDays: number },
  moodDistribution: Array<{ mood: number; count: number }>,
  dayOfWeekStats: Array<{ dayOfWeek: number; avgMood: number; count: number }>,
  trendData: Array<{ date: string; avgMood: number; count: number }>,
}>
```

---

### `get_insights_metadata`

Lightweight all-time stats that don't require decrypting entries. Requires unlock.

```typescript
invoke('get_insights_metadata') → Promise<{
  entriesThisWeek: number,
  totalEntries: number,
  topTags: string[],
  lastEntryDate: string | null,
}>
```

---

## Data Management

**Source:** `src-tauri/src/commands/data_management.rs`
**IPC wrappers:** `src/lib/dataManagementService.ts`

---

### `unlock_app`

Mark the session as unlocked. Called by the frontend after successful password (and optional 2FA) verification. Sensitive commands gate on this state — they return `"Session is locked"` until this is called.

```typescript
invoke('unlock_app') → Promise<void>
```

---

### `lock_app`

Mark the session as locked. Called on manual lock or app exit. Clears in-memory unlock state; the user must re-authenticate.

```typescript
invoke('lock_app') → Promise<void>
```

---

### `exit_app`

Exit the application cleanly.

```typescript
invoke('exit_app') → Promise<never>
```

---

### `factory_reset`

Wipe all app data (database, settings, device identity, media) and return to the first-run state. Requires two-click confirmation in the UI.

```typescript
invoke('factory_reset') → Promise<boolean>
```

---

### `export_data`

Export data as an encrypted `.moodhaven` file. Accepts optional filters for selective export; when no filters are provided all entries are exported.

```typescript
invoke('export_data', {
  _password: string,        // used for encryption envelope
  filter?: {
    tags?: string[],        // include only entries with any of these tags
    moodMin?: number,       // inclusive lower bound (1–5)
    moodMax?: number,       // inclusive upper bound (1–5)
    startDate?: string,     // ISO 8601, inclusive
    endDate?: string,       // ISO 8601, inclusive
  },
}) → Promise<string>        // exported JSON (encrypted envelope)
```

---

### `import_data`

Import data from an encrypted or legacy unencrypted backup file.

```typescript
invoke('import_data', {
  filePath: string,
  password: string,
}) → Promise<boolean>
```

---

### `get_data_stats`

Get basic statistics about stored data.

```typescript
invoke('get_data_stats') → Promise<{
  entryCount: number,
  totalSizeBytes: number,
  lastModified: string | null,
}>
```

---

### `write_text_file`

Write a text file to a user-specified path (used for manual plaintext export).

```typescript
invoke('write_text_file', {
  filePath: string,
  content: string,
}) → Promise<void>
```

---

## Two-Factor Authentication

**Source:** `src-tauri/src/commands/two_factor.rs`
**IPC wrappers:** `src/lib/twoFactorService.ts`

---

### `generate_totp_secret`

Generate a TOTP secret for the 2FA setup flow. Returns a QR code URL and manual entry key.

```typescript
invoke('generate_totp_secret') → Promise<{
  secret: string,
  qrCodeUrl: string,
  manualEntryKey: string,
}>
```

---

### `verify_totp_code`

Verify a 6-digit TOTP code without enabling 2FA (used during setup to confirm the app is correctly configured).

```typescript
invoke('verify_totp_code', { code: string }) → Promise<boolean>
```

---

### `enable_totp`

Enable TOTP 2FA. Returns single-use backup codes.

```typescript
invoke('enable_totp', { code: string }) → Promise<{ codes: string[] }>
```

---

### `verify_2fa_totp`

Verify TOTP code during the unlock flow.

```typescript
invoke('verify_2fa_totp', { code: string }) → Promise<boolean>
```

---

### `get_2fa_status`

Get the current 2FA configuration.

```typescript
invoke('get_2fa_status') → Promise<{
  enabled: boolean,
  method: 'totp' | 'hardware_key' | null,
  backupCodesRemaining: number,
}>
```

---

### `disable_2fa`

Disable 2FA entirely (requires the user to be authenticated).

```typescript
invoke('disable_2fa') → Promise<boolean>
```

---

### `verify_backup_code`

Verify a backup code during the unlock flow.

```typescript
invoke('verify_backup_code', { code: string }) → Promise<boolean>
```

---

### `get_backup_codes_count`

Get the number of remaining (unused) backup codes.

```typescript
invoke('get_backup_codes_count') → Promise<number>
```

---

### `regenerate_backup_codes`

Generate a new set of backup codes (invalidates old ones).

```typescript
invoke('regenerate_backup_codes') → Promise<{ codes: string[] }>
```

---

### `totp_needs_reencryption`

Check whether the stored TOTP secret predates v1.2.1 encryption (i.e., stored as a legacy plaintext blob). If true, the user should disable and re-enable Authenticator App to re-encrypt the seed. Used by `PrivacyTwoFactor` to display the amber migration banner.

```typescript
invoke('totp_needs_reencryption') → Promise<boolean>
```

---

### `store_webauthn_credential_cmd`

Store a WebAuthn credential ID and public key (used alongside hardware key registration).

```typescript
invoke('store_webauthn_credential_cmd', {
  id: string,
  publicKey: string,
}) → Promise<void>
```

---

### `get_webauthn_credentials`

List stored WebAuthn credentials.

```typescript
invoke('get_webauthn_credentials') → Promise<Array<{ id: string; publicKey: string }>>
```

---

## Hardware Key (FIDO2)

**Source:** `src-tauri/src/commands/hardware_key.rs`
**IPC wrappers:** `src/lib/hardwareKeyService.ts`
**Feature flag:** `hardware-key` (optional Cargo feature)

> These commands are only available when the app is compiled with `--features hardware-key`. If the feature is absent, `hardware_key_feature_available` returns `{ available: false, reason: string }` and the UI shows install instructions.

---

### `hardware_key_feature_available`

Check if FIDO2 support is compiled in and runtime dependencies are present.

```typescript
invoke('hardware_key_feature_available') → Promise<{
  available: boolean,
  reason: string | null,   // e.g. "libudev1 not found" on Linux
}>
```

---

### `hardware_key_detect`

List connected FIDO2/CTAP2 hardware keys.

```typescript
invoke('hardware_key_detect') → Promise<Array<{
  name: string,
  manufacturer: string,
}>>
```

---

### `hardware_key_status`

Get hardware key registration status.

```typescript
invoke('hardware_key_status') → Promise<{
  registered: boolean,
  deviceName: string | null,
}>
```

---

### `hardware_key_register`

Register a connected hardware key as a 2FA factor.

```typescript
invoke('hardware_key_register') → Promise<{
  credentialId: string,
  publicKey: string,
}>
```

---

### `hardware_key_verify`

Verify a hardware key challenge during unlock.

```typescript
invoke('hardware_key_verify') → Promise<string>   // verification token
```

---

### `hardware_key_disable`

Disable hardware key 2FA.

```typescript
invoke('hardware_key_disable') → Promise<boolean>
```

---

### `hardware_key_required`

Check if a hardware key is required to unlock.

```typescript
invoke('hardware_key_required') → Promise<boolean>
```

---

## Oura Ring

**Source:** `src-tauri/src/commands/oura.rs`
**IPC wrappers:** `src/lib/ouraService.ts`

---

### `oura_save_pat`

Save the Oura Ring Personal Access Token.

```typescript
invoke('oura_save_pat', {
  pat: string,
  connectedAt: string,   // ISO 8601
}) → Promise<void>
```

---

### `oura_disconnect`

Clear the Oura connection (removes PAT from settings).

```typescript
invoke('oura_disconnect') → Promise<void>
```

---

### `oura_get_status`

Get the current Oura connection status.

```typescript
invoke('oura_get_status') → Promise<{
  connected: boolean,
  connectedAt: string | null,
}>
```

---

### `oura_sync_today`

Fetch today's and yesterday's health data from the Oura API and cache it locally.

```typescript
invoke('oura_sync_today') → Promise<string>   // summary message
```

---

### `oura_get_context`

Get cached health context for a specific date.

```typescript
invoke('oura_get_context', { date: string }) → Promise<HealthContext | null>
```

Where `HealthContext` includes: `sleepScore`, `readinessScore`, `hrvAvg`, `activityScore`, `restingHeartRate`.

---

### `oura_get_history`

Get recent cached health context entries.

```typescript
invoke('oura_get_history', { limit?: number }) → Promise<HealthContext[]>
```

---

### `oura_backfill`

Fetch historical Oura data for a date range and cache it locally.

```typescript
invoke('oura_backfill', {
  startDate: string,
  endDate: string,
}) → Promise<string>   // summary message
```

---

### `oura_validate_pat`

Validate a Personal Access Token by making a test request to the Oura API. Does **not** store the token — storage is handled separately via `oura_save_pat`. Returns an error if the token is empty, invalid (401), or the API is unreachable.

```typescript
invoke('oura_validate_pat', { pat: string }) → Promise<void>
```

---

## Media Attachments

**Source:** `src-tauri/src/commands/media.rs`
**IPC wrappers:** `src/lib/mediaService.ts`

---

### `save_media_attachment`

Save an encrypted media file and create a DB record.

```typescript
invoke('save_media_attachment', {
  entryId: string,
  filename: string,
  mimeType: string,
  fileDataBase64: string,   // base64-encoded file bytes
}) → Promise<MediaAttachment>
```

---

### `list_entry_media`

List media attached to a specific entry.

```typescript
invoke('list_entry_media', { entryId: string }) → Promise<MediaAttachment[]>
```

---

### `list_all_media`

List all media files in the app.

```typescript
invoke('list_all_media') → Promise<MediaAttachment[]>
```

---

### `open_media_attachment`

Open a media file using the OS default application.

```typescript
invoke('open_media_attachment', { id: string }) → Promise<void>
```

---

### `get_media_thumbnail`

Get a base64-encoded thumbnail for an image attachment.

```typescript
invoke('get_media_thumbnail', { id: string }) → Promise<string>
```

---

### `delete_media_attachment`

Delete a media attachment and its file.

```typescript
invoke('delete_media_attachment', { id: string }) → Promise<void>
```

---

### `sweep_preview_temp`

Clean up any leftover temp files from media preview operations.

```typescript
invoke('sweep_preview_temp') → Promise<void>
```

---

### `read_media_for_sync`

Read encrypted media bytes for peer sync transfer.

```typescript
invoke('read_media_for_sync', { id: string }) → Promise<number[]>
```

---

### `write_media_from_sync`

Write media bytes received from peer sync.

```typescript
invoke('write_media_from_sync', {
  entryId: string,
  filename: string,
  mimeType: string,
  data: number[],
}) → Promise<void>
```

---

## Speech-to-Text

**Source:** `src-tauri/src/commands/speech_to_text.rs`
**IPC wrappers:** `src/lib/speechToTextService.ts`

See [`docs/speech-to-text.md`](speech-to-text.md) for full documentation.

---

### `stt_check_sidecar`

Check if the whisper-cli sidecar binary is available.

```typescript
invoke('stt_check_sidecar') → Promise<boolean>
```

---

### `stt_get_models_dir`

Get the absolute path to the models directory.

```typescript
invoke('stt_get_models_dir') → Promise<string>
```

---

### `stt_check_model`

Check if a specific model file is downloaded.

```typescript
invoke('stt_check_model', { modelName: string })
→ Promise<{ exists: boolean; sizeBytes: number | null }>
```

---

### `stt_download_model`

Download a model. Emits `stt:download_progress` and `stt:download_complete` events.

```typescript
invoke('stt_download_model', { modelName: string }) → Promise<void>
```

---

### `stt_delete_model`

Delete a downloaded model file.

```typescript
invoke('stt_delete_model', { modelName: string }) → Promise<void>
```

---

### `stt_transcribe`

Transcribe base64-encoded WAV audio using the specified model.

```typescript
invoke('stt_transcribe', {
  audioBase64: string,
  modelName: string,
}) → Promise<string>
```

---

### `stt_transcribe_timestamped`

Transcribe base64-encoded WAV audio and return per-segment timestamps. Used by the 3-layer formatting pipeline for paragraph detection. Falls back to plain stdout if JSON output is unavailable.

```typescript
invoke('stt_transcribe_timestamped', {
  audioBase64: string,
  modelName: string,
}) → Promise<{
  text: string,
  segments: Array<{ text: string; start: number; end: number }>,
}>
```

---

### `stt_cancel_download`

Cancel an active model download. The download loop checks the cancellation token and stops gracefully; partial files are left in place (clean up with `stt_cleanup_partial` if needed).

```typescript
invoke('stt_cancel_download', { filename: string }) → Promise<void>
// Errors if no download for `filename` is currently active
```

---

## Signals (Watch Events)

**Source:** `src-tauri/src/commands/signals.rs`
**IPC wrappers:** `src/lib/signalService.ts`

Signals are structured data points from external sources (Wear OS mood taps, health snapshots). They are stored encrypted and can be linked to journal entries.

---

### `create_signal`

Create a new signal record.

```typescript
invoke('create_signal', {
  id: string,
  timestamp: string,
  signalType: string,    // 'mood_tap' | 'health_snapshot' | …
  source: string,        // 'wear_os' | 'oura' | 'manual'
  payload: string,       // AES-256-GCM ciphertext (JSON)
}) → Promise<SignalRow>
```

---

### `list_signals`

List signals, optionally filtered by type.

```typescript
invoke('list_signals', {
  signalType?: string,
  limit?: number,
}) → Promise<SignalRow[]>
```

---

### `link_signal_to_entry`

Link a signal to a journal entry (many-to-many).

```typescript
invoke('link_signal_to_entry', {
  reflectionId: string,
  signalId: string,
}) → Promise<void>
```

---

### `list_entry_signals`

Get all signals linked to a journal entry.

```typescript
invoke('list_entry_signals', { reflectionId: string }) → Promise<SignalRow[]>
```

---

### `delete_signal`

Delete a signal record.

```typescript
invoke('delete_signal', { id: string }) → Promise<void>
```

---

### `get_unsynced_log`

Get unsynced entries from the sync log (incremental sync infrastructure).

```typescript
invoke('get_unsynced_log', { limit?: number }) → Promise<SyncLogRow[]>
```

---

### `mark_sync_log_synced`

Mark sync log entries as synced up to a given log ID.

```typescript
invoke('mark_sync_log_synced', { upToId: number }) → Promise<void>
```

---

### `debug_signal_self_test`

Run a signal pipeline self-test. Available in debug builds only; returns diagnostic JSON.

```typescript
invoke('debug_signal_self_test') → Promise<object>
```

---

## Voice Memos

**Source:** `src-tauri/src/commands/voice_memos.rs`
**IPC wrappers:** `src/lib/voiceMemoService.ts`

See [`docs/watch-companion.md`](watch-companion.md) for context.

---

### `store_voice_memo`

Move an incoming voice memo file from `voice_memos_incoming/` to permanent storage and create a DB record.

```typescript
invoke('store_voice_memo', {
  id: string,
  timestamp: string,
  durationMs: number,
  healthJson?: string,    // JSON health context at time of recording
  incomingFile: string,   // filename in voice_memos_incoming/
}) → Promise<VoiceMemoRow>
```

---

### `list_voice_memos`

List voice memos awaiting review.

```typescript
invoke('list_voice_memos', { limit?: number }) → Promise<VoiceMemoRow[]>
```

---

### `get_voice_memo`

Get a single voice memo by ID.

```typescript
invoke('get_voice_memo', { id: string }) → Promise<VoiceMemoRow | null>
```

---

### `delete_voice_memo`

Delete a voice memo and its audio file.

```typescript
invoke('delete_voice_memo', { id: string }) → Promise<void>
```

---

### `patch_voice_memo_transcription`

Update the transcription text for a memo after STT completes.

```typescript
invoke('patch_voice_memo_transcription', {
  id: string,
  transcription: string,
}) → Promise<void>
```

---

### `link_voice_memo_to_entry`

Associate a voice memo with a journal entry after the entry is created.

```typescript
invoke('link_voice_memo_to_entry', {
  entryId: string,
  memoId: string,
}) → Promise<void>
```

---

### `transcribe_voice_memo`

Transcribe a stored voice memo using the whisper.cpp sidecar. Returns the transcription text and updates the DB record.

```typescript
invoke('transcribe_voice_memo', { id: string }) → Promise<string>
```

---

### `patch_voice_memo_context`

Attach biometric context (hr, steps, activity) to a voice memo after transcription. Used by `useWearVoiceMemos` to store the expanded `HealthSnapshot` payload.

```typescript
invoke('patch_voice_memo_context', {
  id: string,
  context: string,   // JSON: { hr?: number, steps?: number, activity?: 'still'|'walking'|'running' }
}) → Promise<void>
```

---

### `patch_voice_memo_mood`

Set the inferred mood on a voice memo. Called after `scoreContentMood` runs on the transcription.

```typescript
invoke('patch_voice_memo_mood', {
  id: string,
  mood: number,   // 1–5
}) → Promise<void>
```

---

### `list_pending_drafts`

Return voice memos that have a transcription, have not been linked to a journal entry, and have not been reviewed (reviewed = 0). Used by `useVoiceMemoDrafts` to populate the draft card list in Timeline.

```typescript
invoke('list_pending_drafts', { limit?: number }) → Promise<VoiceMemoRow[]>
```

---

### `publish_voice_memo_draft`

Create a journal entry from a voice memo draft, mark the memo as reviewed, and link the two records. Accepts the encrypted content produced by `crypto.ts` in the frontend.

```typescript
invoke('publish_voice_memo_draft', {
  memoId: string,
  encryptedContent: { iv: string; data: string; salt: string },
  mood: number,
  bookId?: string,
}) → Promise<JournalEntryRow>
```

---

### `discard_voice_memo_draft`

Mark a voice memo as reviewed without creating a journal entry. Removes the memo record and its audio file.

```typescript
invoke('discard_voice_memo_draft', { id: string }) → Promise<void>
```

---

## Peer Identity

**Source:** `src-tauri/src/commands/peer_identity.rs`
**IPC wrappers:** `src/lib/peerDiscoveryService.ts`

---

### `peer_get_identity`

Get this device's public identity (name, type, ID, public key).

```typescript
invoke('peer_get_identity') → Promise<DeviceIdentity>
```

`DeviceIdentity`:
```typescript
{
  deviceName: string,
  deviceType: 'desktop' | 'phone' | 'tablet' | 'watch',
  deviceId: string,     // 16-char hex
  publicKey: string,    // base64url Ed25519 public key
  created: string,
}
```

---

### `peer_rename_device`

Rename this device (updates `device.json` and the mDNS broadcast).

```typescript
invoke('peer_rename_device', { name: string }) → Promise<DeviceIdentity>
```

---

## Peer Discovery

**Source:** `src-tauri/src/commands/peer_discovery.rs`
**IPC wrappers:** `src/lib/peerDiscoveryService.ts`

Discovery emits Tauri events:
- `peer:discovered` — `{ deviceId, deviceName, host, port }`
- `peer:lost` — `{ deviceId }`

---

### `peer_discovery_start`

Start the mDNS background discovery thread and begin broadcasting.

```typescript
invoke('peer_discovery_start') → Promise<void>
```

---

### `peer_discovery_stop`

Stop mDNS discovery.

```typescript
invoke('peer_discovery_stop') → Promise<void>
```

---

### `peer_get_nearby`

Get the list of currently visible (discovered, not necessarily trusted) peers.

```typescript
invoke('peer_get_nearby') → Promise<DiscoveredPeer[]>
```

---

### `peer_discovery_is_active`

Check if discovery is currently running.

```typescript
invoke('peer_discovery_is_active') → Promise<boolean>
```

---

## Peer Pairing

**Source:** `src-tauri/src/commands/peer_pairing.rs`
**IPC wrappers:** `src/lib/peerPairingService.ts`

---

### `peer_generate_pairing_token`

Start a pairing server and generate a 6-digit PIN + QR payload. Show this to the user on Device A.

```typescript
invoke('peer_generate_pairing_token') → Promise<{
  pin: string,          // 6-digit PIN
  qrPayload: string,    // JSON string for QR encoding
  serverPort: number,
}>
```

---

### `peer_accept_pairing`

Initiate pairing from Device B — connect to Device A's pairing server, exchange keys, verify PIN.

```typescript
invoke('peer_accept_pairing', {
  targetHost: string,     // Device A's IP
  peerDeviceId: string,
  pin: string,
}) → Promise<TrustedDevice>
```

---

### `peer_get_trusted`

List all trusted (paired) devices.

```typescript
invoke('peer_get_trusted') → Promise<TrustedDevice[]>
```

`TrustedDevice`:
```typescript
{
  deviceId: string,
  deviceName: string,
  publicKey: string,
  pairedAt: string,
}
```

---

### `peer_revoke_device`

Remove a device from the trusted list (they will be rejected on next sync attempt).

```typescript
invoke('peer_revoke_device', { deviceId: string }) → Promise<void>
```

---

### `peer_cancel_pairing`

Cancel an active pairing server (e.g., user dismisses the QR screen).

```typescript
invoke('peer_cancel_pairing') → Promise<void>
```

---

### `peer_pairing_is_active`

Check if a pairing server is currently running.

```typescript
invoke('peer_pairing_is_active') → Promise<boolean>
```

---

## Peer Sync Engine

**Source:** `src-tauri/src/commands/peer_sync_engine.rs`
**IPC wrappers:** `src/lib/peerSyncEngineService.ts`

See [`docs/peer-sync-security.md`](peer-sync-security.md) for protocol details.

---

### `peer_start_sync_server`

Start the TCP sync listener. Called automatically at app startup.

```typescript
invoke('peer_start_sync_server') → Promise<void>
```

---

### `peer_sync_now`

Manually trigger sync with a specific trusted peer.

```typescript
invoke('peer_sync_now', { peerDeviceId: string }) → Promise<{
  sent: number,
  received: number,
  conflicts: number,
}>
```

---

### `peer_get_sync_states`

Get sync history for all known peers.

```typescript
invoke('peer_get_sync_states') → Promise<Array<{
  peerDeviceId: string,
  lastSyncAt: string,
}>>
```

---

### `peer_full_restore`

Perform a full database restore from a trusted peer device (used during new device setup). Connects to the peer, downloads all entries, and writes a pending restore file.

```typescript
invoke('peer_full_restore', {
  peerDeviceId: string,
  password: string,
}) → Promise<void>
```

---

### `peer_apply_and_restart`

Apply a pending full restore and restart the app. Called after `peer_full_restore` succeeds.

```typescript
invoke('peer_apply_and_restart') → Promise<void>
```

---

## Multi-Device Sync Helpers

**Source:** `src-tauri/src/commands/sync.rs`

Low-level helpers used by the sync engine internally.

---

### `get_entry_timestamps`

Get lightweight entry metadata for manifest diffing (ID + `updated_at` only).

```typescript
invoke('get_entry_timestamps') → Promise<Array<{ id: string; updatedAt: string }>>
```

---

### `upsert_entry_from_sync`

Insert or update an entry received from a remote peer (LWW: only applies if received `updated_at` is newer).

```typescript
invoke('upsert_entry_from_sync', { entryJson: string }) → Promise<void>
```

---

## Update Manager

**Source:** `src-tauri/src/commands/updater.rs`
**IPC wrappers:** `src/lib/updaterService.ts`

---

### `check_for_update`

Check GitHub Releases for a newer version.

```typescript
invoke('check_for_update') → Promise<{
  updateAvailable: boolean,
  latestVersion: string,
  downloadUrl: string | null,
  assetName: string | null,
  checksum: string | null,
  releaseNotes: string | null,
}>
```

---

### `download_and_install_update`

Download the update asset, verify its SHA-256 checksum, and launch the installer.

```typescript
invoke('download_and_install_update', {
  downloadUrl: string,
  assetName: string,
  expectedChecksum: string,
}) → Promise<void>
```

---

## Session Bridge

**Source:** `src-tauri/src/commands/session_bridge.rs`

Used to pass the unlock password from the main window to the breakout writer window without re-prompting.

---

### `store_session_password`

Store the password temporarily for handoff to the writer window.

```typescript
invoke('store_session_password', { password: string }) → Promise<void>
```

---

### `retrieve_session_password`

Retrieve and consume the stored password (one-time read — cleared immediately).

```typescript
invoke('retrieve_session_password') → Promise<string | null>
```

---

## Writer Window

**Source:** `src-tauri/src/commands/writer_window.rs`

---

### `open_writer_window`

Open or focus the standalone breakout writer window (desktop only).

```typescript
invoke('open_writer_window') → Promise<void>
```

---

## Time Capsule

**Source:** `src-tauri/src/commands/time_capsule.rs`
**IPC wrappers:** `src/lib/timeCapsuleService.ts`

---

### `seal_entry`

Seal an existing journal entry until a future date. Entry content is hidden from all views until `unseal_entry` is called or the date is reached. Validates that `unlock_at` is strictly in the future and that `capsule_type` is one of the allowed values.

```typescript
invoke('seal_entry', {
  id: string,
  unlockAt: string,       // ISO 8601, must be > now; UI enforces today+2d minimum
  capsuleType: 'letter' | 'vault',
}) → Promise<void>
```

---

### `get_due_capsules`

Return the next capsule ready to reveal, or `null` if none are due. Prioritises scheduled capsules (`sealed_until <= now`) over automatic anniversaries. Excludes entries whose month/day matches today (those belong to On This Day).

```typescript
invoke('get_due_capsules', {
  includeAnniversary: boolean,  // false = skip automatic anniversary entries
}) → Promise<JournalEntryRow | null>
```

`JournalEntryRow` always has `encrypted_content` populated for due capsules (the reveal modal needs it to decrypt).

---

### `unseal_entry`

Mark an entry as revealed. Sets `unsealed_at` to the current UTC time, defaults `capsule_type` to `'anniversary'` if unset (automatic-reveal path), and clears `sealed_until`.

```typescript
invoke('unseal_entry', { id: string }) → Promise<void>
```

---

### `get_mood_delta`

Return mood context for the reveal modal — average mood since the entry was written and today's most recent mood.

```typescript
invoke('get_mood_delta', {
  entryId: string,
  entryCreatedAt: string,   // ISO 8601 creation timestamp of the capsule
}) → Promise<{ avg_since: number | null; mood_today: number | null }>
```

---

## StillHaven

**Source:** `src-tauri/src/commands/still.rs`
**IPC wrappers:** `src/lib/stillService.ts`

StillHaven is the bilateral audio stimulation companion. Sessions are stored locally; activation samples (pre/post) are recorded per session. The feature is gated by `stillhavenEnabled` in user settings — all commands are available once unlocked.

---

### `still_create_session`

Create a new session record at the moment the user taps "Begin session".

```typescript
invoke('still_create_session', {
  id: string,
  protocol: string,          // 'general_activation' | 'fake_danger' | …
  environment: string,       // 'underwater'
  bilateralMode: string,     // 'audio'
  durationSeconds: number,   // 0 at create time; updated on complete
  startedAt: string,         // ISO 8601
}) → Promise<StillSession>
```

---

### `still_record_activation`

Record a pre- or post-session activation sample (1–10 scale).

```typescript
invoke('still_record_activation', {
  sessionId: string,
  phase: 'pre' | 'post',
  activation: number,        // 1–10
  hrvManual?: number | null, // ms — user-entered
  hrvSource?: string | null, // 'manual'
  note?: string | null,
}) → Promise<StillActivationSample>
```

---

### `still_complete_session`

Mark a session as completed and record its final duration.

```typescript
invoke('still_complete_session', {
  id: string,
  completedAt: string,       // ISO 8601
  durationSeconds: number,
}) → Promise<void>
```

---

### `still_abandon_session`

Mark a session as abandoned (user navigated away without completing check-out).

```typescript
invoke('still_abandon_session', {
  id: string,
  abandonedAt: string,       // ISO 8601
}) → Promise<void>
```

---

### `still_list_sessions`

List sessions, most recent first.

```typescript
invoke('still_list_sessions', {
  limit?: number,            // default 50
}) → Promise<StillSession[]>
```

---

### `still_get_session_with_samples`

Get a session and its activation samples together.

```typescript
invoke('still_get_session_with_samples', {
  id: string,
}) → Promise<{ session: StillSession; samples: StillActivationSample[] } | null>
```

---

### `link_journal_entry_to_session`

Associate a journal entry with a StillHaven session (called after journal handoff creates the entry).

```typescript
invoke('link_journal_entry_to_session', {
  entryId: string,
  sessionId: string,
}) → Promise<void>
```

---

### `still_link_signal_to_session`

Record that a `still_trigger` signal (sent from the Wear OS watch via the Wrist Loop feature) spawned a specific StillHaven session. Inserts a row into `still_signal_links`. Used by `useWristLoop` after the user accepts the "Start StillHaven" banner.

```typescript
invoke('still_link_signal_to_session', {
  signalId: string,
  sessionId: string,
}) → Promise<void>
```

---

## Logging

**Source:** `src-tauri/src/commands/logging.rs`
**IPC wrappers:** `src/lib/logger.ts`

Logging is powered by `tauri-plugin-log`. In dev builds, logs are written to stderr. In production builds, logs are written to a rotating file in the platform log directory. The frontend uses `logger.ts` — a structured wrapper around `@tauri-apps/plugin-log` — instead of `console.*` calls.

---

### `get_log_path`

Get the absolute path to the current log file.

```typescript
invoke('get_log_path') → Promise<string>
// e.g. "/home/user/.local/share/com.moodhaven.app/logs/moodhaven.log"
```

---

### `open_log_folder`

Open the log file's parent directory in the OS file manager. Used by the "Open Log Folder" button in Settings → About.

```typescript
invoke('open_log_folder') → Promise<void>
```

---

### `set_log_level`

Set the active log level at runtime. Changes take effect immediately without restarting the app.

```typescript
invoke('set_log_level', {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error',
}) → Promise<void>
```
