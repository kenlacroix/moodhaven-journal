//! MoodHaven Journal Library
//!
//! Core functionality for the MoodHaven Journal Tauri application.

pub mod commands;
pub mod db;

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
            // If a full-restore pending file exists, swap it in before opening the DB.
            // This is written by `peer_full_restore` during setup and applied on next startup.
            let db_path = get_db_path(app.handle())?;
            if let Some(parent) = db_path.parent() {
                let pending = parent.join("moodhaven_restore.pending");
                if pending.exists() {
                    log::info!(
                        "[restore] Applying pending DB restore: {:?} → {:?}",
                        pending, db_path
                    );
                    if let Err(e) = std::fs::rename(&pending, &db_path) {
                        log::error!("[restore] WARNING: failed to apply pending DB: {e}");
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
                            log::warn!("[startup] unknown log_level {:?}, defaulting to Warn", other);
                        }
                        log::LevelFilter::Warn
                    }
                };
                log::set_max_level(filter);
            }

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
            // Password management
            commands::check_password_exists,
            commands::store_password_hash,
            commands::get_password_hash,
            // Journal entries
            commands::create_journal_entry,
            commands::get_journal_entry,
            commands::get_all_journal_entries,
            commands::get_journal_entries_by_date,
            commands::update_journal_entry,
            commands::delete_journal_entry,
            commands::patch_entry_location_weather,
            commands::patch_entry_pinned,
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
            commands::store_webauthn_credential_cmd,
            commands::get_webauthn_credentials,
            commands::regenerate_backup_codes,
            commands::verify_backup_code,
            commands::get_backup_codes_count,
            commands::get_2fa_status,
            commands::disable_2fa,
            commands::verify_2fa_totp,
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
            commands::sweep_preview_temp,
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
            // Signal pipeline self-test (automated testing without a watch)
            commands::debug_signal_self_test,
            // Voice memos (Wear OS audio recordings)
            commands::store_voice_memo,
            commands::list_voice_memos,
            commands::get_voice_memo,
            commands::delete_voice_memo,
            commands::patch_voice_memo_transcription,
            commands::link_voice_memo_to_entry,
            commands::transcribe_voice_memo,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
