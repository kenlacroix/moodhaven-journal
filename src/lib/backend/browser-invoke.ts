/**
 * Browser invoke shim.
 *
 * Mirrors the @tauri-apps/api/core invoke() signature. In browser builds,
 * Vite aliases @tauri-apps/api/core to this module, so all existing service
 * files continue to call invoke() without changes.
 *
 * Routes Tauri command names to IndexedDB operations in browser.ts.
 * Commands that have no browser equivalent (peer sync, hardware key, etc.)
 * return a sensible no-op or throw with a clear message.
 */

import {
  openDB,
  dbCreateEntry,
  dbGetEntry,
  dbGetAllEntries,
  dbGetEntriesByDate,
  dbUpdateEntry,
  dbDeleteEntry,
  dbSyncEntryTags,
  dbGetBookTags,
  dbGetMoodStatistics,
  dbGetOverallStatistics,
  dbGetMoodDistribution,
  dbGetStreakStats,
  dbGetDayOfWeekStats,
  dbGetMonthlyMoodData,
  dbGetSetting,
  dbSetSetting,
  dbDeleteSetting,
  dbGetAllSettings,
  dbListBooks,
  dbCreateBook,
  dbUpdateBook,
  dbDeleteBook,
  dbGetDataStats,
  dbImportEntries,
  dbExportAll,
  type BrowserEntryRow,
  type BrowserBook,
} from './browser';

// Injected by vite.config.ts web build; fallback to package.json version at build time
const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.0.0';

type Params = Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function invoke<T>(command: string, params?: Params): Promise<T> {
  const p = params ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await dispatch(command, p);
  return result as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dispatch(command: string, p: Params): Promise<any> {
  switch (command) {
    // -----------------------------------------------------------------------
    // Auth / password
    // -----------------------------------------------------------------------
    case 'check_password_exists': {
      const hash = await dbGetSetting('password_hash');
      return hash !== null;
    }
    case 'store_password_hash': {
      await dbSetSetting('password_hash', p.hash as string);
      await dbSetSetting('password_salt', p.salt as string);
      return;
    }
    case 'get_password_hash': {
      const hash = await dbGetSetting('password_hash');
      const salt = await dbGetSetting('password_salt');
      if (!hash || !salt) return null;
      return { hash, salt };
    }

    // -----------------------------------------------------------------------
    // Journal entries
    // -----------------------------------------------------------------------
    case 'create_journal_entry': {
      const now = new Date().toISOString();
      const entry: BrowserEntryRow = {
        id: p.id as string,
        encrypted_content: p.encryptedContent as BrowserEntryRow['encrypted_content'],
        mood: p.mood as number,
        privacy_mode: (p.privacyMode as number) ?? 0,
        location_weather: (p.locationWeather as string) ?? null,
        book_id: (p.bookId as string) ?? 'default',
        pinned: 0,
        created_at: now,
        updated_at: now,
        tags: [],
        sealed_until: null,
        capsule_type: null,
        linked_original_id: null,
        unsealed_at: null,
        status: null,
      };
      return dbCreateEntry(entry);
    }
    case 'get_journal_entry': {
      return dbGetEntry(p.id as string);
    }
    case 'get_all_journal_entries': {
      return dbGetAllEntries(p.limit as number | undefined);
    }
    case 'get_journal_entries_by_date': {
      return dbGetEntriesByDate(p.startDate as string, p.endDate as string);
    }
    case 'update_journal_entry': {
      return dbUpdateEntry(p.id as string, {
        encrypted_content: p.encryptedContent as BrowserEntryRow['encrypted_content'],
        mood: p.mood as number,
        privacy_mode: (p.privacyMode as number) ?? 0,
      });
    }
    case 'delete_journal_entry': {
      return dbDeleteEntry(p.id as string);
    }
    case 'patch_entry_location_weather': {
      return dbUpdateEntry(p.id as string, { location_weather: p.locationWeather as string });
    }
    case 'patch_entry_pinned': {
      return dbUpdateEntry(p.id as string, { pinned: (p.pinned as boolean) ? 1 : 0 });
    }
    case 'patch_entry_status': {
      return dbUpdateEntry(p.id as string, { status: p.status as string });
    }
    case 'sync_entry_tags': {
      return dbSyncEntryTags(p.id as string, p.tags as string[]);
    }
    case 'get_book_tags': {
      return dbGetBookTags(p.bookId as string);
    }

    // -----------------------------------------------------------------------
    // Analytics
    // -----------------------------------------------------------------------
    case 'get_mood_statistics': {
      return dbGetMoodStatistics(p.startDate as string, p.endDate as string);
    }
    case 'get_overall_statistics': {
      return dbGetOverallStatistics();
    }
    case 'get_mood_distribution': {
      return dbGetMoodDistribution();
    }
    case 'get_streak_stats': {
      return dbGetStreakStats();
    }
    case 'get_day_of_week_stats': {
      return dbGetDayOfWeekStats();
    }
    case 'get_monthly_mood_data': {
      return dbGetMonthlyMoodData(p.year as number, p.month as number);
    }

    // -----------------------------------------------------------------------
    // Settings
    // -----------------------------------------------------------------------
    case 'get_setting': {
      return dbGetSetting(p.key as string);
    }
    case 'set_setting': {
      return dbSetSetting(p.key as string, p.value as string);
    }
    case 'delete_setting': {
      return dbDeleteSetting(p.key as string);
    }
    case 'get_all_settings': {
      return dbGetAllSettings();
    }
    case 'get_app_version': {
      return APP_VERSION;
    }

    // -----------------------------------------------------------------------
    // Books
    // -----------------------------------------------------------------------
    case 'list_books': {
      return dbListBooks();
    }
    case 'create_book': {
      const book: BrowserBook = {
        id: crypto.randomUUID(),
        name: p.name as string,
        emoji: p.emoji as string,
        color: p.color as string,
        description: (p.description as string) ?? null,
        sort_order: (p.sortOrder as number) ?? 0,
        settings: (p.settings as string) ?? null,
        created_at: new Date().toISOString(),
      };
      return dbCreateBook(book);
    }
    case 'update_book': {
      const books = await dbListBooks();
      const existing = books.find((b) => b.id === (p.id as string));
      if (!existing) throw new Error('Book not found');
      await dbUpdateBook({
        ...existing,
        name: p.name as string,
        emoji: p.emoji as string,
        color: p.color as string,
        description: (p.description as string) ?? null,
        settings: (p.settings as string) ?? null,
      });
      return;
    }
    case 'delete_book': {
      return dbDeleteBook(p.id as string);
    }

    // -----------------------------------------------------------------------
    // Data management
    // -----------------------------------------------------------------------
    case 'get_data_stats': {
      return dbGetDataStats();
    }
    case 'export_data': {
      // Returns entries as JSON string — cloudSyncService handles encryption
      const entries = await dbExportAll();
      return JSON.stringify({ entries, exportedAt: new Date().toISOString() });
    }
    case 'import_data': {
      // filePath and password handled by dataManagementService before this point
      // In browser mode, import_data receives pre-parsed entries via a different path.
      // See dataManagementService.ts encryptedImport which calls this.
      return true;
    }
    case 'factory_reset': {
      const db = await openDB();
      const stores = ['journal_entries', 'settings', 'books', 'webdav_state'];
      for (const storeName of stores) {
        await new Promise<void>((resolve, reject) => {
          const t = db.transaction(storeName, 'readwrite');
          const req = t.objectStore(storeName).clear();
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      }
      return true;
    }
    case 'exit_app': {
      window.close();
      return;
    }
    case 'write_text_file': {
      // Trigger browser download
      const blob = new Blob([p.content as string], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (p.filePath as string).split('/').pop() ?? 'export.txt';
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    // -----------------------------------------------------------------------
    // 2FA — browser provides TOTP via WebCrypto; stubs for hardware key
    // -----------------------------------------------------------------------
    case 'get_2fa_status': {
      const stored = await dbGetSetting('totp_enabled');
      return {
        enabled: stored === 'true',
        method: stored === 'true' ? 'totp' : null,
        backupCodesRemaining: 0,
      };
    }
    case 'generate_totp_secret':
    case 'verify_totp_code':
    case 'enable_totp':
    case 'verify_2fa_totp':
    case 'disable_2fa':
    case 'verify_backup_code':
    case 'get_backup_codes_count':
    case 'regenerate_backup_codes': {
      // 2FA not supported in browser build — return safe defaults
      console.warn(`[browser-invoke] ${command} not supported in browser build`);
      if (command === 'get_backup_codes_count') return 0;
      if (command === 'verify_totp_code' || command === 'verify_2fa_totp') return false;
      if (command === 'disable_2fa') return true;
      return null;
    }

    // -----------------------------------------------------------------------
    // Unsupported in browser — Tauri-only features
    // -----------------------------------------------------------------------
    case 'stt_check_sidecar':
      return false;
    case 'stt_get_models_dir':
      return '';
    case 'stt_check_model':
      return { exists: false, sizeBytes: null };
    case 'stt_download_model':
    case 'stt_delete_model':
    case 'stt_transcribe':
    case 'stt_transcribe_timestamped':
      throw new Error('Speech-to-text requires the desktop app');

    case 'peer_get_identity':
    case 'peer_discovery_start':
    case 'peer_discovery_stop':
    case 'peer_get_nearby':
    case 'peer_discovery_is_active':
    case 'peer_generate_pairing_token':
    case 'peer_accept_pairing':
    case 'peer_get_trusted':
    case 'peer_revoke_device':
    case 'peer_cancel_pairing':
    case 'peer_pairing_is_active':
    case 'peer_start_sync_server':
    case 'peer_sync_now':
    case 'peer_get_sync_states':
    case 'peer_full_restore':
    case 'peer_apply_and_restart':
    case 'peer_rename_device':
      throw new Error('Peer sync requires the desktop app');

    case 'hardware_key_feature_available':
      return { available: false, reason: 'Hardware keys require the desktop app' };
    case 'hardware_key_detect':
      return [];
    case 'hardware_key_status':
      return { registered: false, deviceName: null };
    case 'hardware_key_register':
    case 'hardware_key_verify':
    case 'hardware_key_disable':
    case 'hardware_key_required':
      throw new Error('Hardware keys require the desktop app');

    case 'oura_get_status':
      return { connected: false, connectedAt: null };
    case 'oura_sync_today':
    case 'oura_backfill':
      throw new Error('Oura sync requires the desktop app');
    case 'oura_get_context':
    case 'oura_get_history':
      return null;

    case 'open_writer_window':
    case 'open_log_folder':
      console.warn(`[browser-invoke] ${command} not supported in browser`);
      return;
    case 'get_log_path':
      return '';
    case 'set_log_level':
      return;

    case 'check_for_update':
      return { updateAvailable: false, latestVersion: APP_VERSION, downloadUrl: null };
    case 'download_and_install_update':
      throw new Error('Auto-update requires the desktop app');

    case 'get_entry_timestamps': {
      const entries = await dbGetAllEntries();
      return entries.map((e) => ({ id: e.id, updatedAt: e.updated_at }));
    }
    case 'upsert_entry_from_sync': {
      const entry = JSON.parse(p.entryJson as string) as BrowserEntryRow;
      return dbImportEntries([entry]);
    }

    // Capsule commands
    case 'seal_entry': {
      return dbUpdateEntry(p.id as string, {
        sealed_until: p.unlockAt as string,
        capsule_type: p.capsuleType as string,
      });
    }
    case 'unseal_entry': {
      return dbUpdateEntry(p.id as string, {
        unsealed_at: new Date().toISOString(),
        sealed_until: null,
      });
    }
    case 'get_due_capsules': {
      const all = await dbGetAllEntries();
      const now = new Date().toISOString();
      const due = all.find(
        (e) => e.sealed_until !== null && e.unsealed_at === null && e.sealed_until <= now,
      );
      return due ?? null;
    }
    case 'get_mood_delta': {
      const entries = await dbGetAllEntries();
      const since = entries.filter((e) => e.created_at > (p.entryCreatedAt as string));
      const avg = since.length
        ? since.reduce((s, e) => s + e.mood, 0) / since.length
        : null;
      const today = entries.find((e) => e.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10));
      return { avg_since: avg, mood_today: today?.mood ?? null };
    }

    // Session bridge — no-op in browser
    case 'store_session_password':
    case 'retrieve_session_password':
      return null;

    default:
      console.warn(`[browser-invoke] unhandled command: ${command}`, p);
      return null;
  }
}
