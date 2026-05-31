use rusqlite::params;
use serde::{Deserialize, Serialize};

use super::Database;

/// A voice memo row as returned from the database
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VoiceMemoRow {
    pub id: String,
    pub timestamp: String,
    pub duration_ms: i64,
    /// Optional heart-rate JSON captured at recording time: `{"hr":78}`
    pub health_json: Option<String>,
    /// Relative path from app_data_dir, e.g. `voice_memos/<id>.m4a`
    pub file_path: String,
    /// Whisper.cpp transcription (null until processed)
    pub transcription: Option<String>,
    /// Linked journal entry id (null until user attaches it)
    pub entry_id: Option<String>,
    /// Origin: "watch" | "phone"
    pub source: String,
    pub created_at: String,
    /// User-provided or AI-inferred context note attached to this memo
    pub context: Option<String>,
    /// AI-inferred mood score (1–5, null until inferred)
    pub inferred_mood: Option<i64>,
    /// Book this draft belongs to (default = 'default')
    pub book_id: String,
    /// 0 = pending review, 1 = published or discarded
    pub reviewed: i64,
}

/// Map a rusqlite row to a `VoiceMemoRow`.
///
/// Expected column order (0-indexed):
/// 0 id, 1 timestamp, 2 duration_ms, 3 health_json, 4 file_path,
/// 5 transcription, 6 entry_id, 7 source, 8 created_at,
/// 9 context, 10 inferred_mood, 11 book_id, 12 reviewed
fn map_memo_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<VoiceMemoRow> {
    Ok(VoiceMemoRow {
        id: r.get(0)?,
        timestamp: r.get(1)?,
        duration_ms: r.get(2)?,
        health_json: r.get(3)?,
        file_path: r.get(4)?,
        transcription: r.get(5)?,
        entry_id: r.get(6)?,
        source: r.get(7)?,
        created_at: r.get(8)?,
        context: r.get(9)?,
        inferred_mood: r.get(10)?,
        book_id: r
            .get::<_, Option<String>>(11)?
            .unwrap_or_else(|| "default".to_string()),
        reviewed: r.get::<_, Option<i64>>(12)?.unwrap_or(0),
    })
}

const SELECT_COLS: &str = "id, timestamp, duration_ms, health_json, file_path,
     transcription, entry_id, source, created_at,
     context, inferred_mood, book_id, reviewed";

/// Insert a voice memo record.
/// `file_path` is the relative path stored in the DB (`voice_memos/<id>.m4a`).
pub fn create_voice_memo(
    db: &Database,
    id: &str,
    timestamp: &str,
    duration_ms: i64,
    health_json: Option<&str>,
    file_path: &str,
    source: &str,
) -> Result<VoiceMemoRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO voice_memos
             (id, timestamp, duration_ms, health_json, file_path, source, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6,
                 strftime('%Y-%m-%dT%H:%M:%S','now','localtime'))",
        params![id, timestamp, duration_ms, health_json, file_path, source],
    )
    .map_err(|e| format!("Failed to insert voice memo: {}", e))?;

    let sql = format!("SELECT {} FROM voice_memos WHERE id = ?1", SELECT_COLS);
    conn.query_row(&sql, params![id], map_memo_row)
        .map_err(|e| format!("Failed to fetch created voice memo: {}", e))
}

/// List voice memos, newest first, up to `limit` rows.
pub fn list_voice_memos(db: &Database, limit: Option<i32>) -> Result<Vec<VoiceMemoRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(100).min(1000);

    let sql = format!(
        "SELECT {} FROM voice_memos ORDER BY timestamp DESC LIMIT ?1",
        SELECT_COLS
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![lim], map_memo_row)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

/// Get a single voice memo by id.
pub fn get_voice_memo(db: &Database, id: &str) -> Result<Option<VoiceMemoRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let sql = format!("SELECT {} FROM voice_memos WHERE id = ?1", SELECT_COLS);
    let result = conn.query_row(&sql, params![id], map_memo_row);

    match result {
        Ok(row) => Ok(Some(row)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Query failed: {}", e)),
    }
}

/// Delete a voice memo record (caller is responsible for deleting the file).
pub fn delete_voice_memo(db: &Database, id: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM voice_memos WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete voice memo: {}", e))?;

    Ok(())
}

/// Patch the transcription text for a voice memo.
/// On first write (raw_transcription IS NULL), also populates raw_transcription
/// so the original whisper output is preserved even if transcription is later edited.
pub fn patch_voice_memo_transcription(
    db: &Database,
    id: &str,
    transcription: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE voice_memos
         SET transcription = ?1,
             raw_transcription = CASE WHEN raw_transcription IS NULL THEN ?1 ELSE raw_transcription END
         WHERE id = ?2",
        params![transcription, id],
    )
    .map_err(|e| format!("Failed to patch transcription: {}", e))?;

    Ok(())
}

/// Link a voice memo to a journal entry.
pub fn link_voice_memo_to_entry(
    db: &Database,
    memo_id: &str,
    entry_id: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE voice_memos SET entry_id = ?1 WHERE id = ?2",
        params![entry_id, memo_id],
    )
    .map_err(|e| format!("Failed to link voice memo: {}", e))?;

    Ok(())
}

/// List memos that have been transcribed but not yet reviewed or linked to an entry.
pub fn list_pending_drafts(db: &Database, limit: Option<i64>) -> Result<Vec<VoiceMemoRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(50).min(1000);

    let sql = format!(
        "SELECT {} FROM voice_memos
         WHERE reviewed = 0 AND transcription IS NOT NULL AND entry_id IS NULL
         ORDER BY timestamp DESC
         LIMIT ?1",
        SELECT_COLS
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![lim], map_memo_row)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::Mutex;

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().expect("in-memory DB");
        conn.execute_batch(
            "CREATE TABLE voice_memos (
                id                TEXT PRIMARY KEY,
                timestamp         TEXT NOT NULL,
                duration_ms       INTEGER NOT NULL DEFAULT 0,
                health_json       TEXT,
                file_path         TEXT NOT NULL,
                transcription     TEXT,
                entry_id          TEXT,
                source            TEXT NOT NULL DEFAULT 'watch',
                created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now')),
                raw_transcription TEXT,
                context           TEXT,
                inferred_mood     INTEGER,
                book_id           TEXT NOT NULL DEFAULT 'default',
                reviewed          INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE journal_entries (
                id                TEXT PRIMARY KEY,
                encrypted_content TEXT NOT NULL,
                mood              INTEGER NOT NULL,
                privacy_mode      INTEGER NOT NULL DEFAULT 0,
                location_weather  TEXT,
                book_id           TEXT NOT NULL DEFAULT 'default',
                pinned            INTEGER NOT NULL DEFAULT 0,
                created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now')),
                updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now'))
            );",
        )
        .expect("create tables");
        Database { conn: Mutex::new(conn) }
    }

    fn insert_raw(db: &Database, id: &str, transcription: Option<&str>, entry_id: Option<&str>, reviewed: i64) {
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO voice_memos (id, timestamp, duration_ms, file_path, source, transcription, entry_id, reviewed)
             VALUES (?1, '2026-01-01T00:00:00', 1000, 'voice_memos/test.m4a', 'watch', ?2, ?3, ?4)",
            params![id, transcription, entry_id, reviewed],
        ).unwrap();
    }

    // ── list_pending_drafts ──────────────────────────────────────────────────

    #[test]
    fn pending_drafts_only_returns_matching_rows() {
        let db = test_db();
        insert_raw(&db, "m1", Some("hello"), None, 0);
        insert_raw(&db, "m2", None, None, 0);                // no transcription
        insert_raw(&db, "m3", Some("world"), Some("e1"), 0); // has entry_id
        insert_raw(&db, "m4", Some("foo"), None, 1);         // reviewed

        let drafts = list_pending_drafts(&db, None).unwrap();
        assert_eq!(drafts.len(), 1);
        assert_eq!(drafts[0].id, "m1");
    }

    #[test]
    fn pending_drafts_respects_limit() {
        let db = test_db();
        for i in 0..5u8 {
            insert_raw(&db, &format!("m{i}"), Some("text"), None, 0);
        }
        let drafts = list_pending_drafts(&db, Some(3)).unwrap();
        assert_eq!(drafts.len(), 3);
    }

    #[test]
    fn pending_drafts_empty_when_none_qualify() {
        let db = test_db();
        insert_raw(&db, "m1", None, None, 0);
        insert_raw(&db, "m2", Some("x"), None, 1);
        let drafts = list_pending_drafts(&db, None).unwrap();
        assert!(drafts.is_empty());
    }

    // ── create / get ─────────────────────────────────────────────────────────

    #[test]
    fn create_returns_correct_row() {
        let db = test_db();
        let row = create_voice_memo(&db, "vm1", "2026-01-01T10:00:00", 5000, None, "voice_memos/vm1.m4a", "watch").unwrap();
        assert_eq!(row.id, "vm1");
        assert_eq!(row.duration_ms, 5000);
        assert_eq!(row.reviewed, 0);
        assert!(row.transcription.is_none());
    }

    #[test]
    fn get_returns_none_for_missing_id() {
        let db = test_db();
        let result = get_voice_memo(&db, "nonexistent").unwrap();
        assert!(result.is_none());
    }

    // ── delete ───────────────────────────────────────────────────────────────

    #[test]
    fn delete_removes_row() {
        let db = test_db();
        create_voice_memo(&db, "vm1", "2026-01-01T10:00:00", 1000, None, "voice_memos/vm1.m4a", "watch").unwrap();
        delete_voice_memo(&db, "vm1").unwrap();
        assert!(get_voice_memo(&db, "vm1").unwrap().is_none());
    }

    // ── patch_transcription ───────────────────────────────────────────────────

    #[test]
    fn patch_transcription_preserves_raw_on_first_write() {
        let db = test_db();
        create_voice_memo(&db, "vm1", "2026-01-01T10:00:00", 1000, None, "voice_memos/vm1.m4a", "watch").unwrap();
        patch_voice_memo_transcription(&db, "vm1", "original").unwrap();
        patch_voice_memo_transcription(&db, "vm1", "edited").unwrap();

        let conn = db.conn.lock().unwrap();
        let (tx, raw): (String, String) = conn
            .query_row(
                "SELECT transcription, raw_transcription FROM voice_memos WHERE id = 'vm1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(tx, "edited");
        assert_eq!(raw, "original");
    }

    // ── publish contract (SQL-level simulation) ───────────────────────────────

    #[test]
    fn publish_contract_inserts_entry_and_marks_reviewed() {
        let db = test_db();
        insert_raw(&db, "vm1", Some("hello"), None, 0);

        let conn = db.conn.lock().unwrap();
        conn.execute_batch(
            "BEGIN;
             INSERT INTO journal_entries (id, encrypted_content, mood, book_id, created_at, updated_at)
             VALUES ('e1', '{}', 3, 'default',
                     strftime('%Y-%m-%dT%H:%M:%S','now'),
                     strftime('%Y-%m-%dT%H:%M:%S','now'));
             UPDATE voice_memos SET entry_id = 'e1', reviewed = 1 WHERE id = 'vm1';
             COMMIT;",
        ).unwrap();

        let reviewed: i64 = conn
            .query_row("SELECT reviewed FROM voice_memos WHERE id = 'vm1'", [], |r| r.get(0))
            .unwrap();
        let entry_id: String = conn
            .query_row("SELECT entry_id FROM voice_memos WHERE id = 'vm1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(reviewed, 1);
        assert_eq!(entry_id, "e1");
    }

    #[test]
    fn publish_on_missing_id_affects_zero_rows() {
        let db = test_db();
        let conn = db.conn.lock().unwrap();
        let affected = conn
            .execute("UPDATE voice_memos SET reviewed = 1 WHERE id = 'ghost'", [])
            .unwrap();
        assert_eq!(affected, 0);
    }

    // ── discard contract (SQL-level simulation) ───────────────────────────────

    #[test]
    fn discard_contract_removes_row() {
        let db = test_db();
        insert_raw(&db, "vm1", Some("text"), None, 0);
        {
            let conn = db.conn.lock().unwrap();
            conn.execute("DELETE FROM voice_memos WHERE id = 'vm1'", []).unwrap();
        }
        assert!(get_voice_memo(&db, "vm1").unwrap().is_none());
    }
}
