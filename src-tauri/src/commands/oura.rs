//! Oura Ring integration commands for MoodBloom
//!
//! Provides Personal Access Token (PAT) validation, daily health data sync,
//! and retrieval of cached health context for journal writing enrichment.
//!
//! Security:
//! - PAT is stored in the SQLite settings table (same protection as WebDAV credentials)
//! - Health data cached as JSON in SQLite settings table
//! - No data ever leaves the device except to the Oura API

use crate::db::Database;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const OURA_API_BASE: &str = "https://api.ouraring.com/v2/usercollection";
const SETTING_PAT: &str = "oura_pat";
const SETTING_CONNECTED_AT: &str = "oura_connected_at";
const SETTING_LAST_SYNC_AT: &str = "oura_last_sync_at";
const SETTING_CACHE_PREFIX: &str = "oura_cache_";

// ============================================================================
// Response structures for Oura API v2
// ============================================================================

#[derive(Debug, Deserialize)]
struct OuraSleepItem {
    day: String,
    score: Option<i32>,
    total_sleep_duration: Option<i32>, // seconds
    rem_sleep_duration: Option<i32>,   // seconds
    deep_sleep_duration: Option<i32>,  // seconds
    efficiency: Option<i32>,           // 0-100
}

#[derive(Debug, Deserialize)]
struct OuraReadinessItem {
    day: String,
    score: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct OuraActivityItem {
    day: String,
    score: Option<i32>,
    active_calories: Option<i32>,
    steps: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct OuraStressItem {
    day: String,
    stress_high: Option<i32>,   // minutes
    recovery_high: Option<i32>, // minutes
    summary: Option<String>,    // "restored" | "normal" | "stressful" | "demanding"
}

#[derive(Debug, Deserialize)]
struct OuraSpo2Item {
    day: String,
    spo2_percentage: Option<OuraSpo2Percentage>,
}

#[derive(Debug, Deserialize)]
struct OuraSpo2Percentage {
    average: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct OuraListResponse<T> {
    data: Vec<T>,
}

// ============================================================================
// Public return types
// ============================================================================

/// Connection status returned to the frontend
#[derive(Debug, Serialize)]
pub struct OuraStatusResponse {
    pub connected: bool,
    pub connected_at: Option<String>,
    pub last_sync_at: Option<String>,
}

/// Health context for a single day (returned to frontend)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OuraHealthContext {
    pub date: String,
    // Sleep
    pub sleep_score: Option<i32>,
    pub sleep_total_minutes: Option<i32>,
    pub sleep_rem_minutes: Option<i32>,
    pub sleep_deep_minutes: Option<i32>,
    pub sleep_efficiency: Option<i32>,
    // Readiness
    pub readiness_score: Option<i32>,
    // Activity
    pub activity_score: Option<i32>,
    pub active_calories: Option<i32>,
    pub steps: Option<i32>,
    // Stress
    pub stress_summary: Option<String>,
    pub stress_high_minutes: Option<i32>,
    pub recovery_high_minutes: Option<i32>,
    // SpO2
    pub avg_spo2: Option<f64>,
    // Cache metadata
    pub fetched_at: String,
}

// ============================================================================
// Internal helpers
// ============================================================================

fn ensure_settings_table(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn db_get(conn: &rusqlite::Connection, key: &str) -> Result<Option<String>, String> {
    let result: Result<String, rusqlite::Error> =
        conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
            row.get(0)
        });
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn db_set(conn: &rusqlite::Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
        rusqlite::params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn db_delete(conn: &rusqlite::Connection, key: &str) -> Result<(), String> {
    conn.execute("DELETE FROM settings WHERE key = ?1", [key])
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn oura_get<T: for<'de> Deserialize<'de>>(
    pat: &str,
    endpoint: &str,
    date: &str,
) -> Result<OuraListResponse<T>, String> {
    let url = format!(
        "{}/{}?start_date={}&end_date={}",
        OURA_API_BASE, endpoint, date, date
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", pat))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Oura API error {}: {}", status, body));
    }

    resp.json::<OuraListResponse<T>>()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))
}

// ============================================================================
// Tauri commands
// ============================================================================

/// Validate and save a Personal Access Token.
/// Tests the token by calling /personal_info before storing.
#[tauri::command]
pub async fn oura_save_pat(app: AppHandle, pat: String) -> Result<(), String> {
    if pat.trim().is_empty() {
        return Err("Token cannot be empty".to_string());
    }

    // Validate token by fetching personal info (no data stored from this)
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.ouraring.com/v2/usercollection/personal_info")
        .header("Authorization", format!("Bearer {}", pat.trim()))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Could not reach Oura servers: {}", e))?;

    if resp.status() == 401 {
        return Err("Invalid token — please check your Personal Access Token".to_string());
    }

    if !resp.status().is_success() {
        return Err(format!(
            "Oura API returned status {}",
            resp.status().as_u16()
        ));
    }

    // Store validated PAT and connection timestamp
    let db = app.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    ensure_settings_table(&conn)?;
    db_set(&conn, SETTING_PAT, pat.trim())?;
    db_set(&conn, SETTING_CONNECTED_AT, &chrono::Utc::now().to_rfc3339())?;

    Ok(())
}

/// Remove PAT and all cached Oura data from the database.
#[tauri::command]
pub async fn oura_disconnect(app: AppHandle) -> Result<(), String> {
    let db = app.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    ensure_settings_table(&conn)?;

    db_delete(&conn, SETTING_PAT)?;
    db_delete(&conn, SETTING_CONNECTED_AT)?;
    db_delete(&conn, SETTING_LAST_SYNC_AT)?;

    // Remove all cached daily metrics
    conn.execute(
        "DELETE FROM settings WHERE key LIKE 'oura_cache_%'",
        [],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Return current connection status (whether PAT is stored).
#[tauri::command]
pub async fn oura_get_status(app: AppHandle) -> Result<OuraStatusResponse, String> {
    let db = app.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    ensure_settings_table(&conn)?;

    let pat = db_get(&conn, SETTING_PAT)?;
    let connected_at = db_get(&conn, SETTING_CONNECTED_AT)?;
    let last_sync_at = db_get(&conn, SETTING_LAST_SYNC_AT)?;

    Ok(OuraStatusResponse {
        connected: pat.is_some(),
        connected_at,
        last_sync_at,
    })
}

/// Fetch today's health metrics from the Oura API and cache them.
/// Returns the health context.
#[tauri::command]
pub async fn oura_sync_today(app: AppHandle) -> Result<OuraHealthContext, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    // Get PAT (lock → get → unlock before HTTP calls)
    let pat = {
        let db = app.state::<Database>();
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        ensure_settings_table(&conn)?;
        db_get(&conn, SETTING_PAT)?
            .ok_or_else(|| "Oura not connected — save a Personal Access Token first".to_string())?
    };

    // Fetch all endpoints (sequential — each call is fast, avoids needing tokio dep)
    let sleep_res = oura_get::<OuraSleepItem>(&pat, "daily_sleep", &today).await;
    let readiness_res = oura_get::<OuraReadinessItem>(&pat, "daily_readiness", &today).await;
    let activity_res = oura_get::<OuraActivityItem>(&pat, "daily_activity", &today).await;
    let stress_res = oura_get::<OuraStressItem>(&pat, "daily_stress", &today).await;
    let spo2_res = oura_get::<OuraSpo2Item>(&pat, "daily_spo2", &today).await;

    // Extract first matching item for each endpoint (if any)
    let sleep = sleep_res.ok().and_then(|r| {
        r.data.into_iter().find(|i| i.day == today)
    });
    let readiness = readiness_res.ok().and_then(|r| {
        r.data.into_iter().find(|i| i.day == today)
    });
    let activity = activity_res.ok().and_then(|r| {
        r.data.into_iter().find(|i| i.day == today)
    });
    let stress = stress_res.ok().and_then(|r| {
        r.data.into_iter().find(|i| i.day == today)
    });
    let spo2 = spo2_res.ok().and_then(|r| {
        r.data.into_iter().find(|i| i.day == today)
    });

    let context = OuraHealthContext {
        date: today.clone(),
        sleep_score: sleep.as_ref().and_then(|s| s.score),
        sleep_total_minutes: sleep.as_ref().and_then(|s| s.total_sleep_duration.map(|v| v / 60)),
        sleep_rem_minutes: sleep.as_ref().and_then(|s| s.rem_sleep_duration.map(|v| v / 60)),
        sleep_deep_minutes: sleep.as_ref().and_then(|s| s.deep_sleep_duration.map(|v| v / 60)),
        sleep_efficiency: sleep.as_ref().and_then(|s| s.efficiency),
        readiness_score: readiness.as_ref().and_then(|r| r.score),
        activity_score: activity.as_ref().and_then(|a| a.score),
        active_calories: activity.as_ref().and_then(|a| a.active_calories),
        steps: activity.as_ref().and_then(|a| a.steps),
        stress_summary: stress.as_ref().and_then(|s| s.summary.clone()),
        stress_high_minutes: stress.as_ref().and_then(|s| s.stress_high),
        recovery_high_minutes: stress.as_ref().and_then(|s| s.recovery_high),
        avg_spo2: spo2.as_ref().and_then(|s| s.spo2_percentage.as_ref()?.average),
        fetched_at: chrono::Utc::now().to_rfc3339(),
    };

    // Cache in DB
    let json = serde_json::to_string(&context)
        .map_err(|e| format!("Serialization failed: {}", e))?;

    {
        let db = app.state::<Database>();
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        ensure_settings_table(&conn)?;
        let cache_key = format!("{}{}", SETTING_CACHE_PREFIX, today);
        db_set(&conn, &cache_key, &json)?;
        db_set(&conn, SETTING_LAST_SYNC_AT, &chrono::Utc::now().to_rfc3339())?;
    }

    Ok(context)
}

/// Return cached health context for a given date (YYYY-MM-DD).
/// Returns null if no data has been synced for that date.
#[tauri::command]
pub async fn oura_get_context(
    app: AppHandle,
    date: String,
) -> Result<Option<OuraHealthContext>, String> {
    let db = app.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    ensure_settings_table(&conn)?;

    let cache_key = format!("{}{}", SETTING_CACHE_PREFIX, date);
    match db_get(&conn, &cache_key)? {
        None => Ok(None),
        Some(json) => {
            let ctx: OuraHealthContext = serde_json::from_str(&json)
                .map_err(|e| format!("Failed to parse cached data: {}", e))?;
            Ok(Some(ctx))
        }
    }
}
