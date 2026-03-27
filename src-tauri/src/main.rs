//! MoodHaven Journal Desktop Application
//!
//! Entry point for the Tauri desktop application.

// Prevents additional console window on Windows in release
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

fn main() {
    moodhaven_journal_lib::run()
}
