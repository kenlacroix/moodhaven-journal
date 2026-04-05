//! Speech-to-Text commands for local transcription
//!
//! Uses whisper.cpp as a sidecar for fully offline speech recognition.
//! All audio processing happens on-device - no data leaves the machine.

use anyhow::Result;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{command, AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::ShellExt;

/// Model status information
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelStatus {
    pub downloaded: bool,
    pub path: Option<String>,
    pub size: Option<u64>,
}

/// Download progress event payload
#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub state: String, // "connecting", "downloading", "verifying", "complete", "error", "cancelled"
    pub downloaded: u64, // bytes downloaded
    pub total: u64,    // total bytes (0 if unknown)
    pub percentage: f64, // 0-100
    pub speed: f64,    // bytes per second
    pub url: String,   // current URL (for display)
    pub error: Option<String>,
}

/// State for tracking active downloads (for cancellation)
pub struct DownloadState {
    pub active_downloads: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl Default for DownloadState {
    fn default() -> Self {
        Self {
            active_downloads: Mutex::new(HashMap::new()),
        }
    }
}

/// Validate that a model filename does not escape the models directory.
///
/// For files that may not yet exist we canonicalize the models directory itself
/// and reconstruct the candidate path, then verify the prefix.
/// For files that already exist we use a full `canonicalize` + `starts_with` check.
///
/// Returns the resolved, safe `PathBuf` on success, or an error string on rejection.
fn validate_model_path(models_dir: &PathBuf, name: &str) -> std::result::Result<PathBuf, String> {
    // Fast reject: path separators or `..` components in the name
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err(format!(
            "Invalid model name '{name}': path separators are not allowed"
        ));
    }

    let candidate = models_dir.join(name);

    if candidate.exists() {
        // File is present — full canonicalize + prefix check
        let canonical = std::fs::canonicalize(&candidate)
            .map_err(|e| format!("Path resolution failed for '{name}': {e}"))?;
        let canonical_dir = std::fs::canonicalize(models_dir)
            .map_err(|e| format!("Models dir resolution failed: {e}"))?;
        if !canonical.starts_with(&canonical_dir) {
            return Err(format!("Model path '{name}' escapes the models directory"));
        }
        Ok(canonical)
    } else {
        // File does not exist yet — canonicalize the directory, reconstruct the path
        let canonical_dir = std::fs::canonicalize(models_dir)
            .map_err(|e| format!("Models dir resolution failed: {e}"))?;
        let result = canonical_dir.join(name);
        if !result.starts_with(&canonical_dir) {
            return Err(format!("Model path '{name}' escapes the models directory"));
        }
        Ok(result)
    }
}

/// Get the directory where STT models are stored
fn get_models_dir(app: &AppHandle) -> Result<PathBuf> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| anyhow::anyhow!("Failed to get app data dir: {}", e))?;
    let models_dir = app_data.join("models");

    // Create directory if it doesn't exist
    if !models_dir.exists() {
        fs::create_dir_all(&models_dir)?;
    }

    Ok(models_dir)
}

/// Get the temp directory for audio files
fn get_temp_dir(app: &AppHandle) -> Result<PathBuf> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| anyhow::anyhow!("Failed to get app data dir: {}", e))?;
    let temp_dir = app_data.join("temp");

    // Create directory if it doesn't exist
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir)?;
    }

    Ok(temp_dir)
}

/// Check if the whisper sidecar is available
#[command]
pub async fn stt_check_sidecar(app: AppHandle) -> Result<bool, String> {
    let shell = app.shell();
    match shell.sidecar("whisper") {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// Get the models directory path
#[command]
pub async fn stt_get_models_dir(app: AppHandle) -> Result<String, String> {
    get_models_dir(&app)
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

/// Check if a specific model is downloaded
#[command]
pub async fn stt_check_model(app: AppHandle, model_name: String) -> Result<ModelStatus, String> {
    let models_dir = get_models_dir(&app).map_err(|e| e.to_string())?;
    let model_path = validate_model_path(&models_dir, &model_name)?;

    if model_path.exists() {
        let metadata = fs::metadata(&model_path).map_err(|e| e.to_string())?;
        Ok(ModelStatus {
            downloaded: true,
            path: Some(model_path.to_string_lossy().to_string()),
            size: Some(metadata.len()),
        })
    } else {
        Ok(ModelStatus {
            downloaded: false,
            path: None,
            size: None,
        })
    }
}

/// Emit download progress event
fn emit_progress(app: &AppHandle, progress: DownloadProgress) {
    let _ = app.emit("stt-download-progress", progress);
}

/// Map an approved model filename to its canonical Hugging Face download URL.
///
/// Only models in this list may be downloaded. Any other filename is rejected,
/// preventing a compromised WebView from directing downloads to attacker-controlled servers.
fn model_url(filename: &str) -> std::result::Result<String, String> {
    const BASE: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";
    match filename {
        "ggml-tiny.en.bin" => Ok(format!("{BASE}/ggml-tiny.en.bin")),
        "ggml-base.en.bin" => Ok(format!("{BASE}/ggml-base.en.bin")),
        "ggml-small.en.bin" => Ok(format!("{BASE}/ggml-small.en.bin")),
        "ggml-medium.en.bin" => Ok(format!("{BASE}/ggml-medium.en.bin")),
        "ggml-large-v3.bin" => Ok(format!("{BASE}/ggml-large-v3.bin")),
        other => Err(format!(
            "Unknown model '{other}'. Only approved Whisper models may be downloaded."
        )),
    }
}

/// Download a whisper model with streaming progress and cancellation support.
///
/// Downloads to a `.partial` temp file and renames to the final name on success,
/// so an interrupted download never leaves a corrupt model in place.
/// No range-resume: HuggingFace's XetHub/CAS redirect chain does not support
/// byte-range requests, so we always start fresh.
///
/// The download URL is derived from the `filename` via an internal allowlist —
/// the caller cannot supply an arbitrary URL (security: SSRF / supply chain protection).
#[command]
pub async fn stt_download_model(
    app: AppHandle,
    state: State<'_, DownloadState>,
    filename: String,
) -> Result<(), String> {
    let url = model_url(&filename)?;
    let models_dir = get_models_dir(&app).map_err(|e| e.to_string())?;
    let model_path = validate_model_path(&models_dir, &filename)?;
    let partial_path = validate_model_path(&models_dir, &format!("{}.partial", &filename))?;

    // Remove any leftover partial file from a previous attempt
    let _ = fs::remove_file(&partial_path);

    // Register cancellation token
    let cancel_token = Arc::new(AtomicBool::new(false));
    {
        let mut downloads = state
            .active_downloads
            .lock()
            .map_err(|_| "STT download state lock poisoned".to_string())?;
        downloads.insert(filename.clone(), cancel_token.clone());
    }

    let cleanup = |state: &State<'_, DownloadState>, filename: &str| {
        if let Ok(mut downloads) = state.active_downloads.lock() {
            downloads.remove(filename);
        }
    };

    let display_url = url
        .split("//")
        .nth(1)
        .and_then(|s| s.split('/').next())
        .unwrap_or(&url)
        .to_string();

    emit_progress(
        &app,
        DownloadProgress {
            state: "connecting".to_string(),
            downloaded: 0,
            total: 0,
            percentage: 0.0,
            speed: 0.0,
            url: display_url.clone(),
            error: None,
        },
    );

    // connect_timeout: fail fast if server is unreachable.
    // No overall timeout — large models (1.5 GB) must be able to stream to completion.
    // Per-chunk stall detection is handled below via tokio::time::timeout.
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| {
            cleanup(&state, &filename);
            format!("Failed to create HTTP client: {}", e)
        })?;

    let response = client.get(&url).send().await.map_err(|e| {
        cleanup(&state, &filename);
        let msg = format!("Connection failed: {}", e);
        emit_progress(
            &app,
            DownloadProgress {
                state: "error".to_string(),
                downloaded: 0,
                total: 0,
                percentage: 0.0,
                speed: 0.0,
                url: display_url.clone(),
                error: Some(msg.clone()),
            },
        );
        format!("Failed to download model: {}", msg)
    })?;

    let status = response.status();
    if !status.is_success() {
        cleanup(&state, &filename);
        let error_msg = format!("Server returned {}", status);
        emit_progress(
            &app,
            DownloadProgress {
                state: "error".to_string(),
                downloaded: 0,
                total: 0,
                percentage: 0.0,
                speed: 0.0,
                url: display_url.clone(),
                error: Some(error_msg.clone()),
            },
        );
        return Err(format!("Failed to download model: {}", error_msg));
    }

    let total_size = response.content_length().unwrap_or(0);

    let mut file = File::create(&partial_path).map_err(|e| {
        cleanup(&state, &filename);
        format!("Failed to create temp file: {}", e)
    })?;

    let mut downloaded: u64 = 0;
    let start_time = std::time::Instant::now();
    let mut last_progress_time = start_time;
    let mut stream = response.bytes_stream();

    // 60 s between chunks — guards against stalled/dropped connections on large downloads.
    const CHUNK_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

    use futures_util::StreamExt;
    loop {
        let next = tokio::time::timeout(CHUNK_TIMEOUT, stream.next()).await;
        let chunk_result = match next {
            Err(_elapsed) => {
                drop(file);
                let _ = fs::remove_file(&partial_path);
                cleanup(&state, &filename);
                return Err("Download stalled: no data received for 60 seconds".to_string());
            }
            Ok(None) => break, // stream finished
            Ok(Some(r)) => r,
        };
        if cancel_token.load(Ordering::Relaxed) {
            drop(file);
            let _ = fs::remove_file(&partial_path);
            cleanup(&state, &filename);
            emit_progress(
                &app,
                DownloadProgress {
                    state: "cancelled".to_string(),
                    downloaded,
                    total: total_size,
                    percentage: if total_size > 0 {
                        (downloaded as f64 / total_size as f64) * 100.0
                    } else {
                        0.0
                    },
                    speed: 0.0,
                    url: display_url.clone(),
                    error: None,
                },
            );
            return Err("Download cancelled".to_string());
        }

        let chunk: bytes::Bytes = match chunk_result {
            Ok(c) => c,
            Err(e) => {
                drop(file);
                let _ = fs::remove_file(&partial_path);
                cleanup(&state, &filename);
                return Err(format!("Download interrupted: {}", e));
            }
        };

        if let Err(e) = file.write_all(&chunk) {
            drop(file);
            let _ = fs::remove_file(&partial_path);
            cleanup(&state, &filename);
            return Err(format!("Failed to write data: {}", e));
        }

        downloaded += chunk.len() as u64;

        let now = std::time::Instant::now();
        if now.duration_since(last_progress_time).as_millis() >= 100 {
            let elapsed = now.duration_since(start_time).as_secs_f64();
            let speed = if elapsed > 0.0 {
                downloaded as f64 / elapsed
            } else {
                0.0
            };
            emit_progress(
                &app,
                DownloadProgress {
                    state: "downloading".to_string(),
                    downloaded,
                    total: total_size,
                    percentage: if total_size > 0 {
                        (downloaded as f64 / total_size as f64) * 100.0
                    } else {
                        0.0
                    },
                    speed,
                    url: display_url.clone(),
                    error: None,
                },
            );
            last_progress_time = now;
        }
    }

    if let Err(e) = file.flush() {
        drop(file);
        let _ = fs::remove_file(&partial_path);
        cleanup(&state, &filename);
        return Err(format!("Failed to flush file: {}", e));
    }
    drop(file);

    if let Err(e) = fs::rename(&partial_path, &model_path) {
        let _ = fs::remove_file(&partial_path);
        cleanup(&state, &filename);
        return Err(format!("Failed to finalize download: {}", e));
    }

    cleanup(&state, &filename);
    emit_progress(
        &app,
        DownloadProgress {
            state: "complete".to_string(),
            downloaded,
            total: total_size,
            percentage: 100.0,
            speed: 0.0,
            url: display_url,
            error: None,
        },
    );

    Ok(())
}

/// Cancel an active download
#[command]
pub async fn stt_cancel_download(
    state: State<'_, DownloadState>,
    filename: String,
) -> Result<(), String> {
    let downloads = state
        .active_downloads
        .lock()
        .map_err(|_| "STT download state lock poisoned".to_string())?;
    if let Some(token) = downloads.get(&filename) {
        token.store(true, Ordering::Relaxed);
        Ok(())
    } else {
        Err("No active download found".to_string())
    }
}

/// Clean up partial download files
#[command]
pub async fn stt_cleanup_partial(app: AppHandle, filename: String) -> Result<(), String> {
    let models_dir = get_models_dir(&app).map_err(|e| e.to_string())?;
    let partial_path = validate_model_path(&models_dir, &format!("{}.partial", &filename))?;

    if partial_path.exists() {
        fs::remove_file(&partial_path)
            .map_err(|e| format!("Failed to delete partial file: {}", e))?;
    }

    Ok(())
}

/// Delete a downloaded model
#[command]
pub async fn stt_delete_model(app: AppHandle, filename: String) -> Result<(), String> {
    let models_dir = get_models_dir(&app).map_err(|e| e.to_string())?;
    let model_path = validate_model_path(&models_dir, &filename)?;
    let partial_path = validate_model_path(&models_dir, &format!("{}.partial", &filename))?;

    if model_path.exists() {
        fs::remove_file(&model_path).map_err(|e| format!("Failed to delete model: {}", e))?;
    }
    if partial_path.exists() {
        fs::remove_file(&partial_path)
            .map_err(|e| format!("Failed to delete partial file: {}", e))?;
    }

    Ok(())
}

/// Transcribe audio using whisper.cpp sidecar
#[command]
pub async fn stt_transcribe(
    app: AppHandle,
    audio_base64: String,
    model_name: String,
) -> Result<String, String> {
    // Decode base64 audio
    let audio_bytes = STANDARD
        .decode(&audio_base64)
        .map_err(|e| format!("Failed to decode audio: {}", e))?;

    // Write audio to temp file
    let temp_dir = get_temp_dir(&app).map_err(|e| e.to_string())?;
    let audio_path = temp_dir.join(format!("recording_{}.wav", uuid::Uuid::new_v4()));

    {
        let mut file =
            File::create(&audio_path).map_err(|e| format!("Failed to create temp file: {}", e))?;
        file.write_all(&audio_bytes)
            .map_err(|e| format!("Failed to write audio: {}", e))?;
    }

    // Get model path
    let models_dir = get_models_dir(&app).map_err(|e| e.to_string())?;
    let model_path = validate_model_path(&models_dir, &model_name).inspect_err(|_| {
        let _ = fs::remove_file(&audio_path);
    })?;

    if !model_path.exists() {
        let _ = fs::remove_file(&audio_path);
        return Err(format!("Model not found: {}", model_name));
    }

    // Run whisper sidecar
    let shell = app.shell();
    let sidecar = shell
        .sidecar("whisper")
        .map_err(|e| format!("Whisper sidecar not available: {}", e))?;

    let output = sidecar
        .args([
            "-m",
            &model_path.to_string_lossy(),
            "-f",
            &audio_path.to_string_lossy(),
            "-nt", // No timestamps
            "-np", // No progress
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run whisper: {}", e))?;

    // Clean up temp file
    let _ = fs::remove_file(&audio_path);

    if !output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else if !stdout.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            format!("exit code {:?}", output.status.code())
        };
        return Err(format!("Whisper failed: {}", detail));
    }

    let text = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(text)
}

/// Transcription result with per-segment timestamps
#[derive(Debug, Serialize, Deserialize)]
pub struct TranscriptionResult {
    pub text: String,
    pub segments: Vec<TranscriptionSegment>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranscriptionSegment {
    pub text: String,
    pub start: f64,
    pub end: f64,
}

/// Transcribe audio with timestamps using whisper.cpp sidecar.
/// Falls back gracefully to plain stdout if JSON output is unavailable.
#[command]
pub async fn stt_transcribe_timestamped(
    app: AppHandle,
    audio_base64: String,
    model_name: String,
) -> Result<TranscriptionResult, String> {
    // Decode base64 audio
    let audio_bytes = STANDARD
        .decode(&audio_base64)
        .map_err(|e| format!("Failed to decode audio: {}", e))?;

    // Write to temp file
    let temp_dir = get_temp_dir(&app).map_err(|e| e.to_string())?;
    let audio_path = temp_dir.join(format!("recording_{}.wav", uuid::Uuid::new_v4()));
    let json_path = temp_dir.join(format!("transcript_{}.json", uuid::Uuid::new_v4()));

    {
        let mut file =
            File::create(&audio_path).map_err(|e| format!("Failed to create temp file: {}", e))?;
        file.write_all(&audio_bytes)
            .map_err(|e| format!("Failed to write audio: {}", e))?;
    }

    let models_dir = get_models_dir(&app).map_err(|e| e.to_string())?;
    let model_path = validate_model_path(&models_dir, &model_name).inspect_err(|_| {
        let _ = fs::remove_file(&audio_path);
    })?;

    if !model_path.exists() {
        let _ = fs::remove_file(&audio_path);
        return Err(format!("Model not found: {}", model_name));
    }

    let shell = app.shell();
    let sidecar = shell
        .sidecar("whisper")
        .map_err(|e| format!("Whisper sidecar not available: {}", e))?;

    // Strip the ".json" extension — whisper appends it automatically
    let json_out_base = json_path
        .to_string_lossy()
        .trim_end_matches(".json")
        .to_string();

    let output = sidecar
        .args([
            "-m",
            &model_path.to_string_lossy(),
            "-f",
            &audio_path.to_string_lossy(),
            "--output-json",
            "-of",
            &json_out_base,
            "-np",
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run whisper: {}", e))?;

    let _ = fs::remove_file(&audio_path);

    if !output.status.success() {
        let _ = fs::remove_file(&json_path);
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Fall back gracefully: return plain text from stdout if available
        let plain_text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !plain_text.is_empty() {
            return Ok(TranscriptionResult {
                text: plain_text,
                segments: vec![],
            });
        }
        let detail = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else {
            format!("exit code {:?}", output.status.code())
        };
        return Err(format!("Whisper failed: {}", detail));
    }

    // Try to read the JSON output
    if json_path.exists() {
        match fs::read_to_string(&json_path) {
            Ok(json_str) => {
                let _ = fs::remove_file(&json_path);
                // Parse whisper JSON format
                #[derive(Deserialize)]
                struct WhisperJson {
                    transcription: Option<Vec<WhisperSegmentJson>>,
                    text: Option<String>,
                }
                #[derive(Deserialize)]
                struct WhisperSegmentJson {
                    text: String,
                    offsets: WhisperOffsets,
                }
                #[derive(Deserialize)]
                struct WhisperOffsets {
                    from: i64,
                    to: i64,
                }
                match serde_json::from_str::<WhisperJson>(&json_str) {
                    Ok(parsed) => {
                        let segments: Vec<TranscriptionSegment> = parsed
                            .transcription
                            .unwrap_or_default()
                            .into_iter()
                            .map(|s| TranscriptionSegment {
                                text: s.text.trim().to_string(),
                                start: s.offsets.from as f64 / 1000.0,
                                end: s.offsets.to as f64 / 1000.0,
                            })
                            .collect();
                        let full_text = if let Some(t) = parsed.text {
                            t
                        } else {
                            segments
                                .iter()
                                .map(|s| s.text.as_str())
                                .collect::<Vec<_>>()
                                .join(" ")
                        };
                        Ok(TranscriptionResult {
                            text: full_text.trim().to_string(),
                            segments,
                        })
                    }
                    Err(_) => {
                        // JSON parse failed — fall back to plain stdout
                        let plain_text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                        Ok(TranscriptionResult {
                            text: plain_text,
                            segments: vec![],
                        })
                    }
                }
            }
            Err(_) => {
                // JSON file missing — fall back to stdout
                let plain_text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                Ok(TranscriptionResult {
                    text: plain_text,
                    segments: vec![],
                })
            }
        }
    } else {
        let plain_text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(TranscriptionResult {
            text: plain_text,
            segments: vec![],
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn make_models_dir() -> TempDir {
        tempfile::tempdir().expect("tempdir")
    }

    // ── validate_model_path ──────────────────────────────────────────────────

    #[test]
    fn valid_model_name_nonexistent() {
        let tmp = make_models_dir();
        let dir = tmp.path().to_path_buf();
        let result = validate_model_path(&dir, "ggml-base.en.bin");
        assert!(
            result.is_ok(),
            "expected Ok for valid name, got {:?}",
            result
        );
        // Canonicalize the dir for comparison — on macOS /tmp is a symlink to
        // /private/tmp, so validate_model_path returns the resolved path.
        let canonical_dir = fs::canonicalize(&dir).unwrap_or(dir);
        assert!(result.unwrap().starts_with(&canonical_dir));
    }

    #[test]
    fn valid_model_name_existing() {
        let tmp = make_models_dir();
        let dir = tmp.path().to_path_buf();
        fs::write(dir.join("ggml-base.en.bin"), b"fake model").unwrap();
        let result = validate_model_path(&dir, "ggml-base.en.bin");
        assert!(result.is_ok());
    }

    #[test]
    fn traversal_with_dotdot_rejected() {
        let tmp = make_models_dir();
        let dir = tmp.path().to_path_buf();
        let result = validate_model_path(&dir, "../../etc/passwd");
        assert!(result.is_err(), "expected Err for path traversal");
    }

    #[test]
    fn traversal_with_slash_rejected() {
        let tmp = make_models_dir();
        let dir = tmp.path().to_path_buf();
        let result = validate_model_path(&dir, "subdir/ggml-base.en.bin");
        assert!(result.is_err());
    }

    #[test]
    fn partial_suffix_valid() {
        let tmp = make_models_dir();
        let dir = tmp.path().to_path_buf();
        let result = validate_model_path(&dir, "ggml-base.en.bin.partial");
        assert!(result.is_ok());
    }

    // ── model_url ────────────────────────────────────────────────────────────

    #[test]
    fn known_model_returns_hf_url() {
        let url = model_url("ggml-base.en.bin").unwrap();
        assert!(url.starts_with("https://huggingface.co/ggerganov/whisper.cpp/resolve/main"));
        assert!(url.ends_with("ggml-base.en.bin"));
    }

    #[test]
    fn all_approved_models_have_urls() {
        for name in &[
            "ggml-tiny.en.bin",
            "ggml-base.en.bin",
            "ggml-small.en.bin",
            "ggml-medium.en.bin",
            "ggml-large-v3.bin",
        ] {
            assert!(model_url(name).is_ok(), "no URL for {name}");
        }
    }

    #[test]
    fn unknown_model_rejected() {
        assert!(model_url("evil.sh").is_err());
        assert!(model_url("../../moodhaven.db").is_err());
        assert!(model_url("ggml-base.en.bin.malicious").is_err());
    }
}
