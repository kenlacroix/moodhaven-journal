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
    pub state: String,       // "connecting", "downloading", "verifying", "complete", "error", "cancelled"
    pub downloaded: u64,     // bytes downloaded
    pub total: u64,          // total bytes (0 if unknown)
    pub percentage: f64,     // 0-100
    pub speed: f64,          // bytes per second
    pub url: String,         // current URL (for display)
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
    let model_path = models_dir.join(&model_name);

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

/// Download a whisper model with streaming progress and cancellation support.
///
/// Downloads to a `.partial` temp file and renames to the final name on success,
/// so an interrupted download never leaves a corrupt model in place.
/// No range-resume: HuggingFace's XetHub/CAS redirect chain does not support
/// byte-range requests, so we always start fresh.
#[command]
pub async fn stt_download_model(
    app: AppHandle,
    state: State<'_, DownloadState>,
    url: String,
    filename: String,
) -> Result<(), String> {
    let models_dir = get_models_dir(&app).map_err(|e| e.to_string())?;
    let model_path = models_dir.join(&filename);
    let partial_path = models_dir.join(format!("{}.partial", &filename));

    // Remove any leftover partial file from a previous attempt
    let _ = fs::remove_file(&partial_path);

    // Register cancellation token
    let cancel_token = Arc::new(AtomicBool::new(false));
    {
        let mut downloads = state.active_downloads.lock().unwrap();
        downloads.insert(filename.clone(), cancel_token.clone());
    }

    let cleanup = |state: &State<'_, DownloadState>, filename: &str| {
        let mut downloads = state.active_downloads.lock().unwrap();
        downloads.remove(filename);
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

    // connect_timeout only — no overall timeout so large files can stream freely
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

    use futures_util::StreamExt;
    while let Some(chunk_result) = stream.next().await {
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

        let chunk = chunk_result.map_err(|e| {
            cleanup(&state, &filename);
            format!("Download interrupted: {}", e)
        })?;

        file.write_all(&chunk).map_err(|e| {
            cleanup(&state, &filename);
            format!("Failed to write data: {}", e)
        })?;

        downloaded += chunk.len() as u64;

        let now = std::time::Instant::now();
        if now.duration_since(last_progress_time).as_millis() >= 100 {
            let elapsed = now.duration_since(start_time).as_secs_f64();
            let speed = if elapsed > 0.0 { downloaded as f64 / elapsed } else { 0.0 };
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

    file.flush().map_err(|e| {
        cleanup(&state, &filename);
        format!("Failed to flush file: {}", e)
    })?;
    drop(file);

    fs::rename(&partial_path, &model_path).map_err(|e| {
        cleanup(&state, &filename);
        format!("Failed to finalize download: {}", e)
    })?;

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
    let downloads = state.active_downloads.lock().unwrap();
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
    let partial_path = models_dir.join(format!("{}.partial", &filename));

    if partial_path.exists() {
        fs::remove_file(&partial_path).map_err(|e| format!("Failed to delete partial file: {}", e))?;
    }

    Ok(())
}

/// Delete a downloaded model
#[command]
pub async fn stt_delete_model(app: AppHandle, filename: String) -> Result<(), String> {
    let models_dir = get_models_dir(&app).map_err(|e| e.to_string())?;
    let model_path = models_dir.join(&filename);
    let partial_path = models_dir.join(format!("{}.partial", &filename));

    if model_path.exists() {
        fs::remove_file(&model_path).map_err(|e| format!("Failed to delete model: {}", e))?;
    }
    if partial_path.exists() {
        fs::remove_file(&partial_path).map_err(|e| format!("Failed to delete partial file: {}", e))?;
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
    let model_path = models_dir.join(&model_name);

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
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Whisper failed: {}", stderr));
    }

    let text = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(text)
}
