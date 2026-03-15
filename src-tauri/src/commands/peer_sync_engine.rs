//! Peer-to-peer LAN sync engine (Phase 3)
//!
//! ## Protocol overview (sequential, one TCP connection per sync)
//!
//! ```text
//! Client → Server: HELLO plain  {t:"hello", did:"<deviceId>"}
//! Server → Client: OK    plain  {t:"ok",    name:"<serverName>"}
//! Client → Server: MANIFEST enc {t:"manifest", entries:[{id, updated_at},...]}
//! Server → Client: MANIFEST enc {t:"manifest", entries:[{id, updated_at},...]}
//! Server → Client: ENTRY   enc  {t:"entry", row:{...}} × N
//! Server → Client: DONE    enc  {t:"done",  sent:N}
//! Client → Server: ENTRY   enc  {t:"entry", row:{...}} × M
//! Client → Server: DONE    enc  {t:"done",  sent:M}
//! Server → Client: DONE_ACK enc {t:"done_ack", recv:M}
//! Client → Server: DONE_ACK enc {t:"done_ack", recv:N}
//! Both: update peer_sync_state, emit events, close
//! ```
//!
//! ## Transport encryption
//! Shared key = SHA-256("moodbloom-sync-v1:" || sorted(pubKeyA, pubKeyB)).
//! Both sides derive independently — deterministic from stored public keys.
//!
//! Frame format: [4-byte big-endian length][12-byte nonce][AES-256-GCM ciphertext]

use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
use chrono::Utc;
use rand::Rng;
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
    Hello { did: String },
    Ok { name: String },
    /// Sent plaintext by the server when the connecting device is not in its
    /// trusted list. The client should auto-revoke the server in response.
    NotTrusted { server_device_id: String },
    Manifest { entries: Vec<EntryMeta> },
    Entry { row: JournalEntryRow },
    Done { sent: usize },
    DoneAck { recv: usize },
    Err { msg: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EntryMeta {
    id: String,
    updated_at: String,
}

// ── Managed state ─────────────────────────────────────────────────────────────

pub struct SyncEngineState {
    pub is_running: AtomicBool,
    stop_tx: Mutex<Option<mpsc::SyncSender<()>>>,
    server_handle: Mutex<Option<JoinHandle<()>>>,
}

impl SyncEngineState {
    pub fn new() -> Self {
        Self {
            is_running: AtomicBool::new(false),
            stop_tx: Mutex::new(None),
            server_handle: Mutex::new(None),
        }
    }
}

unsafe impl Send for SyncEngineState {}
unsafe impl Sync for SyncEngineState {}

// ── Crypto helpers ────────────────────────────────────────────────────────────

/// Derive shared AES-256 key = SHA-256("moodbloom-sync-v1:" || sorted(pubA, pubB))
fn derive_sync_key(pub_a: &str, pub_b: &str) -> [u8; 32] {
    let mut keys = [pub_a, pub_b];
    keys.sort_unstable();
    let mut h = Sha256::new();
    h.update(b"moodbloom-sync-v1:");
    h.update(keys[0].as_bytes());
    h.update(keys[1].as_bytes());
    h.finalize().into()
}

/// Encrypt plaintext → [12-byte nonce][ciphertext]
fn encrypt_payload(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("AES init: {e}"))?;
    let nonce_bytes: [u8; 12] = rand::thread_rng().gen();
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
fn read_frame_bytes(stream: &mut TcpStream) -> Result<Vec<u8>, String> {
    let mut len_buf = [0u8; 4];
    stream
        .read_exact(&mut len_buf)
        .map_err(|e| format!("read frame length: {e}"))?;
    let len = u32::from_be_bytes(len_buf) as usize;
    if len > 64 * 1024 * 1024 {
        return Err(format!("Frame too large: {len} bytes"));
    }
    let mut buf = vec![0u8; len];
    stream
        .read_exact(&mut buf)
        .map_err(|e| format!("read frame payload: {e}"))?;
    Ok(buf)
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

fn db_get_manifest(conn: &Connection) -> Result<Vec<EntryMeta>, String> {
    let mut stmt = conn
        .prepare("SELECT id, updated_at FROM journal_entries ORDER BY updated_at DESC")
        .map_err(|e| format!("prepare manifest: {e}"))?;
    let rows = stmt
        .query_map([], |r| {
            Ok(EntryMeta {
                id: r.get(0)?,
                updated_at: r.get(1)?,
            })
        })
        .map_err(|e| format!("query manifest: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collect manifest: {e}"))
}

fn db_get_entries_full(conn: &Connection, ids: &[String]) -> Result<Vec<JournalEntryRow>, String> {
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let mut result = Vec::with_capacity(ids.len());
    for id in ids {
        let row: Option<JournalEntryRow> = conn
            .query_row(
                "SELECT je.id, je.encrypted_content, je.mood, je.privacy_mode,
                        je.location_weather, je.book_id, je.pinned,
                        je.created_at, je.updated_at,
                        COALESCE(GROUP_CONCAT(t.name, ','), '') AS tags
                 FROM journal_entries je
                 LEFT JOIN entry_tags et ON et.entry_id = je.id
                 LEFT JOIN tags t ON t.id = et.tag_id
                 WHERE je.id = ?1
                 GROUP BY je.id",
                rusqlite::params![id],
                |r| {
                    let ec_json: String = r.get(1)?;
                    let tags_str: String = r.get(9)?;
                    let tags: Vec<String> = if tags_str.is_empty() {
                        vec![]
                    } else {
                        tags_str.split(',').map(|s| s.to_string()).collect()
                    };
                    let ec: crate::db::EncryptedContent = serde_json::from_str(&ec_json)
                        .map_err(|e| {
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
                        encrypted_content: ec,
                        mood: r.get(2)?,
                        privacy_mode: r.get(3)?,
                        location_weather: r.get(4)?,
                        book_id: r.get(5)?,
                        pinned: r.get::<_, i32>(6)? != 0,
                        created_at: r.get(7)?,
                        updated_at: r.get(8)?,
                        tags,
                    })
                },
            )
            .ok();
        if let Some(r) = row {
            result.push(r);
        }
    }
    Ok(result)
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
    let ec_json =
        serde_json::to_string(&row.encrypted_content).map_err(|e| format!("serialize ec: {e}"))?;

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
                  book_id, pinned, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![
                    row.id,
                    ec_json,
                    row.mood,
                    row.privacy_mode,
                    row.location_weather,
                    row.book_id,
                    row.pinned as i32,
                    row.created_at,
                    row.updated_at
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
                     location_weather = ?5, book_id = ?6, pinned = ?7, updated_at = ?8 \
                 WHERE id = ?1",
                rusqlite::params![
                    row.id,
                    ec_json,
                    row.mood,
                    row.privacy_mode,
                    row.location_weather,
                    row.book_id,
                    row.pinned as i32,
                    row.updated_at
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
    let client_device_id = match hello {
        Msg::Hello { did } => did,
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
            eprintln!("[sync] Server: rejecting unknown device {client_device_id} — sending NotTrusted");
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

    // Derive shared key
    let key = derive_sync_key(&my_identity.public_key, &client_pubkey);

    // Step 2: Send OK (plaintext)
    write_msg(
        &mut stream,
        &Msg::Ok {
            name: my_identity.device_name.clone(),
        },
    )?;

    // Emit sync_started
    let _ = app.emit(
        "peer:sync_started",
        serde_json::json!({
            "deviceId": client_device_id,
            "deviceName": client_name,
        }),
    );

    // Step 3: Read client's MANIFEST
    let client_manifest = match read_msg_enc(&mut stream, &key)? {
        Msg::Manifest { entries } => entries,
        other => return Err(format!("Expected MANIFEST from client, got: {other:?}")),
    };

    // Step 4: Get our manifest (lock DB, then drop)
    let my_manifest = {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        db_get_manifest(&conn)?
    };

    // Step 5: Send our MANIFEST
    write_msg_enc(&mut stream, &key, &Msg::Manifest { entries: my_manifest.clone() })?;

    // Compute what client needs (entries we have that client is missing or has older version of)
    let client_map: std::collections::HashMap<&str, &str> = client_manifest
        .iter()
        .map(|e| (e.id.as_str(), e.updated_at.as_str()))
        .collect();
    let need_by_client: Vec<String> = my_manifest
        .iter()
        .filter(|e| {
            client_map
                .get(e.id.as_str())
                .map(|&cat| e.updated_at.as_str() > cat)
                .unwrap_or(true)
        })
        .map(|e| e.id.clone())
        .collect();

    // Compute what we need from client
    let my_map: std::collections::HashMap<&str, &str> = my_manifest
        .iter()
        .map(|e| (e.id.as_str(), e.updated_at.as_str()))
        .collect();
    let need_by_me: Vec<String> = client_manifest
        .iter()
        .filter(|e| {
            my_map
                .get(e.id.as_str())
                .map(|&mat| e.updated_at.as_str() > mat)
                .unwrap_or(true)
        })
        .map(|e| e.id.clone())
        .collect();

    // Step 6: Fetch and send entries client needs (DB lock per batch, no lock during send)
    let to_send = {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        db_get_entries_full(&conn, &need_by_client)?
    };
    let sent_count = to_send.len();
    for entry_row in to_send {
        write_msg_enc(&mut stream, &key, &Msg::Entry { row: entry_row })?;
    }
    write_msg_enc(&mut stream, &key, &Msg::Done { sent: sent_count })?;

    // Step 7: Receive entries from client until DONE
    let mut received_count = 0usize;
    let expected_recv = need_by_me.len();
    loop {
        let msg = read_msg_enc(&mut stream, &key)?;
        match msg {
            Msg::Entry { row } => {
                let db = app
                    .try_state::<Database>()
                    .ok_or_else(|| "No DB state".to_string())?;
                let conn = db.conn.lock().map_err(|e| e.to_string())?;
                if db_upsert_entry(&conn, &row)? {
                    received_count += 1;
                }
            }
            Msg::Done { sent } => {
                eprintln!("[sync] Server: client sent {sent} entries, we received {received_count} new");
                break;
            }
            other => {
                return Err(format!("Unexpected message during receive: {other:?}"));
            }
        }
        // Safety valve: don't spin forever
        if received_count > expected_recv + 1000 {
            return Err("Received more entries than expected".into());
        }
    }

    // Step 8: Send DONE_ACK then close gracefully (client reads this as confirmation)
    write_msg_enc(&mut stream, &key, &Msg::DoneAck { recv: received_count })?;
    // Flush and close our write-half so client gets a clean EOF after DONE_ACK.
    // This avoids an RST (caused by dropping a stream with unread data) that would
    // make the client's DONE_ACK read fail with "Connection reset by peer".
    let _ = stream.shutdown(std::net::Shutdown::Write);

    // Step 9: Update peer_sync_state
    let now = Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        db_set_peer_sync_at(&conn, &client_device_id, &now)?;
    }

    // Emit sync_complete
    let _ = app.emit(
        "peer:sync_complete",
        serde_json::json!({
            "deviceId": client_device_id,
            "deviceName": client_name,
            "sent": sent_count,
            "received": received_count,
            "at": now,
        }),
    );

    eprintln!(
        "[sync] Server: sync with {client_device_id} complete — sent {sent_count}, received {received_count}"
    );
    Ok(())
}

fn handle_sync_connection(app: AppHandle, stream: TcpStream) {
    if let Err(e) = do_handle_sync_connection(&app, stream) {
        eprintln!("[sync] Server connection error: {e}");
    }
}

// ── Server loop ───────────────────────────────────────────────────────────────

fn run_sync_server_loop(app: AppHandle, listener: TcpListener, stop_rx: mpsc::Receiver<()>) {
    eprintln!("[sync] Server loop started");
    loop {
        // Poll stop channel
        if stop_rx.try_recv().is_ok() {
            eprintln!("[sync] Server received stop signal");
            break;
        }

        match listener.accept() {
            Ok((stream, addr)) => {
                eprintln!("[sync] Incoming connection from {addr}");
                let app_clone = app.clone();
                thread::spawn(move || handle_sync_connection(app_clone, stream));
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                // Non-blocking: no connection pending, sleep briefly
                thread::sleep(Duration::from_millis(200));
            }
            Err(e) => {
                eprintln!("[sync] Server accept error: {e}");
                thread::sleep(Duration::from_millis(200));
            }
        }
    }
    eprintln!("[sync] Server loop stopped");
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

    // Derive shared key
    let key = derive_sync_key(&my_identity.public_key, &peer_pubkey);

    // Compute sync port
    let sync_port = sync_port_for_device(peer_device_id);
    let addr_str = format!("{host}:{sync_port}");
    let addr = addr_str
        .to_socket_addrs()
        .map_err(|e| format!("resolve {addr_str}: {e}"))?
        .next()
        .ok_or_else(|| format!("No address for {addr_str}"))?;

    eprintln!("[sync] Client connecting to {addr}");
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_secs(10))
        .map_err(|e| format!("connect to {addr}: {e}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(60)))
        .map_err(|e| format!("set read timeout: {e}"))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(30)))
        .map_err(|e| format!("set write timeout: {e}"))?;

    // Step 1: Send HELLO (plaintext)
    write_msg(
        &mut stream,
        &Msg::Hello {
            did: my_identity.device_id.clone(),
        },
    )?;

    // Step 2: Read OK (plaintext)
    let server_name = match read_msg(&mut stream)? {
        Msg::Ok { name } => name,
        Msg::NotTrusted { server_device_id } => {
            // The server no longer has us in its trusted list — auto-revoke it
            // from our side so both devices are in sync without manual intervention.
            eprintln!(
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
    eprintln!("[sync] Client: connected to '{server_name}'");

    // Emit sync_started
    let _ = app.emit(
        "peer:sync_started",
        serde_json::json!({
            "deviceId": peer_device_id,
            "deviceName": peer_name,
        }),
    );

    // Step 3: Get our manifest (lock DB, then drop)
    let my_manifest = {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        db_get_manifest(&conn)?
    };

    // Step 4: Send our MANIFEST
    write_msg_enc(&mut stream, &key, &Msg::Manifest { entries: my_manifest.clone() })?;

    // Step 5: Read server's MANIFEST
    let server_manifest = match read_msg_enc(&mut stream, &key)? {
        Msg::Manifest { entries } => entries,
        other => return Err(format!("Expected MANIFEST from server, got: {other:?}")),
    };

    // Compute what we need from server and what server needs from us
    let my_map: std::collections::HashMap<&str, &str> = my_manifest
        .iter()
        .map(|e| (e.id.as_str(), e.updated_at.as_str()))
        .collect();
    let need_by_me: Vec<String> = server_manifest
        .iter()
        .filter(|e| {
            my_map
                .get(e.id.as_str())
                .map(|&mat| e.updated_at.as_str() > mat)
                .unwrap_or(true)
        })
        .map(|e| e.id.clone())
        .collect();

    let server_map: std::collections::HashMap<&str, &str> = server_manifest
        .iter()
        .map(|e| (e.id.as_str(), e.updated_at.as_str()))
        .collect();
    let need_by_server: Vec<String> = my_manifest
        .iter()
        .filter(|e| {
            server_map
                .get(e.id.as_str())
                .map(|&sat| e.updated_at.as_str() > sat)
                .unwrap_or(true)
        })
        .map(|e| e.id.clone())
        .collect();

    // Step 6: Receive entries from server until DONE
    let mut received_count = 0usize;
    let expected_recv = need_by_me.len();
    loop {
        let msg = read_msg_enc(&mut stream, &key)?;
        match msg {
            Msg::Entry { row } => {
                let db = app
                    .try_state::<Database>()
                    .ok_or_else(|| "No DB state".to_string())?;
                let conn = db.conn.lock().map_err(|e| e.to_string())?;
                if db_upsert_entry(&conn, &row)? {
                    received_count += 1;
                }
            }
            Msg::Done { sent } => {
                eprintln!("[sync] Client: server sent {sent} entries, we received {received_count} new");
                break;
            }
            other => {
                return Err(format!("Unexpected message during receive: {other:?}"));
            }
        }
        if received_count > expected_recv + 1000 {
            return Err("Received more entries than expected".into());
        }
    }

    // Step 7: Fetch and send entries server needs
    let to_send = {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        db_get_entries_full(&conn, &need_by_server)?
    };
    let sent_count = to_send.len();
    for entry_row in to_send {
        write_msg_enc(&mut stream, &key, &Msg::Entry { row: entry_row })?;
    }
    write_msg_enc(&mut stream, &key, &Msg::Done { sent: sent_count })?;

    // Step 8: Read DONE_ACK from server (tolerate EOF/reset — server closes after sending)
    match read_msg_enc(&mut stream, &key) {
        Ok(Msg::DoneAck { recv }) => {
            eprintln!("[sync] Client: server confirmed receipt of {recv} entries");
        }
        Ok(other) => {
            eprintln!("[sync] Client: unexpected message after DONE: {other:?}");
        }
        Err(e) => {
            // Server closed the connection after sending DONE_ACK — this is expected.
            eprintln!("[sync] Client: DONE_ACK read ended early ({}), treating as success", e);
        }
    }
    // Close both halves promptly — mirrors the server's shutdown(Write) above.
    // Without this the server-side read-half lingers in CLOSE_WAIT until the OS
    // times out the half-open socket (observed as a 6+ second gap in pcap).
    let _ = stream.shutdown(std::net::Shutdown::Both);

    // Step 9: Update peer_sync_state
    let now = Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    {
        let db = app
            .try_state::<Database>()
            .ok_or_else(|| "No DB state".to_string())?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        db_set_peer_sync_at(&conn, peer_device_id, &now)?;
    }

    // Emit sync_complete
    let _ = app.emit(
        "peer:sync_complete",
        serde_json::json!({
            "deviceId": peer_device_id,
            "deviceName": peer_name,
            "sent": sent_count,
            "received": received_count,
            "at": now,
        }),
    );

    eprintln!(
        "[sync] Client: sync with {peer_device_id} complete — sent {sent_count}, received {received_count}"
    );
    Ok(())
}

fn run_sync_client(app: AppHandle, peer_device_id: String, host: String) {
    if let Err(e) = do_sync_client(&app, &peer_device_id, &host) {
        eprintln!("[sync] Client error with {peer_device_id}: {e}");
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

    eprintln!("[sync] Server bound on port {port}");

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
    device_id: String,
    host: String,
) -> Result<(), String> {
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
        .prepare("SELECT peer_device_id, last_sync_at FROM peer_sync_state ORDER BY last_sync_at DESC")
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
