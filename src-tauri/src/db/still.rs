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
