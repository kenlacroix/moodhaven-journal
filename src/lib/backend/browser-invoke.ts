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
  dbImportEntries,
  dbExportAll,
  dbStillCreateSession,
  dbStillRecordActivation,
  dbStillUpdateSession,
  dbStillListSessions,
  dbStillGetSessionWithSamples,
  dbLinkJournalEntryToSession,
  dbListActivities,
  dbCreateActivity,
  dbDeleteActivity,
  dbSyncEntryActivities,
  dbGetEntryActivities,
  dbListAllEntryActivities,
  dbGetActivityStats,
  type BrowserEntryRow,
  type BrowserBook,
  type BrowserStillSession,
} from './browser';

// Injected by vite.config.ts web build; fallback to package.json version at build time
const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.0.0';

// Mirrors the Tauri session lock state so browser-mode commands can gate on it.
let _browserSessionUnlocked = false;

// Commands gated by require_unlocked on the Rust side that have real IDB-backed
// implementations here. Kept in sync so browser mode rejects them identically
// before unlock — mirrors the backend's explicit per-command guards.
//
// IMPORTANT: when you add a browser handler for a command that reads or writes
// journal data, settings, books, analytics, media, time capsule, StillHaven, or
// sync data, ADD IT HERE. Anything not listed is served regardless of lock state,
// so an unlisted data command is a locked-session bypass (PT7 finding).
//
// Auth/setup/lifecycle commands (check_password_exists, store/get_password_hash,
// verify_password, unlock_app, lock_app, factory_reset, exit_app, get_app_version,
// import_data, 2FA) are intentionally NOT gated — they must work on the lock
// screen / first-run, exactly as on the desktop backend. Desktop-only commands
// (peer_*, stt_*, hardware_key_*, voice memos) are no-op/throw stubs that never
// touch real data, so they need no gate.
const LOCK_GATED_COMMANDS = new Set([
  // Journal entries
  'create_journal_entry',
  'get_journal_entry',
  'get_all_journal_entries',
  'get_journal_entries_by_date',
  'get_entries_on_this_day',
  'update_journal_entry',
  'delete_journal_entry',
  'patch_entry_location_weather',
  'patch_entry_pinned',
  'patch_entry_status',
  'sync_entry_tags',
  'get_book_tags',
  // Statistics / analytics
  'get_mood_statistics',
  'get_overall_statistics',
  'get_mood_distribution',
  'get_streak_stats',
  'get_day_of_week_stats',
  'get_monthly_mood_data',
  'get_full_analytics_bundle',
  'get_year_heatmap',
  'get_insights_metadata',
  // Settings
  'get_setting',
  'set_setting',
  'delete_setting',
  'get_all_settings',
  // Books
  'list_books',
  'create_book',
  'update_book',
  'delete_book',
  // Data management (data-bearing; export/stats require unlock on desktop)
  'export_data',
  'get_data_stats',
  // Media (browser-backed reads)
  'list_all_media',
  'list_entry_media',
  // Multi-device sync helpers (PT7: were unguarded on desktop too)
  'get_entry_timestamps',
  'upsert_entry_from_sync',
  // Time capsule
  'seal_entry',
  'unseal_entry',
  'get_due_capsules',
  'get_mood_delta',
  // StillHaven
  'still_create_session',
  'still_record_activation',
  'still_complete_session',
  'still_abandon_session',
  'still_list_sessions',
  'still_get_session_with_samples',
  'still_get_session_brief',
  'still_get_journal_brief_for_session',
  'still_get_wellbeing_context',
  'still_link_signal_to_session',
  'link_journal_entry_to_session',
  // Activities
  'list_activities',
  'create_activity',
  'delete_activity',
  'sync_entry_activities',
  'get_entry_activities',
  'list_all_entry_activities',
  'get_activity_stats',
]);

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
  if (LOCK_GATED_COMMANDS.has(command) && !_browserSessionUnlocked) {
    throw new Error('Session is locked');
  }
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
      return { password_hash: hash, password_salt: salt };
    }
    case 'verify_password': {
      const hash = await dbGetSetting('password_hash');
      const salt = await dbGetSetting('password_salt');
      if (!hash || !salt) return false;
      const { verifyPasswordHash } = await import('../services/crypto');
      return verifyPasswordHash(p.password as string, hash, salt);
    }
    case 'unlock_app': {
      _browserSessionUnlocked = true;
      return;
    }
    case 'lock_app': {
      _browserSessionUnlocked = false;
      return;
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
        word_count: (p.wordCount as number) ?? null,
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
    case 'get_entries_on_this_day': {
      return [];
    }
    case 'update_journal_entry': {
      return dbUpdateEntry(p.id as string, {
        encrypted_content: p.encryptedContent as BrowserEntryRow['encrypted_content'],
        mood: p.mood as number,
        privacy_mode: (p.privacyMode as number) ?? 0,
        word_count: (p.wordCount as number) ?? null,
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
    case 'get_full_analytics_bundle': {
      const [averageMood, totalEntries] = await dbGetOverallStatistics();
      const streakRaw = await dbGetStreakStats();
      const allForBundle = await dbGetAllEntries();
      const lastDate = allForBundle.length > 0 ? allForBundle[0].created_at.slice(0, 10) : null;
      return {
        average_mood: averageMood,
        total_entries: totalEntries,
        streak_stats: {
          current_streak: streakRaw.currentStreak,
          longest_streak: streakRaw.longestStreak,
          last_entry_date: lastDate,
        },
        mood_distribution: await dbGetMoodDistribution(),
        day_of_week_stats: (await dbGetDayOfWeekStats()).map((r) => ({
          day_of_week: r.dayOfWeek,
          day_name: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][r.dayOfWeek],
          average_mood: r.avgMood,
          entry_count: r.count,
        })),
        trend_data: (await (async () => {
          const trendDays = p.trendDays as number;
          if (trendDays <= 0) {
            // all-time: use epoch start so all entries qualify
            return dbGetMoodStatistics('1970-01-01', new Date().toISOString().slice(0, 10));
          }
          return dbGetMoodStatistics(
            new Date(Date.now() - trendDays * 86400000).toISOString().slice(0, 10),
            new Date().toISOString().slice(0, 10)
          );
        })()).map((r) => ({ date: r.date, average_mood: r.avgMood, entry_count: r.count })),
      };
    }
    case 'get_year_heatmap': {
      const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const rows = await dbGetMoodStatistics(yearAgo, today);
      return rows.map((r) => ({ date: r.date, average_mood: r.avgMood, entry_count: r.count }));
    }
    case 'get_insights_metadata': {
      const allEntries = await dbGetAllEntries();
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      const entriesThisWeek = allEntries.filter(
        (e: { created_at: string }) => new Date(e.created_at) >= weekAgo
      ).length;
      return {
        entries_this_week: entriesThisWeek,
        total_entries: allEntries.length,
        top_tags: [],
        last_entry_date: allEntries.length > 0 ? allEntries[0].created_at : null,
      };
    }
    case 'list_all_media': {
      return [];
    }
    case 'list_entry_media': {
      return [];
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
      // Rust returns { totalEntries, averageMood } — match that shape
      const allEntries = await dbGetAllEntries();
      const moods = allEntries.map((e) => e.mood).filter((m) => m > 0);
      const averageMood = moods.length > 0 ? moods.reduce((a, b) => a + b, 0) / moods.length : 0;
      return { totalEntries: allEntries.length, averageMood };
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
      // Intentionally NOT lock-gated — this is the lock-screen "Erase & Start
      // Fresh" escape hatch and must work while locked, matching the desktop
      // backend (factory_reset has no require_unlocked guard).
      const db = await openDB();
      // Clear every object store so nothing (incl. StillHaven sessions/samples)
      // survives a reset. Iterating storeNames keeps this complete as stores grow.
      const stores = Array.from(db.objectStoreNames);
      for (const storeName of stores) {
        await new Promise<void>((resolve, reject) => {
          const t = db.transaction(storeName, 'readwrite');
          const req = t.objectStore(storeName).clear();
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      }
      _browserSessionUnlocked = false;
      return true;
    }
    case 'exit_app':
    case 'relaunch_app': {
      // window.close() is blocked by browsers unless the tab was opened by script.
      // Reload instead so the app restarts cleanly into first-run (e.g. after reset).
      window.location.reload();
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
    case 'write_binary_file': {
      // Trigger browser download of base64-encoded bytes (recovery-key PDF export).
      const raw = atob(p.contentsBase64 as string);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (p.path as string).split('/').pop() ?? 'download.pdf';
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    case 'read_text_file':
      // BYO-Cloud folder sync reads arbitrary OS paths — not reachable from the browser sandbox.
      throw new Error('Folder sync requires the desktop app');

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

    // PIN unlock — not supported in browser build (no OS-backed secure storage)
    case 'pin_is_enabled':
      return false;
    case 'pin_setup':
    case 'pin_disable':
      return undefined;
    case 'pin_unlock':
      throw new Error('PIN unlock requires the desktop app');

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
    case 'peer_arm_restore':
    case 'peer_disarm_restore':
      throw new Error('Peer sync requires the desktop app');
    case 'peer_restore_is_armed':
      return false;

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
    case 'oura_validate_pat':
    case 'oura_sync_today':
    case 'oura_backfill':
      throw new Error('Oura sync requires the desktop app');
    case 'oura_disconnect': {
      await dbDeleteSetting('oura_pat');
      return;
    }
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
      try {
        const entry = JSON.parse(p.entryJson as string) as BrowserEntryRow;
        return dbImportEntries([entry]);
      } catch {
        throw new Error('upsert_entry_from_sync: invalid entry JSON');
      }
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

    // -----------------------------------------------------------------------
    // StillHaven (somatic sessions)
    // -----------------------------------------------------------------------
    case 'still_create_session': {
      const session: BrowserStillSession = {
        id: p.id as string,
        protocol: p.protocol as string,
        environment: (p.environment as string) ?? 'underwater',
        bilateral_mode: (p.bilateralMode as string) ?? 'audio',
        duration_seconds: (p.durationSeconds as number) ?? 0,
        started_at: p.startedAt as string,
        completed_at: null,
        abandoned_at: null,
        created_at: new Date().toISOString(),
      };
      return dbStillCreateSession(session);
    }
    case 'still_record_activation': {
      return dbStillRecordActivation({
        session_id: p.sessionId as string,
        phase: p.phase as 'pre' | 'post',
        activation: p.activation as number,
        hrv_manual: (p.hrvManual as number | null) ?? null,
        hrv_source: (p.hrvSource as string | null) ?? null,
        note: (p.note as string | null) ?? null,
        sampled_at: new Date().toISOString(),
      });
    }
    case 'still_complete_session': {
      return dbStillUpdateSession(p.id as string, {
        completed_at: p.completedAt as string,
        duration_seconds: p.durationSeconds as number,
      });
    }
    case 'still_abandon_session': {
      return dbStillUpdateSession(p.id as string, { abandoned_at: p.abandonedAt as string });
    }
    case 'still_list_sessions': {
      return dbStillListSessions((p.limit as number | undefined) ?? 50);
    }
    case 'still_get_session_with_samples': {
      return dbStillGetSessionWithSamples(p.id as string);
    }
    // v1.3.0 narrative layer — stub returns in browser mode
    case 'still_get_session_brief':
    case 'still_get_journal_brief_for_session':
      return null;
    case 'still_get_wellbeing_context':
      return {
        oura_readiness_today: null,
        last_still_session_days_ago: null,
        yesterday_mood_avg: null,
        yesterday_entry_count: 0,
        streak_days: 0,
      };
    case 'link_journal_entry_to_session': {
      return dbLinkJournalEntryToSession(p.entryId as string, p.sessionId as string);
    }
    case 'still_link_signal_to_session':
      return;

    // Session bridge — no-op in browser
    case 'store_session_password':
    case 'retrieve_session_password':
      return null;

    // Voice memos — not available in browser (Wear OS / desktop-only feature)
    case 'list_voice_memos':
    case 'list_pending_drafts':
      return [];
    case 'get_voice_memo':
    case 'delete_voice_memo':
    case 'patch_voice_memo_transcription':
    case 'patch_voice_memo_context':
    case 'patch_voice_memo_mood':
    case 'discard_voice_memo_draft':
    case 'link_voice_memo_to_entry':
    case 'transcribe_voice_memo':
    case 'store_voice_memo':
      return null;
    case 'publish_voice_memo_draft':
      throw new Error('publish_voice_memo_draft not supported in browser mode');

    // Activities
    case 'list_activities':
      return dbListActivities();
    case 'create_activity':
      return dbCreateActivity(p.name as string, p.emoji as string);
    case 'delete_activity':
      return dbDeleteActivity(p.id as string);
    case 'sync_entry_activities':
      return dbSyncEntryActivities(p.entryId as string, p.activityIds as string[]);
    case 'get_entry_activities':
      return dbGetEntryActivities(p.entryId as string);
    case 'list_all_entry_activities':
      return dbListAllEntryActivities();
    case 'get_activity_stats':
      return dbGetActivityStats();

    // Managed cloud providers don't run in the browser build.
    case 'cloud_provider_available':
      return false;

    default:
      console.warn(`[browser-invoke] unhandled command: ${command}`, p);
      return null;
  }
}
