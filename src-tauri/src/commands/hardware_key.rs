//! Native Hardware Security Key (FIDO2/CTAP2) Support
//!
//! This module provides hardware key authentication using native Rust libraries,
//! NOT browser WebAuthn APIs (which fail in Tauri WebView).
//!
//! ## Feature Flag
//!
//! This feature requires the `hardware-key` cargo feature and system dependencies:
//! - Linux: `sudo apt-get install libudev-dev`
//! - Windows: No additional dependencies
//! - macOS: No additional dependencies
//!
//! Build with: `cargo build --features hardware-key`
//!
//! ## Security Model:
//! - Password → Argon2id → Primary encryption key
//! - Hardware key → Decrypts locally stored secondary secret
//! - Both are required when hardware key is enabled
//! - Password alone won't unlock if hardware key was enabled
//! - If password is lost → data unrecoverable (no backdoors)
//!
//! The hardware key is bound to this device and acts as a local unlock factor.

use serde::{Deserialize, Serialize};

#[cfg(feature = "hardware-key")]
use crate::db::Database;
#[cfg(feature = "hardware-key")]
use crate::AppLockState;
#[cfg(feature = "hardware-key")]
use super::require_unlocked;
#[cfg(feature = "hardware-key")]
use tauri::State;

/// Hardware key status returned to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareKeyStatus {
    pub enabled: bool,
    pub device_name: Option<String>,
    pub registered_at: Option<String>,
}

/// Device info for available hardware keys
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareKeyDevice {
    pub name: String,
    pub available: bool,
}

/// Result of hardware key registration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareKeyRegistration {
    pub success: bool,
    pub device_name: String,
    pub credential_id: String,
}

/// Feature availability info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareKeyFeatureInfo {
    pub available: bool,
    pub reason: Option<String>,
    pub install_instructions: Option<String>,
}

// ============================================================================
// Feature Available Check (always compiled)
// ============================================================================

/// Check if libudev runtime library is available on Linux
#[cfg(all(feature = "hardware-key", target_os = "linux"))]
fn check_libudev_available() -> bool {
    use std::path::Path;

    // Check common locations for libudev.so
    let paths = [
        "/lib/x86_64-linux-gnu/libudev.so.1",
        "/lib/libudev.so.1",
        "/usr/lib/libudev.so.1",
        "/usr/lib/x86_64-linux-gnu/libudev.so.1",
        "/lib64/libudev.so.1",
        "/usr/lib64/libudev.so.1",
    ];

    paths.iter().any(|p| Path::new(p).exists())
}

/// Check if hardware key feature is available
#[tauri::command]
pub fn hardware_key_feature_available() -> HardwareKeyFeatureInfo {
    #[cfg(feature = "hardware-key")]
    {
        // On Linux, check if libudev runtime library is available
        #[cfg(target_os = "linux")]
        {
            if !check_libudev_available() {
                return HardwareKeyFeatureInfo {
                    available: false,
                    reason: Some(
                        "libudev library not found. Required for USB hardware key support."
                            .to_string(),
                    ),
                    install_instructions: Some(
                        "To enable hardware key support on Linux:\n\n\
                         Install the libudev library:\n   \
                            sudo apt-get install libudev1\n\n\
                         Or on Fedora/RHEL:\n   \
                            sudo dnf install systemd-libs\n\n\
                         Then restart the application."
                            .to_string(),
                    ),
                };
            }
        }

        // macOS and Windows don't need runtime library checks
        HardwareKeyFeatureInfo {
            available: true,
            reason: None,
            install_instructions: None,
        }
    }

    #[cfg(not(feature = "hardware-key"))]
    {
        let instructions = if cfg!(target_os = "linux") {
            "To enable hardware key support on Linux:\n\n\
             1. Install the required libraries:\n   \
                sudo apt-get install libudev1 libudev-dev\n\n\
             2. Rebuild the app with the feature enabled:\n   \
                cd src-tauri && cargo build --features hardware-key\n\n\
             Or run in dev mode:\n   \
                cd src-tauri && cargo run --features hardware-key"
        } else if cfg!(target_os = "macos") {
            "To enable hardware key support on macOS:\n\n\
             Rebuild the app with the feature enabled:\n   \
                cd src-tauri && cargo build --features hardware-key\n\n\
             Or run in dev mode:\n   \
                cd src-tauri && cargo run --features hardware-key"
        } else if cfg!(target_os = "windows") {
            "To enable hardware key support on Windows:\n\n\
             Rebuild the app with the feature enabled:\n   \
                cd src-tauri && cargo build --features hardware-key\n\n\
             Or run in dev mode:\n   \
                cd src-tauri && cargo run --features hardware-key"
        } else {
            "Hardware key support is not available on this platform."
        };

        HardwareKeyFeatureInfo {
            available: false,
            reason: Some(
                "Hardware key feature not compiled. Requires 'hardware-key' cargo feature."
                    .to_string(),
            ),
            install_instructions: Some(instructions.to_string()),
        }
    }
}

// ============================================================================
// Full Implementation (when feature is enabled)
// ============================================================================

#[cfg(feature = "hardware-key")]
mod implementation {
    use super::*;
    use aes_gcm::{
        aead::{Aead, KeyInit},
        Aes256Gcm, Nonce,
    };
    use argon2::{password_hash::SaltString, Argon2, PasswordHasher};
    use ctap_hid_fido2::{
        fidokey::{GetAssertionArgsBuilder, MakeCredentialArgsBuilder},
        FidoKeyHidFactory,
    };
    use rand::{rngs::OsRng, RngCore};
    use sha2::{Digest, Sha256};

    /// Stored hardware key data
    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct StoredHardwareKey {
        pub credential_id: Vec<u8>,
        pub public_key: Vec<u8>,
        pub encrypted_secret: Vec<u8>,
        pub secret_nonce: Vec<u8>,
        pub secret_salt: Vec<u8>,
        pub device_name: String,
        pub registered_at: String,
    }

    // Relying Party ID (use app name since we're not in a browser)
    pub const RP_ID: &str = "moodhaven.local";
    pub const RP_NAME: &str = "MoodHaven Journal";

    /// Generate a random 32-byte challenge
    pub fn generate_challenge() -> Vec<u8> {
        let mut challenge = vec![0u8; 32];
        OsRng.fill_bytes(&mut challenge);
        challenge
    }

    /// Generate a random 32-byte secret
    pub fn generate_secret() -> Vec<u8> {
        let mut secret = vec![0u8; 32];
        OsRng.fill_bytes(&mut secret);
        secret
    }

    /// Derive encryption key from assertion signature using Argon2id
    pub fn derive_key_from_assertion(
        assertion_sig: &[u8],
        salt: &[u8],
    ) -> Result<[u8; 32], String> {
        let mut hasher = Sha256::new();
        hasher.update(assertion_sig);
        let sig_hash = hasher.finalize();

        let argon2 = Argon2::default();
        let salt_string = SaltString::encode_b64(salt).map_err(|e| format!("Salt error: {}", e))?;

        let password_hash = argon2
            .hash_password(&sig_hash, &salt_string)
            .map_err(|e| format!("Argon2 error: {}", e))?;

        let hash_bytes = password_hash.hash.ok_or("No hash generated")?;
        let hash_slice = hash_bytes.as_bytes();

        let mut key = [0u8; 32];
        key.copy_from_slice(&hash_slice[..32]);
        Ok(key)
    }

    /// Encrypt data with AES-256-GCM
    pub fn encrypt_secret(secret: &[u8], key: &[u8; 32]) -> Result<(Vec<u8>, Vec<u8>), String> {
        let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("Cipher error: {}", e))?;

        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, secret)
            .map_err(|e| format!("Encryption error: {}", e))?;

        Ok((ciphertext, nonce_bytes.to_vec()))
    }

    /// Decrypt data with AES-256-GCM
    pub fn decrypt_secret(
        ciphertext: &[u8],
        key: &[u8; 32],
        nonce: &[u8],
    ) -> Result<Vec<u8>, String> {
        let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("Cipher error: {}", e))?;
        let nonce = Nonce::from_slice(nonce);

        cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| format!("Decryption error: {}", e))
    }

    /// Get stored hardware key from database
    pub fn get_stored_hardware_key(db: &Database) -> Result<Option<StoredHardwareKey>, String> {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        let result = conn.query_row(
            "SELECT value FROM settings WHERE key = 'hardware_key_data'",
            [],
            |row| row.get::<_, String>(0),
        );

        match result {
            Ok(json) => {
                let data: StoredHardwareKey =
                    serde_json::from_str(&json).map_err(|e| format!("Parse error: {}", e))?;
                Ok(Some(data))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(format!("Query error: {}", e)),
        }
    }

    /// Store hardware key in database
    pub fn store_hardware_key(db: &Database, data: &StoredHardwareKey) -> Result<(), String> {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let json = serde_json::to_string(data).map_err(|e| format!("Serialize error: {}", e))?;

        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('hardware_key_data', ?1, CURRENT_TIMESTAMP)",
            [&json],
        )
        .map_err(|e| format!("Insert error: {}", e))?;

        Ok(())
    }

    /// Delete hardware key from database
    pub fn delete_hardware_key(db: &Database) -> Result<(), String> {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        conn.execute("DELETE FROM settings WHERE key = 'hardware_key_data'", [])
            .map_err(|e| format!("Delete error: {}", e))?;

        Ok(())
    }

    /// Check if any FIDO2 hardware keys are connected
    pub fn detect_devices() -> Result<Vec<HardwareKeyDevice>, String> {
        let devices = FidoKeyHidFactory::create_fido_key_hid()
            .map_err(|e| format!("Failed to scan for devices: {}", e))?;

        let mut result = Vec::new();

        for device in devices {
            let info = device.get_info();
            let name = info
                .map(|i| {
                    i.versions
                        .first()
                        .map(|v| v.to_string())
                        .unwrap_or_else(|| "FIDO2 Device".to_string())
                })
                .unwrap_or_else(|_| "Unknown Device".to_string());

            result.push(HardwareKeyDevice {
                name,
                available: true,
            });
        }

        Ok(result)
    }

    /// Register a hardware key
    pub fn register_key(db: &Database) -> Result<HardwareKeyRegistration, String> {
        let devices = FidoKeyHidFactory::create_fido_key_hid()
            .map_err(|e| format!("No hardware keys found: {}", e))?;

        let device = devices
            .into_iter()
            .next()
            .ok_or("No hardware key connected")?;

        let device_name = device
            .get_info()
            .map(|i| {
                i.versions
                    .first()
                    .map(|v| v.to_string())
                    .unwrap_or_else(|| "FIDO2 Device".to_string())
            })
            .unwrap_or_else(|_| "Hardware Key".to_string());

        let mut user_id = [0u8; 32];
        OsRng.fill_bytes(&mut user_id);
        let challenge = generate_challenge();

        let args = MakeCredentialArgsBuilder::new(RP_ID, &challenge)
            .rp_name(RP_NAME)
            .user_id(&user_id)
            .user_name("MoodHaven User")
            .user_display_name("MoodHaven User")
            .build();

        let result = device
            .make_credential_with_args(&args)
            .map_err(|e| format!("Registration failed: {}", e))?;

        let credential_id = result.credential_id.clone();
        let public_key = result.public_key.clone();

        let assertion_challenge = generate_challenge();

        let assertion_args = GetAssertionArgsBuilder::new(RP_ID, &assertion_challenge)
            .credential_id(&credential_id)
            .build();

        let assertion = device
            .get_assertion_with_args(&assertion_args)
            .map_err(|e| format!("Confirmation failed: {}", e))?;

        let secret = generate_secret();
        let mut salt = [0u8; 16];
        OsRng.fill_bytes(&mut salt);

        let key = derive_key_from_assertion(&assertion.signature, &salt)?;
        let (encrypted_secret, nonce) = encrypt_secret(&secret, &key)?;

        let stored_data = StoredHardwareKey {
            credential_id: credential_id.clone(),
            public_key,
            encrypted_secret,
            secret_nonce: nonce,
            secret_salt: salt.to_vec(),
            device_name: device_name.clone(),
            registered_at: chrono::Utc::now().to_rfc3339(),
        };

        store_hardware_key(db, &stored_data)?;

        let credential_id_hex = hex::encode(&credential_id);

        Ok(HardwareKeyRegistration {
            success: true,
            device_name,
            credential_id: credential_id_hex,
        })
    }

    /// Verify hardware key and return decrypted secret
    pub fn verify_key(db: &Database) -> Result<String, String> {
        let stored = get_stored_hardware_key(db)?.ok_or("No hardware key registered")?;

        let devices = FidoKeyHidFactory::create_fido_key_hid()
            .map_err(|e| format!("No hardware keys found: {}", e))?;

        let device = devices
            .into_iter()
            .next()
            .ok_or("No hardware key connected")?;

        let challenge = generate_challenge();

        let args = GetAssertionArgsBuilder::new(RP_ID, &challenge)
            .credential_id(&stored.credential_id)
            .build();

        let assertion = device
            .get_assertion_with_args(&args)
            .map_err(|e| format!("Verification failed: {}", e))?;

        let key = derive_key_from_assertion(&assertion.signature, &stored.secret_salt)?;
        let secret = decrypt_secret(&stored.encrypted_secret, &key, &stored.secret_nonce)?;

        Ok(hex::encode(secret))
    }

    /// Disable hardware key
    pub fn disable_key(db: &Database) -> Result<bool, String> {
        verify_key(db)?;
        delete_hardware_key(db)?;
        Ok(true)
    }

    /// Check if hardware key is required
    pub fn is_required(db: &Database) -> Result<bool, String> {
        let stored = get_stored_hardware_key(db)?;
        Ok(stored.is_some())
    }

    /// Get hardware key status
    pub fn get_status(db: &Database) -> Result<HardwareKeyStatus, String> {
        let stored = get_stored_hardware_key(db)?;

        match stored {
            Some(data) => Ok(HardwareKeyStatus {
                enabled: true,
                device_name: Some(data.device_name),
                registered_at: Some(data.registered_at),
            }),
            None => Ok(HardwareKeyStatus {
                enabled: false,
                device_name: None,
                registered_at: None,
            }),
        }
    }
}

// ============================================================================
// Tauri Commands - Full Implementation
// ============================================================================

#[cfg(feature = "hardware-key")]
#[tauri::command]
pub fn hardware_key_detect() -> Result<Vec<HardwareKeyDevice>, String> {
    implementation::detect_devices()
}

#[cfg(feature = "hardware-key")]
#[tauri::command]
pub fn hardware_key_status(db: State<Database>) -> Result<HardwareKeyStatus, String> {
    implementation::get_status(&db)
}

#[cfg(feature = "hardware-key")]
#[tauri::command]
pub fn hardware_key_register(
    db: State<Database>,
    lock: State<'_, AppLockState>,
) -> Result<HardwareKeyRegistration, String> {
    require_unlocked(&lock)?;
    implementation::register_key(&db)
}

#[cfg(feature = "hardware-key")]
#[tauri::command]
pub fn hardware_key_verify(
    db: State<Database>,
    twofa_state: tauri::State<'_, crate::TwoFactorPendingState>,
) -> Result<String, String> {
    let result = implementation::verify_key(&db)?;
    // Mark 2FA complete so unlock_app will proceed for hardware key users.
    // Without this, TwoFactorPendingState would leave twofa_completed=false and
    // unlock_app would reject the session even after successful key verification.
    twofa_state.on_twofa_completed();
    Ok(result)
}

#[cfg(feature = "hardware-key")]
#[tauri::command]
pub fn hardware_key_disable(db: State<Database>) -> Result<bool, String> {
    implementation::disable_key(&db)
}

#[cfg(feature = "hardware-key")]
#[tauri::command]
pub fn hardware_key_required(db: State<Database>) -> Result<bool, String> {
    implementation::is_required(&db)
}

// ============================================================================
// Tauri Commands - Stub Implementation (feature disabled)
// ============================================================================

#[cfg(not(feature = "hardware-key"))]
const FEATURE_DISABLED_MSG: &str =
    "Hardware key feature not available. Rebuild with --features hardware-key";

#[cfg(not(feature = "hardware-key"))]
#[tauri::command]
pub fn hardware_key_detect() -> Result<Vec<HardwareKeyDevice>, String> {
    Err(FEATURE_DISABLED_MSG.to_string())
}

#[cfg(not(feature = "hardware-key"))]
#[tauri::command]
pub fn hardware_key_status() -> Result<HardwareKeyStatus, String> {
    Ok(HardwareKeyStatus {
        enabled: false,
        device_name: None,
        registered_at: None,
    })
}

#[cfg(not(feature = "hardware-key"))]
#[tauri::command]
pub fn hardware_key_register() -> Result<HardwareKeyRegistration, String> {
    Err(FEATURE_DISABLED_MSG.to_string())
}

#[cfg(not(feature = "hardware-key"))]
#[tauri::command]
pub fn hardware_key_verify() -> Result<String, String> {
    Err(FEATURE_DISABLED_MSG.to_string())
}

#[cfg(not(feature = "hardware-key"))]
#[tauri::command]
pub fn hardware_key_disable() -> Result<bool, String> {
    Err(FEATURE_DISABLED_MSG.to_string())
}

#[cfg(not(feature = "hardware-key"))]
#[tauri::command]
pub fn hardware_key_required() -> Result<bool, String> {
    Ok(false)
}
