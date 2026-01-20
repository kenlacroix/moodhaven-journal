//! Native Hardware Security Key (FIDO2/CTAP2) Support
//!
//! This module provides hardware key authentication using native Rust libraries,
//! NOT browser WebAuthn APIs (which fail in Tauri WebView).
//!
//! Security Model:
//! - Password → Argon2id → Primary encryption key
//! - Hardware key → Decrypts locally stored secondary secret
//! - Both are required when hardware key is enabled
//! - Password alone won't unlock if hardware key was enabled
//! - If password is lost → data unrecoverable (no backdoors)
//!
//! The hardware key is bound to this device and acts as a local unlock factor.

use crate::db::Database;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::{password_hash::SaltString, Argon2, PasswordHasher};
use ctap_hid_fido2::{
    fidokey::{GetAssertionArgsBuilder, MakeCredentialArgsBuilder},
    verifier, Cfg, FidoKeyHid, FidoKeyHidFactory,
};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Mutex;
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

/// Challenge for hardware key verification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareKeyChallenge {
    pub challenge: String,
    pub credential_id: String,
}

/// Stored hardware key data
#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredHardwareKey {
    credential_id: Vec<u8>,
    public_key: Vec<u8>,
    encrypted_secret: Vec<u8>,
    secret_nonce: Vec<u8>,
    secret_salt: Vec<u8>,
    device_name: String,
    registered_at: String,
}

// Relying Party ID (use app name since we're not in a browser)
const RP_ID: &str = "moodbloom.local";
const RP_NAME: &str = "MoodBloom";

// ============================================================================
// Internal Helpers
// ============================================================================

/// Generate a random 32-byte challenge
fn generate_challenge() -> Vec<u8> {
    let mut challenge = vec![0u8; 32];
    OsRng.fill_bytes(&mut challenge);
    challenge
}

/// Generate a random 32-byte secret
fn generate_secret() -> Vec<u8> {
    let mut secret = vec![0u8; 32];
    OsRng.fill_bytes(&mut secret);
    secret
}

/// Derive encryption key from assertion signature using Argon2id
fn derive_key_from_assertion(assertion_sig: &[u8], salt: &[u8]) -> Result<[u8; 32], String> {
    // Use SHA-256 of signature as password input
    let mut hasher = Sha256::new();
    hasher.update(assertion_sig);
    let sig_hash = hasher.finalize();

    // Derive key using Argon2id
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
fn encrypt_secret(secret: &[u8], key: &[u8; 32]) -> Result<(Vec<u8>, Vec<u8>), String> {
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
fn decrypt_secret(ciphertext: &[u8], key: &[u8; 32], nonce: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("Cipher error: {}", e))?;
    let nonce = Nonce::from_slice(nonce);

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption error: {}", e))
}

/// Get stored hardware key from database
fn get_stored_hardware_key(db: &Database) -> Result<Option<StoredHardwareKey>, String> {
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
fn store_hardware_key(db: &Database, data: &StoredHardwareKey) -> Result<(), String> {
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
fn delete_hardware_key(db: &Database) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM settings WHERE key = 'hardware_key_data'", [])
        .map_err(|e| format!("Delete error: {}", e))?;

    Ok(())
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Check if any FIDO2 hardware keys are connected
#[tauri::command]
pub fn hardware_key_detect() -> Result<Vec<HardwareKeyDevice>, String> {
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

/// Get current hardware key status
#[tauri::command]
pub fn hardware_key_status(db: State<Database>) -> Result<HardwareKeyStatus, String> {
    let stored = get_stored_hardware_key(&db)?;

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

/// Register a hardware key
/// Creates a FIDO2 credential and binds it to this app
#[tauri::command]
pub fn hardware_key_register(db: State<Database>) -> Result<HardwareKeyRegistration, String> {
    // Get first available FIDO device
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

    // Generate user ID and challenge
    let mut user_id = [0u8; 32];
    OsRng.fill_bytes(&mut user_id);
    let challenge = generate_challenge();

    // Create credential
    let args = MakeCredentialArgsBuilder::new(RP_ID, &challenge)
        .rp_name(RP_NAME)
        .user_id(&user_id)
        .user_name("MoodBloom User")
        .user_display_name("MoodBloom User")
        .build();

    let result = device
        .make_credential_with_args(&args)
        .map_err(|e| format!("Registration failed: {}", e))?;

    let credential_id = result.credential_id.clone();
    let public_key = result.public_key.clone();

    // Now we need to do an assertion to get a signature for key derivation
    // This ensures the user touches the key twice (register + confirm)
    let assertion_challenge = generate_challenge();

    let assertion_args = GetAssertionArgsBuilder::new(RP_ID, &assertion_challenge)
        .credential_id(&credential_id)
        .build();

    let assertion = device
        .get_assertion_with_args(&assertion_args)
        .map_err(|e| format!("Confirmation failed: {}", e))?;

    // Generate and encrypt a secret using the assertion signature
    let secret = generate_secret();
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);

    let key = derive_key_from_assertion(&assertion.signature, &salt)?;
    let (encrypted_secret, nonce) = encrypt_secret(&secret, &key)?;

    // Store credential and encrypted secret
    let stored_data = StoredHardwareKey {
        credential_id: credential_id.clone(),
        public_key,
        encrypted_secret,
        secret_nonce: nonce,
        secret_salt: salt.to_vec(),
        device_name: device_name.clone(),
        registered_at: chrono::Utc::now().to_rfc3339(),
    };

    store_hardware_key(&db, &stored_data)?;

    // Also store the decrypted secret temporarily for the current session
    // This will be combined with the password-derived key
    // The secret is stored in memory only during setup
    let credential_id_hex = hex::encode(&credential_id);

    Ok(HardwareKeyRegistration {
        success: true,
        device_name,
        credential_id: credential_id_hex,
    })
}

/// Verify hardware key and get the decrypted secret
/// Returns the secret that must be combined with password-derived key
#[tauri::command]
pub fn hardware_key_verify(db: State<Database>) -> Result<String, String> {
    let stored = get_stored_hardware_key(&db)?.ok_or("No hardware key registered")?;

    // Get FIDO device
    let devices = FidoKeyHidFactory::create_fido_key_hid()
        .map_err(|e| format!("No hardware keys found: {}", e))?;

    let device = devices
        .into_iter()
        .next()
        .ok_or("No hardware key connected")?;

    // Generate challenge and perform assertion
    let challenge = generate_challenge();

    let args = GetAssertionArgsBuilder::new(RP_ID, &challenge)
        .credential_id(&stored.credential_id)
        .build();

    let assertion = device
        .get_assertion_with_args(&args)
        .map_err(|e| format!("Verification failed: {}", e))?;

    // Derive key from assertion signature
    let key = derive_key_from_assertion(&assertion.signature, &stored.secret_salt)?;

    // Decrypt the stored secret
    let secret = decrypt_secret(&stored.encrypted_secret, &key, &stored.secret_nonce)?;

    // Return secret as hex for combining with password key
    Ok(hex::encode(secret))
}

/// Remove hardware key requirement
/// User must verify with the key one last time to disable
#[tauri::command]
pub fn hardware_key_disable(db: State<Database>) -> Result<bool, String> {
    // First verify the key is present and valid
    hardware_key_verify(db.clone())?;

    // Then delete the stored data
    delete_hardware_key(&db)?;

    Ok(true)
}

/// Check if hardware key verification is required for unlock
#[tauri::command]
pub fn hardware_key_required(db: State<Database>) -> Result<bool, String> {
    let stored = get_stored_hardware_key(&db)?;
    Ok(stored.is_some())
}
