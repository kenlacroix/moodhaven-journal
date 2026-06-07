use crate::db::Database;
use crate::AppLockState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use super::require_unlocked;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Activity {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub is_custom: bool,
    pub sort_order: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ActivityStat {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub is_custom: bool,
    pub avg_mood: f64,
    pub entry_count: i32,
}

/// List all activities — predefined first (sort_order), then custom (alpha).
#[tauri::command]
pub async fn list_activities(
    db: tauri::State<'_, Database>,
    lock: State<'_, AppLockState>,
) -> Result<Vec<Activity>, String> {
    require_unlocked(&lock)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, emoji, is_custom, sort_order FROM activities
             ORDER BY is_custom ASC, sort_order ASC, name ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Activity {
                id: row.get(0)?,
                name: row.get(1)?,
                emoji: row.get(2)?,
                is_custom: row.get::<_, i32>(3)? != 0,
                sort_order: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

/// Create a custom activity. Errors if name already exists (case-insensitive).
#[tauri::command]
pub async fn create_activity(
    db: tauri::State<'_, Database>,
    lock: State<'_, AppLockState>,
    name: String,
    emoji: String,
) -> Result<Activity, String> {
    require_unlocked(&lock)?;
    let name = name.trim().to_lowercase();
    if name.is_empty() || name.len() > 50 {
        return Err("Activity name must be 1–50 characters".to_string());
    }
    let emoji = if emoji.is_empty() {
        "✨".to_string()
    } else {
        emoji
    };
    let id = format!("act_custom_{}", Uuid::new_v4().simple());
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let custom_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM activities WHERE is_custom = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if custom_count >= 50 {
        return Err("Maximum 50 custom activities allowed".to_string());
    }
    let sort_order: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM activities WHERE is_custom = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(1000);
    conn.execute(
        "INSERT INTO activities (id, name, emoji, is_custom, sort_order, created_at)
         VALUES (?1, ?2, ?3, 1, ?4, datetime('now'))",
        params![id, name, emoji, sort_order],
    )
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            "An activity with that name already exists".to_string()
        } else {
            e.to_string()
        }
    })?;
    Ok(Activity {
        id,
        name,
        emoji,
        is_custom: true,
        sort_order,
    })
}

/// Delete a custom activity. Errors if id refers to a predefined activity.
#[tauri::command]
pub async fn delete_activity(
    db: tauri::State<'_, Database>,
    lock: State<'_, AppLockState>,
    id: String,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let is_custom: i32 = conn
        .query_row(
            "SELECT is_custom FROM activities WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|_| "Activity not found".to_string())?;
    if is_custom == 0 {
        return Err("Predefined activities cannot be deleted".to_string());
    }
    conn.execute("DELETE FROM activities WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Replace all activities for an entry (idempotent, mirrors sync_entry_tags).
#[tauri::command]
pub async fn sync_entry_activities(
    db: tauri::State<'_, Database>,
    lock: State<'_, AppLockState>,
    entry_id: String,
    activity_ids: Vec<String>,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM entry_activities WHERE entry_id = ?1",
        params![entry_id],
    )
    .map_err(|e| e.to_string())?;
    for activity_id in &activity_ids {
        conn.execute(
            "INSERT OR IGNORE INTO entry_activities (entry_id, activity_id) VALUES (?1, ?2)",
            params![entry_id, activity_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Get activity IDs for a specific entry.
#[tauri::command]
pub async fn get_entry_activities(
    db: tauri::State<'_, Database>,
    lock: State<'_, AppLockState>,
    entry_id: String,
) -> Result<Vec<String>, String> {
    require_unlocked(&lock)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT activity_id FROM entry_activities WHERE entry_id = ?1")
        .map_err(|e| e.to_string())?;
    let ids = stmt
        .query_map(params![entry_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(ids)
}

/// Fetch all entry→activity associations as a flat list for client-side filtering.
/// Returns every row in entry_activities (no pagination needed; the table is small).
#[tauri::command]
pub async fn list_all_entry_activities(
    db: tauri::State<'_, Database>,
    lock: State<'_, AppLockState>,
) -> Result<Vec<EntryActivityRow>, String> {
    require_unlocked(&lock)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT entry_id, activity_id FROM entry_activities")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(EntryActivityRow {
                entry_id: row.get(0)?,
                activity_id: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EntryActivityRow {
    pub entry_id: String,
    pub activity_id: String,
}

/// Per-activity avg mood and entry count for the correlation chart.
#[tauri::command]
pub async fn get_activity_stats(
    db: tauri::State<'_, Database>,
    lock: State<'_, AppLockState>,
) -> Result<Vec<ActivityStat>, String> {
    require_unlocked(&lock)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.name, a.emoji, a.is_custom,
                    AVG(CAST(j.mood AS REAL)) AS avg_mood,
                    COUNT(*) AS entry_count
             FROM entry_activities ea
             JOIN activities       a ON a.id = ea.activity_id
             JOIN journal_entries  j ON j.id = ea.entry_id
             GROUP BY a.id
             ORDER BY avg_mood DESC",
        )
        .map_err(|e| e.to_string())?;
    let stats = stmt
        .query_map([], |row| {
            Ok(ActivityStat {
                id: row.get(0)?,
                name: row.get(1)?,
                emoji: row.get(2)?,
                is_custom: row.get::<_, i32>(3)? != 0,
                avg_mood: row.get(4)?,
                entry_count: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(stats)
}
