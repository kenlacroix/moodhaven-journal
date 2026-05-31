use rusqlite::params;
use serde::{Deserialize, Serialize};

use super::Database;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StillSessionRow {
    pub id: String,
    pub protocol: String,
    pub environment: String,
    pub bilateral_mode: String,
    pub duration_seconds: i64,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub abandoned_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StillActivationSampleRow {
    pub id: i64,
    pub session_id: String,
    pub phase: String,
    pub activation: i64,
    pub hrv_manual: Option<i64>,
    pub hrv_source: Option<String>,
    pub note: Option<String>,
    pub sampled_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StillSessionWithSamples {
    pub session: StillSessionRow,
    pub samples: Vec<StillActivationSampleRow>,
}

pub fn still_create_session(
    db: &Database,
    id: &str,
    protocol: &str,
    environment: &str,
    bilateral_mode: &str,
    duration_seconds: i64,
    started_at: &str,
) -> Result<StillSessionRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO still_sessions (id, protocol, environment, bilateral_mode, duration_seconds, started_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, protocol, environment, bilateral_mode, duration_seconds, started_at],
    )
    .map_err(|e| format!("Failed to create session: {}", e))?;

    let row = conn.query_row(
        "SELECT id, protocol, environment, bilateral_mode, duration_seconds, started_at, completed_at, abandoned_at, created_at
         FROM still_sessions WHERE id = ?1",
        params![id],
        |r| Ok(StillSessionRow {
            id: r.get(0)?,
            protocol: r.get(1)?,
            environment: r.get(2)?,
            bilateral_mode: r.get(3)?,
            duration_seconds: r.get(4)?,
            started_at: r.get(5)?,
            completed_at: r.get(6)?,
            abandoned_at: r.get(7)?,
            created_at: r.get(8)?,
        }),
    )
    .map_err(|e| format!("Failed to fetch created session: {}", e))?;

    Ok(row)
}

pub fn still_record_activation(
    db: &Database,
    session_id: &str,
    phase: &str,
    activation: i64,
    hrv_manual: Option<i64>,
    hrv_source: Option<&str>,
    note: Option<&str>,
) -> Result<StillActivationSampleRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO still_activation_samples (session_id, phase, activation, hrv_manual, hrv_source, note)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![session_id, phase, activation, hrv_manual, hrv_source, note],
    )
    .map_err(|e| format!("Failed to record activation: {}", e))?;

    let row_id = conn.last_insert_rowid();

    let row = conn
        .query_row(
            "SELECT id, session_id, phase, activation, hrv_manual, hrv_source, note, sampled_at
         FROM still_activation_samples WHERE id = ?1",
            params![row_id],
            |r| {
                Ok(StillActivationSampleRow {
                    id: r.get(0)?,
                    session_id: r.get(1)?,
                    phase: r.get(2)?,
                    activation: r.get(3)?,
                    hrv_manual: r.get(4)?,
                    hrv_source: r.get(5)?,
                    note: r.get(6)?,
                    sampled_at: r.get(7)?,
                })
            },
        )
        .map_err(|e| format!("Failed to fetch activation sample: {}", e))?;

    Ok(row)
}

pub fn still_complete_session(
    db: &Database,
    id: &str,
    completed_at: &str,
    duration_seconds: i64,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE still_sessions SET completed_at = ?1, duration_seconds = ?2 WHERE id = ?3",
        params![completed_at, duration_seconds, id],
    )
    .map_err(|e| format!("Failed to complete session: {}", e))?;

    Ok(())
}

pub fn still_abandon_session(db: &Database, id: &str, abandoned_at: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE still_sessions SET abandoned_at = ?1 WHERE id = ?2",
        params![abandoned_at, id],
    )
    .map_err(|e| format!("Failed to abandon session: {}", e))?;

    Ok(())
}

pub fn still_list_sessions(
    db: &Database,
    limit: Option<i32>,
) -> Result<Vec<StillSessionRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(50) as i64;

    let mut stmt = conn.prepare(
        "SELECT id, protocol, environment, bilateral_mode, duration_seconds, started_at, completed_at, abandoned_at, created_at
         FROM still_sessions ORDER BY started_at DESC LIMIT ?1",
    )
    .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![lim], |r| {
            Ok(StillSessionRow {
                id: r.get(0)?,
                protocol: r.get(1)?,
                environment: r.get(2)?,
                bilateral_mode: r.get(3)?,
                duration_seconds: r.get(4)?,
                started_at: r.get(5)?,
                completed_at: r.get(6)?,
                abandoned_at: r.get(7)?,
                created_at: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

pub fn still_get_session_with_samples(
    db: &Database,
    id: &str,
) -> Result<Option<StillSessionWithSamples>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let session = conn.query_row(
        "SELECT id, protocol, environment, bilateral_mode, duration_seconds, started_at, completed_at, abandoned_at, created_at
         FROM still_sessions WHERE id = ?1",
        params![id],
        |r| Ok(StillSessionRow {
            id: r.get(0)?,
            protocol: r.get(1)?,
            environment: r.get(2)?,
            bilateral_mode: r.get(3)?,
            duration_seconds: r.get(4)?,
            started_at: r.get(5)?,
            completed_at: r.get(6)?,
            abandoned_at: r.get(7)?,
            created_at: r.get(8)?,
        }),
    );

    let session = match session {
        Ok(s) => s,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };

    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, phase, activation, hrv_manual, hrv_source, note, sampled_at
         FROM still_activation_samples WHERE session_id = ?1 ORDER BY sampled_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let samples = stmt
        .query_map(params![id], |r| {
            Ok(StillActivationSampleRow {
                id: r.get(0)?,
                session_id: r.get(1)?,
                phase: r.get(2)?,
                activation: r.get(3)?,
                hrv_manual: r.get(4)?,
                hrv_source: r.get(5)?,
                note: r.get(6)?,
                sampled_at: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Some(StillSessionWithSamples { session, samples }))
}

// ── v1.3.0 narrative layer ────────────────────────────────────────────────────

/// Lightweight session metadata for the timeline badge hover popover.
#[derive(Debug, Serialize, Deserialize)]
pub struct StillSessionBrief {
    pub protocol: String,
    pub duration_seconds: i64,
    pub pre_activation: Option<i64>,
    pub post_activation: Option<i64>,
}

/// Returns the minimal session metadata needed for the timeline badge.
/// Called lazily on hover — never on timeline load.
pub fn get_session_brief(db: &Database, session_id: &str) -> Result<Option<StillSessionBrief>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let row = conn.query_row(
        "SELECT s.protocol, s.duration_seconds,
                pre.activation  AS pre_activation,
                post.activation AS post_activation
         FROM still_sessions s
         LEFT JOIN still_activation_samples pre
               ON pre.session_id = s.id AND pre.phase = 'pre'
         LEFT JOIN still_activation_samples post
               ON post.session_id = s.id AND post.phase = 'post'
         WHERE s.id = ?1
         LIMIT 1",
        params![session_id],
        |r| Ok(StillSessionBrief {
            protocol: r.get(0)?,
            duration_seconds: r.get(1)?,
            pre_activation: r.get(2)?,
            post_activation: r.get(3)?,
        }),
    );

    match row {
        Ok(b) => Ok(Some(b)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Lightweight journal entry metadata for the session history card footer chip.
#[derive(Debug, Serialize, Deserialize)]
pub struct JournalBrief {
    pub entry_id: String,
    pub mood: i32,
    pub word_count: Option<i32>,
    pub created_at: String,
}

/// Returns the journal entry written after a given StillHaven session, if any.
pub fn get_journal_brief_for_session(db: &Database, session_id: &str) -> Result<Option<JournalBrief>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let row = conn.query_row(
        "SELECT id, mood, word_count, created_at
         FROM journal_entries
         WHERE session_id = ?1
         LIMIT 1",
        params![session_id],
        |r| Ok(JournalBrief {
            entry_id: r.get(0)?,
            mood: r.get(1)?,
            word_count: r.get(2)?,
            created_at: r.get(3)?,
        }),
    );

    match row {
        Ok(b) => Ok(Some(b)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Data bundle for the WellbeingCard morning card in WritingView.
/// All queries share a single mutex lock (lock-once pattern).
#[derive(Debug, Serialize, Deserialize)]
pub struct WellbeingContext {
    /// Oura readiness score today (null when Oura not connected or cache not yet written)
    pub oura_readiness_today: Option<i32>,
    /// Days since the last completed StillHaven session (null = no sessions ever)
    pub last_still_session_days_ago: Option<i64>,
    /// Average mood of entries written yesterday (null = no entries yesterday)
    pub yesterday_mood_avg: Option<f64>,
    /// Number of journal entries written yesterday
    pub yesterday_entry_count: i32,
    /// Current journaling streak in days
    pub streak_days: i32,
}

pub fn get_wellbeing_context(db: &Database) -> Result<WellbeingContext, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let yesterday = (chrono::Local::now() - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();

    // Oura readiness: read from settings cache key `oura_cache_YYYY-MM-DD`
    let oura_readiness_today: Option<i32> = {
        let oura_key = format!("oura_cache_{today}");
        let json_opt: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![oura_key],
                |r| r.get(0),
            )
            .ok();
        json_opt.and_then(|json| {
            serde_json::from_str::<serde_json::Value>(&json)
                .ok()
                .and_then(|v| v["readiness_score"].as_i64().map(|n| n as i32))
        })
    };

    // Days since last completed session
    let last_still_session_days_ago: Option<i64> = conn
        .query_row(
            "SELECT CAST(julianday('now') - julianday(completed_at) AS INTEGER)
             FROM still_sessions
             WHERE completed_at IS NOT NULL
             ORDER BY completed_at DESC
             LIMIT 1",
            [],
            |r| r.get(0),
        )
        .ok();

    // Yesterday's mood average and entry count
    let (yesterday_mood_avg, yesterday_entry_count): (Option<f64>, i32) = conn
        .query_row(
            "SELECT AVG(CAST(mood AS REAL)), COUNT(*)
             FROM journal_entries
             WHERE date(created_at) = ?1",
            params![yesterday],
            |r| Ok((r.get(0)?, r.get::<_, i32>(1)?)),
        )
        .unwrap_or((None, 0));

    // Current streak: count consecutive days from today backwards
    let streak_days: i32 = {
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT date(created_at) as d
                 FROM journal_entries
                 ORDER BY d DESC",
            )
            .map_err(|e| format!("streak prepare: {e}"))?;

        let dates: Vec<String> = stmt
            .query_map([], |r| r.get(0))
            .map_err(|e| format!("streak query: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        let mut streak = 0i32;
        let mut check = chrono::Local::now().date_naive();

        for date_str in &dates {
            if date_str == &check.format("%Y-%m-%d").to_string() {
                streak += 1;
                check -= chrono::Duration::days(1);
            } else if streak == 0 {
                // Allow missing today — check if yesterday started the streak
                let yesterday_str = check.format("%Y-%m-%d").to_string();
                if date_str == &yesterday_str {
                    check -= chrono::Duration::days(1);
                    streak += 1;
                    check -= chrono::Duration::days(1);
                } else {
                    break;
                }
            } else {
                break;
            }
        }
        streak
    };

    Ok(WellbeingContext {
        oura_readiness_today,
        last_still_session_days_ago,
        yesterday_mood_avg,
        yesterday_entry_count,
        streak_days,
    })
}
