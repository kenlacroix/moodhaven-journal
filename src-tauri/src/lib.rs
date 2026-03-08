//! MoodBloom Library
//!
//! Core functionality for the MoodBloom Tauri application.

pub mod commands;
pub mod db;

use commands::session_bridge::SessionBridge;
use db::{get_db_path, Database};
use tauri::Manager;

/// Initialize and run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Initialize database
            let db_path = get_db_path(&app.handle())?;
            let database = Database::new(db_path)
                .map_err(|e| anyhow::anyhow!("Database initialization failed: {}", e))?;

            // Manage database state
            app.manage(database);

            // One-shot session bridge for breakout writer password hand-off
            app.manage(SessionBridge::new());

            // Sweep leftover preview temp files from previous sessions
            let _ = commands::sweep_preview_temp(app.handle().clone());

            // Open devtools in debug mode
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
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
            // Books (named journals)
            commands::list_books,
            commands::create_book,
            commands::update_book,
            commands::delete_book,
            // Oura Ring health integration
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
