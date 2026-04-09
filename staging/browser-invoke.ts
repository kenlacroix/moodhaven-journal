/**
 * browser-invoke.ts
 *
 * Browser-mode shim for Tauri's `invoke()`.
 *
 * In production (Tauri), `invoke()` calls native Rust commands via IPC.
 * In browser mode (web build / IndexedDB), this file intercepts those calls
 * and routes them to the pure-TypeScript implementations in `browser.ts`.
 *
 * ── How the shim is wired ────────────────────────────────────────────────────
 * The app detects browser mode via `!window.__TAURI_INTERNALS__` and replaces
 * `@tauri-apps/api/core`'s `invoke` with this function at startup.
 *
 * ── Adding a new shim ────────────────────────────────────────────────────────
 * 1. Add the Rust command name as a `case` in the switch below.
 * 2. Implement (or delegate to) the matching function in `browser.ts`.
 * 3. Add a test in `browser-invoke.test.ts`.
 */

import {
  // Password management
  browserCheckPasswordExists,
  browserStorePasswordHash,
  browserGetPasswordHash,
  browserVerifyPassword,
  // Journal entries
  browserCreateJournalEntry,
  browserGetJournalEntry,
  browserGetAllJournalEntries,
  browserGetJournalEntriesByDate,
  browserUpdateJournalEntry,
  browserDeleteJournalEntry,
  browserPatchEntryLocationWeather,
  browserPatchEntryPinned,
  browserSyncEntryTags,
  browserGetBookTags,
  // Statistics / analytics
  browserGetMoodStatistics,
  browserGetOverallStatistics,
  browserGetMoodDistribution,
  browserGetStreakStats,
  browserGetDayOfWeekStats,
  browserGetMonthlyMoodData,
  // Settings (key-value store)
  browserGetSetting,
  browserSetSetting,
  browserDeleteSetting,
  browserGetAllSettings,
  // Data management
  browserImportData,
  browserExportData,
  browserFactoryReset,
  browserGetDataStats,
  // App info / utilities
  browserGetAppVersion,
} from './browser';

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

/** Mirror the shape of Tauri's invoke args — a plain object (or undefined). */
type InvokeArgs = Record<string, unknown> | undefined;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Drop-in replacement for `invoke()` that runs entirely in the browser.
 *
 * Throws a descriptive error for any command that has not been shimmed yet so
 * that missing shims surface immediately during development / smoke-testing.
 */
export async function browserInvoke<T>(
  command: string,
  args?: InvokeArgs
): Promise<T> {
  switch (command) {
    // ── Password management ──────────────────────────────────────────────────
    case 'check_password_exists':
      return browserCheckPasswordExists() as Promise<T>;

    case 'store_password_hash': {
      const { hash, salt } = args as { hash: string; salt: string };
      return browserStorePasswordHash(hash, salt) as Promise<T>;
    }

    case 'get_password_hash':
      return browserGetPasswordHash() as Promise<T>;

    /**
     * verify_password — added in SEC-DEFER-001.
     *
     * The Rust command accepts a raw password and returns a boolean.
     * In browser mode we replicate the same logic: fetch the stored
     * PBKDF2 hash + salt from IDB and run the comparison in WebCrypto.
     */
    case 'verify_password': {
      const { password } = args as { password: string };
      return browserVerifyPassword(password) as Promise<T>;
    }

    // ── Journal entries ──────────────────────────────────────────────────────
    case 'create_journal_entry': {
      const { id, encryptedContent, mood, privacyMode, locationWeather, bookId } =
        args as {
          id: string;
          encryptedContent: unknown;
          mood: number;
          privacyMode: number;
          locationWeather: string | null;
          bookId: string | null;
        };
      return browserCreateJournalEntry(
        id,
        encryptedContent,
        mood,
        privacyMode,
        locationWeather,
        bookId
      ) as Promise<T>;
    }

    case 'get_journal_entry': {
      const { id } = args as { id: string };
      return browserGetJournalEntry(id) as Promise<T>;
    }

    case 'get_all_journal_entries': {
      const { limit } = (args ?? {}) as { limit?: number };
      return browserGetAllJournalEntries(limit) as Promise<T>;
    }

    case 'get_journal_entries_by_date': {
      const { startDate, endDate } = args as { startDate: string; endDate: string };
      return browserGetJournalEntriesByDate(startDate, endDate) as Promise<T>;
    }

    case 'update_journal_entry': {
      const { id, encryptedContent, mood, privacyMode } = args as {
        id: string;
        encryptedContent: unknown;
        mood: number;
        privacyMode: number;
      };
      return browserUpdateJournalEntry(id, encryptedContent, mood, privacyMode) as Promise<T>;
    }

    case 'delete_journal_entry': {
      const { id } = args as { id: string };
      return browserDeleteJournalEntry(id) as Promise<T>;
    }

    case 'patch_entry_location_weather': {
      const { id, locationWeather } = args as { id: string; locationWeather: string | null };
      return browserPatchEntryLocationWeather(id, locationWeather) as Promise<T>;
    }

    case 'patch_entry_pinned': {
      const { id, pinned } = args as { id: string; pinned: boolean };
      return browserPatchEntryPinned(id, pinned) as Promise<T>;
    }

    case 'sync_entry_tags': {
      const { id, tags } = args as { id: string; tags: string[] };
      return browserSyncEntryTags(id, tags) as Promise<T>;
    }

    case 'get_book_tags': {
      const { bookId } = args as { bookId: string };
      return browserGetBookTags(bookId) as Promise<T>;
    }

    // ── Statistics / analytics ───────────────────────────────────────────────
    case 'get_mood_statistics':
      return browserGetMoodStatistics() as Promise<T>;

    case 'get_overall_statistics':
      return browserGetOverallStatistics() as Promise<T>;

    case 'get_mood_distribution':
      return browserGetMoodDistribution() as Promise<T>;

    case 'get_streak_stats':
      return browserGetStreakStats() as Promise<T>;

    case 'get_day_of_week_stats':
      return browserGetDayOfWeekStats() as Promise<T>;

    case 'get_monthly_mood_data':
      return browserGetMonthlyMoodData() as Promise<T>;

    // ── Settings (key-value) ─────────────────────────────────────────────────
    case 'get_setting': {
      const { key } = args as { key: string };
      return browserGetSetting(key) as Promise<T>;
    }

    case 'set_setting': {
      const { key, value } = args as { key: string; value: string };
      return browserSetSetting(key, value) as Promise<T>;
    }

    case 'delete_setting': {
      const { key } = args as { key: string };
      return browserDeleteSetting(key) as Promise<T>;
    }

    case 'get_all_settings':
      return browserGetAllSettings() as Promise<T>;

    // ── Data management ──────────────────────────────────────────────────────
    case 'import_data': {
      const { data, password } = args as { data: string; password: string };
      return browserImportData(data, password) as Promise<T>;
    }

    case 'export_data': {
      const { password } = (args ?? {}) as { password?: string };
      return browserExportData(password ?? '') as Promise<T>;
    }

    case 'factory_reset':
      return browserFactoryReset() as Promise<T>;

    case 'get_data_stats':
      return browserGetDataStats() as Promise<T>;

    // ── App info / utilities ─────────────────────────────────────────────────
    case 'get_app_version':
      return browserGetAppVersion() as Promise<T>;

    // ── Graceful no-ops for commands that are Tauri/native-only ─────────────
    // These commands have no meaningful browser equivalent. We return safe
    // defaults so callers don't crash when running in the web build.

    case 'open_writer_window':
    case 'store_session_password':
    case 'retrieve_session_password':
    case 'exit_app':
    case 'write_text_file':
      return undefined as unknown as T;

    // ── Unimplemented — fail loudly so missing shims are caught early ────────
    default:
      throw new Error(
        `[browser-invoke] No browser shim for command "${command}". ` +
          `Add a case + implementation in browser-invoke.ts / browser.ts.`
      );
  }
}
