//! Time capsule commands — seal, reveal, and mood delta for journaling.
//!
//! Three capsule flavours share one data model:
//! - automatic anniversary  (sealed_until IS NULL, capsule_type = 'anniversary')
//! - letter to future me    (capsule_type = 'letter')
//! - sealed vault           (capsule_type = 'vault')

use crate::db::{parse_tags, Database, EncryptedContent, JournalEntryRow};
use crate::AppLockState;
use serde::{Deserialize, Serialize};
use tauri::State;

fn require_unlocked(lock: &State<'_, AppLockState>) -> Result<(), String> {
    if lock.is_locked() {
        Err("Session is locked".to_string())
    } else {
        Ok(())
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MoodDelta {
    pub avg_since: Option<f32>,
    pub mood_today: Option<i32>,
}

/// Seal an entry until a future date.
/// `unlock_at` must be strictly after now; the UI enforces a minimum of today+2d.
#[tauri::command]
pub fn seal_entry(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
    unlock_at: String,
    capsule_type: String,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    if !["letter", "vault"].contains(&capsule_type.as_str()) {
        return Err(format!("Invalid capsule_type: {capsule_type}"));
    }
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let rows = conn
        .execute(
            "UPDATE journal_entries
             SET sealed_until = ?1, capsule_type = ?2
             WHERE id = ?3
               AND datetime(?1) > datetime('now')
               AND sealed_until IS NULL
               AND unsealed_at IS NULL",
            rusqlite::params![unlock_at, capsule_type, id],
        )
        .map_err(|e| format!("Failed to seal entry: {}", e))?;

    if rows == 0 {
        return Err("Entry not found or unlock_at is not in the future".to_string());
    }
    Ok(())
}

/// Return at most one capsule that is ready to reveal:
/// - Scheduled capsules (sealed_until <= now) are prioritised.
/// - Anniversary entries (>365 days old, never previously revealed) come next.
/// - Excludes entries whose M/D matches today (those belong to On This Day).
/// - Always returns encrypted content so the reveal modal can decrypt it.
#[tauri::command]
pub fn get_due_capsules(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    include_anniversary: bool,
    local_date: Option<String>,
) -> Result<Option<JournalEntryRow>, String> {
    require_unlocked(&lock)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Use the caller-supplied local date (YYYY-MM-DD) so comparisons match the
    // user's wall-clock date rather than the UTC date from SQLite's 'now'.
    // Falls back to SQLite 'now' if not provided.
    let today_expr = match &local_date {
        Some(d) if !d.is_empty() => format!("date('{}')", d.replace('\'', "")),
        _ => "date('now')".to_string(),
    };
    let now_expr = match &local_date {
        Some(d) if !d.is_empty() => format!("datetime('{} 23:59:59')", d.replace('\'', "")),
        _ => "datetime('now')".to_string(),
    };

    let anniversary_clause = if include_anniversary {
        format!(
            "OR (je.sealed_until IS NULL AND je.capsule_type IS NULL
             AND date(je.created_at) <= date({today_expr}, '-365 days'))"
        )
    } else {
        String::new()
    };

    let sql = format!(
        "SELECT je.id, je.encrypted_content, je.mood, je.privacy_mode, je.location_weather,
                je.book_id, je.pinned, je.created_at, je.updated_at,
                je.sealed_until, je.capsule_type, je.linked_original_id, je.unsealed_at,
                COALESCE(GROUP_CONCAT(t.name, ','), '') AS tags
         FROM journal_entries je
         LEFT JOIN entry_tags et ON et.entry_id = je.id
         LEFT JOIN tags t ON t.id = et.tag_id
         WHERE je.unsealed_at IS NULL
           AND (
             (je.sealed_until IS NOT NULL AND datetime(je.sealed_until) <= {now_expr})
             {anniversary_clause}
           )
           AND NOT (strftime('%m-%d', je.created_at) = strftime('%m-%d', {today_expr}))
         GROUP BY je.id
         ORDER BY
           CASE WHEN je.sealed_until IS NOT NULL THEN 0 ELSE 1 END,
           je.sealed_until ASC
         LIMIT 1"
    );

    let result = conn.query_row(&sql, [], |row| {
        let content_json: String = row.get(1)?;
        let sealed_until: Option<String> = row.get(9)?;
        let capsule_type: Option<String> = row.get(10)?;
        let linked_original_id: Option<String> = row.get(11)?;
        let unsealed_at: Option<String> = row.get(12)?;
        let tags_str: Option<String> = row.get(13)?;

        let encrypted_content: EncryptedContent = serde_json::from_str(&content_json)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        Ok(JournalEntryRow {
            id: row.get(0)?,
            encrypted_content: Some(encrypted_content),
            mood: row.get(2)?,
            privacy_mode: row.get(3)?,
            location_weather: row.get(4)?,
            book_id: row
                .get::<_, Option<String>>(5)?
                .unwrap_or_else(|| "default".to_string()),
            pinned: row.get::<_, i32>(6)? != 0,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
            sealed_until,
            capsule_type,
            linked_original_id,
            unsealed_at,
            tags: parse_tags(tags_str),
            status: None,
        })
    });

    match result {
        Ok(entry) => Ok(Some(entry)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Query failed: {}", e)),
    }
}

/// Mark an entry as revealed.
/// Sets `unsealed_at = now()`, defaults `capsule_type` to 'anniversary' if unset
/// (automatic-reveal path), and clears `sealed_until` (handles early-unseal).
#[tauri::command]
pub fn unseal_entry(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let rows = conn
        .execute(
            "UPDATE journal_entries
             SET unsealed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                 capsule_type = COALESCE(capsule_type, 'anniversary'),
                 sealed_until = NULL,
                 updated_at   = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = ?1
               AND unsealed_at IS NULL",
            rusqlite::params![id],
        )
        .map_err(|e| format!("Failed to unseal entry: {}", e))?;

    if rows == 0 {
        return Err("Entry not found".to_string());
    }
    Ok(())
}

/// Return mood context for the reveal modal:
/// - `avg_since`: average mood of regular entries written after `entry_created_at`
/// - `mood_today`: mood of the most recent entry written today (excluding the capsule)
#[tauri::command]
pub fn get_mood_delta(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    entry_id: String,
    entry_created_at: String,
) -> Result<MoodDelta, String> {
    require_unlocked(&lock)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let avg_since: Option<f32> = conn
        .query_row(
            "SELECT AVG(CAST(mood AS REAL))
             FROM journal_entries
             WHERE created_at > ?1
               AND id != ?2
               AND (unsealed_at IS NOT NULL OR sealed_until IS NULL)",
            rusqlite::params![entry_created_at, entry_id],
            |row| row.get(0),
        )
        .unwrap_or(None);

    let mood_today: Option<i32> = conn
        .query_row(
            "SELECT mood FROM journal_entries
             WHERE date(created_at) = date('now')
               AND id != ?1
               AND (unsealed_at IS NOT NULL OR sealed_until IS NULL)
             ORDER BY created_at DESC
             LIMIT 1",
            rusqlite::params![entry_id],
            |row| row.get(0),
        )
        .unwrap_or(None);

    Ok(MoodDelta {
        avg_since,
        mood_today,
    })
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE journal_entries (
                id TEXT PRIMARY KEY,
                encrypted_content TEXT NOT NULL DEFAULT '{}',
                mood INTEGER NOT NULL DEFAULT 3,
                privacy_mode INTEGER DEFAULT 0,
                location_weather TEXT,
                book_id TEXT NOT NULL DEFAULT 'default',
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                sealed_until TEXT,
                capsule_type TEXT,
                linked_original_id TEXT,
                unsealed_at TEXT,
                status TEXT
            );
            CREATE TABLE tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL
            );
            CREATE TABLE entry_tags (
                entry_id TEXT,
                tag_id INTEGER,
                PRIMARY KEY (entry_id, tag_id)
            );",
        )
        .unwrap();
        conn
    }

    fn insert_entry(conn: &Connection, id: &str, created_at: &str) {
        conn.execute(
            "INSERT INTO journal_entries (id, encrypted_content, mood, created_at, updated_at)
             VALUES (?1, '{}', 3, ?2, ?2)",
            params![id, created_at],
        )
        .unwrap();
    }

    #[test]
    fn test_seal_entry_sets_columns() {
        let conn = setup_db();
        insert_entry(&conn, "e1", "2026-01-01T00:00:00Z");

        let rows = conn
            .execute(
                "UPDATE journal_entries
                 SET sealed_until = ?1, capsule_type = ?2
                 WHERE id = ?3
                   AND datetime(?1) > datetime('now')
                   AND sealed_until IS NULL
                   AND unsealed_at IS NULL",
                params!["2099-01-01T00:00:00Z", "letter", "e1"],
            )
            .unwrap();
        assert_eq!(rows, 1);

        let (sealed_until, capsule_type): (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT sealed_until, capsule_type FROM journal_entries WHERE id = 'e1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(sealed_until.as_deref(), Some("2099-01-01T00:00:00Z"));
        assert_eq!(capsule_type.as_deref(), Some("letter"));
    }

    #[test]
    fn test_seal_entry_rejects_past_date() {
        let conn = setup_db();
        insert_entry(&conn, "e2", "2026-01-01T00:00:00Z");

        let rows = conn
            .execute(
                "UPDATE journal_entries
                 SET sealed_until = ?1, capsule_type = ?2
                 WHERE id = ?3
                   AND datetime(?1) > datetime('now')
                   AND sealed_until IS NULL
                   AND unsealed_at IS NULL",
                params!["2000-01-01T00:00:00Z", "vault", "e2"],
            )
            .unwrap();
        assert_eq!(rows, 0);
    }

    #[test]
    fn test_seal_entry_double_seal_guard() {
        let conn = setup_db();
        insert_entry(&conn, "e3", "2026-01-01T00:00:00Z");

        // First seal
        let rows1 = conn
            .execute(
                "UPDATE journal_entries
                 SET sealed_until = ?1, capsule_type = ?2
                 WHERE id = ?3
                   AND datetime(?1) > datetime('now')
                   AND sealed_until IS NULL
                   AND unsealed_at IS NULL",
                params!["2099-01-01T00:00:00Z", "letter", "e3"],
            )
            .unwrap();
        assert_eq!(rows1, 1);

        // Second seal attempt — sealed_until IS NULL guard blocks it
        let rows2 = conn
            .execute(
                "UPDATE journal_entries
                 SET sealed_until = ?1, capsule_type = ?2
                 WHERE id = ?3
                   AND datetime(?1) > datetime('now')
                   AND sealed_until IS NULL
                   AND unsealed_at IS NULL",
                params!["2099-06-01T00:00:00Z", "vault", "e3"],
            )
            .unwrap();
        assert_eq!(rows2, 0);
    }

    #[test]
    fn test_unseal_entry_clears_columns() {
        let conn = setup_db();
        // Insert an already-sealed entry
        conn.execute(
            "INSERT INTO journal_entries
             (id, encrypted_content, mood, created_at, updated_at, sealed_until, capsule_type)
             VALUES ('e4', '{}', 3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z',
                     '2099-01-01T00:00:00Z', 'letter')",
            [],
        )
        .unwrap();

        let rows = conn
            .execute(
                "UPDATE journal_entries
                 SET unsealed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                     capsule_type = COALESCE(capsule_type, 'anniversary'),
                     sealed_until = NULL
                 WHERE id = ?1
                   AND unsealed_at IS NULL",
                params!["e4"],
            )
            .unwrap();
        assert_eq!(rows, 1);

        let (sealed_until, capsule_type, unsealed_at): (Option<String>, Option<String>, Option<String>) =
            conn.query_row(
                "SELECT sealed_until, capsule_type, unsealed_at FROM journal_entries WHERE id = 'e4'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert!(sealed_until.is_none());
        assert_eq!(capsule_type.as_deref(), Some("letter"));
        assert!(unsealed_at.is_some());
    }

    #[test]
    fn test_get_due_capsules_returns_past_due() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO journal_entries
             (id, encrypted_content, mood, created_at, updated_at, sealed_until, capsule_type)
             VALUES ('e5', '{}', 3, '2025-01-15T00:00:00Z', '2025-01-15T00:00:00Z',
                     '2025-06-01T00:00:00Z', 'vault')",
            [],
        )
        .unwrap();

        let sql = "SELECT je.id
                   FROM journal_entries je
                   WHERE je.unsealed_at IS NULL
                     AND (
                       (je.sealed_until IS NOT NULL AND datetime(je.sealed_until) <= datetime('now'))
                     )
                     AND NOT (strftime('%m-%d', je.created_at) = strftime('%m-%d', 'now'))
                   LIMIT 1";

        let id: String = conn.query_row(sql, [], |r| r.get(0)).unwrap();
        assert_eq!(id, "e5");
    }

    #[test]
    fn test_get_due_capsules_anniversary_exclusion() {
        let conn = setup_db();
        // created_at matches today's M-D (use a past year so anniversary logic triggers)
        let today_md = "strftime('%m-%d', 'now')";
        let created_at_expr = format!("strftime('%Y', 'now', '-2 years') || '-' || {}", today_md);
        conn.execute(
            &format!(
                "INSERT INTO journal_entries
                 (id, encrypted_content, mood, created_at, updated_at, sealed_until, capsule_type)
                 VALUES ('e6', '{{}}', 3,
                         ({}),
                         ({}),
                         '2025-01-01T00:00:00Z', 'letter')",
                created_at_expr, created_at_expr
            ),
            [],
        )
        .unwrap();

        let sql = "SELECT COUNT(*)
                   FROM journal_entries je
                   WHERE je.unsealed_at IS NULL
                     AND (
                       (je.sealed_until IS NOT NULL AND datetime(je.sealed_until) <= datetime('now'))
                     )
                     AND NOT (strftime('%m-%d', je.created_at) = strftime('%m-%d', 'now'))";

        let count: i64 = conn.query_row(sql, [], |r| r.get(0)).unwrap();
        assert_eq!(count, 0);
    }
}
