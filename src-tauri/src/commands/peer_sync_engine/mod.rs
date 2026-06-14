//! Peer-to-peer LAN sync engine (Phase 3)
//!
//! ## Protocol overview (sequential, one TCP connection per sync)
//!
//! ```text
//! Client → Server: HELLO plain  {t:"hello", did:"<deviceId>"}
//! Server → Client: OK    plain  {t:"ok",    name:"<serverName>"}
//! Client → Server: MANIFEST enc {t:"manifest", entries:[…], books:[…], signals:[…], settings:[…]}
//! Server → Client: MANIFEST enc {same shape}
//!
//! ── Entry phase ──────────────────────────────────────────────────────────────
//! Server → Client: ENTRY       enc  {t:"entry",    row:{…}} × N
//! Server → Client: DONE        enc  {t:"done",     sent:N}
//! Client → Server: ENTRY       enc  {t:"entry",    row:{…}} × M
//! Client → Server: DONE        enc  {t:"done",     sent:M}
//! Server → Client: DONE_ACK    enc  {t:"done_ack", recv:M}
//!
//! ── Books phase ──────────────────────────────────────────────────────────────
//! Server → Client: BOOK        enc  {t:"book",       row:{…}} × A
//! Server → Client: BOOKS_DONE  enc  {t:"books_done", sent:A}
//! Client → Server: BOOK        enc  {t:"book",       row:{…}} × B
//! Client → Server: BOOKS_DONE  enc  {t:"books_done", sent:B}
//! Server → Client: BOOKS_ACK   enc  {t:"books_ack",  recv:B}
//!
//! ── Signals phase ────────────────────────────────────────────────────────────
//! Server → Client: SIGNAL      enc  {t:"signal",       row:{…}} × C
//! Server → Client: SIGNALS_DONE enc {t:"signals_done", sent:C}
//! Client → Server: SIGNAL      enc  {t:"signal",       row:{…}} × D
//! Client → Server: SIGNALS_DONE enc {t:"signals_done", sent:D}
//! Server → Client: SIGNALS_ACK enc  {t:"signals_ack",  recv:D}
//!
//! ── Settings phase ───────────────────────────────────────────────────────────
//! Server → Client: SETTING      enc  {t:"setting",       key, value, updated_at} × E
//! Server → Client: SETTINGS_DONE enc {t:"settings_done", sent:E}
//! Client → Server: SETTING      enc  {t:"setting",       key, value, updated_at} × F
//! Client → Server: SETTINGS_DONE enc {t:"settings_done", sent:F}
//! Server → Client: SETTINGS_ACK enc  {t:"settings_ack",  recv:F}
//! Server closes write-half; client closes both halves.
//! Both: update peer_sync_state, emit events.
//! ```
//!
//! ## Transport encryption
//!
//! **v2 (primary):** Forward-secret session key via ephemeral X25519 ECDH.
//! Both sides include an ephemeral X25519 public key in their HELLO/Ok messages.
//! After ECDH the server issues a 32-byte random challenge; the client responds
//! with an Ed25519 signature over `"moodhaven-hello-auth-v1:" || challenge_bytes`
//! using their device private key, proving possession before any data is exchanged.
//! `session_key = SHA-256("moodhaven-sync-v2:" || ecdh_shared || sorted(pub_A, pub_B))`
//!
//! Frame format: [4-byte big-endian length][12-byte nonce][AES-256-GCM ciphertext]

mod conflict;
mod connection;
mod crypto;
mod protocol;

use conflict::*;
use connection::*;
use crypto::*;
pub use protocol::sync_port_for_device;
use protocol::*;

use chrono::Utc;
use serde::Serialize;
use std::net::{TcpListener, TcpStream, ToSocketAddrs};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use x25519_dalek::{EphemeralSecret, PublicKey as X25519PublicKey};

use crate::commands::peer_identity::get_or_create_device_identity;
use crate::commands::peer_pairing::{load_trusted_devices, remove_trusted_device};
use crate::commands::require_unlocked;
use crate::db::{Database, JournalEntryRow};
use crate::AppLockState;

// ── Managed state ─────────────────────────────────────────────────────────────

pub struct SyncEngineState {
    pub is_running: AtomicBool,
    stop_tx: Mutex<Option<mpsc::SyncSender<()>>>,
    server_handle: Mutex<Option<JoinHandle<()>>>,
}

impl Default for SyncEngineState {
    fn default() -> Self {
        Self {
            is_running: AtomicBool::new(false),
            stop_tx: Mutex::new(None),
            server_handle: Mutex::new(None),
        }
    }
}

impl SyncEngineState {
    pub fn new() -> Self {
        Self::default()
    }
}

unsafe impl Send for SyncEngineState {}
unsafe impl Sync for SyncEngineState {}

/// How long a "restore armed" window stays open before it auto-expires.
const RESTORE_ARM_TTL: Duration = Duration::from_secs(300); // 5 minutes

/// Consent gate for full-DB restore serving.
///
/// A trusted peer can complete the Ed25519 handshake using a previously-paired
/// key, so trust alone is not sufficient authorization to hand over the entire
/// database. The serving device's user must explicitly arm restore (Settings →
/// Devices → "Set up a new device") within a short window before any
/// `RestoreRequest` is honored. The flag is single-use and time-limited, so a
/// lost/compromised-but-still-trusted peer cannot silently pull the full DB.
#[derive(Default)]
pub struct RestoreArmState {
    armed_at: Mutex<Option<Instant>>,
}

impl RestoreArmState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns true and consumes the arm window if it is currently armed and fresh.
    /// One-shot: a successful check disarms so each arming permits a single restore.
    fn consume_if_armed(&self) -> bool {
        let mut slot = match self.armed_at.lock() {
            Ok(s) => s,
            Err(_) => return false,
        };
        match *slot {
            Some(t) if t.elapsed() <= RESTORE_ARM_TTL => {
                *slot = None;
                true
            }
            _ => {
                *slot = None; // clear stale
                false
            }
        }
    }

    fn is_armed(&self) -> bool {
        self.armed_at
            .lock()
            .ok()
            .and_then(|s| *s)
            .map(|t| t.elapsed() <= RESTORE_ARM_TTL)
            .unwrap_or(false)
    }

    /// Clear any armed window. Called on lock so an armed-then-locked device does
    /// not keep serving full-DB restores while the session is locked.
    pub fn clear(&self) {
        if let Ok(mut slot) = self.armed_at.lock() {
            *slot = None;
        }
    }
}

/// Arm the device to serve one full-DB restore to a new device within the next
/// 5 minutes. Requires an unlocked session.
#[tauri::command]
pub fn peer_arm_restore(
    lock: State<'_, AppLockState>,
    arm: State<'_, RestoreArmState>,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    *arm.armed_at.lock().map_err(|e| e.to_string())? = Some(Instant::now());
    log::info!(
        "[restore] Full-DB restore armed for {}s",
        RESTORE_ARM_TTL.as_secs()
    );
    Ok(())
}

/// Cancel a pending restore-armed window. Requires an unlocked session.
#[tauri::command]
pub fn peer_disarm_restore(
    lock: State<'_, AppLockState>,
    arm: State<'_, RestoreArmState>,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    *arm.armed_at.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

/// Report whether restore is currently armed (for UI state).
#[tauri::command]
pub fn peer_restore_is_armed(arm: State<'_, RestoreArmState>) -> Result<bool, String> {
    Ok(arm.is_armed())
}

// ── Full-restore server handler ───────────────────────────────────────────────

/// Stream the local SQLite DB file to the requesting client in 4 MB chunks.
///
/// Protocol (both sides have already completed HELLO/OK and key exchange):
///   Client sent:  RestoreRequest  (encrypted JSON)
///   Server sends: RestoreChunk    (encrypted JSON envelope) + encrypted binary frame × N
///   Server sends: RestoreEnd      (encrypted JSON)
///   Server closes.
///
/// Each logical "chunk" is two TCP frames:
///   1. Encrypted JSON: RestoreChunk { seq, total_chunks, offset, total_bytes }
///   2. AES-GCM encrypted binary: the chunk bytes (transport key, same as JSON frames)
///
/// The read timeout is extended to 5 minutes during the transfer to handle
/// slow Wi-Fi or large databases.
const RESTORE_CHUNK_BYTES: usize = 4 * 1024 * 1024; // 4 MiB

/// Returned to callers when a peer omits `eph_pub` in the handshake.
/// The v1 static-key fallback was removed in v1.8.0 (no forward secrecy).
const V1_FALLBACK_REMOVED_MSG: &str =
    "Server did not send eph_pub — v1 static-key fallback has been removed. Peer must be upgraded to v2.";

/// Expected decoded length (bytes) of the PBKDF2 password salt. The frontend
/// generates it as `SALT_LENGTH = 16` (128 bits) in `crypto.ts`; the same length
/// is used for the at-rest db_state.json salt. A restore that advertises any other
/// length is rejected so a compromised source cannot poison db_state.json.
const RESTORE_SALT_LEN: usize = 16;

/// Validate the `encrypted`/`salt` pair received in `RestoreEnd` before it is
/// written to the restored device's authoritative db_state.json.
///
/// A trusted-but-compromised source controls these fields, so they must be
/// checked at receipt:
/// - `encrypted == false` ⇒ `salt` MUST be `None`.
/// - `encrypted == true`  ⇒ `salt` MUST be `Some`, decode as standard base64,
///   and decode to exactly `RESTORE_SALT_LEN` bytes.
///
/// Rejecting `encrypted:true` + `salt:None` outright avoids reproducing the
/// "encryption record missing" permanent lockout this path is meant to prevent.
pub(crate) fn validate_restore_salt(encrypted: bool, salt: &Option<String>) -> Result<(), String> {
    use base64::Engine as _;
    match (encrypted, salt) {
        (false, None) => Ok(()),
        (false, Some(_)) => {
            Err("Restore rejected: unencrypted source must not supply a salt".to_string())
        }
        (true, None) => Err(
            "Restore rejected: encrypted source supplied no salt (would cause permanent lockout)"
                .to_string(),
        ),
        (true, Some(s)) => {
            let decoded = base64::engine::general_purpose::STANDARD
                .decode(s)
                .map_err(|_| "Restore rejected: salt is not valid base64".to_string())?;
            if decoded.len() != RESTORE_SALT_LEN {
                return Err(format!(
                    "Restore rejected: salt decodes to {} bytes, expected {RESTORE_SALT_LEN}",
                    decoded.len()
                ));
            }
            Ok(())
        }
    }
}

/// Compute the integrity digest that binds the restored DB bytes to the
/// db_state.json salt so a verified DB can never be paired with a poison salt.
///
/// digest = hex(SHA-256(db_bytes || dbstate_json))
///
/// The writer (`do_full_restore_client`) and BOTH verifiers (the lib.rs startup
/// promotion block and `peer_apply_and_restart`) must compute this identically.
pub fn restore_integrity_digest(db_bytes: &[u8], dbstate_json: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(db_bytes);
    hasher.update(dbstate_json);
    hex::encode(hasher.finalize())
}

fn do_serve_restore(
    app: &AppHandle,
    stream: &mut TcpStream,
    key: &[u8; 32],
    client_device_id: &str,
    client_name: &str,
) -> Result<(), String> {
    // Give the transfer up to 5 minutes per chunk.
    stream
        .set_write_timeout(Some(Duration::from_secs(300)))
        .map_err(|e| format!("set write timeout: {e}"))?;

    let db_path = crate::db::get_db_path(app)?;
    let db_bytes =
        std::fs::read(&db_path).map_err(|e| format!("Failed to read DB for restore: {e}"))?;
    let total_bytes = db_bytes.len() as u64;
    let total_chunks = db_bytes.len().div_ceil(RESTORE_CHUNK_BYTES);

    // Read the source's encryption state so the restored device can write a
    // matching db_state.json. Without the salt the restored device cannot derive
    // the SQLCipher key and could never unlock. The salt is not secret (it is
    // already public in db_state.json on every device that shares this password).
    let source_state = crate::db::read_db_state(&db_path);

    log::info!(
        "[restore] Serving DB ({} bytes, {} chunks) to {}",
        total_bytes,
        total_chunks,
        client_name
    );

    let _ = app.emit(
        "peer:restore_serving",
        serde_json::json!({
            "deviceId": client_device_id,
            "deviceName": client_name,
            "totalBytes": total_bytes,
        }),
    );

    for (seq, chunk) in db_bytes.chunks(RESTORE_CHUNK_BYTES).enumerate() {
        let offset = (seq * RESTORE_CHUNK_BYTES) as u64;

        // Encrypted JSON envelope describing this chunk.
        write_msg_enc(
            stream,
            key,
            &Msg::RestoreChunk {
                seq: seq as u64,
                total_chunks: total_chunks as u64,
                offset,
                total_bytes,
            },
        )?;

        write_frame_enc_binary(stream, key, chunk)?;

        log::debug!(
            "[restore] Sent chunk {}/{} ({} bytes)",
            seq + 1,
            total_chunks,
            chunk.len()
        );
    }

    // Signal completion, including the source's encryption state + salt so the
    // restored device can derive the same SQLCipher key.
    write_msg_enc(
        stream,
        key,
        &Msg::RestoreEnd {
            total_bytes,
            chunks: total_chunks as u64,
            encrypted: source_state.encrypted,
            salt: source_state.salt.clone(),
        },
    )?;

    log::info!("[restore] Done serving DB to {}", client_name);
    Ok(())
}

// ── Full-restore client handler ────────────────────────────────────────────────

/// Connect to `host:port`, authenticate, request the server's full DB, receive
/// it chunk-by-chunk, and write the result to `{app_data}/moodhaven_restore.pending`.
///
/// Emits `peer:restore_progress` events and, on completion, `peer:restore_ready`.
/// The caller (frontend) should then invoke `peer_apply_and_restart` to swap the
/// pending file in and restart the app.
fn do_full_restore_client(app: &AppHandle, peer_device_id: &str, host: &str) -> Result<(), String> {
    use std::io::Write as _;

    let port = sync_port_for_device(peer_device_id);
    let addr = format!("{host}:{port}");

    log::info!("[restore] Connecting to {addr} for full restore");

    let addrs: Vec<_> = addr
        .to_socket_addrs()
        .map_err(|e| format!("DNS resolve {addr}: {e}"))?
        .collect();
    let mut stream =
        TcpStream::connect_timeout(addrs.first().ok_or("no addr")?, Duration::from_secs(10))
            .map_err(|e| format!("connect to {addr}: {e}"))?;

    // Generous timeouts for large transfers.
    stream
        .set_read_timeout(Some(Duration::from_secs(300)))
        .map_err(|e| format!("set read timeout: {e}"))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(60)))
        .map_err(|e| format!("set write timeout: {e}"))?;

    // ── HELLO / OK ────────────────────────────────────────────────────────────
    let my_identity = get_or_create_device_identity(app)?;
    let trusted = load_trusted_devices(app)?;
    let peer_device = trusted
        .iter()
        .find(|d| d.device_id == peer_device_id)
        .ok_or_else(|| format!("Device {peer_device_id} is not in trusted list"))?;

    let my_eph_secret = EphemeralSecret::random_from_rng(rand::rngs::OsRng);
    let my_eph_pub_hex = hex::encode(X25519PublicKey::from(&my_eph_secret).as_bytes());

    write_msg(
        &mut stream,
        &Msg::Hello {
            did: my_identity.device_id.clone(),
            eph_pub: Some(my_eph_pub_hex),
            features: local_features(),
        },
    )?;

    // Restore path has no feature-gated phases, so OK features are ignored here.
    let (server_name, server_eph_pub, server_challenge) = match read_msg(&mut stream)? {
        Msg::Ok {
            name,
            eph_pub,
            challenge,
            ..
        } => (name, eph_pub, challenge),
        Msg::NotTrusted { server_device_id } => {
            // Auto-revoke stale trust entry.
            let _ = remove_trusted_device(app, &server_device_id);
            let _ = app.emit(
                "peer:trust_revoked",
                serde_json::json!({ "deviceId": server_device_id }),
            );
            return Err(format!(
                "Server {server_device_id} does not trust this device"
            ));
        }
        other => return Err(format!("Expected OK, got: {other:?}")),
    };

    // Prove our identity via Ed25519 signature if the server sent a challenge.
    if let Some(ref challenge_hex) = server_challenge {
        let nonce =
            hex::decode(challenge_hex).map_err(|e| format!("Bad server challenge hex: {e}"))?;
        let sig = crate::commands::peer_identity::sign_hello_challenge(app, &nonce)?;
        write_msg(
            &mut stream,
            &Msg::Auth {
                signature: hex::encode(sig),
            },
        )?;
        log::debug!("[restore] Sent Ed25519 AUTH response");
    }

    let key = match server_eph_pub {
        Some(ref hex) => derive_sync_key_ecdh(
            my_eph_secret,
            hex,
            &my_identity.public_key,
            &peer_device.public_key,
        )?,
        None => {
            return Err(V1_FALLBACK_REMOVED_MSG.to_string());
        }
    };

    log::info!("[restore] Connected to {server_name}, requesting full DB");

    // ── Send RestoreRequest ───────────────────────────────────────────────────
    write_msg_enc(&mut stream, &key, &Msg::RestoreRequest)?;

    // ── Receive chunks ────────────────────────────────────────────────────────
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| anyhow::anyhow!(e))
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let pending_path = app_data.join("moodhaven_restore.pending");
    let tmp_path = app_data.join("moodhaven_restore.tmp");
    let checksum_path = app_data.join("moodhaven_restore.pending.sha256");
    let dbstate_path = app_data.join("moodhaven_restore.pending.dbstate");

    // Finding 3 (LOW): delete any pre-existing restore companions so a new restore
    // can never inherit a previous run's checksum or dbstate. These files are
    // co-located by filename only, so a stale companion would otherwise be applied
    // against the wrong DB.
    let _ = std::fs::remove_file(&pending_path);
    let _ = std::fs::remove_file(&tmp_path);
    let _ = std::fs::remove_file(&checksum_path);
    let _ = std::fs::remove_file(&dbstate_path);

    let mut file = std::fs::File::create(&tmp_path).map_err(|e| format!("create tmp file: {e}"))?;

    let mut bytes_received: u64 = 0;
    let mut chunks_received: u64 = 0;
    // Source encryption state, captured from RestoreEnd. Persisted alongside the
    // pending DB so peer_apply_and_restart can write db_state.json after promotion.
    let restore_encrypted;
    let restore_salt: Option<String>;

    loop {
        match read_msg_enc(&mut stream, &key)? {
            Msg::RestoreChunk {
                seq,
                total_chunks,
                offset: _,
                total_bytes,
            } => {
                let chunk_data = read_frame_enc_binary(&mut stream, &key)?;
                file.write_all(&chunk_data)
                    .map_err(|e| format!("write chunk {seq}: {e}"))?;
                bytes_received += chunk_data.len() as u64;
                chunks_received += 1;

                let pct = if total_bytes > 0 {
                    (bytes_received as f64 / total_bytes as f64) * 100.0
                } else {
                    0.0
                };
                log::debug!(
                    "[restore] Received chunk {}/{} ({:.1}%)",
                    chunks_received,
                    total_chunks,
                    pct
                );
                let _ = app.emit(
                    "peer:restore_progress",
                    serde_json::json!({
                        "bytesReceived": bytes_received,
                        "totalBytes": total_bytes,
                        "percentage": pct,
                        "chunksReceived": chunks_received,
                        "totalChunks": total_chunks,
                        "deviceName": server_name,
                    }),
                );
            }
            Msg::RestoreEnd {
                total_bytes,
                chunks,
                encrypted,
                salt,
            } => {
                // Finding 1 (HIGH): a trusted-but-compromised source controls these
                // fields. Validate before persisting anything; on violation, clean up
                // the tmp file (no companions written yet) and abort the restore.
                if let Err(e) = validate_restore_salt(encrypted, &salt) {
                    drop(file);
                    let _ = std::fs::remove_file(&tmp_path);
                    log::warn!("[restore] {e}");
                    return Err(e);
                }
                restore_encrypted = encrypted;
                restore_salt = salt;
                log::info!(
                    "[restore] Transfer complete: {} bytes in {} chunks (encrypted={})",
                    total_bytes,
                    chunks,
                    restore_encrypted
                );
                break;
            }
            Msg::Err { msg } => {
                return Err(format!("Server reported error during restore: {msg}"));
            }
            other => {
                return Err(format!("Unexpected message during restore: {other:?}"));
            }
        }
    }

    file.flush()
        .map_err(|e| format!("flush restore file: {e}"))?;
    drop(file);

    // Serialize the source's encryption state. Persisted alongside the pending DB
    // so peer_apply_and_restart can write a matching db_state.json after promoting
    // the DB. Without this, the restored device has the encrypted DB but no salt
    // and can never derive the key. The salt has already been validated above.
    let dbstate = crate::db::DbStateFile {
        encrypted: restore_encrypted,
        salt: restore_salt,
    };
    let dbstate_json =
        serde_json::to_vec(&dbstate).map_err(|e| format!("serialize restore dbstate: {e}"))?;

    // Finding 2 (MEDIUM): bind the dbstate salt into the integrity checksum. The
    // digest covers `db_bytes || dbstate_json` so a verified DB can never be paired
    // with a poison salt by a local attacker or on-disk tamper. Both verifiers
    // recompute this exact value before applying the restore.
    let db_bytes =
        std::fs::read(&tmp_path).map_err(|e| format!("read restore tmp for hash: {e}"))?;
    let digest = restore_integrity_digest(&db_bytes, &dbstate_json);
    drop(db_bytes);

    // Write the dbstate companion, then the checksum that binds it.
    std::fs::write(&dbstate_path, &dbstate_json)
        .map_err(|e| format!("write restore dbstate: {e}"))?;
    std::fs::write(&checksum_path, &digest).map_err(|e| format!("write restore checksum: {e}"))?;
    log::info!("[restore] SHA-256 of pending DB + dbstate: {digest}");

    // Atomically move tmp → pending.
    std::fs::rename(&tmp_path, &pending_path).map_err(|e| format!("rename restore file: {e}"))?;

    let _ = app.emit(
        "peer:restore_ready",
        serde_json::json!({
            "totalBytes": bytes_received,
            "deviceName": server_name,
        }),
    );

    log::info!("[restore] Pending file written to {:?}", pending_path);
    Ok(())
}

// ── Server connection handler ─────────────────────────────────────────────────

fn do_handle_sync_connection(app: &AppHandle, mut stream: TcpStream) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(60)))
        .map_err(|e| format!("set read timeout: {e}"))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(30)))
        .map_err(|e| format!("set write timeout: {e}"))?;

    // Step 1: Read HELLO (plaintext)
    let hello = read_msg(&mut stream)?;
    let (client_device_id, client_eph_pub, client_features) = match hello {
        Msg::Hello {
            did,
            eph_pub,
            features,
        } => (did, eph_pub, features),
        other => return Err(format!("Expected HELLO, got: {other:?}")),
    };

    // Look up client's public key from trusted devices
    let trusted = load_trusted_devices(app)?;
    let client_device = trusted.iter().find(|d| d.device_id == client_device_id);

    // Get our own identity (needed for both the NotTrusted and OK paths)
    let my_identity = get_or_create_device_identity(app)?;

    // If the connecting device is not trusted, tell it explicitly so it can
    // auto-revoke us from its own trusted list and update its UI.
    let client_device = match client_device {
        Some(d) => d,
        None => {
            log::warn!(
                "[sync] Server: rejecting unknown device {client_device_id} — sending NotTrusted"
            );
            let _ = write_msg(
                &mut stream,
                &Msg::NotTrusted {
                    server_device_id: my_identity.device_id.clone(),
                },
            );
            let _ = stream.shutdown(std::net::Shutdown::Both);
            // Emit so the server-side UI can surface "unknown device attempted sync"
            let _ = app.emit(
                "peer:sync_unknown_peer",
                serde_json::json!({ "deviceId": client_device_id }),
            );
            return Ok(());
        }
    };
    let client_pubkey = client_device.public_key.clone();
    let client_name = client_device.device_name.clone();

    // Generate our ephemeral X25519 keypair and HELLO challenge for this session.
    use rand::RngCore as _;
    let my_eph_secret = EphemeralSecret::random_from_rng(rand::rngs::OsRng);
    let my_eph_pub_hex = hex::encode(X25519PublicKey::from(&my_eph_secret).as_bytes());
    let mut challenge = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut challenge);
    let challenge_hex = hex::encode(challenge);

    // Step 2: Send OK (plaintext) — eph_pub for ECDH, challenge for identity proof.
    write_msg(
        &mut stream,
        &Msg::Ok {
            name: my_identity.device_name.clone(),
            eph_pub: Some(my_eph_pub_hex),
            challenge: Some(challenge_hex),
            features: local_features(),
        },
    )?;

    // Step 2b: Read AUTH — client must sign the challenge with its Ed25519 private key.
    let auth_sig_hex = match read_msg(&mut stream)? {
        Msg::Auth { signature } => signature,
        other => {
            let _ = write_msg(
                &mut stream,
                &Msg::Err {
                    msg: "Expected AUTH".to_string(),
                },
            );
            let _ = stream.shutdown(std::net::Shutdown::Both);
            return Err(format!(
                "[sync] Server: expected AUTH from {client_device_id}, got: {other:?}"
            ));
        }
    };
    let auth_sig_bytes =
        hex::decode(&auth_sig_hex).map_err(|e| format!("Bad AUTH signature hex: {e}"))?;
    let auth_sig_arr: [u8; 64] = auth_sig_bytes
        .try_into()
        .map_err(|_| "AUTH signature must be 64 bytes".to_string())?;
    if let Err(e) = crate::commands::peer_identity::verify_hello_challenge(
        &client_pubkey,
        &challenge,
        &auth_sig_arr,
    ) {
        log::warn!("[sync] Server: HELLO auth failed for {client_device_id}: {e}");
        let _ = write_msg(
            &mut stream,
            &Msg::Err {
                msg: "Authentication failed".to_string(),
            },
        );
        let _ = stream.shutdown(std::net::Shutdown::Both);
        return Err(format!("[sync] HELLO auth failed for {client_device_id}"));
    }
    log::info!("[sync] Server: {client_device_id} authenticated via Ed25519 HELLO challenge");

    // Derive session key: v2 X25519 ECDH required; reject peers that omit eph_pub.
    let key = match client_eph_pub {
        Some(ref hex) => {
            derive_sync_key_ecdh(my_eph_secret, hex, &my_identity.public_key, &client_pubkey)?
        }
        None => {
            log::warn!(
                "[sync] Server: peer sent no eph_pub — v1 static-key fallback removed, closing"
            );
            let _ = write_msg(
                &mut stream,
                &Msg::Err {
                    msg: "v1 static-key protocol is no longer supported. Upgrade your MoodHaven client.".to_string(),
                },
            );
            let _ = stream.shutdown(std::net::Shutdown::Both);
            return Err(format!(
                "[sync] Rejected {client_device_id}: no eph_pub (v1 fallback removed)"
            ));
        }
    };

    // Emit sync_started
    let _ = app.emit(
        "peer:sync_started",
        serde_json::json!({
            "deviceId": client_device_id,
            "deviceName": client_name,
        }),
    );

    // Step 3: Read client's first encrypted message — either MANIFEST (normal
    // incremental sync) or RESTORE_REQUEST (new-device full-DB transfer).
    let first_msg = read_msg_enc(&mut stream, &key)?;

    // ── Full-restore path ─────────────────────────────────────────────────────
    if matches!(first_msg, Msg::RestoreRequest) {
        // Trust alone is not authorization to hand over the whole DB. The serving
        // user must have explicitly armed restore within the last RESTORE_ARM_TTL.
        let armed = app
            .try_state::<RestoreArmState>()
            .map(|s| s.consume_if_armed())
            .unwrap_or(false);
        if !armed {
            log::warn!(
                "[restore] Rejected RestoreRequest from {client_device_id}: device not armed for restore"
            );
            let _ = write_msg_enc(
                &mut stream,
                &key,
                &Msg::Err {
                    msg: "Restore not authorized. On the source device, choose \
                          Settings → Devices → Set up a new device to allow restore."
                        .to_string(),
                },
            );
            let _ = stream.shutdown(std::net::Shutdown::Both);
            return Err(format!(
                "[restore] Rejected unarmed RestoreRequest from {client_device_id}"
            ));
        }
        return do_serve_restore(app, &mut stream, &key, &client_device_id, &client_name);
    }

    let (client_entries, client_books, client_signals, client_settings, client_voice_memos) =
        match first_msg {
            Msg::Manifest {
                entries,
                books,
                signals,
                settings,
                voice_memos,
            } => (entries, books, signals, settings, voice_memos),
            other => return Err(format!("Expected MANIFEST from client, got: {other:?}")),
        };

    // Step 4: Get our manifest (lock DB, then drop)
    let (my_entries, my_books, my_signals, my_settings, my_voice_memos) = {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        (
            db_get_entries_manifest(&conn)?,
            db_get_books_manifest(&conn)?,
            db_get_signals_manifest(&conn)?,
            db_get_settings_manifest(&conn)?,
            db_get_voice_memos_manifest(&conn)?,
        )
    };

    // Step 5: Send our MANIFEST
    write_msg_enc(
        &mut stream,
        &key,
        &Msg::Manifest {
            entries: my_entries.clone(),
            books: my_books.clone(),
            signals: my_signals.clone(),
            settings: my_settings.clone(),
            voice_memos: my_voice_memos.clone(),
        },
    )?;

    // ── Compute diffs ────────────────────────────────────────────────────────
    let client_entry_map: std::collections::HashMap<&str, &str> = client_entries
        .iter()
        .map(|e| (e.id.as_str(), e.updated_at.as_str()))
        .collect();
    let need_entries_by_client: Vec<String> = my_entries
        .iter()
        .filter(|e| {
            client_entry_map
                .get(e.id.as_str())
                .map(|&cat| e.updated_at.as_str() > cat)
                .unwrap_or(true)
        })
        .map(|e| e.id.clone())
        .collect();

    let my_entry_map: std::collections::HashMap<&str, &str> = my_entries
        .iter()
        .map(|e| (e.id.as_str(), e.updated_at.as_str()))
        .collect();
    let need_entries_by_me: Vec<String> = client_entries
        .iter()
        .filter(|e| {
            my_entry_map
                .get(e.id.as_str())
                .map(|&mat| e.updated_at.as_str() > mat)
                .unwrap_or(true)
        })
        .map(|e| e.id.clone())
        .collect();

    // Books diffs (same LWW pattern)
    let client_book_map: std::collections::HashMap<&str, &str> = client_books
        .iter()
        .map(|e| (e.id.as_str(), e.updated_at.as_str()))
        .collect();
    let need_books_by_client: Vec<String> = my_books
        .iter()
        .filter(|e| {
            client_book_map
                .get(e.id.as_str())
                .map(|&cat| e.updated_at.as_str() > cat)
                .unwrap_or(true)
        })
        .map(|e| e.id.clone())
        .collect();

    let my_book_map: std::collections::HashMap<&str, &str> = my_books
        .iter()
        .map(|e| (e.id.as_str(), e.updated_at.as_str()))
        .collect();
    let need_books_by_me: Vec<String> = client_books
        .iter()
        .filter(|e| {
            my_book_map
                .get(e.id.as_str())
                .map(|&mat| e.updated_at.as_str() > mat)
                .unwrap_or(true)
        })
        .map(|e| e.id.clone())
        .collect();

    // Signals diffs (INSERT OR IGNORE — missing IDs only)
    let my_signal_ids: std::collections::HashSet<&str> =
        my_signals.iter().map(|s| s.id.as_str()).collect();
    let need_signals_by_client: Vec<String> = my_signals
        .iter()
        .filter(|s| !client_signals.iter().any(|cs| cs.id == s.id))
        .map(|s| s.id.clone())
        .collect();
    let need_signals_by_me: Vec<String> = client_signals
        .iter()
        .filter(|s| !my_signal_ids.contains(s.id.as_str()))
        .map(|s| s.id.clone())
        .collect();

    // Settings diffs (LWW per key)
    let client_settings_map: std::collections::HashMap<&str, &str> = client_settings
        .iter()
        .map(|s| (s.id.as_str(), s.updated_at.as_str()))
        .collect();
    let need_settings_by_client: Vec<String> = my_settings
        .iter()
        .filter(|s| {
            client_settings_map
                .get(s.id.as_str())
                .map(|&cat| s.updated_at.as_str() > cat)
                .unwrap_or(true)
        })
        .map(|s| s.id.clone())
        .collect();

    let my_settings_map: std::collections::HashMap<&str, &str> = my_settings
        .iter()
        .map(|s| (s.id.as_str(), s.updated_at.as_str()))
        .collect();
    let need_settings_by_me: Vec<String> = client_settings
        .iter()
        .filter(|s| {
            my_settings_map
                .get(s.id.as_str())
                .map(|&mat| s.updated_at.as_str() > mat)
                .unwrap_or(true)
        })
        .map(|s| s.id.clone())
        .collect();

    // Voice memo diffs (LWW per id, same pattern as books)
    let client_vm_map: std::collections::HashMap<&str, &str> = client_voice_memos
        .iter()
        .map(|m| (m.id.as_str(), m.updated_at.as_str()))
        .collect();
    let need_voice_memos_by_client: Vec<String> = my_voice_memos
        .iter()
        .filter(|m| {
            client_vm_map
                .get(m.id.as_str())
                .map(|&cat| m.updated_at.as_str() > cat)
                .unwrap_or(true)
        })
        .map(|m| m.id.clone())
        .collect();

    let my_vm_map: std::collections::HashMap<&str, &str> = my_voice_memos
        .iter()
        .map(|m| (m.id.as_str(), m.updated_at.as_str()))
        .collect();
    let need_voice_memos_by_me: Vec<String> = client_voice_memos
        .iter()
        .filter(|m| {
            my_vm_map
                .get(m.id.as_str())
                .map(|&mat| m.updated_at.as_str() > mat)
                .unwrap_or(true)
        })
        .map(|m| m.id.clone())
        .collect();

    // ── Entry phase ──────────────────────────────────────────────────────────

    // Step 6: Fetch and send entries client needs (DB lock per batch, no lock during send)
    let to_send = {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        db_get_entries_full(&conn, &need_entries_by_client)?
    };
    let entries_sent = to_send.len();
    for entry_row in to_send {
        write_msg_enc(&mut stream, &key, &Msg::Entry { row: entry_row })?;
    }
    write_msg_enc(&mut stream, &key, &Msg::Done { sent: entries_sent })?;

    // Step 7: Receive entries from client until DONE — collect, don't upsert yet
    let mut recv_entries: Vec<JournalEntryRow> = Vec::new();
    loop {
        let msg = read_msg_enc(&mut stream, &key)?;
        match msg {
            Msg::Entry { row } => {
                if recv_entries.len() >= need_entries_by_me.len() + 1000 {
                    return Err("Sync protocol error: unexpected entry count".into());
                }
                recv_entries.push(row);
            }
            Msg::Done { sent } => {
                log::info!(
                    "[sync] Server: client sent {sent} entries, we received {} new",
                    recv_entries.len()
                );
                break;
            }
            other => return Err(format!("Unexpected msg in entry recv: {other:?}")),
        }
    }
    // Send DONE_ACK for entries (connection stays open — more phases follow)
    write_msg_enc(
        &mut stream,
        &key,
        &Msg::DoneAck {
            recv: recv_entries.len(),
        },
    )?;

    // ── Books phase ──────────────────────────────────────────────────────────

    let books_to_send = {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        db_get_books_full(&conn, &need_books_by_client)?
    };
    let books_sent = books_to_send.len();
    for book in books_to_send {
        write_msg_enc(&mut stream, &key, &Msg::Book { row: book })?;
    }
    write_msg_enc(&mut stream, &key, &Msg::BooksDone { sent: books_sent })?;

    let mut recv_books: Vec<SyncBookRow> = Vec::new();
    loop {
        match read_msg_enc(&mut stream, &key)? {
            Msg::Book { row } => {
                if recv_books.len() >= need_books_by_me.len() + 500 {
                    return Err("Sync protocol error: unexpected book count".into());
                }
                recv_books.push(row);
            }
            Msg::BooksDone { sent } => {
                log::info!(
                    "[sync] Server: client sent {sent} books, we received {} new/updated",
                    recv_books.len()
                );
                break;
            }
            other => return Err(format!("Unexpected msg in books recv: {other:?}")),
        }
    }
    write_msg_enc(
        &mut stream,
        &key,
        &Msg::BooksAck {
            recv: recv_books.len(),
        },
    )?;

    // ── Signals phase ────────────────────────────────────────────────────────

    let signals_to_send = {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        db_get_signals_full(&conn, &need_signals_by_client)?
    };
    let signals_sent = signals_to_send.len();
    for signal in signals_to_send {
        write_msg_enc(&mut stream, &key, &Msg::Signal { row: signal })?;
    }
    write_msg_enc(&mut stream, &key, &Msg::SignalsDone { sent: signals_sent })?;

    let mut recv_signals: Vec<SyncSignalRow> = Vec::new();
    loop {
        match read_msg_enc(&mut stream, &key)? {
            Msg::Signal { row } => {
                if recv_signals.len() >= need_signals_by_me.len() + 10_000 {
                    return Err("Sync protocol error: unexpected signal count".into());
                }
                recv_signals.push(row);
            }
            Msg::SignalsDone { sent } => {
                log::info!(
                    "[sync] Server: client sent {sent} signals, we received {} new",
                    recv_signals.len()
                );
                break;
            }
            other => return Err(format!("Unexpected msg in signals recv: {other:?}")),
        }
    }
    write_msg_enc(
        &mut stream,
        &key,
        &Msg::SignalsAck {
            recv: recv_signals.len(),
        },
    )?;

    // ── Settings phase ───────────────────────────────────────────────────────

    let settings_to_send: Vec<(String, String, String)> = {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for key_name in &need_settings_by_client {
            if let Some((value, updated_at)) = db_get_setting_for_sync(&conn, key_name)? {
                out.push((key_name.clone(), value, updated_at));
            }
        }
        out
    };
    let settings_sent = settings_to_send.len();
    for (k, v, ua) in settings_to_send {
        write_msg_enc(
            &mut stream,
            &key,
            &Msg::Setting {
                key: k,
                value: v,
                updated_at: ua,
            },
        )?;
    }
    write_msg_enc(
        &mut stream,
        &key,
        &Msg::SettingsDone {
            sent: settings_sent,
        },
    )?;

    let mut recv_settings: Vec<(String, String, String)> = Vec::new();
    loop {
        match read_msg_enc(&mut stream, &key)? {
            Msg::Setting {
                key: k,
                value: v,
                updated_at: ua,
            } => {
                if recv_settings.len() >= need_settings_by_me.len() + 100 {
                    return Err("Sync protocol error: unexpected setting count".into());
                }
                recv_settings.push((k, v, ua));
            }
            Msg::SettingsDone { sent } => {
                log::info!(
                    "[sync] Server: client sent {sent} settings, we received {} updated",
                    recv_settings.len()
                );
                break;
            }
            other => return Err(format!("Unexpected msg in settings recv: {other:?}")),
        }
    }
    write_msg_enc(
        &mut stream,
        &key,
        &Msg::SettingsAck {
            recv: recv_settings.len(),
        },
    )?;

    // ── Voice memos phase (only when BOTH peers advertise `voice_memos`) ─────────
    // `recv_voice_memos` is declared outside the gate so the apply transaction
    // below still has it in scope when the phase is skipped (the peer is an older
    // build that omits the feature, so we stay on the legacy message sequence).
    let mut recv_voice_memos: Vec<(SyncVoiceMemoRow, String)> = Vec::new();
    let mut voice_memos_sent = 0usize;
    if client_features.iter().any(|f| f == FEATURE_VOICE_MEMOS) {
        let vm_to_send = {
            let db = app
                .try_state::<Database>()
                .ok_or_else(|| "No DB state".to_string())?;
            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            db_get_voice_memos_full(&conn, &need_voice_memos_by_client)?
        };
        for (row, file_path) in vm_to_send {
            match read_voice_memo_audio_b64(app, &file_path) {
                Ok(audio_base64) => {
                    write_msg_enc(&mut stream, &key, &Msg::VoiceMemo { row, audio_base64 })?;
                    voice_memos_sent += 1;
                }
                Err(e) => log::warn!("[sync] Server: skip voice memo {} — {e}", row.id),
            }
        }
        write_msg_enc(
            &mut stream,
            &key,
            &Msg::VoiceMemosDone {
                sent: voice_memos_sent,
            },
        )?;

        loop {
            match read_msg_enc(&mut stream, &key)? {
                Msg::VoiceMemo { row, audio_base64 } => {
                    if recv_voice_memos.len() >= need_voice_memos_by_me.len() + 1000 {
                        return Err("Sync protocol error: unexpected voice memo count".into());
                    }
                    recv_voice_memos.push((row, audio_base64));
                }
                Msg::VoiceMemosDone { sent } => {
                    log::info!(
                        "[sync] Server: client sent {sent} voice memos, we received {}",
                        recv_voice_memos.len()
                    );
                    break;
                }
                other => return Err(format!("Unexpected msg in voice memos recv: {other:?}")),
            }
        }
        write_msg_enc(
            &mut stream,
            &key,
            &Msg::VoiceMemosAck {
                recv: recv_voice_memos.len(),
            },
        )?;
    } else {
        log::info!(
            "[sync] peer does not advertise `{FEATURE_VOICE_MEMOS}` — skipping voice memo phase"
        );
    }

    // Apply all received data in one atomic transaction — TCP drop before COMMIT
    // leaves the DB untouched; partial state is impossible.
    // Count actual upserts (not total received) so ack/log reflect new-or-updated rows only.
    let (entries_received, books_received, signals_received, settings_received);
    {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        // Refuse to write while a password change is re-keying the DB. A write landing between
        // the change's snapshot and its atomic flip would be encrypted under the old password and
        // stranded undecryptable in the new-keyed DB. The peer retains its rows and re-syncs after.
        if app
            .try_state::<crate::RekeyInProgress>()
            .map(|r| r.is_armed())
            .unwrap_or(false)
        {
            return Err("sync deferred: a password change is re-keying the database".to_string());
        }
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch("BEGIN IMMEDIATE")
            .map_err(|e| format!("sync tx begin: {e}"))?;
        let mut e_count = 0usize;
        let mut b_count = 0usize;
        let mut s_count = 0usize;
        let mut set_count = 0usize;
        let result: Result<(), String> = (|| {
            for row in &recv_entries {
                if db_upsert_entry(&conn, row)? {
                    e_count += 1;
                }
            }
            for row in &recv_books {
                if db_upsert_book(&conn, row)? {
                    b_count += 1;
                }
            }
            for row in &recv_signals {
                if db_insert_signal_if_new(&conn, row)? {
                    s_count += 1;
                }
            }
            for (k, v, ua) in &recv_settings {
                if db_upsert_setting(&conn, k, v, ua)? {
                    set_count += 1;
                }
            }
            Ok(())
        })();
        if let Err(e) = result {
            let _ = conn.execute_batch("ROLLBACK");
            return Err(e);
        }
        conn.execute_batch("COMMIT")
            .map_err(|e| format!("sync tx commit: {e}"))?;
        entries_received = e_count;
        books_received = b_count;
        signals_received = s_count;
        settings_received = set_count;
    }

    // Voice memos apply outside the SQL tx (audio file I/O can't be transactional).
    let voice_memos_received = apply_recv_voice_memos(app, &recv_voice_memos)?;

    // Close write-half cleanly — all phases complete.
    let _ = stream.shutdown(std::net::Shutdown::Write);

    // ── Finalise ─────────────────────────────────────────────────────────────

    let now = Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        db_set_peer_sync_at(&conn, &client_device_id, &now)?;
    }

    let total_sent = entries_sent + books_sent + signals_sent + settings_sent + voice_memos_sent;
    let total_received = entries_received
        + books_received
        + signals_received
        + settings_received
        + voice_memos_received;

    let _ = app.emit(
        "peer:sync_complete",
        serde_json::json!({
            "deviceId": client_device_id,
            "deviceName": client_name,
            "sent": total_sent,
            "received": total_received,
            "sentEntries": entries_sent,
            "receivedEntries": entries_received,
            "sentBooks": books_sent,
            "receivedBooks": books_received,
            "sentSignals": signals_sent,
            "receivedSignals": signals_received,
            "sentSettings": settings_sent,
            "receivedSettings": settings_received,
            "sentVoiceMemos": voice_memos_sent,
            "receivedVoiceMemos": voice_memos_received,
            "at": now,
        }),
    );

    log::info!(
        "[sync] Server: sync with {client_device_id} complete — \
         entries {entries_sent}/{entries_received}, books {books_sent}/{books_received}, \
         signals {signals_sent}/{signals_received}, settings {settings_sent}/{settings_received}, \
         voice_memos {voice_memos_sent}/{voice_memos_received}"
    );
    Ok(())
}

/// Read a voice memo's audio file and base64-encode it for transport.
fn read_voice_memo_audio_b64(app: &AppHandle, file_path: &str) -> Result<String, String> {
    use base64::Engine as _;
    let abs = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?
        .join(file_path);
    let bytes = std::fs::read(&abs).map_err(|e| format!("read voice memo audio: {e}"))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

/// Apply voice memos received from a peer: write each audio file locally, then
/// upsert its metadata (LWW). File I/O can't live inside the SQL transaction, so
/// voice memos apply separately from entries/books/signals/settings; each row is
/// idempotent (LWW) so a partial apply self-heals on the next sync. Returns the
/// number of rows inserted or updated.
fn apply_recv_voice_memos(
    app: &AppHandle,
    memos: &[(SyncVoiceMemoRow, String)],
) -> Result<usize, String> {
    use base64::Engine as _;
    if memos.is_empty() {
        return Ok(0);
    }
    let db = app
        .try_state::<Database>()
        .ok_or_else(|| "No DB state".to_string())?;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?
        .join("voice_memos");
    std::fs::create_dir_all(&dir).map_err(|e| format!("create voice_memos dir: {e}"))?;

    let mut count = 0usize;
    for (row, audio_b64) in memos {
        // `id` becomes the audio filename — reject path traversal from a peer.
        if crate::commands::voice_memos::validate_incoming_filename(&row.id).is_err() {
            log::warn!("[sync] rejecting voice memo with unsafe id {:?}", row.id);
            continue;
        }
        let filename = format!("{}.wav", row.id);
        let dest = dir.join(&filename);
        if dest.parent() != Some(dir.as_path()) {
            log::warn!("[sync] voice memo id escapes dir: {:?}", row.id);
            continue;
        }
        let rel_path = format!("voice_memos/{filename}");
        let bytes = match base64::engine::general_purpose::STANDARD.decode(audio_b64.as_bytes()) {
            Ok(b) => b,
            Err(e) => {
                log::warn!("[sync] voice memo {} base64 decode: {e}", row.id);
                continue;
            }
        };
        if let Err(e) = std::fs::write(&dest, &bytes) {
            log::warn!("[sync] write voice memo {} audio: {e}", row.id);
            continue;
        }
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        if db_upsert_voice_memo(&conn, row, &rel_path)? {
            count += 1;
        }
    }
    Ok(count)
}

fn handle_sync_connection(app: AppHandle, stream: TcpStream) {
    if let Err(e) = do_handle_sync_connection(&app, stream) {
        log::error!("[sync] Server connection error: {e}");
    }
}

// ── Server loop ───────────────────────────────────────────────────────────────

fn run_sync_server_loop(app: AppHandle, listener: TcpListener, stop_rx: mpsc::Receiver<()>) {
    log::info!("[sync] Server loop started");
    loop {
        // Poll stop channel
        if stop_rx.try_recv().is_ok() {
            log::info!("[sync] Server received stop signal");
            break;
        }

        match listener.accept() {
            Ok((stream, addr)) => {
                log::debug!("[sync] Incoming connection from {addr}");
                // The accepted socket inherits the listener's non-blocking mode on
                // Windows, so every read returns WouldBlock the instant data isn't
                // already buffered — dropping legitimate peers mid-handshake. Force
                // blocking; the handler relies on read_timeout for liveness.
                if let Err(e) = stream.set_nonblocking(false) {
                    log::warn!("[sync] Failed to set accepted stream blocking: {e}");
                }
                let app_clone = app.clone();
                thread::spawn(move || handle_sync_connection(app_clone, stream));
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                // Non-blocking: no connection pending, sleep briefly
                thread::sleep(Duration::from_millis(200));
            }
            Err(e) => {
                log::error!("[sync] Server accept error: {e}");
                thread::sleep(Duration::from_millis(200));
            }
        }
    }
    log::info!("[sync] Server loop stopped");
}

// ── Client (initiator) ────────────────────────────────────────────────────────

fn do_sync_client(app: &AppHandle, peer_device_id: &str, host: &str) -> Result<(), String> {
    // Look up peer's public key
    let trusted = load_trusted_devices(app)?;
    let peer_device = trusted
        .iter()
        .find(|d| d.device_id == peer_device_id)
        .ok_or_else(|| format!("Device {peer_device_id} not in trusted list"))?;
    let peer_pubkey = peer_device.public_key.clone();
    let peer_name = peer_device.device_name.clone();

    // Get our own identity
    let my_identity = get_or_create_device_identity(app)?;

    // Generate our ephemeral X25519 keypair before connecting
    let my_eph_secret = EphemeralSecret::random_from_rng(rand::rngs::OsRng);
    let my_eph_pub_hex = hex::encode(X25519PublicKey::from(&my_eph_secret).as_bytes());

    // Compute sync port
    let sync_port = sync_port_for_device(peer_device_id);
    let addr_str = format!("{host}:{sync_port}");
    let addr = addr_str
        .to_socket_addrs()
        .map_err(|e| format!("resolve {addr_str}: {e}"))?
        .next()
        .ok_or_else(|| format!("No address for {addr_str}"))?;

    log::info!("[sync] Client connecting to {addr}");
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_secs(10))
        .map_err(|e| format!("connect to {addr}: {e}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(60)))
        .map_err(|e| format!("set read timeout: {e}"))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(30)))
        .map_err(|e| format!("set write timeout: {e}"))?;

    // Step 1: Send HELLO (plaintext) — include ephemeral pub for v2 ECDH
    write_msg(
        &mut stream,
        &Msg::Hello {
            did: my_identity.device_id.clone(),
            eph_pub: Some(my_eph_pub_hex),
            features: local_features(),
        },
    )?;

    // Step 2: Read OK (plaintext) — server includes eph_pub, HELLO challenge, and
    // its advertised protocol features (used to gate the voice-memo phase below).
    let (server_name, server_eph_pub, server_challenge, server_features) =
        match read_msg(&mut stream)? {
            Msg::Ok {
                name,
                eph_pub,
                challenge,
                features,
            } => (name, eph_pub, challenge, features),
            Msg::NotTrusted { server_device_id } => {
                // The server no longer has us in its trusted list — auto-revoke it
                // from our side so both devices are in sync without manual intervention.
                log::warn!(
                    "[sync] Client: server {server_device_id} does not trust us — auto-revoking"
                );
                let _ = remove_trusted_device(app, peer_device_id);
                let _ = app.emit(
                    "peer:peer_revoked_us",
                    serde_json::json!({
                        "deviceId": peer_device_id,
                        "deviceName": peer_name,
                    }),
                );
                return Ok(());
            }
            Msg::Err { msg } => return Err(format!("Server rejected: {msg}")),
            other => return Err(format!("Expected OK, got: {other:?}")),
        };
    log::info!("[sync] Client: connected to '{server_name}'");

    // Step 2b: If the server sent a challenge, prove our identity with an Ed25519 signature.
    if let Some(ref challenge_hex) = server_challenge {
        let nonce =
            hex::decode(challenge_hex).map_err(|e| format!("Bad server challenge hex: {e}"))?;
        let sig = crate::commands::peer_identity::sign_hello_challenge(app, &nonce)?;
        write_msg(
            &mut stream,
            &Msg::Auth {
                signature: hex::encode(sig),
            },
        )?;
        log::debug!("[sync] Client: sent Ed25519 AUTH response");
    }

    // Derive session key: v2 X25519 ECDH required; reject servers that omit eph_pub.
    let key = match server_eph_pub {
        Some(ref hex) => {
            derive_sync_key_ecdh(my_eph_secret, hex, &my_identity.public_key, &peer_pubkey)?
        }
        None => {
            return Err(V1_FALLBACK_REMOVED_MSG.to_string());
        }
    };

    // Emit sync_started
    let _ = app.emit(
        "peer:sync_started",
        serde_json::json!({
            "deviceId": peer_device_id,
            "deviceName": peer_name,
        }),
    );

    // Step 3: Get our manifest (lock DB, then drop)
    let (my_entries, my_books, my_signals, my_settings, my_voice_memos) = {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        (
            db_get_entries_manifest(&conn)?,
            db_get_books_manifest(&conn)?,
            db_get_signals_manifest(&conn)?,
            db_get_settings_manifest(&conn)?,
            db_get_voice_memos_manifest(&conn)?,
        )
    };

    // Step 4: Send our MANIFEST
    write_msg_enc(
        &mut stream,
        &key,
        &Msg::Manifest {
            entries: my_entries.clone(),
            books: my_books.clone(),
            signals: my_signals.clone(),
            settings: my_settings.clone(),
            voice_memos: my_voice_memos.clone(),
        },
    )?;

    // Step 5: Read server's MANIFEST
    let (server_entries, server_books, server_signals, server_settings, server_voice_memos) =
        match read_msg_enc(&mut stream, &key)? {
            Msg::Manifest {
                entries,
                books,
                signals,
                settings,
                voice_memos,
            } => (entries, books, signals, settings, voice_memos),
            other => return Err(format!("Expected MANIFEST from server, got: {other:?}")),
        };

    // ── Compute diffs ────────────────────────────────────────────────────────

    let my_entry_map: std::collections::HashMap<&str, &str> = my_entries
        .iter()
        .map(|e| (e.id.as_str(), e.updated_at.as_str()))
        .collect();
    let need_entries_by_me: Vec<String> = server_entries
        .iter()
        .filter(|e| {
            my_entry_map
                .get(e.id.as_str())
                .map(|&mat| e.updated_at.as_str() > mat)
                .unwrap_or(true)
        })
        .map(|e| e.id.clone())
        .collect();

    let server_entry_map: std::collections::HashMap<&str, &str> = server_entries
        .iter()
        .map(|e| (e.id.as_str(), e.updated_at.as_str()))
        .collect();
    let need_entries_by_server: Vec<String> = my_entries
        .iter()
        .filter(|e| {
            server_entry_map
                .get(e.id.as_str())
                .map(|&sat| e.updated_at.as_str() > sat)
                .unwrap_or(true)
        })
        .map(|e| e.id.clone())
        .collect();

    // Books diffs
    let my_book_map: std::collections::HashMap<&str, &str> = my_books
        .iter()
        .map(|e| (e.id.as_str(), e.updated_at.as_str()))
        .collect();
    let need_books_by_me: Vec<String> = server_books
        .iter()
        .filter(|e| {
            my_book_map
                .get(e.id.as_str())
                .map(|&mat| e.updated_at.as_str() > mat)
                .unwrap_or(true)
        })
        .map(|e| e.id.clone())
        .collect();

    let server_book_map: std::collections::HashMap<&str, &str> = server_books
        .iter()
        .map(|e| (e.id.as_str(), e.updated_at.as_str()))
        .collect();
    let need_books_by_server: Vec<String> = my_books
        .iter()
        .filter(|e| {
            server_book_map
                .get(e.id.as_str())
                .map(|&sat| e.updated_at.as_str() > sat)
                .unwrap_or(true)
        })
        .map(|e| e.id.clone())
        .collect();

    // Signals diffs (presence only — no LWW needed)
    let my_signal_ids: std::collections::HashSet<&str> =
        my_signals.iter().map(|s| s.id.as_str()).collect();
    let need_signals_by_me: Vec<String> = server_signals
        .iter()
        .filter(|s| !my_signal_ids.contains(s.id.as_str()))
        .map(|s| s.id.clone())
        .collect();
    let need_signals_by_server: Vec<String> = my_signals
        .iter()
        .filter(|s| !server_signals.iter().any(|ss| ss.id == s.id))
        .map(|s| s.id.clone())
        .collect();

    // Settings diffs (LWW per key)
    let my_settings_map: std::collections::HashMap<&str, &str> = my_settings
        .iter()
        .map(|s| (s.id.as_str(), s.updated_at.as_str()))
        .collect();
    let need_settings_by_me: Vec<String> = server_settings
        .iter()
        .filter(|s| {
            my_settings_map
                .get(s.id.as_str())
                .map(|&mat| s.updated_at.as_str() > mat)
                .unwrap_or(true)
        })
        .map(|s| s.id.clone())
        .collect();

    let server_settings_map: std::collections::HashMap<&str, &str> = server_settings
        .iter()
        .map(|s| (s.id.as_str(), s.updated_at.as_str()))
        .collect();
    let need_settings_by_server: Vec<String> = my_settings
        .iter()
        .filter(|s| {
            server_settings_map
                .get(s.id.as_str())
                .map(|&sat| s.updated_at.as_str() > sat)
                .unwrap_or(true)
        })
        .map(|s| s.id.clone())
        .collect();

    // Voice memo diffs (LWW per id)
    let my_vm_map: std::collections::HashMap<&str, &str> = my_voice_memos
        .iter()
        .map(|m| (m.id.as_str(), m.updated_at.as_str()))
        .collect();
    let need_voice_memos_by_me: Vec<String> = server_voice_memos
        .iter()
        .filter(|m| {
            my_vm_map
                .get(m.id.as_str())
                .map(|&mat| m.updated_at.as_str() > mat)
                .unwrap_or(true)
        })
        .map(|m| m.id.clone())
        .collect();

    let server_vm_map: std::collections::HashMap<&str, &str> = server_voice_memos
        .iter()
        .map(|m| (m.id.as_str(), m.updated_at.as_str()))
        .collect();
    let need_voice_memos_by_server: Vec<String> = my_voice_memos
        .iter()
        .filter(|m| {
            server_vm_map
                .get(m.id.as_str())
                .map(|&sat| m.updated_at.as_str() > sat)
                .unwrap_or(true)
        })
        .map(|m| m.id.clone())
        .collect();

    // ── Entry phase ──────────────────────────────────────────────────────────

    // Step 6: Receive entries from server until DONE — collect, don't upsert yet
    let mut recv_entries: Vec<JournalEntryRow> = Vec::new();
    loop {
        let msg = read_msg_enc(&mut stream, &key)?;
        match msg {
            Msg::Entry { row } => {
                if recv_entries.len() >= need_entries_by_me.len() + 1000 {
                    return Err("Sync protocol error: unexpected entry count".into());
                }
                recv_entries.push(row);
            }
            Msg::Done { sent } => {
                log::info!(
                    "[sync] Client: server sent {sent} entries, we received {} new",
                    recv_entries.len()
                );
                break;
            }
            other => return Err(format!("Unexpected msg in entry recv: {other:?}")),
        }
    }

    // Step 7: Send entries server needs
    let to_send = {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        db_get_entries_full(&conn, &need_entries_by_server)?
    };
    let entries_sent = to_send.len();
    for entry_row in to_send {
        write_msg_enc(&mut stream, &key, &Msg::Entry { row: entry_row })?;
    }
    write_msg_enc(&mut stream, &key, &Msg::Done { sent: entries_sent })?;

    // Step 8: Read DONE_ACK for entries
    match read_msg_enc(&mut stream, &key)? {
        Msg::DoneAck { recv } => {
            log::info!("[sync] Client: server confirmed receipt of {recv} entries");
        }
        other => return Err(format!("Expected DONE_ACK for entries, got: {other:?}")),
    }

    // ── Books phase ──────────────────────────────────────────────────────────

    // Receive books from server — collect, don't upsert yet
    let mut recv_books: Vec<SyncBookRow> = Vec::new();
    loop {
        match read_msg_enc(&mut stream, &key)? {
            Msg::Book { row } => {
                if recv_books.len() >= need_books_by_me.len() + 500 {
                    return Err("Sync protocol error: unexpected book count".into());
                }
                recv_books.push(row);
            }
            Msg::BooksDone { sent } => {
                log::info!(
                    "[sync] Client: server sent {sent} books, we received {} new/updated",
                    recv_books.len()
                );
                break;
            }
            other => return Err(format!("Unexpected msg in books recv: {other:?}")),
        }
    }

    // Send books server needs
    let books_to_send = {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        db_get_books_full(&conn, &need_books_by_server)?
    };
    let books_sent = books_to_send.len();
    for book in books_to_send {
        write_msg_enc(&mut stream, &key, &Msg::Book { row: book })?;
    }
    write_msg_enc(&mut stream, &key, &Msg::BooksDone { sent: books_sent })?;

    match read_msg_enc(&mut stream, &key)? {
        Msg::BooksAck { recv } => {
            log::info!("[sync] Client: server confirmed receipt of {recv} books");
        }
        other => return Err(format!("Expected BOOKS_ACK, got: {other:?}")),
    }

    // ── Signals phase ────────────────────────────────────────────────────────

    // Receive signals from server — collect, don't upsert yet
    let mut recv_signals: Vec<SyncSignalRow> = Vec::new();
    loop {
        match read_msg_enc(&mut stream, &key)? {
            Msg::Signal { row } => {
                if recv_signals.len() >= need_signals_by_me.len() + 10_000 {
                    return Err("Sync protocol error: unexpected signal count".into());
                }
                recv_signals.push(row);
            }
            Msg::SignalsDone { sent } => {
                log::info!(
                    "[sync] Client: server sent {sent} signals, we received {} new",
                    recv_signals.len()
                );
                break;
            }
            other => return Err(format!("Unexpected msg in signals recv: {other:?}")),
        }
    }

    // Send signals server needs
    let signals_to_send = {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        db_get_signals_full(&conn, &need_signals_by_server)?
    };
    let signals_sent = signals_to_send.len();
    for signal in signals_to_send {
        write_msg_enc(&mut stream, &key, &Msg::Signal { row: signal })?;
    }
    write_msg_enc(&mut stream, &key, &Msg::SignalsDone { sent: signals_sent })?;

    match read_msg_enc(&mut stream, &key)? {
        Msg::SignalsAck { recv } => {
            log::info!("[sync] Client: server confirmed receipt of {recv} signals");
        }
        other => return Err(format!("Expected SIGNALS_ACK, got: {other:?}")),
    }

    // ── Settings phase ───────────────────────────────────────────────────────

    // Receive settings from server — collect, don't upsert yet
    let mut recv_settings: Vec<(String, String, String)> = Vec::new();
    loop {
        match read_msg_enc(&mut stream, &key)? {
            Msg::Setting {
                key: k,
                value: v,
                updated_at: ua,
            } => {
                if recv_settings.len() >= need_settings_by_me.len() + 100 {
                    return Err("Sync protocol error: unexpected setting count".into());
                }
                recv_settings.push((k, v, ua));
            }
            Msg::SettingsDone { sent } => {
                log::info!(
                    "[sync] Client: server sent {sent} settings, we received {} updated",
                    recv_settings.len()
                );
                break;
            }
            other => return Err(format!("Unexpected msg in settings recv: {other:?}")),
        }
    }

    // Send settings server needs
    let settings_to_send: Vec<(String, String, String)> = {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for key_name in &need_settings_by_server {
            if let Some((value, updated_at)) = db_get_setting_for_sync(&conn, key_name)? {
                out.push((key_name.clone(), value, updated_at));
            }
        }
        out
    };
    let settings_sent = settings_to_send.len();
    for (k, v, ua) in settings_to_send {
        write_msg_enc(
            &mut stream,
            &key,
            &Msg::Setting {
                key: k,
                value: v,
                updated_at: ua,
            },
        )?;
    }
    write_msg_enc(
        &mut stream,
        &key,
        &Msg::SettingsDone {
            sent: settings_sent,
        },
    )?;

    // Read SETTINGS_ACK (tolerate EOF/reset — server closes write-half after this)
    match read_msg_enc(&mut stream, &key) {
        Ok(Msg::SettingsAck { recv }) => {
            log::info!("[sync] Client: server confirmed receipt of {recv} settings");
        }
        Ok(other) => {
            log::info!("[sync] Client: unexpected message after SETTINGS_DONE: {other:?}");
        }
        Err(e) => {
            // Server closed the connection after sending SETTINGS_ACK — expected.
            log::info!(
                "[sync] Client: SETTINGS_ACK read ended early ({}), treating as success",
                e
            );
        }
    }

    // ── Voice memos phase (only when BOTH peers advertise `voice_memos`) ─────────
    // `recv_voice_memos` is declared outside the gate so the apply transaction
    // below still has it in scope when the phase is skipped (peer is an older build
    // that omits the feature, so we stay on the legacy message sequence).
    let mut recv_voice_memos: Vec<(SyncVoiceMemoRow, String)> = Vec::new();
    let mut voice_memos_sent = 0usize;
    if server_features.iter().any(|f| f == FEATURE_VOICE_MEMOS) {
        // Receive voice memos from server — collect, apply after close
        loop {
            match read_msg_enc(&mut stream, &key)? {
                Msg::VoiceMemo { row, audio_base64 } => {
                    if recv_voice_memos.len() >= need_voice_memos_by_me.len() + 1000 {
                        return Err("Sync protocol error: unexpected voice memo count".into());
                    }
                    recv_voice_memos.push((row, audio_base64));
                }
                Msg::VoiceMemosDone { sent } => {
                    log::info!(
                        "[sync] Client: server sent {sent} voice memos, we received {}",
                        recv_voice_memos.len()
                    );
                    break;
                }
                other => return Err(format!("Unexpected msg in voice memos recv: {other:?}")),
            }
        }

        // Send voice memos server needs
        let vm_to_send = {
            let db = app
                .try_state::<Database>()
                .ok_or_else(|| "No DB state".to_string())?;
            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            db_get_voice_memos_full(&conn, &need_voice_memos_by_server)?
        };
        for (row, file_path) in vm_to_send {
            match read_voice_memo_audio_b64(app, &file_path) {
                Ok(audio_base64) => {
                    write_msg_enc(&mut stream, &key, &Msg::VoiceMemo { row, audio_base64 })?;
                    voice_memos_sent += 1;
                }
                Err(e) => log::warn!("[sync] Client: skip voice memo {} — {e}", row.id),
            }
        }
        write_msg_enc(
            &mut stream,
            &key,
            &Msg::VoiceMemosDone {
                sent: voice_memos_sent,
            },
        )?;

        // Read VOICE_MEMOS_ACK (tolerate EOF — server closes write-half after this)
        match read_msg_enc(&mut stream, &key) {
            Ok(Msg::VoiceMemosAck { recv }) => {
                log::info!("[sync] Client: server confirmed receipt of {recv} voice memos");
            }
            Ok(other) => {
                log::info!("[sync] Client: unexpected message after VOICE_MEMOS_DONE: {other:?}");
            }
            Err(e) => {
                log::info!(
                    "[sync] Client: VOICE_MEMOS_ACK read ended early ({e}), treating as success"
                );
            }
        }
    } else {
        log::info!(
            "[sync] peer does not advertise `{FEATURE_VOICE_MEMOS}` — skipping voice memo phase"
        );
    }

    // Close both halves promptly.
    let _ = stream.shutdown(std::net::Shutdown::Both);

    // Apply all received data in one atomic transaction — TCP drop before COMMIT
    // leaves the DB untouched; partial state is impossible.
    // Count actual upserts (not total received) so ack/log reflect new-or-updated rows only.
    let (entries_received, books_received, signals_received, settings_received);
    {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        // Refuse to write while a password change is re-keying the DB. A write landing between
        // the change's snapshot and its atomic flip would be encrypted under the old password and
        // stranded undecryptable in the new-keyed DB. The peer retains its rows and re-syncs after.
        if app
            .try_state::<crate::RekeyInProgress>()
            .map(|r| r.is_armed())
            .unwrap_or(false)
        {
            return Err("sync deferred: a password change is re-keying the database".to_string());
        }
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch("BEGIN IMMEDIATE")
            .map_err(|e| format!("sync tx begin: {e}"))?;
        let mut e_count = 0usize;
        let mut b_count = 0usize;
        let mut s_count = 0usize;
        let mut set_count = 0usize;
        let result: Result<(), String> = (|| {
            for row in &recv_entries {
                if db_upsert_entry(&conn, row)? {
                    e_count += 1;
                }
            }
            for row in &recv_books {
                if db_upsert_book(&conn, row)? {
                    b_count += 1;
                }
            }
            for row in &recv_signals {
                if db_insert_signal_if_new(&conn, row)? {
                    s_count += 1;
                }
            }
            for (k, v, ua) in &recv_settings {
                if db_upsert_setting(&conn, k, v, ua)? {
                    set_count += 1;
                }
            }
            Ok(())
        })();
        if let Err(e) = result {
            let _ = conn.execute_batch("ROLLBACK");
            return Err(e);
        }
        conn.execute_batch("COMMIT")
            .map_err(|e| format!("sync tx commit: {e}"))?;
        entries_received = e_count;
        books_received = b_count;
        signals_received = s_count;
        settings_received = set_count;
    }

    // Voice memos apply outside the SQL tx (audio file I/O can't be transactional).
    let voice_memos_received = apply_recv_voice_memos(app, &recv_voice_memos)?;

    // ── Finalise ─────────────────────────────────────────────────────────────

    let now = Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        db_set_peer_sync_at(&conn, peer_device_id, &now)?;
    }

    let total_sent = entries_sent + books_sent + signals_sent + settings_sent + voice_memos_sent;
    let total_received = entries_received
        + books_received
        + signals_received
        + settings_received
        + voice_memos_received;

    let _ = app.emit(
        "peer:sync_complete",
        serde_json::json!({
            "deviceId": peer_device_id,
            "deviceName": peer_name,
            "sent": total_sent,
            "received": total_received,
            "sentEntries": entries_sent,
            "receivedEntries": entries_received,
            "sentBooks": books_sent,
            "receivedBooks": books_received,
            "sentSignals": signals_sent,
            "receivedSignals": signals_received,
            "sentSettings": settings_sent,
            "receivedSettings": settings_received,
            "sentVoiceMemos": voice_memos_sent,
            "receivedVoiceMemos": voice_memos_received,
            "at": now,
        }),
    );

    log::info!(
        "[sync] Client: sync with {peer_device_id} complete — \
         entries {entries_sent}/{entries_received}, books {books_sent}/{books_received}, \
         signals {signals_sent}/{signals_received}, settings {settings_sent}/{settings_received}, \
         voice_memos {voice_memos_sent}/{voice_memos_received}"
    );
    Ok(())
}

fn run_sync_client(app: AppHandle, peer_device_id: String, host: String) {
    if let Err(e) = do_sync_client(&app, &peer_device_id, &host) {
        log::info!("[sync] Client error with {peer_device_id}: {e}");
        let _ = app.emit(
            "peer:sync_error",
            serde_json::json!({
                "deviceId": peer_device_id,
                "message": e,
            }),
        );
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Start the sync server on this device's deterministic port.
/// Stops any previously running server first.
#[tauri::command]
pub fn peer_start_sync_server(
    app: AppHandle,
    state: State<'_, SyncEngineState>,
) -> Result<(), String> {
    // Stop previous server if running
    {
        let mut tx_guard = state.stop_tx.lock().map_err(|e| e.to_string())?;
        if let Some(tx) = tx_guard.take() {
            let _ = tx.send(());
        }
    }
    // Join previous server thread to ensure port is released
    {
        let mut handle_guard = state.server_handle.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = handle_guard.take() {
            let _ = handle.join();
        }
    }

    // Get our device_id to determine port
    let identity = get_or_create_device_identity(&app)?;
    let port = sync_port_for_device(&identity.device_id);

    // Bind listener
    let listener = TcpListener::bind(format!("0.0.0.0:{port}"))
        .map_err(|e| format!("bind sync server on port {port}: {e}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("set nonblocking: {e}"))?;

    log::info!("[sync] Server bound on port {port}");

    let (stop_tx, stop_rx) = mpsc::sync_channel(1);
    let app_clone = app.clone();
    let handle = thread::spawn(move || run_sync_server_loop(app_clone, listener, stop_rx));

    state
        .stop_tx
        .lock()
        .map_err(|e| e.to_string())?
        .replace(stop_tx);
    state
        .server_handle
        .lock()
        .map_err(|e| e.to_string())?
        .replace(handle);
    state.is_running.store(true, Ordering::SeqCst);

    Ok(())
}

/// Initiate a sync with a trusted peer (client side).
/// Verifies the peer is trusted, then spawns a background thread.
#[tauri::command]
pub fn peer_sync_now(
    app: AppHandle,
    lock: State<'_, AppLockState>,
    device_id: String,
    host: String,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    // Verify trusted
    let trusted = load_trusted_devices(&app)?;
    if !trusted.iter().any(|d| d.device_id == device_id) {
        return Err(format!("Device {device_id} is not trusted"));
    }

    thread::spawn(move || run_sync_client(app, device_id, host));
    Ok(())
}

/// Read-only view of per-peer last-sync timestamps.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerSyncStateRecord {
    pub peer_device_id: String,
    pub last_sync_at: String,
}

#[tauri::command]
pub fn peer_get_sync_states(
    app: AppHandle,
    lock: State<'_, AppLockState>,
) -> Result<Vec<PeerSyncStateRecord>, String> {
    require_unlocked(&lock)?;
    let db = app
        .try_state::<Database>()
        .ok_or_else(|| "No DB state".to_string())?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT peer_device_id, last_sync_at FROM peer_sync_state ORDER BY last_sync_at DESC",
        )
        .map_err(|e| format!("prepare peer_sync_state: {e}"))?;
    let rows = stmt
        .query_map([], |r| {
            Ok(PeerSyncStateRecord {
                peer_device_id: r.get(0)?,
                last_sync_at: r.get(1)?,
            })
        })
        .map_err(|e| format!("query peer_sync_state: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collect peer_sync_state: {e}"))
}

/// Initiate a full DB restore from a trusted peer (setup-time only).
///
/// Spawns a background thread that connects to the peer, requests its complete
/// SQLite database, receives it in 4 MiB chunks, and writes the reassembled file
/// to `{app_data}/moodhaven_restore.pending`.
///
/// Progress is reported via `peer:restore_progress` events.
/// Completion is signalled via `peer:restore_ready`.
/// On completion the frontend should call `peer_apply_and_restart`.
#[tauri::command]
pub fn peer_full_restore(
    app: AppHandle,
    lock: State<'_, AppLockState>,
    device_id: String,
    host: String,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    // Verify trusted
    let trusted = load_trusted_devices(&app)?;
    if !trusted.iter().any(|d| d.device_id == device_id) {
        return Err(format!("Device {device_id} is not trusted"));
    }

    thread::spawn(move || {
        if let Err(e) = do_full_restore_client(&app, &device_id, &host) {
            log::error!("[restore] Client error: {e}");
            let _ = app.emit("peer:restore_error", serde_json::json!({ "message": e }));
        }
    });
    Ok(())
}

/// Restart the app so `lib.rs` can apply the pending DB restore.
///
/// The rename of `moodhaven_restore.pending` → `moodhaven.db` is intentionally
/// left to the startup code in `lib.rs` (before `Database::new`), not done here.
/// This keeps the pending file intact if the process exits without relaunching
/// (e.g. in `tauri dev` mode), so the next manual restart still picks it up.
///
/// Should only be called after `peer:restore_ready` has been received.
#[tauri::command]
pub fn peer_apply_and_restart(app: AppHandle) -> Result<(), String> {
    let db_path = crate::db::get_db_path(&app)?;
    let parent = db_path.parent().ok_or("no parent dir")?;
    let pending = parent.join("moodhaven_restore.pending");
    let checksum_path = parent.join("moodhaven_restore.pending.sha256");
    let dbstate_path = parent.join("moodhaven_restore.pending.dbstate");

    if !pending.exists() {
        return Err("No pending restore file found".to_string());
    }

    // Verify integrity before applying. Finding 2 (MEDIUM): the checksum binds the
    // DB bytes to the dbstate salt, so the salt is verified before it can ever be
    // written to db_state.json.
    if checksum_path.exists() {
        let expected = std::fs::read_to_string(&checksum_path)
            .map_err(|e| format!("read restore checksum: {e}"))?;
        let expected = expected.trim();
        let data =
            std::fs::read(&pending).map_err(|e| format!("read pending restore for verify: {e}"))?;
        // The dbstate companion is part of the integrity envelope; its absence means
        // the checksum can't be reproduced. Treat as tamper.
        let dbstate_json = std::fs::read(&dbstate_path)
            .map_err(|e| format!("read restore dbstate for verify: {e}"))?;
        let actual = restore_integrity_digest(&data, &dbstate_json);
        // Re-validate the salt independently of the bound checksum (defence in depth).
        let salt_check = serde_json::from_slice::<crate::db::DbStateFile>(&dbstate_json)
            .map_err(|e| format!("parse restore dbstate: {e}"))
            .and_then(|st| validate_restore_salt(st.encrypted, &st.salt));
        if actual != expected || salt_check.is_err() {
            // Remove the pending files to avoid leaving a corrupt restore.
            let _ = std::fs::remove_file(&pending);
            let _ = std::fs::remove_file(&checksum_path);
            let _ = std::fs::remove_file(&dbstate_path);
            if let Err(e) = salt_check {
                return Err(format!("Restore aborted: {e}"));
            }
            return Err(format!(
                "Restore file integrity check failed (expected {expected}, got {actual}) — aborted"
            ));
        }
        log::info!("[restore] Integrity check passed ({actual})");
    } else {
        return Err(
            "Restore aborted: integrity checksum missing. Re-initiate the restore from the source device.".to_string()
        );
    }

    log::info!("[restore] Triggering restart to apply pending DB restore");
    app.restart();
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{EncryptedContent, JournalEntryRow};
    use rusqlite::Connection;

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn open_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db");
        conn.execute_batch(
            "CREATE TABLE journal_entries (
                id TEXT PRIMARY KEY,
                encrypted_content TEXT NOT NULL,
                mood INTEGER NOT NULL,
                privacy_mode INTEGER NOT NULL DEFAULT 0,
                location_weather TEXT,
                book_id TEXT NOT NULL DEFAULT 'default',
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                sealed_until TEXT,
                capsule_type TEXT,
                linked_original_id TEXT,
                unsealed_at TEXT
            );
            CREATE TABLE tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL
            );
            CREATE TABLE entry_tags (
                entry_id TEXT NOT NULL,
                tag_id INTEGER NOT NULL,
                PRIMARY KEY (entry_id, tag_id)
            );",
        )
        .expect("schema");
        conn
    }

    fn make_entry(id: &str, updated_at: &str) -> JournalEntryRow {
        JournalEntryRow {
            id: id.to_string(),
            encrypted_content: Some(EncryptedContent {
                ciphertext: "abc".to_string(),
                iv: "iv".to_string(),
                salt: "salt".to_string(),
                version: 1,
            }),
            mood: 3,
            privacy_mode: 0,
            location_weather: None,
            book_id: "default".to_string(),
            pinned: false,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: updated_at.to_string(),
            tags: vec![],
            sealed_until: None,
            capsule_type: None,
            linked_original_id: None,
            unsealed_at: None,
            status: None,
            session_id: None,
            word_count: None,
        }
    }

    // ── LWW upsert logic ──────────────────────────────────────────────────────

    #[test]
    fn lww_insert_new_entry() {
        let conn = open_test_db();
        let entry = make_entry("e1", "2026-03-01T10:00:00Z");
        let inserted = db_upsert_entry(&conn, &entry).expect("upsert");
        assert!(inserted, "new entry should be inserted");
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM journal_entries WHERE id = 'e1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn lww_older_remote_no_overwrite() {
        let conn = open_test_db();
        // Insert a local entry with a newer timestamp
        let local = make_entry("e2", "2026-03-10T10:00:00Z");
        db_upsert_entry(&conn, &local).expect("initial insert");

        // Remote has an older timestamp — should be skipped
        let remote = make_entry("e2", "2026-03-05T10:00:00Z");
        let updated = db_upsert_entry(&conn, &remote).expect("upsert older");
        assert!(!updated, "older remote must not overwrite local");

        let stored_at: String = conn
            .query_row(
                "SELECT updated_at FROM journal_entries WHERE id = 'e2'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            stored_at, "2026-03-10T10:00:00Z",
            "local timestamp must be preserved"
        );
    }

    #[test]
    fn lww_same_timestamp_no_overwrite() {
        let conn = open_test_db();
        let entry = make_entry("e3", "2026-03-10T10:00:00Z");
        db_upsert_entry(&conn, &entry).expect("initial insert");

        // Second upsert with identical timestamp — should be a no-op
        let same = make_entry("e3", "2026-03-10T10:00:00Z");
        let updated = db_upsert_entry(&conn, &same).expect("upsert same ts");
        assert!(!updated, "same timestamp must not overwrite");
    }

    // ── Transaction rollback ──────────────────────────────────────────────────

    #[test]
    fn sync_tx_rollback_leaves_db_clean() {
        let conn = open_test_db();

        // Start a transaction, insert one valid entry, then trigger an error
        conn.execute_batch("BEGIN IMMEDIATE").expect("begin");
        let result: Result<(), String> = (|| {
            let entry = make_entry("e4", "2026-03-01T00:00:00Z");
            db_upsert_entry(&conn, &entry)?;
            // Simulate a second operation that fails
            conn.execute(
                "INSERT INTO journal_entries (id) VALUES (?1)",
                rusqlite::params!["e4"],
            )
            .map_err(|e| format!("forced error: {e}"))?;
            Ok(())
        })();

        assert!(result.is_err(), "inner closure must have returned an error");
        conn.execute_batch("ROLLBACK").expect("rollback");

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM journal_entries WHERE id = 'e4'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0, "rollback must leave no partial data");
    }

    // ── Restore salt validation (PT10 Finding 1) ──────────────────────────────

    #[test]
    fn restore_salt_unencrypted_none_ok() {
        // Honest unencrypted source: encrypted=false + salt=None must pass.
        assert!(validate_restore_salt(false, &None).is_ok());
    }

    #[test]
    fn restore_salt_encrypted_valid_16_byte_ok() {
        // The real on-disk salt decodes to 16 bytes — must pass.
        let salt = Some("M2sEcsHxYyVyJl3UGquc9w==".to_string());
        assert!(validate_restore_salt(true, &salt).is_ok());
    }

    #[test]
    fn restore_salt_unencrypted_with_salt_rejected() {
        let salt = Some("M2sEcsHxYyVyJl3UGquc9w==".to_string());
        assert!(validate_restore_salt(false, &salt).is_err());
    }

    #[test]
    fn restore_salt_encrypted_none_rejected() {
        // Reproduces the "encryption record missing" lockout — must be rejected.
        assert!(validate_restore_salt(true, &None).is_err());
    }

    #[test]
    fn restore_salt_encrypted_bad_base64_rejected() {
        let salt = Some("!!!not base64!!!".to_string());
        assert!(validate_restore_salt(true, &salt).is_err());
    }

    #[test]
    fn restore_salt_encrypted_wrong_length_rejected() {
        use base64::Engine as _;
        // 8 bytes instead of 16 — wrong length must be rejected.
        let short = base64::engine::general_purpose::STANDARD.encode([0u8; 8]);
        assert!(validate_restore_salt(true, &Some(short)).is_err());
        // 32 bytes — also wrong length.
        let long = base64::engine::general_purpose::STANDARD.encode([0u8; 32]);
        assert!(validate_restore_salt(true, &Some(long)).is_err());
    }

    // ── Integrity digest binds DB + dbstate (PT10 Finding 2) ──────────────────

    #[test]
    fn restore_digest_changes_with_dbstate() {
        let db = b"fake-sqlite-bytes";
        let state_a = br#"{"encrypted":true,"salt":"M2sEcsHxYyVyJl3UGquc9w=="}"#;
        let state_b = br#"{"encrypted":true,"salt":"AAAAAAAAAAAAAAAAAAAAAA=="}"#;
        let d1 = restore_integrity_digest(db, state_a);
        let d2 = restore_integrity_digest(db, state_b);
        assert_ne!(
            d1, d2,
            "swapping the dbstate salt must change the bound digest"
        );
        // Deterministic for identical inputs.
        assert_eq!(d1, restore_integrity_digest(db, state_a));
    }
}
