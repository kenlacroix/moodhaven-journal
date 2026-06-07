//! One-shot session bridge — lets the main window hand the session password to
//! the breakout writer window without the user having to type it again.
//!
//! Security properties:
//! - The password lives in Rust memory only for the instant between the main
//!   window calling `store_session_password` and the breakout window calling
//!   `retrieve_session_password`.
//! - `retrieve_session_password` atomically takes the value (returns it and
//!   clears the slot), so the password can only be consumed once.
//! - A short TTL bounds how long an unconsumed password can linger (writer
//!   window never opened / crashed before init). Stale entries are wiped on the
//!   next store/retrieve.
//! - `lock_app` and `factory_reset` clear the bridge, so the plaintext never
//!   survives a lock cycle.
//! - `store_session_password` requires an unlocked session — prevents bridge
//!   poisoning from the locked lock screen.
//! - The Rust process already holds the SQLite DB and processes all IPC — this
//!   is the same trust boundary the app already relies on.

use crate::AppLockState;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use zeroize::Zeroizing;

/// How long a stored password remains retrievable before it is treated as stale.
const BRIDGE_TTL: Duration = Duration::from_secs(60);

pub struct SessionBridge {
    slot: Mutex<Option<(Zeroizing<String>, Instant)>>,
}

impl Default for SessionBridge {
    fn default() -> Self {
        Self {
            slot: Mutex::new(None),
        }
    }
}

impl SessionBridge {
    pub fn new() -> Self {
        Self::default()
    }

    /// Wipe any stored password. Called on lock and factory reset.
    pub fn clear(&self) {
        if let Ok(mut slot) = self.slot.lock() {
            *slot = None; // Zeroizing drops + wipes the String
        }
    }
}

/// Called by the main window just before opening the breakout writer.
/// Stores the session password for single retrieval.
/// Requires an unlocked session — prevents bridge poisoning from the lock screen.
#[tauri::command]
pub fn store_session_password(
    state: tauri::State<SessionBridge>,
    lock: tauri::State<'_, AppLockState>,
    password: String,
) -> Result<(), String> {
    // Wrap before the lock check so the plaintext is wiped even on the
    // locked-early-return path.
    let password = Zeroizing::new(password);
    if lock.is_locked() {
        return Err("Session is locked".to_string());
    }
    let mut slot = state.slot.lock().map_err(|e| e.to_string())?;
    *slot = Some((password, Instant::now()));
    Ok(())
}

/// Called by the breakout window on init. Returns the password (if any and not
/// expired) and immediately clears it so it cannot be retrieved a second time.
#[tauri::command]
pub fn retrieve_session_password(
    state: tauri::State<SessionBridge>,
) -> Result<Option<String>, String> {
    let mut slot = state.slot.lock().map_err(|e| e.to_string())?;
    match slot.take() {
        Some((pw, stored_at)) if stored_at.elapsed() <= BRIDGE_TTL => Ok(Some(pw.to_string())),
        _ => Ok(None), // none stored or expired — slot already cleared by take()
    }
}
