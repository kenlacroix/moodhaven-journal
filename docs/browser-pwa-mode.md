# Browser / PWA Mode

> **Version:** v1.8.0 | **Last Updated:** 2026-06-07

MoodHaven Journal runs in two modes: the full **Tauri desktop app** (the primary target) and a **browser / PWA build** that runs without Rust, usable in any modern browser. This document explains what the browser build is, how its shim layer works, and what contributors need to know when working with it.

---

## Why a Browser Build Exists

The Tauri app requires installing a native binary. During development that is fine, but it creates friction for quick previews, UI testing on CI, and potential future PWA deployment. The browser build solves this by replacing the Rust backend with an equivalent IndexedDB implementation, compiled and served as a static site.

All app functionality that does not depend on native OS APIs works identically in both modes. The UI, state management, encryption, and business logic are all shared.

---

## How the Shim Layer Works

### Build-time detection

`vite.config.ts` detects the target at build time:

```typescript
const isWebBuild = process.env.VITE_TARGET === 'web';
const isTauriContext = !!process.env.TAURI_ENV_PLATFORM;
const useBrowserShim = isWebBuild || !isTauriContext;
```

When `useBrowserShim` is true, Vite aliases all eight Tauri packages to browser shim files before bundling:

| Tauri package | Browser alias |
|:---|:---|
| `@tauri-apps/api/core` | `src/lib/backend/browser-invoke.ts` |
| `@tauri-apps/plugin-http` | `src/lib/backend/browser-stubs.ts` |
| `@tauri-apps/plugin-log` | `src/lib/backend/browser-stubs.ts` |
| `@tauri-apps/plugin-shell` | `src/lib/backend/browser-stubs.ts` |
| `@tauri-apps/plugin-dialog` | `src/lib/backend/browser-stubs.ts` |
| `@tauri-apps/plugin-notification` | `src/lib/backend/browser-stubs.ts` |
| `@tauri-apps/api/window` | `src/lib/backend/browser-stubs.ts` |
| `@tauri-apps/api/event` | `src/lib/backend/browser-stubs.ts` |

The result is that `import { invoke } from '@tauri-apps/api/core'` in any service file resolves to the browser shim without any change to the calling code.

Output directories: `dist-web/` (browser build) and `dist/` (desktop build).

### The invoke shim (`browser-invoke.ts`)

`browser-invoke.ts` exports an `invoke<T>(command: string, params?: object): Promise<T>` function that mirrors the Tauri API signature exactly. Internally it uses a `dispatch()` switch statement that routes approximately 60 Tauri command names to IndexedDB operations.

It also maintains `_browserSessionUnlocked` state, mirroring the Rust session lock so that commands returning `"Session is locked"` behave identically to the desktop build.

Notable browser-specific behaviors:

| Command | Desktop behavior | Browser behavior |
|:---|:---|:---|
| `exit_app` | Kills the process | `window.location.reload()` |
| `write_text_file` | Writes to filesystem | Creates a `<a download>` link |
| `factory_reset` | Deletes DB file + app data | Clears all IDB stores |
| `stt_*` | whisper.cpp sidecar | Throws `"Speech-to-text requires the desktop app"` |
| `peer_*` | mDNS + TCP sync | Throws `"Peer sync requires the desktop app"` |
| `hardware_key_feature_available` | Checks libudev / CTAP2 | Returns `{ available: false }` |

### Plugin stubs (`browser-stubs.ts`)

`browser-stubs.ts` exports no-op versions of all Tauri-only plugins so that service files that import them compile without errors. Calls to these stubs silently do nothing. Covered plugins: `plugin-http`, `plugin-log`, `plugin-shell`, `plugin-dialog`, `plugin-notification`, `api/window`, `api/event`.

The HTTP service (`src/lib/services/http.ts`) is an exception — it is shim-aware and uses `window.fetch` directly when `useBrowserShim` is true instead of `@tauri-apps/plugin-http`. This means WebDAV sync works in the browser build, subject to CORS restrictions from the target server.

---

## IndexedDB Backend (`browser.ts`)

`src/lib/backend/browser.ts` implements all CRUD operations using the browser's IndexedDB API.

### Database identity

```
DB_NAME    = 'moodhaven'
DB_VERSION = 3
```

### Object stores

| Store | Key path | Description |
|:---|:---|:---|
| `journal_entries` | `id` | All journal entries with encrypted content |
| `settings` | `key` | Key-value settings (mirrors SQLite `settings` table) |
| `books` | `id` | Named journals |
| `webdav_state` | `id` | Singleton WebDAV ETag guard (`{ id: 'singleton', filename, etag }`) |
| `still_sessions` | `id` | StillHaven session records |
| `still_activation_samples` | `id` | Pre/post activation samples linked to sessions |
| `activities` | `id` | Predefined and custom activities (v3 migration) |

### Entry schema (`BrowserEntryRow`)

```typescript
interface BrowserEntryRow {
  id: string;
  encrypted_content: { iv: string; data: string; salt: string };
  mood: number;
  privacy_mode: number;
  location_weather: string | null;
  book_id: string;
  pinned: number;
  created_at: string;
  updated_at: string;
  tags: string[];
  sealed_until: string | null;
  capsule_type: string | null;
  linked_original_id: string | null;
  unsealed_at: string | null;
  status: string | null;
  session_id?: string;
  word_count?: number;
  // stored as runtime extension by dbSyncEntryActivities — not in the TS interface
  activityIds?: string[];
}
```

### Import / merge strategy

`dbImportEntries()` uses last-write-wins: if an entry with the same ID already exists and the incoming `updated_at` is newer, the local record is replaced. Otherwise the existing record is kept. This matches the desktop's `upsert_entry_from_sync` behavior.

### WebDAV ETag guard

`dbGetWebDAVState()` and `dbSetWebDAVState(filename, etag)` manage a singleton record that prevents concurrent upload overwrites. Before uploading, the service reads the stored ETag and passes it as `If-Match`; after a successful upload it updates the stored ETag with the server's response.

---

## Feature Parity

| Feature | Desktop | Browser |
|:---|:---|:---|
| Journal CRUD | Full | Full |
| Encryption (AES-256-GCM) | Full | Full |
| Books, tags, analytics | Full | Full |
| Activity tagging | Full | Full |
| Time Capsule | Full | Full |
| StillHaven | Full | Full |
| Oura Ring sync | Full | Full (uses `window.fetch`) |
| WebDAV sync | Full | Partial (CORS-dependent) |
| Speech-to-text (whisper.cpp) | Full | Not available |
| Peer sync (mDNS/TCP) | Full | Not available |
| Hardware key (FIDO2) | Optional feature flag | Not available |
| OS notifications | Full | Not available |
| File system (export/import) | Full | Download/upload via `<input>` |
| Auto-lock on window blur | Full | Best-effort (Page Visibility API) |

---

## Running the Browser Build

```bash
npm run dev:web          # Vite dev server with hot reload, no Rust needed
npm run build:web        # Production build → dist-web/
```

The Vite dev server sets `VITE_TARGET=web`, which triggers `useBrowserShim`. No Tauri installation is required.

---

## Contributing: Adding a New Command to the Browser Backend

When a new Tauri command is added to the desktop build, the browser backend needs a corresponding handler if the feature should work in browser mode.

1. **Add the IDB operation to `browser.ts`** — implement the data access using the existing store helpers (`dbGet`, `dbPut`, `dbDelete`, etc.).

2. **Add a case to the `dispatch()` switch in `browser-invoke.ts`**:
   ```typescript
   case 'my_new_command':
     return dbMyNewOperation(params.argName) as T;
   ```

3. **If the command is desktop-only** (OS-level APIs, sidecar, etc.), add a throwing case:
   ```typescript
   case 'my_native_only_command':
     throw new Error('my_native_only_command requires the desktop app');
   ```

4. **Write a test** — add coverage to `src/lib/backend/browser-invoke.test.ts` following the existing pattern.

The TypeScript types for all Tauri commands are defined in `src/lib/` service files and can be reused directly in the browser backend.

---

## Related

- Architecture overview: [`docs/architecture.md`](architecture.md)
- Vite config and alias mechanism: `vite.config.ts`
- IndexedDB implementation: `src/lib/backend/browser.ts`
- Invoke shim: `src/lib/backend/browser-invoke.ts`
- Plugin stubs: `src/lib/backend/browser-stubs.ts`
