//! MoodHaven Journal Library
//!
//! Core functionality for the MoodHaven Journal Tauri application.

pub mod commands;
pub mod db;

use std::sync::Mutex;
use zeroize::Zeroize;

/// Tracks whether the user has authenticated this session.
/// Starts locked (true). Set to false by `unlock_app` after the frontend
/// verifies the password. Resets to true on `lock_app`.
/// Sensitive Tauri commands check this state before executing.
pub struct AppLockState(pub Mutex<bool>);

/// Backend rate limiter for `verify_password`.
///
/// Tracks consecutive failures and enforces a 30-second lockout after 5 failures.
/// The in-memory state is authoritative at runtime.  Lockout is also persisted to
/// `{app_data}/pw_lockout.json` so a process restart does not reset it.
///
/// Persistence format: `{"locked_until_epoch_secs": <u64>}` — uses wall-clock
/// seconds (SystemTime / UNIX epoch) rather than `Instant` so it survives restarts.
pub struct PasswordRateLimiter {
    pub state: Mutex<PasswordRateState>,
    pub lockout_file: Mutex<Option<std::path::PathBuf>>,
}

#[derive(Default)]
pub struct PasswordRateState {
    pub failures: u32,
    pub locked_until: Option<std::time::Instant>,
}

impl PasswordRateLimiter {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(PasswordRateState::default()),
            lockout_file: Mutex::new(None),
        }
    }

    /// Called from `setup()` after the app data dir is known.
    /// Loads any existing lockout from disk so a restart does not reset it.
    pub fn initialize(&self, app_data: &std::path::Path) {
        self.initialize_with_path(&app_data.join("pw_lockout.json"));
    }

    /// Like `initialize` but accepts an explicit lockout file path.
    /// Used by `PinRateLimiter` to keep PIN and password lockout files separate.
    pub fn initialize_with_path(&self, path: &std::path::Path) {
        let path = path.to_path_buf();
        // Attempt to load a persisted lockout epoch.
        if let Ok(contents) = std::fs::read_to_string(&path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&contents) {
                if let Some(epoch) = json["locked_until_epoch_secs"].as_u64() {
                    let now_epoch = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();
                    if epoch > now_epoch {
                        let remaining_secs = epoch - now_epoch;
                        let until = std::time::Instant::now()
                            + std::time::Duration::from_secs(remaining_secs);
                        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
                        state.locked_until = Some(until);
                        log::info!(
                            "[auth] Loaded persisted password lockout — {remaining_secs}s remaining"
                        );
                    }
                }
            }
        }
        let mut file = self.lockout_file.lock().unwrap_or_else(|e| e.into_inner());
        *file = Some(path);
    }

    /// Write current lockout expiry to disk so a process restart cannot bypass it.
    fn persist_lockout(&self, expires_at_epoch_secs: u64) {
        let file = self.lockout_file.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(ref path) = *file {
            let json = serde_json::json!({ "locked_until_epoch_secs": expires_at_epoch_secs });
            let _ = std::fs::write(path, json.to_string());
        }
    }

    /// Remove the lockout persistence file.
    fn clear_persisted_lockout(&self) {
        let file = self.lockout_file.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(ref path) = *file {
            let _ = std::fs::remove_file(path);
        }
    }

    /// Returns Ok(()) if a verification attempt is allowed, Err with seconds remaining if locked.
    pub fn check(&self) -> Result<(), u64> {
        let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(until) = state.locked_until {
            let now = std::time::Instant::now();
            if now < until {
                let remaining = (until - now).as_secs().saturating_add(1);
                return Err(remaining);
            }
        }
        Ok(())
    }

    /// Record a failed attempt. Returns the lockout duration in seconds if lockout is now active.
    pub fn record_failure(&self) -> Option<u64> {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        // If a previous lockout expired, reset the counter.
        if let Some(until) = state.locked_until {
            if std::time::Instant::now() >= until {
                state.failures = 0;
                state.locked_until = None;
            }
        }
        state.failures += 1;
        if state.failures >= 5 {
            let lockout_secs = 30u64;
            let until = std::time::Instant::now() + std::time::Duration::from_secs(lockout_secs);
            state.locked_until = Some(until);
            state.failures = 0;
            // Persist so app restart does not reset the lockout.
            let epoch = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
                + lockout_secs;
            drop(state); // release state lock before taking lockout_file lock
            self.persist_lockout(epoch);
            Some(lockout_secs)
        } else {
            None
        }
    }

    /// Record a successful verification — reset the failure counter.
    pub fn record_success(&self) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.failures = 0;
        state.locked_until = None;
        drop(state);
        self.clear_persisted_lockout();
    }
}

impl Default for PasswordRateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

/// Separate rate limiter for PIN unlock attempts.
/// Wraps `PasswordRateLimiter` so the PIN lockout counter is independent of
/// the password lockout counter, and persists to `pin_lockout.json`.
pub struct PinRateLimiter(pub PasswordRateLimiter);

impl AppLockState {
    pub fn new() -> Self {
        AppLockState(Mutex::new(true))
    }
    pub fn is_locked(&self) -> bool {
        *self.0.lock().unwrap_or_else(|e| e.into_inner())
    }
}

impl Default for AppLockState {
    fn default() -> Self {
        Self::new()
    }
}

/// Rust-side 2FA enforcement state.
///
/// Tracks whether the user completed both authentication factors before `unlock_app`
/// is called. This is separate from `AppLockState` so that a compromised frontend
/// cannot bypass 2FA by calling `unlock_app` directly after `verify_password`.
///
/// Lifecycle:
///   verify_password (success) → password_verified=true, twofa_required=<from DB>
///   verify_2fa_totp / verify_backup_code (success) → twofa_completed=true
///   unlock_app → checks twofa_required; rejects if required && !twofa_completed
///   lock_app → resets all three flags
pub struct TwoFactorPendingState(pub Mutex<TwoFactorPending>);

#[derive(Default)]
pub struct TwoFactorPending {
    pub password_verified: bool,
    pub twofa_required: bool,
    pub twofa_completed: bool,
}

impl TwoFactorPendingState {
    pub fn new() -> Self {
        TwoFactorPendingState(Mutex::new(TwoFactorPending::default()))
    }

    /// Called on successful password verification. Records whether 2FA is required
    /// (passed in from the caller which has DB access).
    pub fn on_password_verified(&self, twofa_required: bool) {
        let mut s = self.0.lock().unwrap_or_else(|e| e.into_inner());
        s.password_verified = true;
        s.twofa_required = twofa_required;
        s.twofa_completed = false;
    }

    /// Called on successful 2FA factor verification (TOTP or backup code).
    pub fn on_twofa_completed(&self) {
        let mut s = self.0.lock().unwrap_or_else(|e| e.into_inner());
        s.twofa_completed = true;
    }

    /// Returns true if the session is fully authenticated (password done, and
    /// either 2FA was not required or has been completed).
    pub fn is_fully_authenticated(&self) -> bool {
        let s = self.0.lock().unwrap_or_else(|e| e.into_inner());
        s.password_verified && (!s.twofa_required || s.twofa_completed)
    }

    /// Reset all auth flags (called on lock_app).
    pub fn reset(&self) {
        let mut s = self.0.lock().unwrap_or_else(|e| e.into_inner());
        *s = TwoFactorPending::default();
    }
}

impl Default for TwoFactorPendingState {
    fn default() -> Self {
        Self::new()
    }
}

/// In-memory store for the 32-byte SQLCipher key derived from the user's password.
/// Set by `verify_password` on successful authentication; cleared (zeroized) by `lock_app`.
/// Also consumed by `unlock_app` to trigger the unencrypted → encrypted migration.
pub struct DbKeyState(pub Mutex<Option<[u8; 32]>>);

impl DbKeyState {
    pub fn new() -> Self {
        DbKeyState(Mutex::new(None))
    }

    pub fn set(&self, key: [u8; 32]) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(key);
    }

    pub fn get(&self) -> Option<[u8; 32]> {
        *self.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Overwrite the key bytes before clearing. Uses volatile writes via the
    /// `zeroize` crate to prevent the compiler from eliding the stores under LTO.
    pub fn clear(&self) {
        let mut guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(ref mut k) = *guard {
            k.zeroize();
        }
        *guard = None;
    }
}

impl Default for DbKeyState {
    fn default() -> Self {
        Self::new()
    }
}

/// In-memory cache of recently used TOTP codes.
/// Key: `"{time_step}:{code}"` — time_step is unix_secs / 30.
/// Entries are pruned when the owning time step is more than 3 steps old,
/// so the set stays small (at most a few dozen entries in normal usage).
pub struct TotpUsedCodes(pub Mutex<std::collections::HashSet<String>>);

impl TotpUsedCodes {
    pub fn new() -> Self {
        TotpUsedCodes(Mutex::new(std::collections::HashSet::new()))
    }

    /// Returns true if the code has already been used for this time step.
    /// Also evicts stale entries (steps older than current - 3).
    pub fn check_and_record(&self, code: &str, now_secs: u64) -> bool {
        let current_step = now_secs / 30;
        let mut set = self.0.lock().unwrap_or_else(|e| e.into_inner());
        // Evict entries from steps older than current - 3 (they can never be valid again).
        set.retain(|k| {
            k.split_once(':')
                .and_then(|(step_str, _)| step_str.parse::<u64>().ok())
                .map(|step| step + 4 > current_step)
                .unwrap_or(false)
        });
        // Check all three valid steps (current ± 1).
        for offset in [-1i64, 0, 1] {
            let step = (current_step as i64 + offset) as u64;
            let key = format!("{step}:{code}");
            if set.contains(&key) {
                return true; // already used
            }
        }
        // Record use for the current step.
        set.insert(format!("{current_step}:{code}"));
        false
    }
}

impl Default for TotpUsedCodes {
    fn default() -> Self {
        Self::new()
    }
}

use commands::peer_discovery::PeerDiscoveryState;
use commands::peer_pairing::PairingServerState;
use commands::peer_sync_engine::SyncEngineState;
use commands::session_bridge::SessionBridge;
use db::{get_db_path, Database};
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

/// Initialize and run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                // Initialize at Debug so fern's internal filter is permissive.
                // The user-configured level is applied via log::set_max_level() in setup().
                .level(log::LevelFilter::Debug)
                .targets([
                    Target::new(TargetKind::Stderr),
                    Target::new(TargetKind::LogDir {
                        file_name: Some("moodhaven".to_string()),
                    }),
                ])
                .max_file_size(5_000_000)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // Registers the Android-native WearPlugin so Tauri's IPC router can route
        // `invoke('plugin:wear|*')` calls to the Kotlin WearPlugin via pluginManager.
        .plugin(tauri::plugin::Builder::<_, ()>::new("wear").build())
        .setup(|app| {
            // If a full-restore pending file exists, verify its SHA-256 checksum then
            // swap it in before opening the DB.  This prevents a tampered pending
            // file (written by another process with access to app_data_dir) from
            // silently replacing the live database.
            let db_path = get_db_path(app.handle())?;
            if let Some(parent) = db_path.parent() {
                let pending = parent.join("moodhaven_restore.pending");
                let checksum_path = parent.join("moodhaven_restore.pending.sha256");
                if pending.exists() {
                    let integrity_ok = if checksum_path.exists() {
                        use sha2::{Digest, Sha256};
                        let expected = std::fs::read_to_string(&checksum_path)
                            .unwrap_or_default();
                        let expected = expected.trim().to_string();
                        let data = std::fs::read(&pending).unwrap_or_default();
                        let actual = hex::encode(Sha256::digest(&data));
                        if actual == expected {
                            log::info!("[restore] Integrity check passed ({actual})");
                            true
                        } else {
                            log::error!(
                                "[restore] Integrity check FAILED (expected {expected}, got {actual}) — discarding"
                            );
                            let _ = std::fs::remove_file(&pending);
                            let _ = std::fs::remove_file(&checksum_path);
                            false
                        }
                    } else {
                        // No checksum — legacy or in-flight; allow but warn.
                        log::warn!("[restore] No checksum file for pending restore — proceeding unverified");
                        true
                    };

                    if integrity_ok {
                        log::info!(
                            "[restore] Applying pending DB restore: {:?} → {:?}",
                            pending,
                            db_path
                        );
                        if let Err(e) = std::fs::rename(&pending, &db_path) {
                            log::error!("[restore] WARNING: failed to apply pending DB: {e}");
                        }
                        let _ = std::fs::remove_file(&checksum_path);
                    }
                }
            }

            // Initialize database
            let database = Database::new(db_path)
                .map_err(|e| anyhow::anyhow!("Database initialization failed: {}", e))?;

            // Manage database state
            app.manage(database);

            // Apply user-configured log level as early as possible.
            // Reads the "log_level" SQL key (set by set_log_level command); defaults to Warn.
            {
                let db = app.state::<Database>();
                let stored = db
                    .conn
                    .lock()
                    .ok()
                    .and_then(|conn| {
                        conn.query_row(
                            "SELECT value FROM settings WHERE key = 'log_level'",
                            [],
                            |row| row.get::<_, String>(0),
                        )
                        .ok()
                    })
                    .unwrap_or_default();
                let filter = match stored.as_str() {
                    "error" => log::LevelFilter::Error,
                    "warn" => log::LevelFilter::Warn,
                    "info" => log::LevelFilter::Info,
                    "debug" => log::LevelFilter::Debug,
                    other => {
                        if !other.is_empty() {
                            log::warn!(
                                "[startup] unknown log_level {:?}, defaulting to Warn",
                                other
                            );
                        }
                        log::LevelFilter::Warn
                    }
                };
                log::set_max_level(filter);
            }

            // Session lock state — starts locked, set to unlocked after auth
            app.manage(AppLockState::new());

            // Backend rate limiter for verify_password — persisted to disk so
            // a process restart does not reset an active lockout.
            let pw_rate_limiter = PasswordRateLimiter::new();
            if let Ok(app_data) = app.path().app_data_dir() {
                pw_rate_limiter.initialize(&app_data);
            }
            app.manage(pw_rate_limiter);

            // Separate rate limiter for PIN unlock — independent counter, independent file.
            let pin_rate_limiter = PinRateLimiter(PasswordRateLimiter::new());
            if let Ok(app_data) = app.path().app_data_dir() {
                pin_rate_limiter.0.initialize_with_path(&app_data.join("pin_lockout.json"));
            }
            app.manage(pin_rate_limiter);

            // 2FA pending state — enforces that both auth factors are complete
            // before unlock_app succeeds, even if the frontend skips the 2FA step.
            app.manage(TwoFactorPendingState::new());

            // SQLCipher key — holds the 32-byte derived key in memory while unlocked.
            // Cleared (zeroized) on lock_app. Consumed by unlock_app for DB migration.
            app.manage(DbKeyState::new());

            // TOTP replay prevention — tracks used codes for the current 90s window.
            app.manage(TotpUsedCodes::new());

            // One-shot session bridge for breakout writer password hand-off
            app.manage(SessionBridge::new());

            // Peer-to-peer discovery state
            app.manage(PeerDiscoveryState::new());

            // Peer-to-peer pairing server state
            app.manage(PairingServerState::new());

            // Peer-to-peer sync engine state
            app.manage(SyncEngineState::new());

            // STT model download state (cancellation tokens)
            app.manage(commands::DownloadState::default());

            // Auto-start sync server so peers can connect to us
            if let Err(e) = commands::peer_sync_engine::peer_start_sync_server(
                app.handle().clone(),
                app.state::<SyncEngineState>(),
            ) {
                log::error!("[sync] Auto-start failed: {e}");
            }

            // Sweep leftover preview temp files from previous sessions
            let _ = commands::sweep_preview_temp(app.handle().clone());

            // Open devtools in debug mode
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

            // Linux/WebKit2GTK: handle WebKit permission-request events so that
            // getUserMedia() (microphone) works inside the Tauri WebView.
            //
            // Without this, WebKit fires an internal PermissionRequest event that
            // nobody handles, so it auto-denies and getUserMedia() throws NotAllowedError
            // before the OS ever gets a chance to show its own prompt.
            //
            // Allowing here hands control to the OS-level permission system, which
            // will either show a native prompt or honour the existing system setting.
            #[cfg(target_os = "linux")]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.with_webview(|webview| {
                    use webkit2gtk::glib::ObjectExt;
                    use webkit2gtk::{PermissionRequestExt, WebViewExt};
                    webview.inner().connect_permission_request(
                        |_view, request: &webkit2gtk::PermissionRequest| {
                            // Only allow microphone (UserMedia) — deny camera, geolocation, notifications, etc.
                            if request.is::<webkit2gtk::UserMediaPermissionRequest>() {
                                request.allow();
                            } else {
                                request.deny();
                            }
                            true
                        },
                    );
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Session lock / unlock (set by frontend after auth, checked by sensitive commands)
            commands::unlock_app,
            commands::lock_app,
            // PIN unlock (pre-auth: pin_is_enabled + pin_unlock; post-auth: pin_setup + pin_disable)
            commands::pin_is_enabled,
            commands::pin_setup,
            commands::pin_unlock,
            commands::pin_disable,
            // Password management
            commands::check_password_exists,
            commands::store_password_hash,
            commands::get_password_hash,
            commands::verify_password,
            // Journal entries
            commands::create_journal_entry,
            commands::get_journal_entry,
            commands::get_all_journal_entries,
            commands::get_journal_entries_by_date,
            commands::get_entries_on_this_day,
            commands::update_journal_entry,
            commands::delete_journal_entry,
            commands::patch_entry_location_weather,
            commands::patch_entry_pinned,
            commands::patch_entry_status,
            commands::link_journal_entry_to_session,
            commands::sync_entry_tags,
            commands::get_book_tags,
            // Statistics
            commands::get_mood_statistics,
            commands::get_overall_statistics,
            // Analytics
            commands::get_mood_distribution,
            commands::get_streak_stats,
            commands::get_day_of_week_stats,
            commands::get_monthly_mood_data,
            commands::get_full_analytics_bundle,
            commands::get_insights_metadata,
            // Settings
            commands::get_setting,
            commands::set_setting,
            commands::delete_setting,
            commands::get_all_settings,
            commands::get_app_version,
            // Data management
            commands::factory_reset,
            commands::export_data,
            commands::import_data,
            commands::get_data_stats,
            commands::write_text_file,
            commands::exit_app,
            commands::get_log_path,
            commands::open_log_folder,
            commands::set_log_level,
            // Two-factor authentication
            commands::generate_totp_secret,
            commands::verify_totp_code,
            commands::enable_totp,
            commands::regenerate_backup_codes,
            commands::verify_backup_code,
            commands::get_backup_codes_count,
            commands::get_2fa_status,
            commands::disable_2fa,
            commands::verify_2fa_totp,
            commands::totp_needs_reencryption,
            // Hardware key (native FIDO2, not WebAuthn)
            commands::hardware_key_feature_available,
            commands::hardware_key_detect,
            commands::hardware_key_status,
            commands::hardware_key_register,
            commands::hardware_key_verify,
            commands::hardware_key_disable,
            commands::hardware_key_required,
            // Speech-to-Text (local whisper.cpp)
            commands::stt_check_sidecar,
            commands::stt_get_models_dir,
            commands::stt_check_model,
            commands::stt_download_model,
            commands::stt_delete_model,
            commands::stt_transcribe,
            commands::stt_transcribe_timestamped,
            commands::stt_cancel_download,
            // Books (named journals)
            commands::list_books,
            commands::create_book,
            commands::update_book,
            commands::delete_book,
            // Oura Ring health integration
            commands::oura_validate_pat,
            commands::oura_save_pat,
            commands::oura_disconnect,
            commands::oura_get_status,
            commands::oura_sync_today,
            commands::oura_get_context,
            commands::oura_get_history,
            commands::oura_backfill,
            // Media attachments
            commands::save_media_attachment,
            commands::list_entry_media,
            commands::list_all_media,
            commands::open_media_attachment,
            commands::get_media_thumbnail,
            commands::delete_media_attachment,
            // Media sync helpers
            commands::read_media_for_sync,
            commands::write_media_from_sync,
            // Multi-device sync
            commands::get_entry_timestamps,
            commands::upsert_entry_from_sync,
            // Update manager
            commands::check_for_update,
            commands::download_and_install_update,
            // Breakout writer window
            commands::open_writer_window,
            // Session bridge (password hand-off to breakout window)
            commands::store_session_password,
            commands::retrieve_session_password,
            // Signals (structured data points, Wear OS events, health snapshots)
            commands::create_signal,
            commands::list_signals,
            commands::link_signal_to_entry,
            commands::list_entry_signals,
            commands::delete_signal,
            // Sync log (incremental sync infrastructure)
            commands::get_unsynced_log,
            commands::mark_sync_log_synced,
            // Voice memos (Wear OS audio recordings)
            commands::store_voice_memo,
            commands::list_voice_memos,
            commands::get_voice_memo,
            commands::delete_voice_memo,
            commands::patch_voice_memo_transcription,
            commands::link_voice_memo_to_entry,
            commands::transcribe_voice_memo,
            // Voice memo drafts (Phase 5)
            commands::patch_voice_memo_context,
            commands::patch_voice_memo_mood,
            commands::publish_voice_memo_draft,
            commands::discard_voice_memo_draft,
            commands::list_pending_drafts,
            // Peer-to-peer sync (Phase 1: identity + discovery)
            commands::peer_get_identity,
            commands::peer_rename_device,
            commands::peer_discovery_start,
            commands::peer_discovery_stop,
            commands::peer_get_nearby,
            commands::peer_discovery_is_active,
            // Peer-to-peer sync (Phase 2: secure pairing)
            commands::peer_generate_pairing_token,
            commands::peer_accept_pairing,
            commands::peer_get_trusted,
            commands::peer_revoke_device,
            commands::peer_cancel_pairing,
            commands::peer_pairing_is_active,
            // Peer-to-peer sync (Phase 3: sync engine)
            commands::peer_start_sync_server,
            commands::peer_sync_now,
            commands::peer_get_sync_states,
            // Full DB restore (setup-time, new device ← existing device)
            commands::peer_full_restore,
            commands::peer_apply_and_restart,
            // Time capsule (seal / reveal / mood delta)
            commands::seal_entry,
            commands::get_due_capsules,
            commands::unseal_entry,
            commands::get_mood_delta,
            // StillHaven (somatic session module)
            commands::still_create_session,
            commands::still_record_activation,
            commands::still_complete_session,
            commands::still_abandon_session,
            commands::still_list_sessions,
            commands::still_get_session_with_samples,
            commands::still_get_session_brief,
            commands::still_get_journal_brief_for_session,
            commands::still_get_wellbeing_context,
            commands::still_get_effect_stats,
            commands::still_link_signal_to_session,
            // Cloud sync (Dropbox + Google Drive)
            commands::cloud_provider_auth_start,
            commands::cloud_provider_upload_blob,
            commands::cloud_provider_download_blob,
            commands::cloud_provider_status,
            commands::cloud_provider_disconnect,
            commands::cloud_provider_refresh_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn check_allows_when_no_failures() {
        let limiter = PasswordRateLimiter::new();
        assert!(limiter.check().is_ok());
    }

    #[test]
    fn check_returns_ok_after_fewer_than_5_failures() {
        let limiter = PasswordRateLimiter::new();
        for _ in 0..4 {
            limiter.record_failure();
        }
        assert!(limiter.check().is_ok());
    }

    #[test]
    fn lockout_triggered_after_5_failures() {
        let limiter = PasswordRateLimiter::new();
        for _ in 0..5 {
            limiter.record_failure();
        }
        match limiter.check() {
            Err(remaining_secs) => assert!(remaining_secs >= 29),
            Ok(()) => panic!("expected lockout after 5 failures"),
        }
    }

    #[test]
    fn record_success_clears_failure_count() {
        let limiter = PasswordRateLimiter::new();
        for _ in 0..3 {
            limiter.record_failure();
        }
        limiter.record_success();
        // 4 more failures after reset — should not hit the 5-failure threshold
        for _ in 0..4 {
            limiter.record_failure();
        }
        assert!(limiter.check().is_ok());
    }

    #[test]
    fn expired_lockout_allows_again() {
        let limiter = PasswordRateLimiter::new();
        for _ in 0..5 {
            limiter.record_failure();
        }
        // Manually expire the lockout
        {
            let mut state = limiter.state.lock().unwrap();
            state.locked_until = Some(Instant::now() - Duration::from_secs(1));
        }
        assert!(limiter.check().is_ok());
    }

    #[test]
    fn record_failure_after_expired_lockout_resets_counter() {
        let limiter = PasswordRateLimiter::new();
        for _ in 0..5 {
            limiter.record_failure();
        }
        // Manually expire the lockout
        {
            let mut state = limiter.state.lock().unwrap();
            state.locked_until = Some(Instant::now() - Duration::from_secs(1));
        }
        // 4 failures after expiry — counter was reset, should not lock again
        for _ in 0..4 {
            limiter.record_failure();
        }
        assert!(limiter.check().is_ok());
    }

    // ── TwoFactorPendingState ─────────────────────────────────────────────────

    #[test]
    fn twofa_initial_state_not_authenticated() {
        let state = TwoFactorPendingState::new();
        assert!(
            !state.is_fully_authenticated(),
            "new state must not be authenticated"
        );
    }

    #[test]
    fn twofa_password_only_no_2fa_is_authenticated() {
        let state = TwoFactorPendingState::new();
        state.on_password_verified(false); // 2FA not required
        assert!(state.is_fully_authenticated());
    }

    #[test]
    fn twofa_password_only_with_2fa_required_is_not_authenticated() {
        let state = TwoFactorPendingState::new();
        state.on_password_verified(true); // 2FA is required
        assert!(
            !state.is_fully_authenticated(),
            "2FA required but not completed"
        );
    }

    #[test]
    fn twofa_password_plus_twofa_completed_is_authenticated() {
        let state = TwoFactorPendingState::new();
        state.on_password_verified(true);
        state.on_twofa_completed();
        assert!(state.is_fully_authenticated());
    }

    #[test]
    fn twofa_reset_clears_all_state() {
        let state = TwoFactorPendingState::new();
        state.on_password_verified(true);
        state.on_twofa_completed();
        state.reset();
        assert!(
            !state.is_fully_authenticated(),
            "reset must clear auth state"
        );
    }

    #[test]
    fn twofa_bypass_attempt_without_password_fails() {
        // Simulates: attacker calls on_twofa_completed() without verify_password first.
        let state = TwoFactorPendingState::new();
        state.on_twofa_completed(); // called out of order
                                    // password_verified is still false → not fully authenticated
        assert!(!state.is_fully_authenticated());
    }
}
