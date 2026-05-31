use rusqlite::params;
use serde::{Deserialize, Serialize};

use super::Database;

/// Encrypted content structure matching TypeScript EncryptedData
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EncryptedContent {
    pub ciphertext: String,
    pub iv: String,
    pub salt: String,
    pub version: i32,
}

/// Journal entry as stored in database
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JournalEntryRow {
    pub id: String,
    /// None for currently-sealed entries (content withheld until unlock date)
    pub encrypted_content: Option<EncryptedContent>,
    pub mood: i32,
    /// Privacy mode: 0 = Open, 1 = Mindful (local analysis only), 2 = Private (no analysis)
    pub privacy_mode: i32,
    /// JSON-encoded LocationWeather captured at write time (not encrypted; city-level only)
    pub location_weather: Option<String>,
    /// Book this entry belongs to (default = 'default')
    pub book_id: String,
    /// Whether this entry is pinned/favourited
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
    /// Tag names for this entry (fetched via GROUP_CONCAT join)
    pub tags: Vec<String>,
    /// ISO timestamp until which this entry is sealed (None = not sealed)
    pub sealed_until: Option<String>,
    /// 'letter' | 'vault' | 'anniversary' — set on seal; 'anniversary' on auto-reveal
    pub capsule_type: Option<String>,
    /// ID of the original capsule entry this response was written for
    pub linked_original_id: Option<String>,
    /// ISO timestamp when this entry was revealed (None = not yet revealed)
    pub unsealed_at: Option<String>,
    /// Entry state: 'thinking' | 'complete' | 'revisit' (default: 'complete')
    pub status: Option<String>,
    /// StillHaven session this entry was written after (nullable)
    pub session_id: Option<String>,
    /// Word count computed from decrypted content at write time (nullable for legacy entries)
    pub word_count: Option<i32>,
}

/// Journal entry metadata (without content, for list views)
#[derive(Debug, Serialize, Deserialize)]
pub struct JournalEntryMeta {
    pub id: String,
    pub mood: i32,
    pub created_at: String,
}

/// Parse a GROUP_CONCAT tag string into a Vec of tag names.
pub fn parse_tags(tags_str: Option<String>) -> Vec<String> {
    match tags_str {
        Some(s) if !s.is_empty() => s.split(',').map(|t| t.to_string()).collect(),
        _ => vec![],
    }
}

/// Map a rusqlite row to a `JournalEntryRow`.
///
/// Expected column order (0-indexed):
/// 0  id, 1  encrypted_content, 2  mood, 3  privacy_mode,
/// 4  location_weather, 5  book_id, 6  pinned, 7  created_at,
/// 8  updated_at, 9  sealed_until, 10 capsule_type,
/// 11 linked_original_id, 12 unsealed_at, 13 status,
/// 14 session_id, 15 word_count, 16 tags (GROUP_CONCAT)
pub fn map_entry_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<JournalEntryRow> {
    let content_json_opt: Option<String> = row.get(1)?;
    let sealed_until: Option<String> = row.get(9)?;
    let capsule_type: Option<String> = row.get(10)?;
    let linked_original_id: Option<String> = row.get(11)?;
    let unsealed_at: Option<String> = row.get(12)?;
    let status: Option<String> = row.get(13).ok().flatten();
    let session_id: Option<String> = row.get(14).ok().flatten();
    let word_count: Option<i32> = row.get(15).ok().flatten();
    let tags_str: Option<String> = row.get(16)?;

    // Withhold content for entries that are sealed but not yet revealed.
    let is_sealed = sealed_until.is_some() && unsealed_at.is_none();
    let encrypted_content = if is_sealed {
        None
    } else {
        content_json_opt
            .as_deref()
            .map(|json| {
                serde_json::from_str::<EncryptedContent>(json)
                    .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))
            })
            .transpose()?
    };

    Ok(JournalEntryRow {
        id: row.get(0)?,
        encrypted_content,
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
        status,
        session_id,
        word_count,
    })
}

/// Create a new journal entry
#[allow(clippy::too_many_arguments)]
pub fn create_entry(
    db: &Database,
    id: &str,
    encrypted_content: &EncryptedContent,
    mood: i32,
    privacy_mode: i32,
    location_weather: Option<&str>,
    book_id: Option<&str>,
    word_count: Option<i32>,
) -> Result<JournalEntryRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let content_json = serde_json::to_string(encrypted_content)
        .map_err(|e| format!("JSON serialization failed: {}", e))?;

    let bid = book_id.unwrap_or("default");

    conn.execute(
        "INSERT INTO journal_entries (id, encrypted_content, mood, privacy_mode, location_weather, book_id, word_count, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'), strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime'))",
        params![id, content_json, mood, privacy_mode, location_weather, bid, word_count],
    )
    .map_err(|e| format!("Failed to create entry: {}", e))?;

    conn.query_row(
        "SELECT je.id, je.encrypted_content, je.mood, je.privacy_mode, je.location_weather, je.book_id, je.pinned, je.created_at, je.updated_at,
                je.sealed_until, je.capsule_type, je.linked_original_id, je.unsealed_at, je.status, je.session_id, je.word_count,
                COALESCE(GROUP_CONCAT(t.name, ','), '') as tags
         FROM journal_entries je
         LEFT JOIN entry_tags et ON je.id = et.entry_id
         LEFT JOIN tags t ON et.tag_id = t.id
         WHERE je.id = ?1
         GROUP BY je.id",
        params![id],
        map_entry_row,
    )
    .map_err(|e| format!("Failed to fetch created entry: {}", e))
}

/// Toggle the pinned state of an entry.
pub fn patch_entry_pinned(db: &Database, id: &str, pinned: bool) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let pinned_val: i32 = if pinned { 1 } else { 0 };
    conn.execute(
        "UPDATE journal_entries SET pinned = ?1 WHERE id = ?2",
        params![pinned_val, id],
    )
    .map_err(|e| format!("Failed to patch pinned: {}", e))?;
    Ok(())
}

/// Set the status of an entry ('thinking' | 'complete' | 'revisit').
pub fn patch_entry_status(db: &Database, id: &str, status: &str) -> Result<(), String> {
    let valid = matches!(status, "thinking" | "complete" | "revisit");
    if !valid {
        return Err(format!("Invalid entry status: {}", status));
    }
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE journal_entries SET status = ?1 WHERE id = ?2",
        params![status, id],
    )
    .map_err(|e| format!("Failed to patch status: {}", e))?;
    Ok(())
}

/// Link a journal entry to a StillHaven session.
pub fn link_journal_entry_to_session(
    db: &Database,
    entry_id: &str,
    session_id: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE journal_entries SET session_id = ?1 WHERE id = ?2",
        params![session_id, entry_id],
    )
    .map_err(|e| format!("Failed to link entry to session: {}", e))?;
    Ok(())
}

/// Sync tags for an entry: replaces all existing tags with the provided list.
/// Tags are upserted into the `tags` table and linked via `entry_tags`.
pub fn sync_entry_tags(db: &Database, entry_id: &str, tags: &[String]) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM entry_tags WHERE entry_id = ?1",
        params![entry_id],
    )
    .map_err(|e| format!("Failed to clear entry tags: {}", e))?;

    for tag in tags {
        let name = tag.trim();
        if name.is_empty() {
            continue;
        }

        conn.execute(
            "INSERT OR IGNORE INTO tags (name) VALUES (?1)",
            params![name],
        )
        .map_err(|e| format!("Failed to upsert tag: {}", e))?;

        let tag_id: i64 = conn
            .query_row(
                "SELECT id FROM tags WHERE name = ?1 COLLATE NOCASE",
                params![name],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to get tag id: {}", e))?;

        conn.execute(
            "INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?1, ?2)",
            params![entry_id, tag_id],
        )
        .map_err(|e| format!("Failed to link entry tag: {}", e))?;
    }

    Ok(())
}

/// Get all unique tag names used in entries for a given book.
pub fn get_book_tags(db: &Database, book_id: &str) -> Result<Vec<String>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT t.name
             FROM tags t
             JOIN entry_tags et ON t.id = et.tag_id
             JOIN journal_entries je ON je.id = et.entry_id
             WHERE je.book_id = ?1
             ORDER BY t.name COLLATE NOCASE",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let tags = stmt
        .query_map(params![book_id], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Query failed: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(tags)
}

/// Attach (or replace) location_weather on an existing entry.
/// Called when geolocation resolves after the first auto-save has already created the row.
pub fn patch_entry_location_weather(
    db: &Database,
    id: &str,
    location_weather: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE journal_entries SET location_weather = ?1 WHERE id = ?2",
        params![location_weather, id],
    )
    .map_err(|e| format!("Failed to patch location_weather: {}", e))?;

    Ok(())
}

/// Get a single entry by ID
pub fn get_entry(db: &Database, id: &str) -> Result<Option<JournalEntryRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let result = conn.query_row(
        "SELECT je.id, je.encrypted_content, je.mood, je.privacy_mode, je.location_weather, je.book_id, je.pinned, je.created_at, je.updated_at,
                je.sealed_until, je.capsule_type, je.linked_original_id, je.unsealed_at, je.status, je.session_id, je.word_count,
                COALESCE(GROUP_CONCAT(t.name, ','), '') as tags
         FROM journal_entries je
         LEFT JOIN entry_tags et ON je.id = et.entry_id
         LEFT JOIN tags t ON et.tag_id = t.id
         WHERE je.id = ?1
         GROUP BY je.id",
        params![id],
        map_entry_row,
    );

    match result {
        Ok(entry) => Ok(Some(entry)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Query failed: {}", e)),
    }
}

/// Get all entries (most recent first)
pub fn get_all_entries(db: &Database, limit: Option<i32>) -> Result<Vec<JournalEntryRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let limit_clause = limit.map_or(String::new(), |l| format!(" LIMIT {}", l));

    let mut stmt = conn
        .prepare(&format!(
            "SELECT je.id, je.encrypted_content, je.mood, je.privacy_mode, je.location_weather, je.book_id, je.pinned, je.created_at, je.updated_at,
                    je.sealed_until, je.capsule_type, je.linked_original_id, je.unsealed_at, je.status, je.session_id, je.word_count,
                    COALESCE(GROUP_CONCAT(t.name, ','), '') as tags
             FROM journal_entries je
             LEFT JOIN entry_tags et ON je.id = et.entry_id
             LEFT JOIN tags t ON et.tag_id = t.id
             GROUP BY je.id
             ORDER BY je.created_at DESC{}",
            limit_clause
        ))
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let entries = stmt
        .query_map([], map_entry_row)
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row parsing failed: {}", e))?;

    Ok(entries)
}

/// Get entries for a date range
pub fn get_entries_by_date_range(
    db: &Database,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<JournalEntryRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT je.id, je.encrypted_content, je.mood, je.privacy_mode, je.location_weather, je.book_id, je.pinned, je.created_at, je.updated_at,
                    je.sealed_until, je.capsule_type, je.linked_original_id, je.unsealed_at, je.status, je.session_id, je.word_count,
                    COALESCE(GROUP_CONCAT(t.name, ','), '') as tags
             FROM journal_entries je
             LEFT JOIN entry_tags et ON je.id = et.entry_id
             LEFT JOIN tags t ON et.tag_id = t.id
             WHERE date(je.created_at) BETWEEN ?1 AND ?2
             GROUP BY je.id
             ORDER BY je.created_at DESC",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let entries = stmt
        .query_map(params![start_date, end_date], map_entry_row)
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row parsing failed: {}", e))?;

    Ok(entries)
}

/// Get entries from the same calendar month+day in previous years (On This Day).
pub fn get_entries_on_this_day(db: &Database) -> Result<Vec<JournalEntryRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT je.id, je.encrypted_content, je.mood, je.privacy_mode, je.location_weather, je.book_id, je.pinned, je.created_at, je.updated_at,
                    je.sealed_until, je.capsule_type, je.linked_original_id, je.unsealed_at, je.status, je.session_id, je.word_count,
                    COALESCE(GROUP_CONCAT(t.name, ','), '') as tags
             FROM journal_entries je
             LEFT JOIN entry_tags et ON je.id = et.entry_id
             LEFT JOIN tags t ON et.tag_id = t.id
             WHERE strftime('%m-%d', je.created_at) = strftime('%m-%d', 'now')
               AND strftime('%Y', je.created_at) != strftime('%Y', 'now')
             GROUP BY je.id
             ORDER BY je.created_at DESC",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let entries = stmt
        .query_map([], map_entry_row)
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row parsing failed: {}", e))?;

    Ok(entries)
}

/// Update an entry's content
pub fn update_entry(
    db: &Database,
    id: &str,
    encrypted_content: &EncryptedContent,
    mood: i32,
    privacy_mode: i32,
    word_count: Option<i32>,
) -> Result<JournalEntryRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let content_json = serde_json::to_string(encrypted_content)
        .map_err(|e| format!("JSON serialization failed: {}", e))?;

    let rows_affected = conn
        .execute(
            "UPDATE journal_entries
             SET encrypted_content = ?1, mood = ?2, privacy_mode = ?3, word_count = ?5
             WHERE id = ?4",
            params![content_json, mood, privacy_mode, id, word_count],
        )
        .map_err(|e| format!("Failed to update entry: {}", e))?;

    if rows_affected == 0 {
        return Err("Entry not found".to_string());
    }

    conn.query_row(
        "SELECT je.id, je.encrypted_content, je.mood, je.privacy_mode, je.location_weather, je.book_id, je.pinned, je.created_at, je.updated_at,
                je.sealed_until, je.capsule_type, je.linked_original_id, je.unsealed_at, je.status, je.session_id, je.word_count,
                COALESCE(GROUP_CONCAT(t.name, ','), '') as tags
         FROM journal_entries je
         LEFT JOIN entry_tags et ON je.id = et.entry_id
         LEFT JOIN tags t ON et.tag_id = t.id
         WHERE je.id = ?1
         GROUP BY je.id",
        params![id],
        map_entry_row,
    )
    .map_err(|e| format!("Failed to fetch updated entry: {}", e))
}

/// Delete an entry
pub fn delete_entry(db: &Database, id: &str) -> Result<bool, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let rows_affected = conn
        .execute("DELETE FROM journal_entries WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete entry: {}", e))?;

    Ok(rows_affected > 0)
}
