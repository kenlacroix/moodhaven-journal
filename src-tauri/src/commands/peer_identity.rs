//! Device identity management for peer-to-peer sync
//!
//! Generates and persists a stable Ed25519 keypair on first run.
//! The private key seed is stored in the OS keyring (DPAPI on Windows,
//! Keychain on macOS, Secret Service on Linux). If the keyring is unavailable
//! (e.g. headless Linux without a secrets daemon), falls back to a 0600 file.
//! Existing `peer_key.bin` files are silently migrated to the keyring on next
//! app start and the file is deleted after successful migration.
//! The public key is shared openly; the private key never leaves the device.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use ed25519_dalek::{SigningKey, VerifyingKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use tauri::{AppHandle, Manager};

const KEYRING_SERVICE: &str = "com.moodhaven.app";
const KEYRING_ACCOUNT: &str = "peer-signing-key";

/// Public device identity (safe to share, returned to frontend)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIdentity {
    pub device_name: String,
    pub device_type: String,
    pub device_id: String,  // first 16 hex chars of SHA-256(public_key)
    pub public_key: String, // base64url-encoded Ed25519 public key
    pub created: String,
}

/// Persisted identity file (also stores device name/type)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedIdentity {
    device_name: String,
    device_type: String,
    device_id: String,
    public_key: String,
    created: String,
}

fn detect_device_type() -> &'static str {
    "desktop"
}

fn default_device_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "My Device".to_string())
        .split('.')
        .next()
        .unwrap_or("My Device")
        .to_string()
}

// ── Keyring helpers ───────────────────────────────────────────────────────────

/// Try to load the Ed25519 seed from the OS keyring.
/// Returns Some(seed) on success, None if not found or keyring unavailable.
fn try_load_from_keyring() -> Option<[u8; 32]> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).ok()?;
    let hex_str = entry.get_password().ok()?;
    let bytes = hex::decode(hex_str.trim()).ok()?;
    bytes.try_into().ok()
}

/// Try to store the Ed25519 seed in the OS keyring.
/// Returns true on success, false if the keyring is unavailable.
fn try_store_in_keyring(seed: &[u8; 32]) -> bool {
    let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT) else {
        return false;
    };
    entry.set_password(&hex::encode(seed)).is_ok()
}

/// Write the seed to `peer_key.bin` with 0600 permissions (fallback path).
fn write_key_file(key_path: &std::path::Path, seed: &[u8; 32]) -> Result<(), String> {
    fs::write(key_path, seed).map_err(|e| format!("Failed to write peer_key.bin: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(key_path)
            .map_err(|e| e.to_string())?
            .permissions();
        perms.set_mode(0o600);
        fs::set_permissions(key_path, perms)
            .map_err(|e| format!("Failed to set key permissions: {e}"))?;
    }
    Ok(())
}

// ── Identity lifecycle ────────────────────────────────────────────────────────

/// Get or create this device's identity. Called on first launch and cached.
pub fn get_or_create_device_identity(app: &AppHandle) -> Result<DeviceIdentity, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;

    let identity_path = app_data_dir.join("peer_identity.json");
    let key_path = app_data_dir.join("peer_key.bin");

    // Return existing identity if the keypair is accessible (keyring or file)
    if identity_path.exists() && (key_path.exists() || try_load_from_keyring().is_some()) {
        let json = fs::read_to_string(&identity_path)
            .map_err(|e| format!("Failed to read identity: {e}"))?;
        let persisted: PersistedIdentity =
            serde_json::from_str(&json).map_err(|e| format!("Failed to parse identity: {e}"))?;

        // Migrate peer_key.bin → keyring if the file is still present
        if key_path.exists() {
            if let Ok(bytes) = fs::read(&key_path) {
                if let Ok(seed) = <[u8; 32]>::try_from(bytes.as_slice()) {
                    if try_store_in_keyring(&seed) {
                        let _ = fs::remove_file(&key_path);
                        log::info!("[peer-identity] Migrated peer_key.bin to OS keyring");
                    }
                }
            }
        }

        return Ok(DeviceIdentity {
            device_name: persisted.device_name,
            device_type: persisted.device_type,
            device_id: persisted.device_id,
            public_key: persisted.public_key,
            created: persisted.created,
        });
    }

    // Generate new Ed25519 keypair
    let signing_key = SigningKey::generate(&mut OsRng);
    let verifying_key: VerifyingKey = signing_key.verifying_key();
    let public_key_bytes = verifying_key.to_bytes();
    let seed: [u8; 32] = signing_key.to_bytes();

    // Derive device ID from public key hash
    let hash = Sha256::digest(public_key_bytes);
    let device_id = hex::encode(&hash[..8]); // 16 hex chars

    let public_key = URL_SAFE_NO_PAD.encode(public_key_bytes);
    let device_name = default_device_name();
    let device_type = detect_device_type().to_string();
    let created = chrono::Utc::now().to_rfc3339();

    let identity = PersistedIdentity {
        device_name: device_name.clone(),
        device_type: device_type.clone(),
        device_id: device_id.clone(),
        public_key: public_key.clone(),
        created: created.clone(),
    };

    // Ensure app data dir exists
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data dir: {e}"))?;

    // Store private key — keyring preferred, file fallback
    if !try_store_in_keyring(&seed) {
        write_key_file(&key_path, &seed)?;
        log::info!("[peer-identity] Keyring unavailable — stored peer key in peer_key.bin (0600)");
    } else {
        log::info!("[peer-identity] Stored peer key in OS keyring");
    }

    // Write identity JSON (public info only)
    let json = serde_json::to_string_pretty(&identity)
        .map_err(|e| format!("Failed to serialize identity: {e}"))?;
    fs::write(&identity_path, &json)
        .map_err(|e| format!("Failed to write identity: {e}"))?;

    Ok(DeviceIdentity {
        device_name,
        device_type,
        device_id,
        public_key,
        created,
    })
}

/// Update the device name in the persisted identity
pub fn update_device_name(app: &AppHandle, new_name: String) -> Result<DeviceIdentity, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    let identity_path = app_data_dir.join("peer_identity.json");

    let json =
        fs::read_to_string(&identity_path).map_err(|e| format!("Failed to read identity: {e}"))?;
    let mut persisted: PersistedIdentity =
        serde_json::from_str(&json).map_err(|e| format!("Failed to parse identity: {e}"))?;

    let name = new_name.trim().to_string();
    if name.is_empty() {
        return Err("Device name cannot be empty".to_string());
    }
    if name.len() > 64 {
        return Err("Device name must be 64 characters or less".to_string());
    }

    persisted.device_name = name.clone();

    let updated_json = serde_json::to_string_pretty(&persisted)
        .map_err(|e| format!("Failed to serialize identity: {e}"))?;
    fs::write(&identity_path, &updated_json)
        .map_err(|e| format!("Failed to write identity: {e}"))?;

    Ok(DeviceIdentity {
        device_name: persisted.device_name,
        device_type: persisted.device_type,
        device_id: persisted.device_id,
        public_key: persisted.public_key,
        created: persisted.created,
    })
}

// ── HELLO challenge helpers ───────────────────────────────────────────────────

/// Load the raw Ed25519 signing key — keyring preferred, peer_key.bin fallback.
fn load_signing_key(app: &AppHandle) -> Result<ed25519_dalek::SigningKey, String> {
    // Try OS keyring first
    if let Some(seed) = try_load_from_keyring() {
        return Ok(ed25519_dalek::SigningKey::from_bytes(&seed));
    }

    // File fallback (users who haven't migrated yet, or keyring unavailable)
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let key_path = app_data_dir.join("peer_key.bin");
    let bytes = fs::read(&key_path).map_err(|e| format!("Failed to read peer_key.bin: {e}"))?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "peer_key.bin must be exactly 32 bytes".to_string())?;
    Ok(ed25519_dalek::SigningKey::from_bytes(&arr))
}

/// Sign a HELLO challenge nonce with this device's Ed25519 private key.
/// Returns 64-byte raw signature over `b"moodhaven-hello-auth-v1:" || nonce`.
pub fn sign_hello_challenge(app: &AppHandle, nonce: &[u8]) -> Result<[u8; 64], String> {
    use ed25519_dalek::Signer;
    let key = load_signing_key(app)?;
    let mut payload = b"moodhaven-hello-auth-v1:".to_vec();
    payload.extend_from_slice(nonce);
    Ok(key.sign(&payload).to_bytes())
}

/// Verify a HELLO challenge signature against a base64url-encoded Ed25519 public key.
pub fn verify_hello_challenge(
    pubkey_b64url: &str,
    nonce: &[u8],
    sig_bytes: &[u8; 64],
) -> Result<(), String> {
    use ed25519_dalek::{Signature, Verifier};
    let pk_bytes = URL_SAFE_NO_PAD
        .decode(pubkey_b64url)
        .map_err(|e| format!("base64 decode pubkey: {e}"))?;
    let arr: [u8; 32] = pk_bytes
        .try_into()
        .map_err(|_| "public key must be 32 bytes".to_string())?;
    let vk = ed25519_dalek::VerifyingKey::from_bytes(&arr)
        .map_err(|e| format!("invalid Ed25519 public key: {e}"))?;
    let sig = Signature::from_bytes(sig_bytes);
    let mut payload = b"moodhaven-hello-auth-v1:".to_vec();
    payload.extend_from_slice(nonce);
    vk.verify(&payload, &sig)
        .map_err(|_| "Ed25519 HELLO challenge verification failed".to_string())
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Get (or create on first call) this device's identity
#[tauri::command]
pub fn peer_get_identity(app: AppHandle) -> Result<DeviceIdentity, String> {
    get_or_create_device_identity(&app)
}

/// Rename this device
#[tauri::command]
pub fn peer_rename_device(app: AppHandle, name: String) -> Result<DeviceIdentity, String> {
    update_device_name(&app, name)
}
