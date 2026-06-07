use rusqlite::params;
use serde::{Deserialize, Serialize};

use super::Database;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActivityRow {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub is_custom: bool,
    pub sort_order: i32,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActivityStats {
    pub activity_id: String,
    pub name: String,
    pub emoji: String,
    pub entry_count: i64,
    pub avg_mood: f64,
}

pub fn list_activities(db: &Database) -> Result<Vec<ActivityRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, emoji, is_custom, sort_order, created_at
             FROM activities ORDER BY sort_order ASC, name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(ActivityRow {
                id: r.get(0)?,
                name: r.get(1)?,
                emoji: r.get(2)?,
                is_custom: r.get::<_, i32>(3)? != 0,
                sort_order: r.get(4)?,
                created_at: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

pub fn create_activity(
    db: &Database,
    id: &str,
    name: &str,
    emoji: &str,
    max_custom: i64,
) -> Result<ActivityRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM activities WHERE is_custom = 1",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if count >= max_custom {
        return Err(format!("Custom activity limit reached ({})", max_custom));
    }

    let sort_order: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM activities WHERE is_custom = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(100);

    conn.execute(
        "INSERT INTO activities (id, name, emoji, is_custom, sort_order)
         VALUES (?1, ?2, ?3, 1, ?4)",
        params![id, name, emoji, sort_order],
    )
    .map_err(|e| format!("Failed to create activity: {}", e))?;

    let row = conn
        .query_row(
            "SELECT id, name, emoji, is_custom, sort_order, created_at
             FROM activities WHERE id = ?1",
            params![id],
            |r| {
                Ok(ActivityRow {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    emoji: r.get(2)?,
                    is_custom: r.get::<_, i32>(3)? != 0,
                    sort_order: r.get(4)?,
                    created_at: r.get(5)?,
                })
            },
        )
        .map_err(|e| format!("Failed to fetch created activity: {}", e))?;

    Ok(row)
}

pub fn delete_activity(db: &Database, id: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let is_custom: i32 = conn
        .query_row(
            "SELECT is_custom FROM activities WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|_| "Activity not found".to_string())?;

    if is_custom == 0 {
        return Err("Cannot delete a predefined activity".to_string());
    }

    conn.execute("DELETE FROM activities WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete activity: {}", e))?;

    Ok(())
}

pub fn sync_entry_activities(
    db: &Database,
    entry_id: &str,
    activity_ids: &[String],
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM entry_activities WHERE entry_id = ?1",
        params![entry_id],
    )
    .map_err(|e| format!("Failed to clear entry activities: {}", e))?;

    for aid in activity_ids {
        let aid = aid.trim();
        if aid.is_empty() {
            continue;
        }
        conn.execute(
            "INSERT OR IGNORE INTO entry_activities (entry_id, activity_id) VALUES (?1, ?2)",
            params![entry_id, aid],
        )
        .map_err(|e| format!("Failed to link activity: {}", e))?;
    }

    Ok(())
}

pub fn get_entry_activities(db: &Database, entry_id: &str) -> Result<Vec<ActivityRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.name, a.emoji, a.is_custom, a.sort_order, a.created_at
             FROM activities a
             INNER JOIN entry_activities ea ON ea.activity_id = a.id
             WHERE ea.entry_id = ?1
             ORDER BY a.sort_order ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![entry_id], |r| {
            Ok(ActivityRow {
                id: r.get(0)?,
                name: r.get(1)?,
                emoji: r.get(2)?,
                is_custom: r.get::<_, i32>(3)? != 0,
                sort_order: r.get(4)?,
                created_at: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

pub fn get_activity_stats(db: &Database) -> Result<Vec<ActivityStats>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.name, a.emoji,
                    COUNT(ea.entry_id) AS entry_count,
                    AVG(CAST(je.mood AS REAL)) AS avg_mood
             FROM activities a
             LEFT JOIN entry_activities ea ON ea.activity_id = a.id
             LEFT JOIN journal_entries je ON je.id = ea.entry_id
             GROUP BY a.id
             ORDER BY entry_count DESC, a.sort_order ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(ActivityStats {
                activity_id: r.get(0)?,
                name: r.get(1)?,
                emoji: r.get(2)?,
                entry_count: r.get(3)?,
                avg_mood: r.get::<_, Option<f64>>(4)?.unwrap_or(0.0),
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}
