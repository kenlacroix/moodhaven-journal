//! One-shot session bridge — lets the main window hand the session password to
//! the breakout writer window without the user having to type it again.
//!
//! Security properties:
//! - The password lives in Rust memory only for the instant between the main
//!   window calling `store_session_password` and the breakout window calling
//!   `retrieve_session_password`.
//! - `retrieve_session_password` atomically takes the value (returns it and
//!   clears the slot), so the password can only be consumed once.
//! - The Rust process already holds the SQLite DB and processes all IPC — this
//!   is the same trust boundary the app already relies on.

use std::sync::Mutex;

pub struct SessionBridge {
    pub password: Mutex<Option<String>>,
}

impl SessionBridge {
    pub fn new() -> Self {
        Self { password: Mutex::new(None) }
    }
}

/// Called by the main window just before opening the breakout writer.
/// Stores the session password for single retrieval.
#[tauri::command]
pub fn store_session_password(
    state: tauri::State<SessionBridge>,
    password: String,
) -> Result<(), String> {
    let mut slot = state.password.lock().map_err(|e| e.to_string())?;
    *slot = Some(password);
    Ok(())
}

/// Called by the breakout window on init. Returns the password (if any) and
/// immediately clears it so it cannot be retrieved a second time.
#[tauri::command]
pub fn retrieve_session_password(
    state: tauri::State<SessionBridge>,
) -> Result<Option<String>, String> {
    let mut slot = state.password.lock().map_err(|e| e.to_string())?;
    Ok(slot.take())
}
