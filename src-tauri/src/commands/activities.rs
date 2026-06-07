//! Activity tagging Tauri commands

use crate::db::{self, ActivityRow, ActivityStats, Database};
use crate::AppLockState;
use tauri::State;
use uuid::Uuid;

use super::require_unlocked;

const MAX_CUSTOM_ACTIVITIES: i64 = 50;
const MAX_ACTIVITY_NAME_LEN: usize = 64;

/// List all activities ordered by sort_order
#[tauri::command]
pub fn list_activities(
    db: State<Database>,
    lock: State<'_, AppLockState>,
) -> Result<Vec<ActivityRow>, String> {
    require_unlocked(&lock)?;
    db::list_activities(&db)
}

/// Create a new custom activity
#[tauri::command]
pub fn create_activity(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    name: String,
    emoji: String,
) -> Result<ActivityRow, String> {
    require_unlocked(&lock)?;

    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Activity name cannot be empty".to_string());
    }
    if name.chars().count() > MAX_ACTIVITY_NAME_LEN {
        return Err(format!(
            "Activity name too long (max {} characters)",
            MAX_ACTIVITY_NAME_LEN
        ));
    }
    if emoji.len() > 32 {
        return Err("Emoji field too long (max 32 bytes)".to_string());
    }

    let id = format!("act_custom_{}", Uuid::new_v4().simple());
    db::create_activity(&db, &id, &name, &emoji, MAX_CUSTOM_ACTIVITIES)
}

/// Delete a custom activity (predefined activities cannot be deleted)
#[tauri::command]
pub fn delete_activity(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    db::delete_activity(&db, &id)
}

/// Replace all activities for a journal entry (called on explicit save)
#[tauri::command]
pub fn sync_entry_activities(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    entry_id: String,
    activity_ids: Vec<String>,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    if entry_id.is_empty() {
        return Err("entry_id must not be empty".to_string());
    }
    db::sync_entry_activities(&db, &entry_id, &activity_ids)
}

/// Get activities linked to a specific journal entry
#[tauri::command]
pub fn get_entry_activities(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    entry_id: String,
) -> Result<Vec<ActivityRow>, String> {
    require_unlocked(&lock)?;
    db::get_entry_activities(&db, &entry_id)
}

/// Get per-activity mood averages and entry counts (for insights)
#[tauri::command]
pub fn get_activity_stats(
    db: State<Database>,
    lock: State<'_, AppLockState>,
) -> Result<Vec<ActivityStats>, String> {
    require_unlocked(&lock)?;
    db::get_activity_stats(&db)
}
