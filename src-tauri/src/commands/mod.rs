//! Tauri commands for MoodHaven Journal
//!
//! These commands are invoked from the React frontend via IPC.

use crate::AppLockState;
use tauri::State;

pub const KEYRING_SERVICE: &str = "com.moodhaven.app";

/// Shared lock guard used by all command modules.
pub(crate) fn require_unlocked(lock: &State<'_, AppLockState>) -> Result<(), String> {
    if lock.is_locked() {
        Err("Session is locked".to_string())
    } else {
        Ok(())
    }
}

pub mod activities;
pub mod analytics;
pub mod biometric;
pub mod books;
pub mod cloud_providers;
pub mod data_management;
pub mod hardware_key;
pub mod journal;
pub mod media;
pub mod oura;
pub mod peer_discovery;
pub mod peer_identity;
pub mod peer_pairing;
pub mod peer_sync_engine;
pub mod pin_unlock;
pub mod session_bridge;
pub mod settings;
pub mod signals;
pub mod speech_to_text;
pub mod still;
pub mod sync;
pub mod time_capsule;
pub mod two_factor;
pub mod updater;
pub mod voice_memos;
pub mod writer_window;

pub use activities::*;
pub use analytics::*;
pub use biometric::*;
pub use books::*;
pub use cloud_providers::*;
pub use data_management::*;
pub use hardware_key::*;
pub use journal::*;
pub use media::*;
pub use oura::*;
pub use peer_discovery::*;
pub use peer_identity::*;
pub use peer_pairing::*;
pub use peer_sync_engine::*;
pub use pin_unlock::*;
pub use session_bridge::*;
pub use settings::*;
pub use signals::*;
pub use speech_to_text::*;
pub use still::*;
pub use sync::*;
pub use time_capsule::*;
pub use two_factor::*;
pub use updater::*;
pub use voice_memos::*;
pub use writer_window::*;

#[cfg(test)]
mod tests {
    use crate::AppLockState;

    #[test]
    fn new_lock_state_starts_locked() {
        let s = AppLockState::new();
        assert!(
            s.is_locked(),
            "app must start locked until password is verified"
        );
    }

    #[test]
    fn lock_state_reports_unlocked_after_unlock() {
        let s = AppLockState::new();
        *s.0.lock().unwrap() = false;
        assert!(!s.is_locked());
    }

    #[test]
    fn lock_state_can_be_re_locked() {
        let s = AppLockState::new();
        *s.0.lock().unwrap() = false;
        assert!(!s.is_locked());
        *s.0.lock().unwrap() = true;
        assert!(s.is_locked());
    }
}
