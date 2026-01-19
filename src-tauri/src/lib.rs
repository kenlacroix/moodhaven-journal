//! MoodBloom Library
//!
//! Core functionality for the MoodBloom Tauri application.

pub mod commands;
pub mod db;

use db::{get_db_path, Database};
use tauri::Manager;

/// Initialize and run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize database
            let db_path = get_db_path(&app.handle())?;
            let database = Database::new(db_path)
                .map_err(|e| anyhow::anyhow!("Database initialization failed: {}", e))?;

            // Manage database state
            app.manage(database);

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
