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

    let n = conn
        .execute(
            "UPDATE still_sessions SET completed_at = ?1, duration_seconds = ?2 WHERE id = ?3",
            params![completed_at, duration_seconds, id],
        )
        .map_err(|e| format!("Failed to complete session: {}", e))?;
    if n == 0 {
        return Err(format!("Session not found: {id}"));
    }

    Ok(())
}

pub fn still_abandon_session(db: &Database, id: &str, abandoned_at: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let n = conn
        .execute(
            "UPDATE still_sessions SET abandoned_at = ?1 WHERE id = ?2",
            params![abandoned_at, id],
        )
        .map_err(|e| format!("Failed to abandon session: {}", e))?;
    if n == 0 {
        return Err(format!("Session not found: {id}"));
    }

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
pub fn get_session_brief(
    db: &Database,
    session_id: &str,
) -> Result<Option<StillSessionBrief>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let row = conn.query_row(
        "SELECT s.protocol, s.duration_seconds,
                (SELECT activation FROM still_activation_samples
                 WHERE session_id = s.id AND phase = 'pre'
                 ORDER BY sampled_at DESC, ROWID DESC LIMIT 1) AS pre_activation,
                (SELECT activation FROM still_activation_samples
                 WHERE session_id = s.id AND phase = 'post'
                 ORDER BY sampled_at DESC, ROWID DESC LIMIT 1) AS post_activation
         FROM still_sessions s
         WHERE s.id = ?1",
        params![session_id],
        |r| {
            Ok(StillSessionBrief {
                protocol: r.get(0)?,
                duration_seconds: r.get(1)?,
                pre_activation: r.get(2)?,
                post_activation: r.get(3)?,
            })
        },
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
pub fn get_journal_brief_for_session(
    db: &Database,
    session_id: &str,
) -> Result<Option<JournalBrief>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let row = conn.query_row(
        "SELECT id, mood, word_count, created_at
         FROM journal_entries
         WHERE session_id = ?1
         LIMIT 1",
        params![session_id],
        |r| {
            Ok(JournalBrief {
                entry_id: r.get(0)?,
                mood: r.get(1)?,
                word_count: r.get(2)?,
                created_at: r.get(3)?,
            })
        },
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
                 ORDER BY d DESC
                 LIMIT 1000",
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
                // Allow missing today — check if yesterday started the streak.
                // check is still today here; compute actual yesterday before comparing.
                let yesterday = check - chrono::Duration::days(1);
                if date_str == &yesterday.format("%Y-%m-%d").to_string() {
                    streak += 1;
                    check = yesterday - chrono::Duration::days(1);
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

// ── v1.4.0 StillHaven Effect ──────────────────────────────────────────────────

/// Per-protocol aggregate: activation drop and mood after linked journal entry.
#[derive(Debug, Serialize, Deserialize)]
pub struct ProtocolEffect {
    pub protocol: String,
    pub session_count: i32,
    /// Average pre−post activation delta; positive = improvement (activation dropped).
    pub avg_activation_delta: Option<f64>,
    /// Average mood on the journal entry written after the session (1–5).
    pub avg_mood_after: Option<f64>,
}

/// Aggregated effect statistics across all completed sessions that have both
/// pre/post activation samples and a linked journal entry.
#[derive(Debug, Serialize, Deserialize)]
pub struct StillEffectStats {
    pub per_protocol: Vec<ProtocolEffect>,
    /// Protocol with highest avg activation delta (requires ≥2 qualifying sessions).
    pub best_protocol: Option<String>,
    /// Total sessions included in the analysis.
    pub sessions_with_data: i32,
    /// Overall average mood across all qualifying sessions.
    pub avg_mood_after: Option<f64>,
}

/// Compute per-protocol effect statistics by joining sessions → activation samples
/// → linked journal entries. Only completed sessions with both pre+post samples
/// and a linked journal entry are included.
pub fn get_effect_stats(db: &Database) -> Result<StillEffectStats, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT
                s.protocol,
                COUNT(*)                                          AS session_count,
                AVG(CAST(pre.activation - post.activation AS REAL)) AS avg_delta,
                AVG(CAST(je.mood AS REAL))                        AS avg_mood
             FROM still_sessions s
             INNER JOIN still_activation_samples pre
                     ON pre.session_id = s.id AND pre.phase = 'pre'
             INNER JOIN still_activation_samples post
                     ON post.session_id = s.id AND post.phase = 'post'
             INNER JOIN journal_entries je
                     ON je.session_id = s.id
             WHERE s.completed_at IS NOT NULL
             GROUP BY s.protocol
             ORDER BY avg_delta DESC",
        )
        .map_err(|e| format!("effect_stats prepare: {e}"))?;

    let per_protocol: Vec<ProtocolEffect> = stmt
        .query_map([], |r| {
            Ok(ProtocolEffect {
                protocol: r.get(0)?,
                session_count: r.get(1)?,
                avg_activation_delta: r.get(2)?,
                avg_mood_after: r.get(3)?,
            })
        })
        .map_err(|e| format!("effect_stats query: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    let sessions_with_data: i32 = per_protocol.iter().map(|p| p.session_count).sum();

    let avg_mood_after: Option<f64> = if sessions_with_data > 0 {
        let total_mood: f64 = per_protocol
            .iter()
            .filter_map(|p| p.avg_mood_after.map(|m| m * p.session_count as f64))
            .sum();
        Some(total_mood / sessions_with_data as f64)
    } else {
        None
    };

    // Recommend the protocol with the highest avg activation delta that has ≥2 sessions.
    let best_protocol = per_protocol
        .iter()
        .filter(|p| p.session_count >= 2)
        .filter(|p| p.avg_activation_delta.unwrap_or(0.0) > 0.0)
        .max_by(|a, b| {
            a.avg_activation_delta
                .unwrap_or(0.0)
                .partial_cmp(&b.avg_activation_delta.unwrap_or(0.0))
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|p| p.protocol.clone());

    Ok(StillEffectStats {
        per_protocol,
        best_protocol,
        sessions_with_data,
        avg_mood_after,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::Mutex;

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().expect("in-memory DB");
        conn.execute_batch(
            "CREATE TABLE still_sessions (
                id               TEXT PRIMARY KEY,
                protocol         TEXT NOT NULL,
                environment      TEXT NOT NULL DEFAULT 'underwater',
                bilateral_mode   TEXT NOT NULL DEFAULT 'audio',
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                started_at       TEXT NOT NULL,
                completed_at     TEXT,
                abandoned_at     TEXT,
                created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now'))
            );
            CREATE TABLE still_activation_samples (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id  TEXT NOT NULL,
                phase       TEXT NOT NULL,
                activation  INTEGER NOT NULL,
                hrv_manual  INTEGER,
                hrv_source  TEXT,
                note        TEXT,
                sampled_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now'))
            );
            CREATE TABLE journal_entries (
                id                TEXT PRIMARY KEY,
                encrypted_content TEXT NOT NULL DEFAULT '{}',
                mood              INTEGER NOT NULL DEFAULT 3,
                privacy_mode      INTEGER NOT NULL DEFAULT 0,
                location_weather  TEXT,
                book_id           TEXT NOT NULL DEFAULT 'default',
                pinned            INTEGER NOT NULL DEFAULT 0,
                session_id        TEXT,
                word_count        INTEGER,
                created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now')),
                updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now'))
            );
            CREATE TABLE settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
        )
        .expect("create tables");
        Database {
            conn: Mutex::new(conn),
        }
    }

    fn insert_session(db: &Database, id: &str, started_at: &str) {
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO still_sessions (id, protocol, started_at) VALUES (?1, 'general_activation', ?2)",
            params![id, started_at],
        )
        .unwrap();
    }

    fn insert_entry_yesterday(db: &Database, id: &str, mood: i32) {
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO journal_entries (id, mood, created_at, updated_at)
             VALUES (?1, ?2, date('now','-1 day') || 'T12:00:00', date('now','-1 day') || 'T12:00:00')",
            params![id, mood],
        )
        .unwrap();
    }

    // ── still_create_session ─────────────────────────────────────────────────

    #[test]
    fn create_session_returns_correct_row() {
        let db = test_db();
        let row = still_create_session(
            &db,
            "s1",
            "general_activation",
            "underwater",
            "audio",
            0,
            "2026-01-01T10:00:00",
        )
        .unwrap();
        assert_eq!(row.id, "s1");
        assert_eq!(row.protocol, "general_activation");
        assert_eq!(row.duration_seconds, 0);
        assert!(row.completed_at.is_none());
        assert!(row.abandoned_at.is_none());
    }

    #[test]
    fn create_session_duplicate_id_errors() {
        let db = test_db();
        insert_session(&db, "s1", "2026-01-01T10:00:00");
        let result = still_create_session(
            &db,
            "s1",
            "fake_danger",
            "underwater",
            "audio",
            0,
            "2026-01-01T11:00:00",
        );
        assert!(result.is_err());
    }

    // ── still_record_activation ──────────────────────────────────────────────

    #[test]
    fn record_activation_pre_phase() {
        let db = test_db();
        insert_session(&db, "s1", "2026-01-01T10:00:00");
        let row = still_record_activation(&db, "s1", "pre", 7, None, None, None).unwrap();
        assert_eq!(row.session_id, "s1");
        assert_eq!(row.phase, "pre");
        assert_eq!(row.activation, 7);
        assert!(row.hrv_manual.is_none());
        assert!(row.hrv_source.is_none());
        assert!(row.note.is_none());
    }

    #[test]
    fn record_activation_with_hrv() {
        let db = test_db();
        insert_session(&db, "s1", "2026-01-01T10:00:00");
        let row = still_record_activation(
            &db,
            "s1",
            "post",
            4,
            Some(45),
            Some("manual"),
            Some("felt calmer"),
        )
        .unwrap();
        assert_eq!(row.phase, "post");
        assert_eq!(row.hrv_manual, Some(45));
        assert_eq!(row.hrv_source.as_deref(), Some("manual"));
        assert_eq!(row.note.as_deref(), Some("felt calmer"));
    }

    // ── still_complete_session ───────────────────────────────────────────────

    #[test]
    fn complete_session_updates_fields() {
        let db = test_db();
        insert_session(&db, "s1", "2026-01-01T10:00:00");
        still_complete_session(&db, "s1", "2026-01-01T10:20:00", 1200).unwrap();
        let result = still_get_session_with_samples(&db, "s1").unwrap().unwrap();
        assert_eq!(
            result.session.completed_at.as_deref(),
            Some("2026-01-01T10:20:00")
        );
        assert_eq!(result.session.duration_seconds, 1200);
        assert!(result.session.abandoned_at.is_none());
    }

    // ── still_abandon_session ────────────────────────────────────────────────

    #[test]
    fn abandon_session_sets_abandoned_at() {
        let db = test_db();
        insert_session(&db, "s1", "2026-01-01T10:00:00");
        still_abandon_session(&db, "s1", "2026-01-01T10:05:00").unwrap();
        let result = still_get_session_with_samples(&db, "s1").unwrap().unwrap();
        assert_eq!(
            result.session.abandoned_at.as_deref(),
            Some("2026-01-01T10:05:00")
        );
        assert!(result.session.completed_at.is_none());
    }

    // ── still_list_sessions ──────────────────────────────────────────────────

    #[test]
    fn list_sessions_empty() {
        let db = test_db();
        let rows = still_list_sessions(&db, None).unwrap();
        assert!(rows.is_empty());
    }

    #[test]
    fn list_sessions_ordered_newest_first() {
        let db = test_db();
        insert_session(&db, "s1", "2026-01-01T09:00:00");
        insert_session(&db, "s2", "2026-01-02T09:00:00");
        let rows = still_list_sessions(&db, None).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].id, "s2");
        assert_eq!(rows[1].id, "s1");
    }

    #[test]
    fn list_sessions_respects_limit() {
        let db = test_db();
        for i in 0..5u8 {
            insert_session(
                &db,
                &format!("s{i}"),
                &format!("2026-01-0{}T09:00:00", i + 1),
            );
        }
        let rows = still_list_sessions(&db, Some(2)).unwrap();
        assert_eq!(rows.len(), 2);
    }

    // ── still_get_session_with_samples ───────────────────────────────────────

    #[test]
    fn get_session_with_samples_returns_none_for_missing() {
        let db = test_db();
        let result = still_get_session_with_samples(&db, "nonexistent").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn get_session_with_samples_no_activation_records() {
        let db = test_db();
        insert_session(&db, "s1", "2026-01-01T10:00:00");
        let result = still_get_session_with_samples(&db, "s1").unwrap().unwrap();
        assert_eq!(result.session.id, "s1");
        assert!(result.samples.is_empty());
    }

    #[test]
    fn get_session_with_samples_returns_both() {
        let db = test_db();
        insert_session(&db, "s1", "2026-01-01T10:00:00");
        still_record_activation(&db, "s1", "pre", 6, None, None, None).unwrap();
        still_record_activation(&db, "s1", "post", 3, None, None, None).unwrap();
        let result = still_get_session_with_samples(&db, "s1").unwrap().unwrap();
        assert_eq!(result.samples.len(), 2);
        assert_eq!(result.samples[0].phase, "pre");
        assert_eq!(result.samples[1].phase, "post");
    }

    // ── get_session_brief ────────────────────────────────────────────────────

    #[test]
    fn get_session_brief_returns_none_for_missing() {
        let db = test_db();
        let result = get_session_brief(&db, "nonexistent").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn get_session_brief_with_pre_and_post() {
        let db = test_db();
        insert_session(&db, "s1", "2026-01-01T10:00:00");
        still_record_activation(&db, "s1", "pre", 5, None, None, None).unwrap();
        still_record_activation(&db, "s1", "post", 3, None, None, None).unwrap();
        let brief = get_session_brief(&db, "s1").unwrap().unwrap();
        assert_eq!(brief.protocol, "general_activation");
        assert_eq!(brief.pre_activation, Some(5));
        assert_eq!(brief.post_activation, Some(3));
    }

    // ── still_complete_session / still_abandon_session — nonexistent id ────────

    #[test]
    fn complete_session_nonexistent_id_errors() {
        let db = test_db();
        let result = still_complete_session(&db, "nope", "2026-01-01T11:00:00", 600);
        assert!(result.is_err(), "expected Err for nonexistent session id");
    }

    #[test]
    fn abandon_session_nonexistent_id_errors() {
        let db = test_db();
        let result = still_abandon_session(&db, "nope", "2026-01-01T10:05:00");
        assert!(result.is_err(), "expected Err for nonexistent session id");
    }

    // ── get_session_brief — partial activation ───────────────────────────────

    #[test]
    fn get_session_brief_only_pre_activation() {
        let db = test_db();
        insert_session(&db, "s1", "2026-01-01T10:00:00");
        still_record_activation(&db, "s1", "pre", 8, None, None, None).unwrap();
        let brief = get_session_brief(&db, "s1").unwrap().unwrap();
        assert_eq!(brief.pre_activation, Some(8));
        assert!(brief.post_activation.is_none());
    }

    #[test]
    fn get_session_brief_only_post_activation() {
        let db = test_db();
        insert_session(&db, "s1", "2026-01-01T10:00:00");
        still_record_activation(&db, "s1", "post", 2, None, None, None).unwrap();
        let brief = get_session_brief(&db, "s1").unwrap().unwrap();
        assert!(brief.pre_activation.is_none());
        assert_eq!(brief.post_activation, Some(2));
    }

    // ── get_journal_brief_for_session ────────────────────────────────────────

    #[test]
    fn get_journal_brief_returns_none_when_no_entry() {
        let db = test_db();
        insert_session(&db, "s1", "2026-01-01T10:00:00");
        let result = get_journal_brief_for_session(&db, "s1").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn get_journal_brief_returns_entry() {
        let db = test_db();
        insert_session(&db, "s1", "2026-01-01T10:00:00");
        {
            let conn = db.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO journal_entries (id, mood, session_id, created_at, updated_at)
                 VALUES ('e1', 4, 's1', '2026-01-01T11:00:00', '2026-01-01T11:00:00')",
                [],
            )
            .unwrap();
        }
        let brief = get_journal_brief_for_session(&db, "s1").unwrap().unwrap();
        assert_eq!(brief.entry_id, "e1");
        assert_eq!(brief.mood, 4);
    }

    // ── get_wellbeing_context ────────────────────────────────────────────────

    #[test]
    fn get_wellbeing_context_empty_db() {
        let db = test_db();
        let ctx = get_wellbeing_context(&db).unwrap();
        assert!(ctx.oura_readiness_today.is_none());
        assert!(ctx.last_still_session_days_ago.is_none());
        assert!(ctx.yesterday_mood_avg.is_none());
        assert_eq!(ctx.yesterday_entry_count, 0);
        assert_eq!(ctx.streak_days, 0);
    }

    #[test]
    fn get_wellbeing_context_yesterday_entries() {
        let db = test_db();
        insert_entry_yesterday(&db, "e1", 3);
        insert_entry_yesterday(&db, "e2", 5);
        let ctx = get_wellbeing_context(&db).unwrap();
        assert_eq!(ctx.yesterday_entry_count, 2);
        let avg = ctx.yesterday_mood_avg.expect("should have avg");
        assert!((avg - 4.0).abs() < 0.001, "expected avg 4.0, got {avg}");
    }

    #[test]
    fn get_wellbeing_context_streak_from_only_yesterday() {
        let db = test_db();
        insert_entry_yesterday(&db, "e1", 3);
        let ctx = get_wellbeing_context(&db).unwrap();
        // Streak of 1: no entry today, but yesterday counts (allow-missing-today path)
        assert_eq!(
            ctx.streak_days, 1,
            "yesterday-only should give streak 1, got {}",
            ctx.streak_days
        );
    }

    #[test]
    fn get_wellbeing_context_streak_from_today_and_yesterday() {
        let db = test_db();
        // Entry today
        {
            let conn = db.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO journal_entries (id, mood, created_at, updated_at)
                 VALUES ('today', 3, datetime('now'), datetime('now'))",
                [],
            )
            .unwrap();
        }
        // Entry yesterday
        insert_entry_yesterday(&db, "yesterday", 4);
        let ctx = get_wellbeing_context(&db).unwrap();
        assert!(
            ctx.streak_days >= 2,
            "streak should be ≥2 with today + yesterday entries, got {}",
            ctx.streak_days
        );
    }
}
