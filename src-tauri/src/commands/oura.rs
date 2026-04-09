//! Oura Ring integration commands for MoodHaven Journal
//!
//! Provides Personal Access Token (PAT) validation, daily health data sync,
//! and retrieval of cached health context for journal writing enrichment.
//!
//! ## Temporal design
//!
//! All Oura endpoints are daily aggregates. Availability differs by metric:
//! - Sleep / Readiness / SpO2: dated to the wake-up day, available from morning
//! - Activity / Stress: finalize at end of day — use **yesterday's** data for
//!   complete readings when journaling in the morning
//!
//! `oura_sync_today` therefore syncs BOTH today and yesterday and caches each
//! under its own key (`oura_cache_YYYY-MM-DD`).  The frontend builds a "merged"
//! context that takes sleep/readiness from today and activity/stress from yesterday.
//!
//! Prompt modifiers are gated by history depth (≥ 3 cached days) to avoid
//! misleading suggestions from a single data point.
//!
//! Security:
//! - PAT is stored in the SQLite settings table (same protection as WebDAV credentials)
//! - Health data cached as JSON in SQLite settings table
//! - No data ever leaves the device except to the Oura API

use crate::db::Database;
use crate::AppLockState;
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

/// Fetch all 5 Oura endpoints for a calendar date and assemble a health context.
/// Does NOT interact with the database — the caller is responsible for caching.
async fn fetch_date_context(pat: &str, date: &str) -> OuraHealthContext {
    // Sequential fetches (avoids needing an explicit tokio dependency)
    let sleep_res = oura_get::<OuraSleepItem>(pat, "daily_sleep", date).await;
    let readiness_res = oura_get::<OuraReadinessItem>(pat, "daily_readiness", date).await;
    let activity_res = oura_get::<OuraActivityItem>(pat, "daily_activity", date).await;
    let stress_res = oura_get::<OuraStressItem>(pat, "daily_stress", date).await;
    let spo2_res = oura_get::<OuraSpo2Item>(pat, "daily_spo2", date).await;

    let d = date.to_string();
    let sleep = sleep_res
        .ok()
        .and_then(|r| r.data.into_iter().find(|i| i.day == d));
    let readiness = readiness_res
        .ok()
        .and_then(|r| r.data.into_iter().find(|i| i.day == d));
    let activity = activity_res
        .ok()
        .and_then(|r| r.data.into_iter().find(|i| i.day == d));
    let stress = stress_res
        .ok()
        .and_then(|r| r.data.into_iter().find(|i| i.day == d));
    let spo2 = spo2_res
        .ok()
        .and_then(|r| r.data.into_iter().find(|i| i.day == d));

    OuraHealthContext {
        date: d,
        sleep_score: sleep.as_ref().and_then(|s| s.score),
        sleep_total_minutes: sleep
            .as_ref()
            .and_then(|s| s.total_sleep_duration.map(|v| v / 60)),
        sleep_rem_minutes: sleep
            .as_ref()
            .and_then(|s| s.rem_sleep_duration.map(|v| v / 60)),
        sleep_deep_minutes: sleep
            .as_ref()
            .and_then(|s| s.deep_sleep_duration.map(|v| v / 60)),
        sleep_efficiency: sleep.as_ref().and_then(|s| s.efficiency),
        readiness_score: readiness.as_ref().and_then(|r| r.score),
        activity_score: activity.as_ref().and_then(|a| a.score),
        active_calories: activity.as_ref().and_then(|a| a.active_calories),
        steps: activity.as_ref().and_then(|a| a.steps),
        stress_summary: stress.as_ref().and_then(|s| s.summary.clone()),
        stress_high_minutes: stress.as_ref().and_then(|s| s.stress_high),
        recovery_high_minutes: stress.as_ref().and_then(|s| s.recovery_high),
        avg_spo2: spo2
            .as_ref()
            .and_then(|s| s.spo2_percentage.as_ref()?.average),
        fetched_at: chrono::Utc::now().to_rfc3339(),
    }
}

/// Serialize and store a health context in the settings table.
fn cache_context(conn: &rusqlite::Connection, ctx: &OuraHealthContext) -> Result<(), String> {
    let json = serde_json::to_string(ctx).map_err(|e| format!("Serialization failed: {}", e))?;
    let key = format!("{}{}", SETTING_CACHE_PREFIX, ctx.date);
    db_set(conn, &key, &json)
}

// ============================================================================
// Tauri commands
// ============================================================================

/// Validate a Personal Access Token by calling the Oura API.
/// Does NOT store the token — storage is handled by the frontend (encrypted via secureStorage).
#[tauri::command]
pub async fn oura_validate_pat(_app: AppHandle, pat: String) -> Result<(), String> {
    if pat.trim().is_empty() {
        return Err("Token cannot be empty".to_string());
    }

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

    Ok(())
}

/// Validate and save a Personal Access Token.
/// Kept for backwards compatibility; new flow calls oura_validate_pat + secureStorage instead.
#[tauri::command]
pub async fn oura_save_pat(app: AppHandle, pat: String) -> Result<(), String> {
    if app.state::<AppLockState>().is_locked() {
        return Err("Session is locked".to_string());
    }
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
    db_set(
        &conn,
        SETTING_CONNECTED_AT,
        &chrono::Utc::now().to_rfc3339(),
    )?;

    Ok(())
}

/// Remove PAT and all cached Oura data from the database.
#[tauri::command]
pub async fn oura_disconnect(app: AppHandle) -> Result<(), String> {
    if app.state::<AppLockState>().is_locked() {
        return Err("Session is locked".to_string());
    }
    let db = app.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    ensure_settings_table(&conn)?;

    db_delete(&conn, SETTING_PAT)?;
    db_delete(&conn, SETTING_CONNECTED_AT)?;
    db_delete(&conn, SETTING_LAST_SYNC_AT)?;

    // Remove all cached daily metrics
    conn.execute("DELETE FROM settings WHERE key LIKE 'oura_cache_%'", [])
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Return current connection status (whether PAT is stored).
#[tauri::command]
pub async fn oura_get_status(app: AppHandle) -> Result<OuraStatusResponse, String> {
    if app.state::<AppLockState>().is_locked() {
        return Err("Session is locked".to_string());
    }
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

/// Fetch health metrics for today AND yesterday from the Oura API, caching both.
///
/// Why both dates?
/// - Today  → sleep, readiness, SpO2 are available from morning (dated to wake day)
/// - Yesterday → activity score and stress summary are finalized after end of day
///
/// The frontend merges these two cached entries into a single "session context"
/// that gives complete data for morning journaling.
///
/// `pat` is passed from the frontend (decrypted from secureStorage) rather than read from
/// the database, so the credential never needs to be stored unencrypted in Rust.
#[tauri::command]
pub async fn oura_sync_today(app: AppHandle, pat: String) -> Result<OuraHealthContext, String> {
    if app.state::<AppLockState>().is_locked() {
        return Err("Session is locked".to_string());
    }
    if pat.trim().is_empty() {
        return Err("Oura not connected — save a Personal Access Token first".to_string());
    }
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let yesterday = (chrono::Local::now() - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();

    let pat = pat.trim().to_string();

    // Fetch both dates (sequential; each call is ~100ms)
    let today_ctx = fetch_date_context(&pat, &today).await;
    let yesterday_ctx = fetch_date_context(&pat, &yesterday).await;

    // Cache both and update sync timestamp
    {
        let db = app.state::<Database>();
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        ensure_settings_table(&conn)?;
        cache_context(&conn, &today_ctx)?;
        cache_context(&conn, &yesterday_ctx)?;
        db_set(
            &conn,
            SETTING_LAST_SYNC_AT,
            &chrono::Utc::now().to_rfc3339(),
        )?;
    }

    Ok(today_ctx)
}

/// Return cached health context for a given date (YYYY-MM-DD).
/// Returns null if no data has been synced for that date.
#[tauri::command]
pub async fn oura_get_context(
    app: AppHandle,
    date: String,
) -> Result<Option<OuraHealthContext>, String> {
    if app.state::<AppLockState>().is_locked() {
        return Err("Session is locked".to_string());
    }
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

/// Return the last `days` cached health contexts, sorted ascending by date.
///
/// Used by the frontend to build trend-aware prompt modifiers.
/// Prompt modifiers are gated by history depth (< 3 days → no modifiers).
#[tauri::command]
pub async fn oura_get_history(app: AppHandle, days: i32) -> Result<Vec<OuraHealthContext>, String> {
    if app.state::<AppLockState>().is_locked() {
        return Err("Session is locked".to_string());
    }
    let db = app.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    ensure_settings_table(&conn)?;

    let limit = days.clamp(1, 90) as i64;

    let mut stmt = conn
        .prepare(
            "SELECT value FROM settings \
             WHERE key LIKE 'oura_cache_%' \
             ORDER BY key DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<String> = stmt
        .query_map([limit], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut contexts: Vec<OuraHealthContext> = rows
        .into_iter()
        .filter_map(|json| serde_json::from_str::<OuraHealthContext>(&json).ok())
        .collect();

    // Query returned DESC; reverse to chronological (ascending) order
    contexts.sort_by(|a, b| a.date.cmp(&b.date));

    Ok(contexts)
}

/// Fetch and cache health data for the last `days` days, skipping already-cached dates.
///
/// Called automatically on first PAT connect to prime the 7-day history
/// needed for trend-aware prompt modifiers.  Returns the number of newly
/// fetched days.
///
/// `pat` is passed from the frontend (decrypted from secureStorage).
#[tauri::command]
pub async fn oura_backfill(app: AppHandle, days: i32, pat: String) -> Result<i32, String> {
    if app.state::<AppLockState>().is_locked() {
        return Err("Session is locked".to_string());
    }
    if pat.trim().is_empty() {
        return Err("Oura not connected".to_string());
    }
    let days = days.clamp(1, 30); // cap at 30 days
    let pat = pat.trim().to_string();

    let mut fetched = 0i32;

    for i in 0..days {
        let date = (chrono::Local::now() - chrono::Duration::days(i as i64))
            .format("%Y-%m-%d")
            .to_string();

        // Skip dates already in the cache
        let already_cached = {
            let db = app.state::<Database>();
            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            let key = format!("{}{}", SETTING_CACHE_PREFIX, date);
            db_get(&conn, &key)?.is_some()
        };

        if already_cached {
            continue;
        }

        // Fetch from Oura API (no DB lock held during network call)
        let ctx = fetch_date_context(&pat, &date).await;

        // Cache the result
        let db = app.state::<Database>();
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        cache_context(&conn, &ctx)?;
        fetched += 1;
    }

    Ok(fetched)
}
