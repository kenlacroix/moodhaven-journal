//! Time capsule commands — seal, reveal, and mood delta for journaling.
//!
//! Three capsule flavours share one data model:
//! - automatic anniversary  (sealed_until IS NULL, capsule_type = 'anniversary')
//! - letter to future me    (capsule_type = 'letter')
//! - sealed vault           (capsule_type = 'vault')

use crate::db::{parse_tags, Database, EncryptedContent, JournalEntryRow};
use serde::{Deserialize, Serialize};
use tauri::State;

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
    id: String,
    unlock_at: String,
    capsule_type: String,
) -> Result<(), String> {
    if !["letter", "vault"].contains(&capsule_type.as_str()) {
        return Err(format!("Invalid capsule_type: {capsule_type}"));
    }
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let rows = conn
        .execute(
            "UPDATE journal_entries
             SET sealed_until = ?1, capsule_type = ?2
             WHERE id = ?3 AND datetime(?1) > datetime('now')",
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
    include_anniversary: bool,
) -> Result<Option<JournalEntryRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let anniversary_clause = if include_anniversary {
        "OR (je.sealed_until IS NULL AND je.capsule_type IS NULL
             AND date(je.created_at) <= date('now', '-365 days'))"
    } else {
        ""
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
             (je.sealed_until IS NOT NULL AND datetime(je.sealed_until) <= datetime('now'))
             {anniversary_clause}
           )
           AND NOT (strftime('%m-%d', je.created_at) = strftime('%m-%d', 'now'))
         GROUP BY je.id
         ORDER BY
           CASE WHEN je.sealed_until IS NOT NULL THEN 0 ELSE 1 END,
           je.sealed_until ASC
         LIMIT 1"
    );

    let result = conn.query_row(
        &sql,
        [],
        |row| {
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
            })
        },
    );

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
pub fn unseal_entry(db: State<Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let rows = conn
        .execute(
            "UPDATE journal_entries
             SET unsealed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                 capsule_type = COALESCE(capsule_type, 'anniversary'),
                 sealed_until = NULL
             WHERE id = ?1",
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
    entry_id: String,
    entry_created_at: String,
) -> Result<MoodDelta, String> {
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
             WHERE date(created_at) = date('now', 'localtime')
               AND id != ?1
               AND (unsealed_at IS NOT NULL OR sealed_until IS NULL)
             ORDER BY created_at DESC
             LIMIT 1",
            rusqlite::params![entry_id],
            |row| row.get(0),
        )
        .unwrap_or(None);

    Ok(MoodDelta { avg_since, mood_today })
}
