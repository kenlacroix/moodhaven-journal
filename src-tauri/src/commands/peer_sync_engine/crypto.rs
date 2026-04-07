//! Sync-specific cryptographic helpers: transport key derivation and AES-GCM encrypt/decrypt.

use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
use rand::RngCore;
use sha2::{Digest, Sha256};
use x25519_dalek::{EphemeralSecret, PublicKey as X25519PublicKey};

// ── Key derivation ────────────────────────────────────────────────────────────

/// Legacy: static key from both Ed25519 public keys (no forward secrecy).
/// Used as fallback when the remote peer does not advertise an eph_pub.
pub fn derive_sync_key_static(pub_a: &str, pub_b: &str) -> [u8; 32] {
    let mut keys = [pub_a, pub_b];
    keys.sort_unstable();
    let mut h = Sha256::new();
    h.update(b"moodhaven-sync-v1:");
    h.update(keys[0].as_bytes());
    h.update(keys[1].as_bytes());
    h.finalize().into()
}

/// v2: ephemeral X25519 ECDH + static identity binding → forward-secret session key.
/// session_key = SHA-256("moodhaven-sync-v2:" || X25519_shared || sorted(static_a, static_b))
pub fn derive_sync_key_ecdh(
    my_eph_secret: EphemeralSecret,
    peer_eph_pub_hex: &str,
    my_static_pub: &str,
    peer_static_pub: &str,
) -> Result<[u8; 32], String> {
    let peer_bytes =
        hex::decode(peer_eph_pub_hex).map_err(|e| format!("bad peer eph_pub hex: {e}"))?;
    let peer_arr: [u8; 32] = peer_bytes
        .try_into()
        .map_err(|_| "peer eph_pub must be 32 bytes".to_string())?;
    let peer_pub = X25519PublicKey::from(peer_arr);
    let shared = my_eph_secret.diffie_hellman(&peer_pub);

    let mut static_keys = [my_static_pub, peer_static_pub];
    static_keys.sort_unstable();
    let mut h = Sha256::new();
    h.update(b"moodhaven-sync-v2:");
    h.update(shared.as_bytes());
    h.update(static_keys[0].as_bytes());
    h.update(static_keys[1].as_bytes());
    Ok(h.finalize().into())
}

// ── Encrypt / decrypt ─────────────────────────────────────────────────────────

/// Encrypt plaintext → [12-byte nonce][ciphertext]
pub fn encrypt_payload(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("AES init: {e}"))?;
    let mut nonce_bytes = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("Encrypt: {e}"))?;
    let mut out = nonce_bytes.to_vec();
    out.extend(ct);
    Ok(out)
}

/// Decrypt [12-byte nonce][ciphertext] → plaintext
pub fn decrypt_payload(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 12 {
        return Err("Frame too short to decrypt".into());
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("AES init: {e}"))?;
    let (nonce_bytes, ct) = data.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ct)
        .map_err(|_| "Decryption failed (wrong key or tampered data)".to_string())
}
