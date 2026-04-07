//! Wire protocol types and port formula for the peer sync engine.

use crate::db::JournalEntryRow;
use serde::{Deserialize, Serialize};

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
pub enum Msg {
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
pub struct SyncMeta {
    pub id: String,
    pub updated_at: String,
}

/// Book row transmitted over the wire during sync.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncBookRow {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub color: String,
    pub sort_order: i32,
    pub description: Option<String>,
    pub settings: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Signal row transmitted over the wire during sync.
/// Signals are immutable after creation — no updated_at.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncSignalRow {
    pub id: String,
    pub timestamp: String,
    #[serde(rename = "type")]
    pub signal_type: String,
    pub source: String,
    pub payload: String,
    pub created_at: String,
}
