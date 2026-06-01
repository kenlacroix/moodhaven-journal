//! Device identity management for peer-to-peer sync
//!
//! Generates and persists a stable Ed25519 keypair on first run.
//! The public key is shared openly; the private key never leaves the device.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use ed25519_dalek::{SigningKey, VerifyingKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use tauri::{AppHandle, Manager};

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
    // On desktop we always return "desktop"
    // Mobile/watch detection would differ at compile time
    "desktop"
}

fn default_device_name() -> String {
    // Use system hostname, fallback to "My Device"
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "My Device".to_string())
        .split('.')
        .next()
        .unwrap_or("My Device")
        .to_string()
}

/// Get or create this device's identity. Called on first launch and cached.
pub fn get_or_create_device_identity(app: &AppHandle) -> Result<DeviceIdentity, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;

    let identity_path = app_data_dir.join("peer_identity.json");
    let key_path = app_data_dir.join("peer_key.bin");

    // Return cached identity if it exists and private key is present
    if identity_path.exists() && key_path.exists() {
        let json = fs::read_to_string(&identity_path)
            .map_err(|e| format!("Failed to read identity: {e}"))?;
        let persisted: PersistedIdentity =
            serde_json::from_str(&json).map_err(|e| format!("Failed to parse identity: {e}"))?;
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
    let private_key_bytes = signing_key.to_bytes();

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
    fs::create_dir_all(&app_data_dir).map_err(|e| format!("Failed to create app data dir: {e}"))?;

    // Write identity JSON (public info)
    let json = serde_json::to_string_pretty(&identity)
        .map_err(|e| format!("Failed to serialize identity: {e}"))?;
    fs::write(&identity_path, &json).map_err(|e| format!("Failed to write identity: {e}"))?;

    // Write private key bytes (raw 32-byte seed) - restricted permissions
    fs::write(&key_path, private_key_bytes)
        .map_err(|e| format!("Failed to write private key: {e}"))?;

    // Set restrictive permissions on private key (Unix only)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&key_path)
            .map_err(|e| format!("{e}"))?
            .permissions();
        perms.set_mode(0o600);
        fs::set_permissions(&key_path, perms)
            .map_err(|e| format!("Failed to set key permissions: {e}"))?;
    }

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

/// Load the raw Ed25519 signing key from peer_key.bin.
fn load_signing_key(app: &AppHandle) -> Result<ed25519_dalek::SigningKey, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let key_path = app_data_dir.join("peer_key.bin");
    let bytes =
        fs::read(&key_path).map_err(|e| format!("Failed to read peer_key.bin: {e}"))?;
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
