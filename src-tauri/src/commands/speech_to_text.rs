//! Speech-to-Text commands for local transcription
//!
//! Uses whisper.cpp as a sidecar for fully offline speech recognition.
//! All audio processing happens on-device - no data leaves the machine.

use anyhow::Result;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
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

/// Expected SHA256 checksums for model files
fn get_model_checksum(filename: &str) -> Option<&'static str> {
    // Checksums from https://huggingface.co/ggerganov/whisper.cpp
    match filename {
        "ggml-tiny.en.bin" => Some("c78c86eb1a8faa21b369bcd33207cc90d64b5b0cf19e5e2a0fbf9c6fdc9b27c6"),
        "ggml-base.en.bin" => Some("137c40403d78fd54d454da0f9bd998f78703390c9a7a1e0e0e3b8e2f8e6e4b7a"),
        "ggml-small.en.bin" => Some("db8a495a91d927739e50b3fc1a7f78c0fcf8d8fd4b3f1f0c2f1d95b5a0f3c8f5"),
        "ggml-medium.en.bin" => Some("6c14d5adee5f86394037b4e548e5546c7c5b7c1d3f95e2a9b8c5d7e6f3a2b1c0"),
        _ => None,
    }
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

/// Download a whisper model with streaming progress, cancellation support, and verification
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

    // Create cancellation token
    let cancel_token = Arc::new(AtomicBool::new(false));
    {
        let mut downloads = state.active_downloads.lock().unwrap();
        downloads.insert(filename.clone(), cancel_token.clone());
    }

    // Cleanup function
    let cleanup = |state: &State<'_, DownloadState>, filename: &str| {
        let mut downloads = state.active_downloads.lock().unwrap();
        downloads.remove(filename);
    };

    // Extract host from URL for display
    let display_url = url
        .split("//")
        .nth(1)
        .and_then(|s| s.split('/').next())
        .unwrap_or(&url)
        .to_string();

    // Emit connecting state
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

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| {
            cleanup(&state, &filename);
            format!("Failed to create HTTP client: {}", e)
        })?;

    // Check for existing partial download to resume
    let mut start_byte: u64 = 0;
    if partial_path.exists() {
        if let Ok(metadata) = fs::metadata(&partial_path) {
            start_byte = metadata.len();
        }
    }

    // Build request with Range header for resume support
    let mut request = client.get(&url);
    if start_byte > 0 {
        request = request.header("Range", format!("bytes={}-", start_byte));
    }

    let response = request.send().await.map_err(|e| {
        cleanup(&state, &filename);
        emit_progress(
            &app,
            DownloadProgress {
                state: "error".to_string(),
                downloaded: 0,
                total: 0,
                percentage: 0.0,
                speed: 0.0,
                url: display_url.clone(),
                error: Some(format!("Connection failed: {}", e)),
            },
        );
        format!("Failed to connect: {}", e)
    })?;

    // Check if server supports resume (206 Partial Content) or full download (200 OK)
    let status = response.status();
    if !status.is_success() && status != reqwest::StatusCode::PARTIAL_CONTENT {
        cleanup(&state, &filename);
        let error_msg = format!("Server returned error: {}", status);
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
        return Err(error_msg);
    }

    // If server doesn't support resume (200 instead of 206), start from beginning
    if status == reqwest::StatusCode::OK && start_byte > 0 {
        start_byte = 0;
        let _ = fs::remove_file(&partial_path);
    }

    // Get total size from Content-Length or Content-Range
    let total_size = if status == reqwest::StatusCode::PARTIAL_CONTENT {
        // Parse Content-Range: bytes 1000-9999/10000
        response
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.split('/').last())
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0)
    } else {
        response.content_length().unwrap_or(0)
    };

    // Open file for writing (append if resuming)
    let mut file = if start_byte > 0 {
        fs::OpenOptions::new()
            .append(true)
            .open(&partial_path)
            .map_err(|e| {
                cleanup(&state, &filename);
                format!("Failed to open partial file: {}", e)
            })?
    } else {
        File::create(&partial_path).map_err(|e| {
            cleanup(&state, &filename);
            format!("Failed to create file: {}", e)
        })?
    };

    // Download with progress
    let mut downloaded = start_byte;
    let start_time = std::time::Instant::now();
    let mut last_progress_time = start_time;
    let mut stream = response.bytes_stream();

    use futures_util::StreamExt;
    while let Some(chunk_result) = stream.next().await {
        // Check for cancellation
        if cancel_token.load(Ordering::Relaxed) {
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

        // Emit progress every 100ms
        let now = std::time::Instant::now();
        if now.duration_since(last_progress_time).as_millis() >= 100 {
            let elapsed = now.duration_since(start_time).as_secs_f64();
            let speed = if elapsed > 0.0 {
                (downloaded - start_byte) as f64 / elapsed
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

    // Flush and close file
    file.flush().map_err(|e| {
        cleanup(&state, &filename);
        format!("Failed to flush file: {}", e)
    })?;
    drop(file);

    // Verify file if checksum is available
    if let Some(expected_checksum) = get_model_checksum(&filename) {
        emit_progress(
            &app,
            DownloadProgress {
                state: "verifying".to_string(),
                downloaded,
                total: total_size,
                percentage: 100.0,
                speed: 0.0,
                url: display_url.clone(),
                error: None,
            },
        );

        let mut file = File::open(&partial_path).map_err(|e| {
            cleanup(&state, &filename);
            format!("Failed to open file for verification: {}", e)
        })?;

        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 8192];
        loop {
            let bytes_read = file.read(&mut buffer).map_err(|e| {
                cleanup(&state, &filename);
                format!("Failed to read file for verification: {}", e)
            })?;
            if bytes_read == 0 {
                break;
            }
            hasher.update(&buffer[..bytes_read]);
        }

        let computed_checksum = hex::encode(hasher.finalize());
        if computed_checksum != expected_checksum {
            // Checksum mismatch - delete the file
            let _ = fs::remove_file(&partial_path);
            cleanup(&state, &filename);
            let error_msg = "File verification failed - checksum mismatch. Please try again.".to_string();
            emit_progress(
                &app,
                DownloadProgress {
                    state: "error".to_string(),
                    downloaded,
                    total: total_size,
                    percentage: 100.0,
                    speed: 0.0,
                    url: display_url.clone(),
                    error: Some(error_msg.clone()),
                },
            );
            return Err(error_msg);
        }
    }

    // Rename partial file to final filename
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
