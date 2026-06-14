//! Wire protocol types and port formula for the peer sync engine.

use crate::db::JournalEntryRow;
use serde::{Deserialize, Serialize};

// ── Protocol features ─────────────────────────────────────────────────────────

/// Feature flag advertised in the HELLO/OK handshake when a peer supports the
/// voice-memo sync phase. The phase only runs when BOTH peers advertise it, so a
/// device on this build syncing with an older peer (which omits the flag) skips
/// the phase entirely and the connection stays on the legacy message sequence.
pub const FEATURE_VOICE_MEMOS: &str = "voice_memos";

/// The protocol features this build supports, advertised in HELLO and OK.
pub fn local_features() -> Vec<String> {
    vec![FEATURE_VOICE_MEMOS.to_string()]
}

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
            features: Vec::new(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(
            !json.contains("eph_pub"),
            "absent eph_pub must be omitted from JSON"
        );
        assert!(
            !json.contains("features"),
            "empty features must be omitted from JSON (back-compat with old peers)"
        );
        assert!(json.contains("dev-001"));
    }

    #[test]
    fn msg_hello_omits_features_decodes_to_empty() {
        // An older peer's HELLO has no `features` key; it must deserialize with an
        // empty feature list so we skip feature-gated phases against it.
        let json = r#"{"t":"hello","did":"old-peer"}"#;
        match serde_json::from_str::<Msg>(json).unwrap() {
            Msg::Hello { features, .. } => assert!(features.is_empty()),
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn msg_hello_round_trips_features() {
        let msg = Msg::Hello {
            did: "dev-003".into(),
            eph_pub: None,
            features: local_features(),
        };
        let back: Msg = serde_json::from_str(&serde_json::to_string(&msg).unwrap()).unwrap();
        match back {
            Msg::Hello { features, .. } => {
                assert!(features.iter().any(|f| f == FEATURE_VOICE_MEMOS))
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn msg_hello_includes_eph_pub_when_some() {
        let msg = Msg::Hello {
            did: "dev-002".into(),
            eph_pub: Some("deadbeef".into()),
            features: Vec::new(),
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

    // ── Voice-memo protocol features + wire types ─────────────────────────────

    #[test]
    fn local_features_advertises_voice_memos() {
        let feats = local_features();
        assert!(feats.iter().any(|f| f == FEATURE_VOICE_MEMOS));
        assert_eq!(FEATURE_VOICE_MEMOS, "voice_memos");
    }

    #[test]
    fn msg_ok_round_trips_features() {
        let msg = Msg::Ok {
            name: "Server".into(),
            eph_pub: Some("cafe".into()),
            challenge: Some("beef".into()),
            features: local_features(),
        };
        let back: Msg = serde_json::from_str(&serde_json::to_string(&msg).unwrap()).unwrap();
        match back {
            Msg::Ok { features, name, .. } => {
                assert_eq!(name, "Server");
                assert!(features.iter().any(|f| f == FEATURE_VOICE_MEMOS));
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn msg_ok_from_old_peer_decodes_to_empty_features() {
        // An older server omits `features`; it must deserialize as empty so the
        // client skips the voice-memo phase against it.
        let json = r#"{"t":"ok","name":"Old"}"#;
        match serde_json::from_str::<Msg>(json).unwrap() {
            Msg::Ok { features, name, .. } => {
                assert_eq!(name, "Old");
                assert!(features.is_empty());
            }
            _ => panic!("wrong variant"),
        }
    }

    fn sample_voice_memo_row() -> SyncVoiceMemoRow {
        SyncVoiceMemoRow {
            id: "vm-001".into(),
            timestamp: "2026-01-01T00:00:00Z".into(),
            duration_ms: 4200,
            health_json: Some(r#"{"hr":62}"#.into()),
            transcription: Some("hello world".into()),
            entry_id: None,
            source: "phone".into(),
            created_at: "2026-01-01T00:00:00Z".into(),
            context: None,
            inferred_mood: Some(4),
            book_id: "default".into(),
            reviewed: 0,
            updated_at: "2026-01-02T00:00:00Z".into(),
        }
    }

    #[test]
    fn sync_voice_memo_row_round_trips() {
        let row = sample_voice_memo_row();
        let back: SyncVoiceMemoRow =
            serde_json::from_str(&serde_json::to_string(&row).unwrap()).unwrap();
        assert_eq!(back.id, "vm-001");
        assert_eq!(back.duration_ms, 4200);
        assert_eq!(back.transcription.as_deref(), Some("hello world"));
        assert_eq!(back.inferred_mood, Some(4));
        assert_eq!(back.updated_at, "2026-01-02T00:00:00Z");
    }

    #[test]
    fn sync_voice_memo_row_has_no_file_path() {
        // file_path is device-local and must never be serialized over the wire.
        let json = serde_json::to_string(&sample_voice_memo_row()).unwrap();
        assert!(
            !json.contains("file_path"),
            "file_path must never cross the wire"
        );
    }

    #[test]
    fn msg_voice_memo_round_trips() {
        let msg = Msg::VoiceMemo {
            row: sample_voice_memo_row(),
            audio_base64: "QUJD".into(),
        };
        let back: Msg = serde_json::from_str(&serde_json::to_string(&msg).unwrap()).unwrap();
        match back {
            Msg::VoiceMemo { row, audio_base64 } => {
                assert_eq!(row.id, "vm-001");
                assert_eq!(audio_base64, "QUJD");
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn msg_voice_memos_done_and_ack_round_trip() {
        let done: Msg =
            serde_json::from_str(&serde_json::to_string(&Msg::VoiceMemosDone { sent: 3 }).unwrap())
                .unwrap();
        match done {
            Msg::VoiceMemosDone { sent } => assert_eq!(sent, 3),
            _ => panic!("wrong variant"),
        }
        let ack: Msg =
            serde_json::from_str(&serde_json::to_string(&Msg::VoiceMemosAck { recv: 2 }).unwrap())
                .unwrap();
        match ack {
            Msg::VoiceMemosAck { recv } => assert_eq!(recv, 2),
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn manifest_voice_memos_defaults_when_omitted() {
        // A pre-voice-memo peer's MANIFEST omits `voice_memos`; it must default to
        // an empty list so the diff treats the peer as having none.
        let json = r#"{"t":"manifest","entries":[],"books":[],"signals":[],"settings":[]}"#;
        match serde_json::from_str::<Msg>(json).unwrap() {
            Msg::Manifest { voice_memos, .. } => assert!(voice_memos.is_empty()),
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn manifest_round_trips_voice_memos() {
        let msg = Msg::Manifest {
            entries: Vec::new(),
            books: Vec::new(),
            signals: Vec::new(),
            settings: Vec::new(),
            voice_memos: vec![SyncMeta {
                id: "vm-9".into(),
                updated_at: "2026-03-01T00:00:00Z".into(),
            }],
        };
        let back: Msg = serde_json::from_str(&serde_json::to_string(&msg).unwrap()).unwrap();
        match back {
            Msg::Manifest { voice_memos, .. } => {
                assert_eq!(voice_memos.len(), 1);
                assert_eq!(voice_memos[0].id, "vm-9");
            }
            _ => panic!("wrong variant"),
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
        /// Optional protocol-feature advertisement (e.g. `"voice_memos"`). Peers
        /// that predate a feature omit it, so a phase is only run when BOTH sides
        /// advertise it — see `FEATURE_VOICE_MEMOS`. `#[serde(default)]` keeps
        /// older peers (which omit the field) deserializing.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        features: Vec<String>,
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
        /// Protocol-feature advertisement (see `Hello::features`).
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        features: Vec<String>,
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
        /// Voice memos manifest: id + updated_at for LWW. `#[serde(default)]` so
        /// pre-voice-memo peers (which omit it) still deserialize — they simply
        /// exchange no memos.
        #[serde(default)]
        voice_memos: Vec<SyncMeta>,
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
    // ── Voice memos phase ──
    /// A voice memo plus its audio bytes (base64). The audio is opaque to the
    /// sync engine; the receiver writes it to its own voice_memos/<id>.wav and
    /// sets its own local file_path (never the peer's).
    VoiceMemo {
        row: SyncVoiceMemoRow,
        audio_base64: String,
    },
    VoiceMemosDone {
        sent: usize,
    },
    VoiceMemosAck {
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
        /// Whether the source DB is SQLCipher-encrypted. Copied from the source's
        /// db_state.json so the restored device can write its own matching state.
        #[serde(default)]
        encrypted: bool,
        /// Base64 PBKDF2 salt from the source's db_state.json. Required to derive
        /// the SQLCipher key on the restored device (same password ⇒ same key).
        /// Absent when the source DB is unencrypted.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        salt: Option<String>,
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

/// Voice memo row transmitted over the wire during sync.
/// `file_path` is intentionally omitted — it is device-local; each device
/// derives its own from the memo id. LWW on `updated_at`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncVoiceMemoRow {
    pub id: String,
    pub timestamp: String,
    pub duration_ms: i64,
    pub health_json: Option<String>,
    pub transcription: Option<String>,
    pub entry_id: Option<String>,
    pub source: String,
    pub created_at: String,
    pub context: Option<String>,
    pub inferred_mood: Option<i64>,
    pub book_id: String,
    pub reviewed: i64,
    pub updated_at: String,
}
