//! Desktop biometric unlock — OS keyring storage for the session password.
//!
//! On desktop (Windows / macOS / Linux) there is no platform biometric API
//! accessible from Tauri v2 without a native plugin that only targets mobile.
//! Instead we store the user's password in the **OS credential store** via the
//! `keyring` crate:
//!   - macOS  → Keychain
//!   - Windows → Credential Manager
//!   - Linux   → libsecret (GNOME Keyring / KWallet)
//!
//! Security properties:
//! - The password is stored in the OS secure store, protected by the user's OS
//!   login session.  An attacker who can read the OS credential store has already
//!   compromised the device — the same threat model as hardware-key FIDO2.
//! - `biometric_store_session` requires an unlocked app session, preventing a
//!   lock-screen attacker from poisoning the stored credential.
//! - `biometric_clear_session` is called on factory_reset and when the user
//!   disables the feature, removing the credential from the OS store.
//! - The password is never logged.
//!
//! On platforms where the OS credential store is unavailable (e.g., a headless
//! Linux server without libsecret), the commands return descriptive errors; the
//! frontend falls back gracefully to password entry.

use crate::AppLockState;
use serde::Serialize;

use super::KEYRING_SERVICE;
const KEYRING_ACCOUNT: &str = "desktop_biometric_session";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BiometricAvailability {
    pub available: bool,
    pub reason: Option<String>,
}

/// Check whether the OS credential store is accessible on this platform.
///
/// Returns `available: true` when the keyring crate can create an entry.
/// Returns `available: false` with a human-readable `reason` if not (e.g.,
/// libsecret is not running on Linux without a desktop session).
#[tauri::command]
pub fn biometric_is_available() -> BiometricAvailability {
    match keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT) {
        Ok(_) => BiometricAvailability {
            available: true,
            reason: None,
        },
        Err(e) => BiometricAvailability {
            available: false,
            reason: Some(format!("OS credential store unavailable: {e}")),
        },
    }
}

/// Store the session password in the OS credential store.
///
/// Requires an unlocked app session so the lock screen cannot call this.
/// Called by the frontend after a successful password unlock when the user
/// enables biometric unlock in Settings → Privacy.
#[tauri::command]
pub fn biometric_store_session(
    lock: tauri::State<'_, AppLockState>,
    password: String,
) -> Result<(), String> {
    if lock.is_locked() {
        return Err("Session is locked".to_string());
    }
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| format!("Failed to open OS credential store: {e}"))?;
    entry
        .set_password(&password)
        .map_err(|e| format!("Failed to store credential: {e}"))?;
    Ok(())
}

/// Retrieve the session password from the OS credential store.
///
/// On desktop there is no separate biometric challenge — the OS credential
/// store is protected by the user's OS login session.  The act of the app
/// being able to read the credential confirms the user is logged in.
///
/// Returns `Err` if no credential is stored (user must unlock with password
/// first and enable biometric unlock in Settings).
#[tauri::command]
pub fn biometric_retrieve_session() -> Result<String, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| format!("Failed to open OS credential store: {e}"))?;
    entry.get_password().map_err(|e| match e {
        keyring::Error::NoEntry => {
            "No biometric session stored. Please unlock with your password first \
             and enable biometric unlock in Settings."
                .to_string()
        }
        other => format!("Failed to retrieve credential: {other}"),
    })
}

/// Remove the session password from the OS credential store.
///
/// Called on factory_reset, on lock (optional), and when the user disables
/// biometric unlock in Settings → Privacy.  Errors are swallowed so a
/// missing entry does not surface as an error to the user.
#[tauri::command]
pub fn biometric_clear_session() -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| format!("Failed to open OS credential store: {e}"))?;
    match entry.delete_password() {
        Ok(()) => Ok(()),
        // NoEntry is fine — nothing to clear
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to clear credential: {e}")),
    }
}
