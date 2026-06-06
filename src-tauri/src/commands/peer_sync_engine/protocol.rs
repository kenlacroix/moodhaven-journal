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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn port_always_in_valid_range() {
        for prefix in [
            "0000", "ffff", "8000", "1234", "abcd", "0001", "fffe", "cafe",
        ] {
            let id = format!("{prefix}extra-ignored-chars");
            let port = sync_port_for_device(&id);
            assert!(
                (44000..=44999).contains(&port),
                "port {port} out of 44000–44999 for device id starting with {prefix}"
            );
        }
    }

    #[test]
    fn port_is_deterministic() {
        let id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
        assert_eq!(
            sync_port_for_device(id),
            sync_port_for_device(id),
            "same device id must always yield the same port"
        );
    }

    #[test]
    fn port_known_value_1234() {
        // "1234" hex = 4660 decimal; 4660 % 1000 = 660; 44000 + 660 = 44660
        assert_eq!(sync_port_for_device("1234abcdef"), 44660);
    }

    #[test]
    fn port_known_value_ffff() {
        // "ffff" hex = 65535; 65535 % 1000 = 535; 44000 + 535 = 44535
        assert_eq!(sync_port_for_device("ffff000000"), 44535);
    }

    #[test]
    fn port_known_value_0000() {
        // "0000" hex = 0; 0 % 1000 = 0; 44000 + 0 = 44000
        assert_eq!(sync_port_for_device("0000anything"), 44000);
    }

    #[test]
    fn port_short_id_does_not_panic() {
        // Device ID shorter than 4 chars — takes what's available
        let port = sync_port_for_device("ab");
        assert!((44000..=44999).contains(&port));
    }

    #[test]
    fn msg_hello_omits_eph_pub_when_none() {
        let msg = Msg::Hello {
            did: "dev-001".into(),
            eph_pub: None,
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(
            !json.contains("eph_pub"),
            "absent eph_pub must be omitted from JSON"
        );
        assert!(json.contains("dev-001"));
    }

    #[test]
    fn msg_hello_includes_eph_pub_when_some() {
        let msg = Msg::Hello {
            did: "dev-002".into(),
            eph_pub: Some("deadbeef".into()),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("deadbeef"));
    }

    #[test]
    fn msg_not_trusted_round_trips() {
        let msg = Msg::NotTrusted {
            server_device_id: "rogue-device-id".into(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let back: Msg = serde_json::from_str(&json).unwrap();
        match back {
            Msg::NotTrusted { server_device_id } => {
                assert_eq!(server_device_id, "rogue-device-id");
            }
            _ => panic!("deserialized to wrong variant"),
        }
    }

    #[test]
    fn msg_auth_round_trips() {
        let sig = "a".repeat(128);
        let msg = Msg::Auth {
            signature: sig.clone(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let back: Msg = serde_json::from_str(&json).unwrap();
        match back {
            Msg::Auth { signature } => assert_eq!(signature, sig),
            _ => panic!("deserialized to wrong variant"),
        }
    }
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
        /// 32-byte random challenge nonce (hex). Client must respond with Auth
        /// containing Ed25519(b"moodhaven-hello-auth-v1:" || nonce_bytes).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        challenge: Option<String>,
    },
    /// Client response to the server's HELLO challenge.
    /// signature = hex(Ed25519_sign(b"moodhaven-hello-auth-v1:" || challenge_bytes))
    Auth {
        signature: String,
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
