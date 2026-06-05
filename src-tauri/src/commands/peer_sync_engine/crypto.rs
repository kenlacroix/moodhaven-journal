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

#[cfg(test)]
mod tests {
    use super::*;
    use rand::rngs::OsRng;
    use x25519_dalek::EphemeralSecret;

    #[test]
    fn static_key_is_symmetric() {
        let k1 = derive_sync_key_static("aaaaaa", "bbbbbb");
        let k2 = derive_sync_key_static("bbbbbb", "aaaaaa");
        assert_eq!(k1, k2, "static key derivation must be commutative");
    }

    #[test]
    fn static_key_differs_for_different_peer_pairs() {
        let k1 = derive_sync_key_static("device-a", "device-b");
        let k2 = derive_sync_key_static("device-a", "device-c");
        assert_ne!(k1, k2, "distinct peer pairs must yield distinct transport keys");
    }

    #[test]
    fn encrypt_decrypt_round_trip() {
        let key = [42u8; 32];
        let plaintext = b"hello sync world \xf0\x9f\x94\x90"; // emoji bytes
        let encrypted = encrypt_payload(&key, plaintext).unwrap();
        let decrypted = decrypt_payload(&key, &encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn each_encryption_produces_unique_ciphertext() {
        let key = [1u8; 32];
        let plaintext = b"same plaintext";
        let enc1 = encrypt_payload(&key, plaintext).unwrap();
        let enc2 = encrypt_payload(&key, plaintext).unwrap();
        // Different random nonces → different outputs (overwhelmingly likely)
        assert_ne!(enc1, enc2, "two encryptions of same plaintext must differ (unique nonces)");
    }

    #[test]
    fn decrypt_rejects_tampered_ciphertext() {
        let key = [0u8; 32];
        let mut encrypted = encrypt_payload(&key, b"secret journal data").unwrap();
        // Flip a byte in the ciphertext portion (after the 12-byte nonce)
        let idx = encrypted.len() / 2;
        encrypted[idx] ^= 0xFF;
        assert!(
            decrypt_payload(&key, &encrypted).is_err(),
            "GCM tag check must reject tampered ciphertext"
        );
    }

    #[test]
    fn decrypt_rejects_wrong_key() {
        let key_a = [0u8; 32];
        let mut key_b = [0u8; 32];
        key_b[0] = 1;
        let encrypted = encrypt_payload(&key_a, b"sensitive journal content").unwrap();
        assert!(
            decrypt_payload(&key_b, &encrypted).is_err(),
            "wrong key must not decrypt ciphertext"
        );
    }

    #[test]
    fn decrypt_rejects_frame_shorter_than_nonce() {
        let key = [0u8; 32];
        let short = vec![0u8; 11]; // less than the 12-byte nonce
        let result = decrypt_payload(&key, &short);
        assert!(result.is_err());
        assert!(
            result.unwrap_err().contains("too short"),
            "error message must mention 'too short'"
        );
    }

    #[test]
    fn decrypt_rejects_nonce_only_frame() {
        // Exactly 12 bytes = nonce present but no ciphertext — GCM tag check fails
        let key = [0u8; 32];
        let nonce_only = vec![0u8; 12];
        assert!(decrypt_payload(&key, &nonce_only).is_err());
    }

    #[test]
    fn ecdh_both_sides_derive_same_key() {
        let secret_a = EphemeralSecret::random_from_rng(OsRng);
        let pub_a = x25519_dalek::PublicKey::from(&secret_a);
        let secret_b = EphemeralSecret::random_from_rng(OsRng);
        let pub_b = x25519_dalek::PublicKey::from(&secret_b);

        let pub_a_hex = hex::encode(pub_a.as_bytes());
        let pub_b_hex = hex::encode(pub_b.as_bytes());

        // Device A sees B's ephemeral pub; Device B sees A's ephemeral pub.
        // Static keys are swapped to match the "my_static / peer_static" perspective.
        let key_a = derive_sync_key_ecdh(secret_a, &pub_b_hex, &pub_a_hex, &pub_b_hex).unwrap();
        let key_b = derive_sync_key_ecdh(secret_b, &pub_a_hex, &pub_b_hex, &pub_a_hex).unwrap();

        assert_eq!(key_a, key_b, "both parties must derive the same session key");
    }

    #[test]
    fn ecdh_rejects_invalid_hex_peer_pub() {
        let secret = EphemeralSecret::random_from_rng(OsRng);
        let result = derive_sync_key_ecdh(secret, "not-valid-hex!!", "static_a", "static_b");
        assert!(result.is_err(), "invalid hex must be rejected");
    }

    #[test]
    fn ecdh_rejects_wrong_length_peer_pub() {
        let secret = EphemeralSecret::random_from_rng(OsRng);
        // 31 bytes = 62 hex chars (X25519 public key must be exactly 32 bytes)
        let too_short = "ab".repeat(31);
        let result = derive_sync_key_ecdh(secret, &too_short, "static_a", "static_b");
        assert!(result.is_err(), "31-byte pub key must be rejected");
    }
}
