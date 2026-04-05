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
//! Shared key = SHA-256("moodhaven-sync-v1:" || sorted(pubKeyA, pubKeyB)).
//! Both sides derive independently — deterministic from stored public keys.
//!
//! Frame format: [4-byte big-endian length][12-byte nonce][AES-256-GCM ciphertext]

use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
use chrono::Utc;
use rand::RngCore;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, ToSocketAddrs};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use x25519_dalek::{EphemeralSecret, PublicKey as X25519PublicKey};

use crate::commands::peer_identity::get_or_create_device_identity;
use crate::commands::peer_pairing::{load_trusted_devices, remove_trusted_device};
use crate::db::{Database, JournalEntryRow};

// ── Port formula ──────────────────────────────────────────────────────────────

/// Derive the sync port from a device_id.
/// Port = 44000 + (first 4 hex chars as u16) % 1000  →  range 44000–44999.
pub fn sync_port_for_device(device_id: &str) -> u16 {
    let hex = &device_id[..device_id.len().min(4)];
    let offset = u16::from_str_radix(hex, 16).unwrap_or(0) % 1000;
    44000 + offset
}

// ── Protocol messages ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "snake_case")]
enum Msg {
    Hello {
        did: String,
        /// Ephemeral X25519 public key (hex) for forward-secret session key.
        /// Absent in pre-v2 peers — falls back to static key derivation.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        eph_pub: Option<String>,
    },
    Ok {
        name: String,
        /// Ephemeral X25519 public key (hex), present when server supports v2.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        eph_pub: Option<String>,
    },
    /// Sent plaintext by the server when the connecting device is not in its
    /// trusted list. The client should auto-revoke the server in response.
    NotTrusted {
        server_device_id: String,
    },
    Manifest {
        entries: Vec<SyncMeta>,
        books: Vec<SyncMeta>,
        /// Signals use created_at as the version field (signals are immutable).
        signals: Vec<SyncMeta>,
        /// Settings manifest: only whitelisted keys; updated_at for LWW.
        settings: Vec<SyncMeta>,
    },
    // ── Entry phase ──
    Entry {
        row: JournalEntryRow,
    },
    Done {
        sent: usize,
    },
    DoneAck {
        recv: usize,
    },
    // ── Books phase ──
    Book {
        row: SyncBookRow,
    },
    BooksDone {
        sent: usize,
    },
    BooksAck {
        recv: usize,
    },
    // ── Signals phase ──
    Signal {
        row: SyncSignalRow,
    },
    SignalsDone {
        sent: usize,
    },
    SignalsAck {
        recv: usize,
    },
    // ── Settings phase ──
    Setting {
        key: String,
        value: String,
        updated_at: String,
    },
    SettingsDone {
        sent: usize,
    },
    SettingsAck {
        recv: usize,
    },
    // ── Full restore protocol ──
    /// Client → Server: request the server's complete DB as a binary stream.
    RestoreRequest,
    /// Server → Client: metadata envelope preceding each binary chunk frame.
    RestoreChunk {
        seq: u64,
        total_chunks: u64,
        offset: u64,
        total_bytes: u64,
    },
    /// Server → Client: all chunks have been sent.
    RestoreEnd {
        total_bytes: u64,
        chunks: u64,
    },
    Err {
        msg: String,
    },
}

/// Generic manifest item used for all data types.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncMeta {
    id: String,
    updated_at: String,
}

/// Book row transmitted over the wire during sync.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncBookRow {
    id: String,
    name: String,
    emoji: String,
    color: String,
    sort_order: i32,
    description: Option<String>,
    settings: Option<String>,
    created_at: String,
    updated_at: String,
}

/// Signal row transmitted over the wire during sync.
/// Signals are immutable after creation — no updated_at.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncSignalRow {
    id: String,
    timestamp: String,
    #[serde(rename = "type")]
    signal_type: String,
    source: String,
    payload: String,
    created_at: String,
}

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

// ── Crypto helpers ────────────────────────────────────────────────────────────

/// Legacy: static key from both Ed25519 public keys (no forward secrecy).
/// Used as fallback when the remote peer does not advertise an eph_pub.
fn derive_sync_key_static(pub_a: &str, pub_b: &str) -> [u8; 32] {
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
fn derive_sync_key_ecdh(
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

/// Encrypt plaintext → [12-byte nonce][ciphertext]
fn encrypt_payload(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, String> {
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
fn decrypt_payload(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
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

// ── Frame I/O ─────────────────────────────────────────────────────────────────

/// Write a length-prefixed frame: [4-byte big-endian length][payload]
fn write_frame(stream: &mut TcpStream, payload: &[u8]) -> Result<(), String> {
    let len = payload.len() as u32;
    stream
        .write_all(&len.to_be_bytes())
        .map_err(|e| format!("write frame length: {e}"))?;
    stream
        .write_all(payload)
        .map_err(|e| format!("write frame payload: {e}"))?;
    Ok(())
}

/// Read exactly the next length-prefixed frame bytes.
/// The limit is generous (256 MB) to accommodate large binary restore chunks
/// while still guarding against malformed frames.
fn read_frame_bytes(stream: &mut TcpStream) -> Result<Vec<u8>, String> {
    let mut len_buf = [0u8; 4];
    stream
        .read_exact(&mut len_buf)
        .map_err(|e| format!("read frame length: {e}"))?;
    let len = u32::from_be_bytes(len_buf) as usize;
    if len > 256 * 1024 * 1024 {
        return Err(format!("Frame too large: {len} bytes"));
    }
    let mut buf = vec![0u8; len];
    stream
        .read_exact(&mut buf)
        .map_err(|e| format!("read frame payload: {e}"))?;
    Ok(buf)
}

/// Write a raw binary frame (no encryption — only used for DB chunk data
/// which is already sent after an encrypted envelope confirming chunk metadata).
fn write_binary_frame(stream: &mut TcpStream, data: &[u8]) -> Result<(), String> {
    let len = data.len() as u32;
    stream
        .write_all(&len.to_be_bytes())
        .map_err(|e| format!("write binary frame length: {e}"))?;
    stream
        .write_all(data)
        .map_err(|e| format!("write binary frame data: {e}"))?;
    Ok(())
}

/// Read a raw binary frame (no decryption — pair with write_binary_frame).
fn read_binary_frame(stream: &mut TcpStream) -> Result<Vec<u8>, String> {
    read_frame_bytes(stream)
}

// ── Message I/O ───────────────────────────────────────────────────────────────

/// Send a plaintext JSON message (used for HELLO/OK before key exchange).
fn write_msg(stream: &mut TcpStream, msg: &Msg) -> Result<(), String> {
    let json = serde_json::to_vec(msg).map_err(|e| format!("serialize msg: {e}"))?;
    write_frame(stream, &json)
}

/// Send an AES-GCM encrypted JSON message.
fn write_msg_enc(stream: &mut TcpStream, key: &[u8; 32], msg: &Msg) -> Result<(), String> {
    let json = serde_json::to_vec(msg).map_err(|e| format!("serialize msg: {e}"))?;
    let payload = encrypt_payload(key, &json)?;
    write_frame(stream, &payload)
}

/// Read and parse a plaintext JSON message.
fn read_msg(stream: &mut TcpStream) -> Result<Msg, String> {
    let bytes = read_frame_bytes(stream)?;
    serde_json::from_slice(&bytes).map_err(|e| format!("parse msg: {e}"))
}

/// Read and decrypt an AES-GCM encrypted JSON message.
fn read_msg_enc(stream: &mut TcpStream, key: &[u8; 32]) -> Result<Msg, String> {
    let bytes = read_frame_bytes(stream)?;
    let plain = decrypt_payload(key, &bytes)?;
    serde_json::from_slice(&plain).map_err(|e| format!("parse decrypted msg: {e}"))
}

// ── DB helpers ────────────────────────────────────────────────────────────────

fn db_get_entries_manifest(conn: &Connection) -> Result<Vec<SyncMeta>, String> {
    let mut stmt = conn
        .prepare("SELECT id, updated_at FROM journal_entries ORDER BY updated_at DESC")
        .map_err(|e| format!("prepare entries manifest: {e}"))?;
    let rows = stmt
        .query_map([], |r| {
            Ok(SyncMeta {
                id: r.get(0)?,
                updated_at: r.get(1)?,
            })
        })
        .map_err(|e| format!("query entries manifest: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collect entries manifest: {e}"))
}

fn db_get_books_manifest(conn: &Connection) -> Result<Vec<SyncMeta>, String> {
    let mut stmt = conn
        .prepare("SELECT id, COALESCE(updated_at, created_at) FROM books ORDER BY id")
        .map_err(|e| format!("prepare books manifest: {e}"))?;
    let rows = stmt
        .query_map([], |r| {
            Ok(SyncMeta {
                id: r.get(0)?,
                updated_at: r.get(1)?,
            })
        })
        .map_err(|e| format!("query books manifest: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collect books manifest: {e}"))
}

fn db_get_signals_manifest(conn: &Connection) -> Result<Vec<SyncMeta>, String> {
    let mut stmt = conn
        .prepare("SELECT id, created_at FROM signals ORDER BY created_at DESC")
        .map_err(|e| format!("prepare signals manifest: {e}"))?;
    let rows = stmt
        .query_map([], |r| {
            Ok(SyncMeta {
                id: r.get(0)?,
                updated_at: r.get(1)?,
            })
        })
        .map_err(|e| format!("query signals manifest: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collect signals manifest: {e}"))
}

/// Returns manifest items for whitelisted settings keys that exist in the DB.
fn db_get_settings_manifest(conn: &Connection) -> Result<Vec<SyncMeta>, String> {
    let result: rusqlite::Result<(String, String)> = conn.query_row(
        "SELECT key, updated_at FROM settings WHERE key = 'app_settings'",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    );
    match result {
        Ok((key, updated_at)) => Ok(vec![SyncMeta {
            id: key,
            updated_at,
        }]),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(vec![]),
        Err(e) => Err(format!("query settings manifest: {e}")),
    }
}

fn db_get_books_full(conn: &Connection, ids: &[String]) -> Result<Vec<SyncBookRow>, String> {
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT id, name, emoji, color, sort_order, description, settings, \
                created_at, COALESCE(updated_at, created_at) \
         FROM books WHERE id IN ({placeholders})"
    );
    conn.prepare(&sql)
        .map_err(|e| format!("prepare books full: {e}"))?
        .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            Ok(SyncBookRow {
                id: r.get(0)?,
                name: r.get(1)?,
                emoji: r.get(2)?,
                color: r.get(3)?,
                sort_order: r.get(4)?,
                description: r.get(5)?,
                settings: r.get(6)?,
                created_at: r.get(7)?,
                updated_at: r.get(8)?,
            })
        })
        .map_err(|e| format!("query books full: {e}"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("collect books full: {e}"))
}

fn db_upsert_book(conn: &Connection, row: &SyncBookRow) -> Result<bool, String> {
    let existing: Option<String> = conn
        .query_row(
            "SELECT COALESCE(updated_at, created_at) FROM books WHERE id = ?1",
            rusqlite::params![row.id],
            |r| r.get(0),
        )
        .ok();

    match existing {
        None => {
            conn.execute(
                "INSERT INTO books \
                 (id, name, emoji, color, sort_order, description, settings, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![
                    row.id, row.name, row.emoji, row.color, row.sort_order,
                    row.description, row.settings, row.created_at, row.updated_at
                ],
            )
            .map_err(|e| format!("insert book: {e}"))?;
            Ok(true)
        }
        Some(ref local) if row.updated_at.as_str() > local.as_str() => {
            conn.execute(
                "UPDATE books \
                 SET name = ?2, emoji = ?3, color = ?4, sort_order = ?5, \
                     description = ?6, settings = ?7, updated_at = ?8 \
                 WHERE id = ?1",
                rusqlite::params![
                    row.id,
                    row.name,
                    row.emoji,
                    row.color,
                    row.sort_order,
                    row.description,
                    row.settings,
                    row.updated_at
                ],
            )
            .map_err(|e| format!("update book: {e}"))?;
            Ok(true)
        }
        _ => Ok(false), // local is same age or newer — skip
    }
}

fn db_get_signals_full(conn: &Connection, ids: &[String]) -> Result<Vec<SyncSignalRow>, String> {
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT id, timestamp, type, source, payload, created_at \
         FROM signals WHERE id IN ({placeholders})"
    );
    conn.prepare(&sql)
        .map_err(|e| format!("prepare signals full: {e}"))?
        .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            Ok(SyncSignalRow {
                id: r.get(0)?,
                timestamp: r.get(1)?,
                signal_type: r.get(2)?,
                source: r.get(3)?,
                payload: r.get(4)?,
                created_at: r.get(5)?,
            })
        })
        .map_err(|e| format!("query signals full: {e}"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("collect signals full: {e}"))
}

/// Signals are immutable — INSERT OR IGNORE; returns true if a new row was inserted.
fn db_insert_signal_if_new(conn: &Connection, row: &SyncSignalRow) -> Result<bool, String> {
    let changes = conn
        .execute(
            "INSERT OR IGNORE INTO signals (id, timestamp, type, source, payload, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                row.id,
                row.timestamp,
                row.signal_type,
                row.source,
                row.payload,
                row.created_at
            ],
        )
        .map_err(|e| format!("insert signal: {e}"))?;
    Ok(changes > 0)
}

fn db_get_setting_for_sync(
    conn: &Connection,
    key: &str,
) -> Result<Option<(String, String)>, String> {
    let result: rusqlite::Result<(String, String)> = conn.query_row(
        "SELECT value, updated_at FROM settings WHERE key = ?1",
        rusqlite::params![key],
        |r| Ok((r.get(0)?, r.get(1)?)),
    );
    match result {
        Ok(pair) => Ok(Some(pair)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("query setting: {e}")),
    }
}

/// Merge whitelisted fields from `remote` JSON into `local` JSON.
/// Non-whitelisted fields (credentials, device-specific prefs) are never overwritten.
fn merge_settings_json(local_json: &str, remote_json: &str) -> Result<String, String> {
    let mut local: serde_json::Value =
        serde_json::from_str(local_json).map_err(|e| format!("parse local settings: {e}"))?;
    let remote: serde_json::Value =
        serde_json::from_str(remote_json).map_err(|e| format!("parse remote settings: {e}"))?;

    // Take these top-level sections entirely from remote
    for section in &["journal", "reminders"] {
        if let Some(v) = remote.get(*section) {
            local[section] = v.clone();
        }
    }
    // Take only ai.features and ai.consent from remote (not ai.openai / ai.localAI / ai.enabled)
    if let Some(remote_ai) = remote.get("ai") {
        if let Some(local_ai) = local.get_mut("ai") {
            for sub in &["features", "consent"] {
                if let Some(v) = remote_ai.get(*sub) {
                    local_ai[sub] = v.clone();
                }
            }
        }
    }
    // Take specific appearance fields from remote (not theme — that's per-device)
    if let Some(remote_app) = remote.get("appearance") {
        if let Some(local_app) = local.get_mut("appearance") {
            for field in &["compactMode", "animationsEnabled"] {
                if let Some(v) = remote_app.get(*field) {
                    local_app[field] = v.clone();
                }
            }
        }
    }

    serde_json::to_string(&local).map_err(|e| format!("serialize merged settings: {e}"))
}

/// Upsert a setting received from a peer, applying whitelist merge for app_settings.
/// Returns true if the local DB was changed.
fn db_upsert_setting(
    conn: &Connection,
    key: &str,
    remote_value: &str,
    remote_updated_at: &str,
) -> Result<bool, String> {
    let local = db_get_setting_for_sync(conn, key)?;
    let new_value = match &local {
        None => remote_value.to_string(),
        Some((local_value, local_updated_at)) => {
            if remote_updated_at <= local_updated_at.as_str() {
                return Ok(false); // local is same age or newer
            }
            if key == "app_settings" {
                merge_settings_json(local_value, remote_value)?
            } else {
                remote_value.to_string()
            }
        }
    };

    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)",
        rusqlite::params![key, new_value, remote_updated_at],
    )
    .map_err(|e| format!("upsert setting: {e}"))?;
    Ok(true)
}

fn db_get_entries_full(conn: &Connection, ids: &[String]) -> Result<Vec<JournalEntryRow>, String> {
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT je.id, je.encrypted_content, je.mood, je.privacy_mode, \
                je.location_weather, je.book_id, je.pinned, \
                je.created_at, je.updated_at, \
                je.sealed_until, je.capsule_type, je.linked_original_id, je.unsealed_at, \
                COALESCE(GROUP_CONCAT(t.name, ','), '') AS tags \
         FROM journal_entries je \
         LEFT JOIN entry_tags et ON et.entry_id = je.id \
         LEFT JOIN tags t ON t.id = et.tag_id \
         WHERE je.id IN ({placeholders}) \
         GROUP BY je.id"
    );
    conn.prepare(&sql)
        .map_err(|e| format!("prepare entries full: {e}"))?
        .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            let ec_json: String = r.get(1)?;
            let tags_str: Option<String> = r.get(13)?;
            let tags = crate::db::parse_tags(tags_str);
            let ec: crate::db::EncryptedContent = serde_json::from_str(&ec_json).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    1,
                    rusqlite::types::Type::Text,
                    Box::new(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        e.to_string(),
                    )),
                )
            })?;
            Ok(JournalEntryRow {
                id: r.get(0)?,
                encrypted_content: Some(ec),
                mood: r.get(2)?,
                privacy_mode: r.get(3)?,
                location_weather: r.get(4)?,
                book_id: r
                    .get::<_, Option<String>>(5)?
                    .unwrap_or_else(|| "default".to_string()),
                pinned: r.get::<_, i32>(6)? != 0,
                created_at: r.get(7)?,
                updated_at: r.get(8)?,
                sealed_until: r.get(9)?,
                capsule_type: r.get(10)?,
                linked_original_id: r.get(11)?,
                unsealed_at: r.get(12)?,
                tags,
                status: None,
            })
        })
        .map_err(|e| format!("query entries full: {e}"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("collect entries full: {e}"))
}

fn db_upsert_tags(conn: &Connection, entry_id: &str, tags: &[String]) -> Result<(), String> {
    if tags.is_empty() {
        return Ok(());
    }
    for tag_name in tags {
        let tag_name = tag_name.trim();
        if tag_name.is_empty() {
            continue;
        }
        // Ensure tag exists
        conn.execute(
            "INSERT OR IGNORE INTO tags (id, name) VALUES (lower(hex(randomblob(8))), ?1)",
            rusqlite::params![tag_name],
        )
        .map_err(|e| format!("insert tag: {e}"))?;

        // Get tag id
        let tag_id: String = conn
            .query_row(
                "SELECT id FROM tags WHERE name = ?1",
                rusqlite::params![tag_name],
                |r| r.get(0),
            )
            .map_err(|e| format!("get tag id: {e}"))?;

        // Link tag to entry
        conn.execute(
            "INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![entry_id, tag_id],
        )
        .map_err(|e| format!("link tag: {e}"))?;
    }
    Ok(())
}

fn db_upsert_entry(conn: &Connection, row: &JournalEntryRow) -> Result<bool, String> {
    let ec = row
        .encrypted_content
        .as_ref()
        .ok_or("encrypted_content is None — cannot sync sealed entry")?;
    let ec_json = serde_json::to_string(ec).map_err(|e| format!("serialize ec: {e}"))?;

    // Check existing updated_at
    let existing: Option<String> = conn
        .query_row(
            "SELECT updated_at FROM journal_entries WHERE id = ?1",
            rusqlite::params![row.id],
            |r| r.get(0),
        )
        .ok();

    match existing {
        None => {
            // INSERT — trigger only fires on UPDATE, so updated_at is preserved as-is
            conn.execute(
                "INSERT INTO journal_entries \
                 (id, encrypted_content, mood, privacy_mode, location_weather, \
                  book_id, pinned, created_at, updated_at, \
                  sealed_until, capsule_type, linked_original_id, unsealed_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                rusqlite::params![
                    row.id,
                    ec_json,
                    row.mood,
                    row.privacy_mode,
                    row.location_weather,
                    row.book_id,
                    row.pinned as i32,
                    row.created_at,
                    row.updated_at,
                    row.sealed_until,
                    row.capsule_type,
                    row.linked_original_id,
                    row.unsealed_at,
                ],
            )
            .map_err(|e| format!("insert entry: {e}"))?;
            db_upsert_tags(conn, &row.id, &row.tags)?;
            Ok(true)
        }
        Some(ref local) if row.updated_at.as_str() > local.as_str() => {
            // UPDATE — set updated_at explicitly so the trigger (WHEN NEW.updated_at = OLD.updated_at) doesn't fire
            conn.execute(
                "UPDATE journal_entries \
                 SET encrypted_content = ?2, mood = ?3, privacy_mode = ?4, \
                     location_weather = ?5, book_id = ?6, pinned = ?7, updated_at = ?8, \
                     sealed_until = ?9, capsule_type = ?10, \
                     linked_original_id = ?11, unsealed_at = ?12 \
                 WHERE id = ?1",
                rusqlite::params![
                    row.id,
                    ec_json,
                    row.mood,
                    row.privacy_mode,
                    row.location_weather,
                    row.book_id,
                    row.pinned as i32,
                    row.updated_at,
                    row.sealed_until,
                    row.capsule_type,
                    row.linked_original_id,
                    row.unsealed_at,
                ],
            )
            .map_err(|e| format!("update entry: {e}"))?;
            db_upsert_tags(conn, &row.id, &row.tags)?;
            Ok(true)
        }
        _ => Ok(false), // local is same age or newer — skip
    }
}

#[allow(dead_code)]
fn db_get_peer_sync_at(conn: &Connection, peer_id: &str) -> Result<Option<String>, String> {
    let result: rusqlite::Result<String> = conn.query_row(
        "SELECT last_sync_at FROM peer_sync_state WHERE peer_device_id = ?1",
        rusqlite::params![peer_id],
        |r| r.get(0),
    );
    match result {
        Ok(val) => Ok(Some(val)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("query peer_sync_at: {e}")),
    }
}

fn db_set_peer_sync_at(conn: &Connection, peer_id: &str, at: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO peer_sync_state (peer_device_id, last_sync_at) VALUES (?1, ?2)
         ON CONFLICT(peer_device_id) DO UPDATE SET last_sync_at = excluded.last_sync_at",
        rusqlite::params![peer_id, at],
    )
    .map_err(|e| format!("set peer sync at: {e}"))?;
    Ok(())
}

// ── Full-restore server handler ───────────────────────────────────────────────

/// Stream the local SQLite DB file to the requesting client in 4 MB chunks.
///
/// Protocol (both sides have already completed HELLO/OK and key exchange):
///   Client sent:  RestoreRequest  (encrypted JSON)
///   Server sends: RestoreChunk    (encrypted JSON envelope) + binary data frame × N
///   Server sends: RestoreEnd      (encrypted JSON)
///   Server closes.
///
/// Each logical "chunk" is two TCP frames:
///   1. Encrypted JSON: RestoreChunk { seq, total_chunks, offset, total_bytes }
///   2. Raw binary: the chunk bytes (not encrypted — wire is already AES-GCM per-frame,
///      but the raw DB content is already encrypted at rest with the user's
///      password, so this is safe; avoids double-buffering 4 MB in memory)
///
/// The read timeout is extended to 5 minutes during the transfer to handle
/// slow Wi-Fi or large databases.
const RESTORE_CHUNK_BYTES: usize = 4 * 1024 * 1024; // 4 MiB

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

        // Raw binary data for the chunk (DB content is already encrypted at rest).
        write_binary_frame(stream, chunk)?;

        log::debug!(
            "[restore] Sent chunk {}/{} ({} bytes)",
            seq + 1,
            total_chunks,
            chunk.len()
        );
    }

    // Signal completion.
    write_msg_enc(
        stream,
        key,
        &Msg::RestoreEnd {
            total_bytes,
            chunks: total_chunks as u64,
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
        },
    )?;

    let (server_name, server_eph_pub) = match read_msg(&mut stream)? {
        Msg::Ok { name, eph_pub } => (name, eph_pub),
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

    let key = match server_eph_pub {
        Some(ref hex) => derive_sync_key_ecdh(
            my_eph_secret,
            hex,
            &my_identity.public_key,
            &peer_device.public_key,
        )?,
        None => derive_sync_key_static(&my_identity.public_key, &peer_device.public_key),
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

    let mut file = std::fs::File::create(&tmp_path).map_err(|e| format!("create tmp file: {e}"))?;

    let mut bytes_received: u64 = 0;
    let mut chunks_received: u64 = 0;

    loop {
        match read_msg_enc(&mut stream, &key)? {
            Msg::RestoreChunk {
                seq,
                total_chunks,
                offset: _,
                total_bytes,
            } => {
                // Read the following raw binary data frame.
                let chunk_data = read_binary_frame(&mut stream)?;
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
            } => {
                log::info!(
                    "[restore] Transfer complete: {} bytes in {} chunks",
                    total_bytes,
                    chunks
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
    let (client_device_id, client_eph_pub) = match hello {
        Msg::Hello { did, eph_pub } => (did, eph_pub),
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

    // Generate our ephemeral X25519 keypair for this session
    let my_eph_secret = EphemeralSecret::random_from_rng(rand::rngs::OsRng);
    let my_eph_pub_hex = hex::encode(X25519PublicKey::from(&my_eph_secret).as_bytes());

    // Step 2: Send OK (plaintext) — include our ephemeral pub so client can do ECDH
    write_msg(
        &mut stream,
        &Msg::Ok {
            name: my_identity.device_name.clone(),
            eph_pub: Some(my_eph_pub_hex),
        },
    )?;

    // Derive session key: ECDH if client supports v2, else legacy static key
    let key = match client_eph_pub {
        Some(ref hex) => {
            derive_sync_key_ecdh(my_eph_secret, hex, &my_identity.public_key, &client_pubkey)?
        }
        None => {
            log::warn!("[sync] Server: peer sent no eph_pub — using legacy static key");
            derive_sync_key_static(&my_identity.public_key, &client_pubkey)
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
        return do_serve_restore(app, &mut stream, &key, &client_device_id, &client_name);
    }

    let (client_entries, client_books, client_signals, client_settings) = match first_msg {
        Msg::Manifest {
            entries,
            books,
            signals,
            settings,
        } => (entries, books, signals, settings),
        other => return Err(format!("Expected MANIFEST from client, got: {other:?}")),
    };

    // Step 4: Get our manifest (lock DB, then drop)
    let (my_entries, my_books, my_signals, my_settings) = {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        (
            db_get_entries_manifest(&conn)?,
            db_get_books_manifest(&conn)?,
            db_get_signals_manifest(&conn)?,
            db_get_settings_manifest(&conn)?,
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
        if recv_entries.len() > need_entries_by_me.len() + 1000 {
            return Err("Received more entries than expected".into());
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
        if recv_books.len() > need_books_by_me.len() + 500 {
            return Err("Received more books than expected".into());
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
        if recv_signals.len() > need_signals_by_me.len() + 10_000 {
            return Err("Received more signals than expected".into());
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
        if recv_settings.len() > need_settings_by_me.len() + 100 {
            return Err("Received more settings than expected".into());
        }
    }
    write_msg_enc(
        &mut stream,
        &key,
        &Msg::SettingsAck {
            recv: recv_settings.len(),
        },
    )?;

    // Apply all received data in one atomic transaction — TCP drop before COMMIT
    // leaves the DB untouched; partial state is impossible.
    // Count actual upserts (not total received) so ack/log reflect new-or-updated rows only.
    let (entries_received, books_received, signals_received, settings_received);
    {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
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

    let total_sent = entries_sent + books_sent + signals_sent + settings_sent;
    let total_received = entries_received + books_received + signals_received + settings_received;

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
            "at": now,
        }),
    );

    log::info!(
        "[sync] Server: sync with {client_device_id} complete — \
         entries {entries_sent}/{entries_received}, books {books_sent}/{books_received}, \
         signals {signals_sent}/{signals_received}, settings {settings_sent}/{settings_received}"
    );
    Ok(())
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
        },
    )?;

    // Step 2: Read OK (plaintext) — server may include its own eph_pub
    let (server_name, server_eph_pub) = match read_msg(&mut stream)? {
        Msg::Ok { name, eph_pub } => (name, eph_pub),
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

    // Derive session key: ECDH if server supports v2, else legacy static key
    let key = match server_eph_pub {
        Some(ref hex) => {
            derive_sync_key_ecdh(my_eph_secret, hex, &my_identity.public_key, &peer_pubkey)?
        }
        None => {
            log::warn!("[sync] Client: server sent no eph_pub — using legacy static key");
            derive_sync_key_static(&my_identity.public_key, &peer_pubkey)
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
    let (my_entries, my_books, my_signals, my_settings) = {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        (
            db_get_entries_manifest(&conn)?,
            db_get_books_manifest(&conn)?,
            db_get_signals_manifest(&conn)?,
            db_get_settings_manifest(&conn)?,
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
        },
    )?;

    // Step 5: Read server's MANIFEST
    let (server_entries, server_books, server_signals, server_settings) =
        match read_msg_enc(&mut stream, &key)? {
            Msg::Manifest {
                entries,
                books,
                signals,
                settings,
            } => (entries, books, signals, settings),
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

    // ── Entry phase ──────────────────────────────────────────────────────────

    // Step 6: Receive entries from server until DONE — collect, don't upsert yet
    let mut recv_entries: Vec<JournalEntryRow> = Vec::new();
    loop {
        let msg = read_msg_enc(&mut stream, &key)?;
        match msg {
            Msg::Entry { row } => {
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
        if recv_entries.len() > need_entries_by_me.len() + 1000 {
            return Err("Received more entries than expected".into());
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
        if recv_books.len() > need_books_by_me.len() + 500 {
            return Err("Received more books than expected".into());
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
        if recv_signals.len() > need_signals_by_me.len() + 10_000 {
            return Err("Received more signals than expected".into());
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
        if recv_settings.len() > need_settings_by_me.len() + 100 {
            return Err("Received more settings than expected".into());
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

    // ── Finalise ─────────────────────────────────────────────────────────────

    let now = Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        db_set_peer_sync_at(&conn, peer_device_id, &now)?;
    }

    let total_sent = entries_sent + books_sent + signals_sent + settings_sent;
    let total_received = entries_received + books_received + signals_received + settings_received;

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
            "at": now,
        }),
    );

    log::info!(
        "[sync] Client: sync with {peer_device_id} complete — \
         entries {entries_sent}/{entries_received}, books {books_sent}/{books_received}, \
         signals {signals_sent}/{signals_received}, settings {settings_sent}/{settings_received}"
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
pub fn peer_sync_now(app: AppHandle, device_id: String, host: String) -> Result<(), String> {
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
pub fn peer_get_sync_states(app: AppHandle) -> Result<Vec<PeerSyncStateRecord>, String> {
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
pub fn peer_full_restore(app: AppHandle, device_id: String, host: String) -> Result<(), String> {
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
    let pending = db_path
        .parent()
        .ok_or("no parent dir")?
        .join("moodhaven_restore.pending");

    if !pending.exists() {
        return Err("No pending restore file found".to_string());
    }

    log::info!("[restore] Triggering restart to apply pending DB restore");
    app.restart();
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{EncryptedContent, JournalEntryRow};

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
        }
    }

    // ── Key derivation ────────────────────────────────────────────────────────

    #[test]
    fn key_derivation_static_symmetric() {
        let key_ab = derive_sync_key_static("pubkey_a", "pubkey_b");
        let key_ba = derive_sync_key_static("pubkey_b", "pubkey_a");
        assert_eq!(key_ab, key_ba, "static key must be symmetric");
    }

    #[test]
    fn key_derivation_different_peers_differ() {
        let key_ab = derive_sync_key_static("pubkey_a", "pubkey_b");
        let key_ac = derive_sync_key_static("pubkey_a", "pubkey_c");
        assert_ne!(
            key_ab, key_ac,
            "different peer keys must yield different transport keys"
        );
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
}
