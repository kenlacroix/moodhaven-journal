//! Cloud provider sync commands for MoodHaven Journal
//!
//! Implements OAuth 2.0 PKCE flows (RFC 8252) for Dropbox and Google Drive.
//! Tokens are stored in the SQLite settings table. All journal data uploaded
//! to cloud providers is already AES-256-GCM encrypted by the frontend before
//! being passed to these commands — the providers only ever see ciphertext.

use crate::db::Database;
use crate::AppLockState;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'~' => out.push(b as char),
            _ => {
                out.push('%');
                out.push_str(&format!("{:02X}", b));
            }
        }
    }
    out
}

// ============================================================================
// Compile-time credentials (replace before shipping)
// ============================================================================

const DROPBOX_APP_KEY: &str = "DROPBOX_APP_KEY_PLACEHOLDER";

const GOOGLE_CLIENT_ID: &str = "GOOGLE_CLIENT_ID_PLACEHOLDER";
const GOOGLE_CLIENT_SECRET: &str = "GOOGLE_CLIENT_SECRET_PLACEHOLDER";

// ============================================================================
// Setting key helpers
// ============================================================================

fn key_access_token(provider: &str) -> String {
    format!("cloud_{}_access_token", provider)
}

fn key_refresh_token(provider: &str) -> String {
    format!("cloud_{}_refresh_token", provider)
}

fn key_expires_at(provider: &str) -> String {
    format!("cloud_{}_expires_at", provider)
}

fn key_connected_at(provider: &str) -> String {
    format!("cloud_{}_connected_at", provider)
}

fn key_last_sync_at(provider: &str) -> String {
    format!("cloud_{}_last_sync_at", provider)
}

// ============================================================================
// Public types
// ============================================================================

#[derive(Debug, Serialize)]
pub struct ProviderStatus {
    pub provider: String,
    pub connected: bool,
    pub last_sync_at: Option<String>,
}

// ============================================================================
// Internal DB helpers (mirrors the pattern in oura.rs)
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

// ============================================================================
// PKCE helpers
// ============================================================================

fn generate_code_verifier() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn generate_code_challenge(verifier: &str) -> String {
    let hash = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(hash)
}

// ============================================================================
// Token helpers
// ============================================================================

fn is_token_expired(expires_at: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(expires_at)
        .map(|t| t < chrono::Utc::now() + chrono::Duration::seconds(60))
        .unwrap_or(true)
}

// ============================================================================
// TCP OAuth callback listener
// ============================================================================

async fn wait_for_oauth_code(listener: TcpListener) -> Result<String, String> {
    let (mut stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
    let request = String::from_utf8_lossy(&buf[..n]);

    let code = extract_query_param(&request, "code")
        .ok_or_else(|| "No authorization code in OAuth callback".to_string())?;

    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n\
        <html><body style=\"font-family:sans-serif;padding:2em\">\
        <h2>Authorization complete.</h2>\
        <p>Return to MoodHaven Journal.</p>\
        </body></html>";
    let _ = stream.write_all(response.as_bytes()).await;

    Ok(code)
}

fn extract_query_param(request: &str, key: &str) -> Option<String> {
    let line = request.lines().next()?;
    let path = line.split_whitespace().nth(1)?;
    let query = path.split('?').nth(1)?;
    for pair in query.split('&') {
        let mut kv = pair.splitn(2, '=');
        if kv.next()? == key {
            return kv.next().map(|v| v.to_string());
        }
    }
    None
}

// ============================================================================
// Provider-specific OAuth token response structs
// ============================================================================

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
}

// ============================================================================
// Internal: perform the token exchange for each provider
// ============================================================================

async fn exchange_dropbox_code(
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<TokenResponse, String> {
    let client = reqwest::Client::new();
    let params = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("client_id", DROPBOX_APP_KEY),
        ("code_verifier", code_verifier),
    ];

    let resp = client
        .post("https://api.dropboxapi.com/oauth2/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Network error during token exchange: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Dropbox token exchange failed ({}): {}",
            status, body
        ));
    }

    resp.json::<TokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse Dropbox token response: {}", e))
}

async fn exchange_google_code(
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<TokenResponse, String> {
    let client = reqwest::Client::new();
    let params = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("client_id", GOOGLE_CLIENT_ID),
        ("client_secret", GOOGLE_CLIENT_SECRET),
        ("code_verifier", code_verifier),
    ];

    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Network error during token exchange: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Google token exchange failed ({}): {}",
            status, body
        ));
    }

    resp.json::<TokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse Google token response: {}", e))
}

// ============================================================================
// Internal: store tokens in DB
// ============================================================================

fn store_tokens(
    conn: &rusqlite::Connection,
    provider: &str,
    token_resp: &TokenResponse,
) -> Result<(), String> {
    db_set(conn, &key_access_token(provider), &token_resp.access_token)?;

    if let Some(ref rt) = token_resp.refresh_token {
        db_set(conn, &key_refresh_token(provider), rt)?;
    }

    let expires_at = token_resp
        .expires_in
        .map(|secs| {
            (chrono::Utc::now() + chrono::Duration::seconds(secs as i64)).to_rfc3339()
        })
        .unwrap_or_else(|| {
            // Default 4 hours if provider doesn't return expires_in
            (chrono::Utc::now() + chrono::Duration::hours(4)).to_rfc3339()
        });

    db_set(conn, &key_expires_at(provider), &expires_at)?;
    db_set(
        conn,
        &key_connected_at(provider),
        &chrono::Utc::now().to_rfc3339(),
    )?;

    Ok(())
}

// ============================================================================
// Internal: Google Drive helpers
// ============================================================================

#[derive(Debug, Deserialize)]
struct DriveFile {
    id: String,
}

#[derive(Debug, Deserialize)]
struct DriveFileList {
    files: Vec<DriveFile>,
}

#[derive(Debug, Deserialize)]
struct DriveUploadResponse {
    id: String,
}

/// List appDataFolder files named "moodhaven-backup.moodhaven".
/// Returns the file ID if found.
async fn gdrive_find_backup_file(access_token: &str) -> Result<Option<String>, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://www.googleapis.com/drive/v3/files")
        .query(&[
            ("spaces", "appDataFolder"),
            ("fields", "files(id,name)"),
            ("q", "name='moodhaven-backup.moodhaven'"),
        ])
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Network error listing Drive files: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Google Drive list failed ({}): {}", status, body));
    }

    let list: DriveFileList = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Drive file list: {}", e))?;

    Ok(list.files.into_iter().next().map(|f| f.id))
}

async fn gdrive_upload_new(
    access_token: &str,
    blob_bytes: &[u8],
) -> Result<String, String> {
    let client = reqwest::Client::new();

    let metadata = serde_json::json!({
        "name": "moodhaven-backup.moodhaven",
        "parents": ["appDataFolder"]
    });
    let metadata_str = metadata.to_string();

    let boundary = "moodhaven_boundary_xKz8f2Lp";
    let mut body = Vec::new();
    // Metadata part
    body.extend_from_slice(
        format!(
            "--{}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{}\r\n",
            boundary, metadata_str
        )
        .as_bytes(),
    );
    // Media part
    body.extend_from_slice(
        format!(
            "--{}\r\nContent-Type: application/octet-stream\r\n\r\n",
            boundary
        )
        .as_bytes(),
    );
    body.extend_from_slice(blob_bytes);
    body.extend_from_slice(format!("\r\n--{}--\r\n", boundary).as_bytes());

    let content_type = format!("multipart/related; boundary={}", boundary);

    let resp = client
        .post("https://www.googleapis.com/upload/drive/v3/files")
        .query(&[
            ("uploadType", "multipart"),
            ("spaces", "appDataFolder"),
        ])
        .bearer_auth(access_token)
        .header("Content-Type", content_type)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Network error uploading to Drive: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Google Drive upload failed ({}): {}",
            status, body_text
        ));
    }

    let upload_resp: DriveUploadResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Drive upload response: {}", e))?;

    Ok(upload_resp.id)
}

async fn gdrive_update_existing(
    access_token: &str,
    file_id: &str,
    blob_bytes: &[u8],
) -> Result<(), String> {
    let client = reqwest::Client::new();

    let resp = client
        .patch(format!(
            "https://www.googleapis.com/upload/drive/v3/files/{}",
            file_id
        ))
        .query(&[("uploadType", "media")])
        .bearer_auth(access_token)
        .header("Content-Type", "application/octet-stream")
        .body(blob_bytes.to_vec())
        .send()
        .await
        .map_err(|e| format!("Network error updating Drive file: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Google Drive update failed ({}): {}",
            status, body
        ));
    }

    Ok(())
}

// ============================================================================
// Internal: load access token, refreshing if expired
// ============================================================================

async fn load_access_token_refreshing(
    db: &Database,
    provider: &str,
) -> Result<String, String> {
    // Read token fields under one lock, then drop lock before any async work.
    let (access_token, expires_at) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        ensure_settings_table(&conn)?;
        let at = db_get(&conn, &key_access_token(provider))?
            .ok_or_else(|| format!("{} is not connected — run auth first", provider))?;
        let ea = db_get(&conn, &key_expires_at(provider))?.unwrap_or_default();
        (at, ea)
    };

    if !is_token_expired(&expires_at) {
        return Ok(access_token);
    }

    // Token expired — refresh it (no DB lock held during network call)
    let refresh_token = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        db_get(&conn, &key_refresh_token(provider))?
            .ok_or_else(|| format!("No refresh token for {} — re-authenticate", provider))?
    };

    let token_resp = perform_token_refresh(provider, &refresh_token).await?;

    // Store refreshed tokens
    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        store_tokens(&conn, provider, &token_resp)?;
    }

    Ok(token_resp.access_token)
}

async fn perform_token_refresh(
    provider: &str,
    refresh_token: &str,
) -> Result<TokenResponse, String> {
    let client = reqwest::Client::new();

    match provider {
        "dropbox" => {
            if DROPBOX_APP_KEY == "DROPBOX_APP_KEY_PLACEHOLDER" {
                return Err(
                    "Dropbox OAuth not configured — set DROPBOX_APP_KEY before shipping"
                        .to_string(),
                );
            }
            let params = [
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh_token),
                ("client_id", DROPBOX_APP_KEY),
            ];
            let resp = client
                .post("https://api.dropboxapi.com/oauth2/token")
                .form(&params)
                .send()
                .await
                .map_err(|e| format!("Network error refreshing Dropbox token: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(format!(
                    "Dropbox token refresh failed ({}): {}",
                    status, body
                ));
            }

            resp.json::<TokenResponse>()
                .await
                .map_err(|e| format!("Failed to parse Dropbox refresh response: {}", e))
        }

        "gdrive" => {
            if GOOGLE_CLIENT_ID == "GOOGLE_CLIENT_ID_PLACEHOLDER" {
                return Err(
                    "Google Drive OAuth not configured — set GOOGLE_CLIENT_ID before shipping"
                        .to_string(),
                );
            }
            let params = [
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh_token),
                ("client_id", GOOGLE_CLIENT_ID),
                ("client_secret", GOOGLE_CLIENT_SECRET),
            ];
            let resp = client
                .post("https://oauth2.googleapis.com/token")
                .form(&params)
                .send()
                .await
                .map_err(|e| format!("Network error refreshing Google token: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(format!(
                    "Google token refresh failed ({}): {}",
                    status, body
                ));
            }

            resp.json::<TokenResponse>()
                .await
                .map_err(|e| format!("Failed to parse Google refresh response: {}", e))
        }

        _ => Err(format!("Unknown provider: {}", provider)),
    }
}

// ============================================================================
// Tauri commands
// ============================================================================

/// Full OAuth 2.0 PKCE flow for the given provider ("dropbox" or "gdrive").
///
/// Opens the system browser at the provider's consent screen, waits up to 5
/// minutes for the localhost redirect callback, exchanges the authorization code
/// for tokens, and stores them in the SQLite settings table.
#[tauri::command]
pub async fn cloud_provider_auth_start(
    app: AppHandle,
    db: State<'_, Database>,
    provider: String,
) -> Result<(), String> {
    // Validate provider and check placeholder credentials
    match provider.as_str() {
        "dropbox" => {
            if DROPBOX_APP_KEY == "DROPBOX_APP_KEY_PLACEHOLDER" {
                return Err(
                    "Dropbox OAuth not configured — set DROPBOX_APP_KEY before shipping"
                        .to_string(),
                );
            }
        }
        "gdrive" => {
            if GOOGLE_CLIENT_ID == "GOOGLE_CLIENT_ID_PLACEHOLDER" {
                return Err(
                    "Google Drive OAuth not configured — set GOOGLE_CLIENT_ID before shipping"
                        .to_string(),
                );
            }
        }
        _ => return Err(format!("Unknown provider: {}", provider)),
    }

    // 1. Generate PKCE pair
    let code_verifier = generate_code_verifier();
    let code_challenge = generate_code_challenge(&code_verifier);

    // 2. Bind listener on OS-assigned port
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind OAuth callback listener: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();
    let redirect_uri = format!("http://localhost:{}/oauth", port);

    // 3. Build authorization URL
    let auth_url = match provider.as_str() {
        "dropbox" => {
            format!(
                "https://www.dropbox.com/oauth2/authorize\
                ?client_id={}\
                &redirect_uri={}\
                &response_type=code\
                &code_challenge={}\
                &code_challenge_method=S256\
                &token_access_type=offline",
                DROPBOX_APP_KEY,
                url_encode(&redirect_uri),
                code_challenge
            )
        }
        "gdrive" => {
            format!(
                "https://accounts.google.com/o/oauth2/v2/auth\
                ?client_id={}\
                &redirect_uri={}\
                &response_type=code\
                &code_challenge={}\
                &code_challenge_method=S256\
                &scope={}\
                &access_type=offline\
                &prompt=consent",
                GOOGLE_CLIENT_ID,
                url_encode(&redirect_uri),
                code_challenge,
                url_encode("https://www.googleapis.com/auth/drive.appdata")
            )
        }
        _ => unreachable!(),
    };

    // 4. Open browser
    use tauri_plugin_shell::ShellExt;
    app.shell()
        .open(&auth_url, None)
        .map_err(|e| format!("Failed to open browser: {}", e))?;

    // 5. Wait up to 5 minutes for the OAuth callback
    let code = tokio::time::timeout(
        std::time::Duration::from_secs(300),
        wait_for_oauth_code(listener),
    )
    .await
    .map_err(|_| "OAuth authorization timed out (5 minutes). Please try again.".to_string())?
    .map_err(|e| format!("OAuth callback error: {}", e))?;

    // 6. Exchange code for tokens (no DB lock held during network call)
    let token_resp = match provider.as_str() {
        "dropbox" => exchange_dropbox_code(&code, &code_verifier, &redirect_uri).await?,
        "gdrive" => exchange_google_code(&code, &code_verifier, &redirect_uri).await?,
        _ => unreachable!(),
    };

    // 7. Store tokens
    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        ensure_settings_table(&conn)?;
        store_tokens(&conn, &provider, &token_resp)?;
    }

    Ok(())
}

/// Upload an encrypted backup blob to the specified cloud provider.
///
/// The blob must already be AES-256-GCM encrypted by the frontend — this
/// command is purely a transport layer.
#[tauri::command]
pub async fn cloud_provider_upload_blob(
    db: State<'_, Database>,
    lock: State<'_, AppLockState>,
    provider: String,
    blob: String,
) -> Result<(), String> {
    if lock.is_locked() {
        return Err("Session is locked".to_string());
    }

    let access_token = load_access_token_refreshing(&db, &provider).await?;
    let blob_bytes = blob.as_bytes();

    match provider.as_str() {
        "dropbox" => {
            let dropbox_arg = serde_json::json!({
                "path": "/Apps/MoodHaven/moodhaven-backup.moodhaven",
                "mode": "overwrite",
                "autorename": false
            });

            let client = reqwest::Client::new();
            let resp = client
                .post("https://content.dropboxapi.com/2/files/upload")
                .bearer_auth(&access_token)
                .header("Dropbox-API-Arg", dropbox_arg.to_string())
                .header("Content-Type", "application/octet-stream")
                .body(blob_bytes.to_vec())
                .send()
                .await
                .map_err(|e| format!("Network error uploading to Dropbox: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(format!("Dropbox upload failed ({}): {}", status, body));
            }
        }

        "gdrive" => {
            // Check if we already have a stored file ID
            let existing_file_id = {
                let conn = db.conn.lock().map_err(|e| e.to_string())?;
                db_get(&conn, "cloud_gdrive_file_id")?
            };

            if let Some(file_id) = existing_file_id {
                gdrive_update_existing(&access_token, &file_id, blob_bytes).await?;
            } else {
                let new_id = gdrive_upload_new(&access_token, blob_bytes).await?;
                let conn = db.conn.lock().map_err(|e| e.to_string())?;
                db_set(&conn, "cloud_gdrive_file_id", &new_id)?;
            }
        }

        _ => return Err(format!("Unknown provider: {}", provider)),
    }

    // Update last_sync_at
    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        db_set(
            &conn,
            &key_last_sync_at(&provider),
            &chrono::Utc::now().to_rfc3339(),
        )?;
    }

    Ok(())
}

/// Download the backup blob from the specified cloud provider.
///
/// Returns the raw blob string (which is AES-256-GCM ciphertext — the
/// frontend is responsible for decryption).
#[tauri::command]
pub async fn cloud_provider_download_blob(
    db: State<'_, Database>,
    lock: State<'_, AppLockState>,
    provider: String,
) -> Result<String, String> {
    if lock.is_locked() {
        return Err("Session is locked".to_string());
    }

    let access_token = load_access_token_refreshing(&db, &provider).await?;
    let client = reqwest::Client::new();

    let blob_bytes: Vec<u8> = match provider.as_str() {
        "dropbox" => {
            let dropbox_arg = serde_json::json!({
                "path": "/Apps/MoodHaven/moodhaven-backup.moodhaven"
            });

            let resp = client
                .post("https://content.dropboxapi.com/2/files/download")
                .bearer_auth(&access_token)
                .header("Dropbox-API-Arg", dropbox_arg.to_string())
                .send()
                .await
                .map_err(|e| format!("Network error downloading from Dropbox: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(format!("Dropbox download failed ({}): {}", status, body));
            }

            resp.bytes()
                .await
                .map_err(|e| format!("Failed to read Dropbox response body: {}", e))?
                .to_vec()
        }

        "gdrive" => {
            // Find the file ID (check cache first, then list API)
            let file_id = {
                let cached = {
                    let conn = db.conn.lock().map_err(|e| e.to_string())?;
                    db_get(&conn, "cloud_gdrive_file_id")?
                };
                if let Some(id) = cached {
                    id
                } else {
                    let id = gdrive_find_backup_file(&access_token)
                        .await?
                        .ok_or_else(|| {
                            "No MoodHaven backup found in Google Drive".to_string()
                        })?;
                    let conn = db.conn.lock().map_err(|e| e.to_string())?;
                    db_set(&conn, "cloud_gdrive_file_id", &id)?;
                    id
                }
            };

            let resp = client
                .get(format!(
                    "https://www.googleapis.com/drive/v3/files/{}",
                    file_id
                ))
                .query(&[("alt", "media"), ("spaces", "appDataFolder")])
                .bearer_auth(&access_token)
                .send()
                .await
                .map_err(|e| format!("Network error downloading from Google Drive: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(format!(
                    "Google Drive download failed ({}): {}",
                    status, body
                ));
            }

            resp.bytes()
                .await
                .map_err(|e| format!("Failed to read Google Drive response body: {}", e))?
                .to_vec()
        }

        _ => return Err(format!("Unknown provider: {}", provider)),
    };

    String::from_utf8(blob_bytes)
        .map_err(|e| format!("Downloaded blob is not valid UTF-8: {}", e))
}

/// Return connection status for all providers (or the specified one).
#[tauri::command]
pub async fn cloud_provider_status(
    db: State<'_, Database>,
    provider: Option<String>,
) -> Result<Vec<ProviderStatus>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    ensure_settings_table(&conn)?;

    let providers_to_check: Vec<&str> = match provider.as_deref() {
        Some("dropbox") => vec!["dropbox"],
        Some("gdrive") => vec!["gdrive"],
        Some(other) => return Err(format!("Unknown provider: {}", other)),
        None => vec!["dropbox", "gdrive"],
    };

    let mut results = Vec::new();
    for p in providers_to_check {
        let access_token = db_get(&conn, &key_access_token(p))?;
        let last_sync_at = db_get(&conn, &key_last_sync_at(p))?;
        results.push(ProviderStatus {
            provider: p.to_string(),
            connected: access_token.is_some(),
            last_sync_at,
        });
    }

    Ok(results)
}

/// Clear stored tokens for the provider. Disconnects the cloud account.
#[tauri::command]
pub async fn cloud_provider_disconnect(
    db: State<'_, Database>,
    lock: State<'_, AppLockState>,
    provider: String,
) -> Result<(), String> {
    if lock.is_locked() {
        return Err("Session is locked".to_string());
    }

    match provider.as_str() {
        "dropbox" | "gdrive" => {}
        _ => return Err(format!("Unknown provider: {}", provider)),
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    ensure_settings_table(&conn)?;

    db_delete(&conn, &key_access_token(&provider))?;
    db_delete(&conn, &key_refresh_token(&provider))?;
    db_delete(&conn, &key_expires_at(&provider))?;
    db_delete(&conn, &key_connected_at(&provider))?;
    db_delete(&conn, &key_last_sync_at(&provider))?;

    // Also clear the cached Google Drive file ID if disconnecting GDrive
    if provider == "gdrive" {
        db_delete(&conn, "cloud_gdrive_file_id")?;
    }

    Ok(())
}

/// Refresh the access token using the stored refresh token.
///
/// Called internally by upload/download if the token is expired.
/// Also exposed as a command for frontend pre-flight checks.
#[tauri::command]
pub async fn cloud_provider_refresh_token(
    db: State<'_, Database>,
    provider: String,
) -> Result<(), String> {
    match provider.as_str() {
        "dropbox" | "gdrive" => {}
        _ => return Err(format!("Unknown provider: {}", provider)),
    }

    let refresh_token = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        ensure_settings_table(&conn)?;
        db_get(&conn, &key_refresh_token(&provider))?
            .ok_or_else(|| format!("No refresh token for {} — re-authenticate", provider))?
    };

    let token_resp = perform_token_refresh(&provider, &refresh_token).await?;

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        store_tokens(&conn, &provider, &token_resp)?;
    }

    Ok(())
}
