//! Voice memo Tauri commands
//!
//! Handles storage of .m4a audio files received from the Wear OS watch
//! (via WearListenerService / ChannelAPI) and manages the voice_memos table.
//!
//! File lifecycle on Android:
//!   1. WearListenerService writes raw audio to:
//!      filesDir/voice_memos_incoming/<id>.m4a
//!   2. TypeScript hears "wear://voice_memo" event and calls `store_voice_memo`.
//!   3. `store_voice_memo` moves the file to:
//!      app_data_dir/voice_memos/<id>.m4a
//!      and inserts a row into `voice_memos`.
//!   4. Transcription (whisper.cpp) fills the `transcription` column later.
//!
//! On Android, Tauri's `app_data_dir()` resolves to `getFilesDir()`, which is
//! the same directory that Kotlin's `filesDir` refers to.  The two paths are
//! therefore consistent without any extra configuration.

use crate::db::{self, Database, VoiceMemoRow};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::ShellExt;

// ── helpers ───────────────────────────────────────────────────────────────────

fn voice_memos_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))?
        .join("voice_memos");
    std::fs::create_dir_all(&dir).map_err(|e| format!("create_dir_all: {}", e))?;
    Ok(dir)
}

fn incoming_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))?
        .join("voice_memos_incoming"))
}

// ── commands ──────────────────────────────────────────────────────────────────

/// Move a newly-received voice memo from the incoming staging directory to
/// permanent storage and record it in the database.
///
/// Called by `useWearSignals` on every "wear://voice_memo" Tauri event.
///
/// - `incoming_file`  — filename only (e.g. `"abc123.m4a"`), not a full path.
///   The full source path is `app_data_dir/voice_memos_incoming/<incoming_file>`.
/// - `file_path` stored in DB is the relative path `voice_memos/<id>.m4a`.
#[tauri::command]
pub fn store_voice_memo(
    app: AppHandle,
    db: State<Database>,
    id: String,
    timestamp: String,
    duration_ms: i64,
    health_json: Option<String>,
    incoming_file: String,
) -> Result<VoiceMemoRow, String> {
    if id.is_empty() {
        return Err("store_voice_memo: id must not be empty".to_string());
    }
    if incoming_file.is_empty() {
        return Err("store_voice_memo: incoming_file must not be empty".to_string());
    }

    let src = incoming_dir(&app)?.join(&incoming_file);
    let dest_dir = voice_memos_dir(&app)?;
    let dest_filename = format!("{}.m4a", id);
    let dest = dest_dir.join(&dest_filename);
    let rel_path = format!("voice_memos/{}", dest_filename);

    if !src.exists() {
        return Err(format!(
            "store_voice_memo: incoming file not found: {}",
            src.display()
        ));
    }

    // Try rename first; fall back to copy+delete across mount points
    if std::fs::rename(&src, &dest).is_err() {
        std::fs::copy(&src, &dest).map_err(|e| format!("store_voice_memo: copy failed: {}", e))?;
        let _ = std::fs::remove_file(&src);
    }

    if !dest.exists() {
        return Err(format!(
            "store_voice_memo: dest file missing after move: {}",
            dest.display()
        ));
    }

    db::create_voice_memo(
        &db,
        &id,
        &timestamp,
        duration_ms,
        health_json.as_deref(),
        &rel_path,
        "watch",
    )
}

/// List voice memos, newest first.
#[tauri::command]
pub fn list_voice_memos(
    db: State<Database>,
    limit: Option<i32>,
) -> Result<Vec<VoiceMemoRow>, String> {
    db::list_voice_memos(&db, limit)
}

/// Get a single voice memo by id.
#[tauri::command]
pub fn get_voice_memo(db: State<Database>, id: String) -> Result<Option<VoiceMemoRow>, String> {
    db::get_voice_memo(&db, &id)
}

/// Delete a voice memo record and its audio file.
#[tauri::command]
pub fn delete_voice_memo(app: AppHandle, db: State<Database>, id: String) -> Result<(), String> {
    // Look up file path before deleting the row
    let row = db::get_voice_memo(&db, &id)?;

    db::delete_voice_memo(&db, &id)?;

    // Best-effort file deletion — don't fail if the file is already gone
    if let Some(row) = row {
        let abs_path = app
            .path()
            .app_data_dir()
            .map(|d| d.join(&row.file_path))
            .ok();
        if let Some(path) = abs_path {
            let _ = std::fs::remove_file(&path);
        }
    }

    Ok(())
}

/// Patch the transcription text (called after whisper.cpp processes the file).
#[tauri::command]
pub fn patch_voice_memo_transcription(
    db: State<Database>,
    id: String,
    transcription: String,
) -> Result<(), String> {
    db::patch_voice_memo_transcription(&db, &id, &transcription)
}

/// Transcribe a stored voice memo with the whisper.cpp sidecar.
///
/// Looks up `id` in the database to get the audio file path, runs the
/// `whisper` sidecar against it, patches the `transcription` column, and
/// returns the transcribed text.
///
/// The caller is responsible for selecting a `model` (e.g. `"ggml-tiny.en.bin"`)
/// that has already been downloaded via the STT settings screen.
///
/// **Note:** whisper-cli must be built with ffmpeg support to accept M4A input
/// directly. If it is not, it will return an error and the caller should
/// surface a "convert to WAV" suggestion.
#[tauri::command]
pub async fn transcribe_voice_memo(
    app: AppHandle,
    db: State<'_, Database>,
    id: String,
    model: String,
) -> Result<String, String> {
    // 1. Look up the stored file path
    let row = db::get_voice_memo(&db, &id)?
        .ok_or_else(|| format!("transcribe_voice_memo: memo not found: {}", id))?;

    let audio_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))?
        .join(&row.file_path);

    if !audio_path.exists() {
        return Err(format!(
            "transcribe_voice_memo: audio file not found: {}",
            audio_path.display()
        ));
    }

    // 2. Resolve the model path
    let model_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))?
        .join("models")
        .join(&model);

    if !model_path.exists() {
        return Err(format!("transcribe_voice_memo: model not found: {}", model));
    }

    // 3. Run the whisper sidecar
    let shell = app.shell();
    let sidecar = shell
        .sidecar("whisper")
        .map_err(|e| format!("whisper sidecar not available: {}", e))?;

    let output = sidecar
        .args([
            "-m",
            &model_path.to_string_lossy(),
            "-f",
            &audio_path.to_string_lossy(),
            "-nt", // no timestamps
            "-np", // no progress output
        ])
        .output()
        .await
        .map_err(|e| format!("transcribe_voice_memo: whisper exec failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("transcribe_voice_memo: whisper error: {}", stderr));
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // 4. Persist the transcription
    db::patch_voice_memo_transcription(&db, &id, &text)?;

    Ok(text)
}

/// Link a voice memo to a journal entry.
#[tauri::command]
pub fn link_voice_memo_to_entry(
    db: State<Database>,
    memo_id: String,
    entry_id: String,
) -> Result<(), String> {
    db::link_voice_memo_to_entry(&db, &memo_id, &entry_id)
}
