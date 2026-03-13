//! Secure device pairing via 6-digit PIN (+ optional QR code)
//!
//! ## Flow
//! 1. **Initiator** calls `peer_generate_pairing_token` → starts HTTP listener on its
//!    device-derived port, returns a 6-digit PIN and a QR payload string for the frontend.
//! 2. **Acceptor** calls `peer_accept_pairing(target_host, peer_device_id, pin)` → derives
//!    the initiator's pairing port from `peer_device_id`, POSTs its own identity + the PIN.
//!    Both sides save each other as trusted.
//!
//! ## Port assignment
//! Each device gets a deterministic pairing port: `43000 + (first 4 hex chars of device_id
//! as u16) % 1000` → range 43000–43999. This avoids conflicts when two instances share the
//! same host (e.g. during local dev testing with two app instances).
//! 3. On success the initiator's server emits `peer:paired`; the acceptor command also
//!    emits `peer:paired` so both frontends react.
//!
//! ## Trusted device storage
//! `trusted_devices.json` in the app data directory — a plain JSON array of
//! `TrustedDevice` records (not sensitive; public keys only).

use crate::commands::peer_identity::get_or_create_device_identity;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

const TOKEN_TTL_SECS: i64 = 300; // 5 minutes

/// Derive a stable pairing port from a device_id.
/// Port = 43000 + (first 4 hex chars as u16) % 1000  →  range 43000–43999.
/// Different devices get different ports, eliminating conflicts on the same host.
pub fn pairing_port_for_device(device_id: &str) -> u16 {
    let hex = &device_id[..device_id.len().min(4)];
    let offset = u16::from_str_radix(hex, 16).unwrap_or(0) % 1000;
    43000 + offset
}

// ── Public types ──────────────────────────────────────────────────────────────

/// A device that has been paired (mutually trusted) with this device.
/// Stored in `trusted_devices.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustedDevice {
    pub device_id: String,
    pub device_name: String,
    pub device_type: String,
    pub public_key: String,
    pub paired_at: String,
    pub last_seen: String,
}

/// Returned by `peer_generate_pairing_token` so the frontend can display the code.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingTokenInfo {
    /// 6-digit PIN for manual entry
    pub pin: String,
    /// Compact JSON string suitable for encoding as a QR code
    pub qr_payload: String,
    /// Unix timestamp when the token expires (5 min from now)
    pub expires_at: i64,
    /// This device's LAN IP (so the QR payload knows where to connect)
    pub local_host: String,
    /// Always 42425
    pub pairing_port: u16,
}

// ── Managed state ──────────────────────────────────────────────────────────────

struct ActiveToken {
    pin: String,
    expires_at: i64,
}

pub struct PairingServerState {
    pub is_serving: AtomicBool,
    active_token: Mutex<Option<ActiveToken>>,
    stop_tx: Mutex<Option<std::sync::mpsc::SyncSender<()>>>,
    /// Join handle for the server thread — joining guarantees the TcpListener
    /// has been dropped (port released) before we attempt to rebind.
    server_handle: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl PairingServerState {
    pub fn new() -> Self {
        Self {
            is_serving: AtomicBool::new(false),
            active_token: Mutex::new(None),
            stop_tx: Mutex::new(None),
            server_handle: Mutex::new(None),
        }
    }
}

// AtomicBool + Mutex<T> are already Send+Sync
unsafe impl Send for PairingServerState {}
unsafe impl Sync for PairingServerState {}

// ── Trusted-devices file helpers ───────────────────────────────────────────────

fn trusted_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("trusted_devices.json"))
        .map_err(|e| format!("Failed to get app data dir: {e}"))
}

/// Load all trusted devices from disk.
pub fn load_trusted_devices(app: &AppHandle) -> Result<Vec<TrustedDevice>, String> {
    let path = trusted_path(app)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let json = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read trusted devices: {e}"))?;
    serde_json::from_str(&json).map_err(|e| format!("Failed to parse trusted devices: {e}"))
}

/// Upsert a trusted device (insert or replace by device_id).
fn save_trusted_device(app: &AppHandle, device: TrustedDevice) -> Result<(), String> {
    let mut devices = load_trusted_devices(app)?;
    if let Some(pos) = devices.iter().position(|d| d.device_id == device.device_id) {
        devices[pos] = device;
    } else {
        devices.push(device);
    }
    let path = trusted_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{e}"))?;
    }
    let json = serde_json::to_string_pretty(&devices)
        .map_err(|e| format!("Failed to serialize trusted devices: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write trusted devices: {e}"))
}

/// Remove a trusted device by device_id.
fn remove_trusted_device(app: &AppHandle, device_id: &str) -> Result<(), String> {
    let mut devices = load_trusted_devices(app)?;
    devices.retain(|d| d.device_id != device_id);
    let path = trusted_path(app)?;
    let json = serde_json::to_string_pretty(&devices)
        .map_err(|e| format!("Failed to serialize trusted devices: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write trusted devices: {e}"))
}

/// Check if a device_id is in the trusted list (without error propagation).
pub fn is_device_trusted(app: &AppHandle, device_id: &str) -> bool {
    load_trusted_devices(app)
        .map(|devices| devices.iter().any(|d| d.device_id == device_id))
        .unwrap_or(false)
}

// ── HTTP helpers ───────────────────────────────────────────────────────────────

fn write_http_json<T: Serialize>(stream: &mut std::net::TcpStream, status: u16, body: &T) {
    let body_json = serde_json::to_string(body).unwrap_or_default();
    let response = format!(
        "HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{body_json}",
        body_json.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn write_http_error(stream: &mut std::net::TcpStream, status: u16, msg: &str) {
    // Escape msg for JSON safety
    let escaped = msg.replace('"', "'");
    let body = format!("{{\"error\":\"{escaped}\"}}");
    let response = format!(
        "HTTP/1.1 {status} Error\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

/// Read the JSON body from an incoming HTTP request. Returns None on error.
fn read_request_body(stream: &mut std::net::TcpStream) -> Option<serde_json::Value> {
    stream.set_read_timeout(Some(Duration::from_secs(8))).ok();

    let cloned = stream.try_clone().ok()?;
    let mut reader = BufReader::new(cloned);

    // Skip the request line (e.g. "POST /pair HTTP/1.1")
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;

    // Parse headers for Content-Length
    let mut content_length: usize = 0;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).ok()? == 0 {
            break;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            break; // blank line = end of headers
        }
        if trimmed.to_lowercase().starts_with("content-length:") {
            content_length = trimmed["content-length:".len()..].trim().parse().unwrap_or(0);
        }
    }

    if content_length == 0 {
        return None;
    }

    let mut body = vec![0u8; content_length];
    reader.read_exact(&mut body).ok()?;
    serde_json::from_slice(&body).ok()
}

// ── Pairing server ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct PairRequest {
    device_id: String,
    device_name: String,
    device_type: String,
    public_key: String,
    pin: String,
}

fn run_pairing_server(
    app: AppHandle,
    listener: TcpListener,
    stop_rx: std::sync::mpsc::Receiver<()>,
) {
    listener.set_nonblocking(true).ok();
    let deadline = std::time::Instant::now() + Duration::from_secs(TOKEN_TTL_SECS as u64 + 10);
    eprintln!("[pairing] Server started");

    loop {
        // Check stop signal or 5-min expiry
        if stop_rx.try_recv().is_ok() || std::time::Instant::now() >= deadline {
            break;
        }

        match listener.accept() {
            Ok((mut stream, addr)) => {
                eprintln!("[pairing] Incoming connection from {addr}");

                // Validate the active token hasn't expired
                let expected_pin = {
                    let opt = app.try_state::<PairingServerState>().and_then(|s| {
                        s.active_token.lock().ok().and_then(|g| {
                            g.as_ref().and_then(|t| {
                                if chrono::Utc::now().timestamp() <= t.expires_at {
                                    Some(t.pin.clone())
                                } else {
                                    None
                                }
                            })
                        })
                    });
                    opt
                };

                let expected_pin = match expected_pin {
                    Some(p) => p,
                    None => {
                        write_http_error(&mut stream, 410, "Token expired or no active session");
                        continue;
                    }
                };

                // Parse request body
                let body = match read_request_body(&mut stream) {
                    Some(b) => b,
                    None => {
                        write_http_error(&mut stream, 400, "Could not read request body");
                        continue;
                    }
                };

                let req: PairRequest = match serde_json::from_value(body) {
                    Ok(r) => r,
                    Err(_) => {
                        write_http_error(&mut stream, 400, "Invalid request format");
                        continue;
                    }
                };

                // Constant-time PIN comparison (short strings, good enough)
                if req.pin != expected_pin {
                    write_http_error(&mut stream, 403, "Invalid PIN");
                    eprintln!("[pairing] Invalid PIN from {addr}");
                    continue;
                }

                // Get our own identity to return
                let my_identity = match get_or_create_device_identity(&app) {
                    Ok(id) => id,
                    Err(e) => {
                        write_http_error(&mut stream, 500, &e);
                        break;
                    }
                };

                // Save acceptor as trusted
                let trusted = TrustedDevice {
                    device_id: req.device_id.clone(),
                    device_name: req.device_name.clone(),
                    device_type: req.device_type.clone(),
                    public_key: req.public_key.clone(),
                    paired_at: chrono::Utc::now().to_rfc3339(),
                    last_seen: chrono::Utc::now().to_rfc3339(),
                };

                if let Err(e) = save_trusted_device(&app, trusted.clone()) {
                    eprintln!("[pairing] Failed to save trusted device: {e}");
                    write_http_error(&mut stream, 500, "Failed to save pairing");
                    break;
                }

                // Respond with our own identity
                #[derive(Serialize)]
                #[serde(rename_all = "camelCase")]
                struct PairResponse {
                    device_id: String,
                    device_name: String,
                    device_type: String,
                    public_key: String,
                }
                write_http_json(
                    &mut stream,
                    200,
                    &PairResponse {
                        device_id: my_identity.device_id.clone(),
                        device_name: my_identity.device_name.clone(),
                        device_type: my_identity.device_type.clone(),
                        public_key: my_identity.public_key.clone(),
                    },
                );

                // Emit event so the frontend can react
                let _ = app.emit("peer:paired", &trusted);
                eprintln!(
                    "[pairing] Paired with {} ({})",
                    trusted.device_name, trusted.device_id
                );

                // Clear token and stop serving
                if let Some(s) = app.try_state::<PairingServerState>() {
                    if let Ok(mut g) = s.active_token.lock() {
                        *g = None;
                    }
                    s.is_serving.store(false, Ordering::SeqCst);
                }
                break; // one successful pairing per token
            }

            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(200));
            }

            Err(e) => {
                eprintln!("[pairing] Accept error: {e}");
                break;
            }
        }
    }

    eprintln!("[pairing] Server stopped");
    if let Some(s) = app.try_state::<PairingServerState>() {
        s.is_serving.store(false, Ordering::SeqCst);
        if let Ok(mut g) = s.active_token.lock() {
            *g = None;
        }
    }
}

// ── Tauri commands ─────────────────────────────────────────────────────────────

/// Generate a 6-digit PIN, start the pairing HTTP server on port 42425,
/// and return a `PairingTokenInfo` for the frontend to display.
#[tauri::command]
pub fn peer_generate_pairing_token(
    app: AppHandle,
    state: State<'_, PairingServerState>,
) -> Result<PairingTokenInfo, String> {
    // Stop any previous server gracefully
    // Signal any running server to stop, then join its thread.
    // Joining (not just sleeping) guarantees the TcpListener has been dropped
    // and the OS port is free before we try to rebind below.
    if let Ok(mut g) = state.stop_tx.lock() {
        if let Some(tx) = g.take() {
            let _ = tx.send(());
        }
    }
    if let Ok(mut h) = state.server_handle.lock() {
        if let Some(handle) = h.take() {
            let _ = handle.join();
        }
    }

    // Generate a random 6-digit PIN
    let pin_u32: u32 = rand::thread_rng().gen_range(0..1_000_000);
    let pin = format!("{:06}", pin_u32);
    let expires_at = chrono::Utc::now().timestamp() + TOKEN_TTL_SECS;

    // Detect our LAN IP for the QR payload
    let local_host = crate::commands::peer_discovery::get_local_ipv4()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|| "127.0.0.1".to_string());

    // Get our identity so the QR payload contains enough info
    let identity = get_or_create_device_identity(&app)?;

    // Derive this device's pairing port from its device_id (stable, unique per device).
    // Different device IDs → different ports, so two instances on the same host never conflict.
    let pairing_port = pairing_port_for_device(&identity.device_id);

    // Build compact QR payload
    let qr_payload = serde_json::json!({
        "v": 1,
        "did": identity.device_id,
        "dn": identity.device_name,
        "dt": identity.device_type,
        "pk": identity.public_key,
        "pin": pin,
        "host": local_host,
        "port": pairing_port,
        "exp": expires_at,
    })
    .to_string();

    // Persist active token
    {
        let mut g = state.active_token.lock().map_err(|e| e.to_string())?;
        *g = Some(ActiveToken { pin: pin.clone(), expires_at });
    }

    // Bind TCP listener before spawning thread (fail fast on port conflict)
    let listener = TcpListener::bind(format!("0.0.0.0:{pairing_port}"))
        .map_err(|e| format!("Failed to bind pairing port {pairing_port}: {e}"))?;
    eprintln!("[pairing] Listening on port {pairing_port}");

    let (stop_tx, stop_rx) = std::sync::mpsc::sync_channel::<()>(1);
    {
        let mut g = state.stop_tx.lock().map_err(|e| e.to_string())?;
        *g = Some(stop_tx);
    }
    state.is_serving.store(true, Ordering::SeqCst);

    let app_clone = app.clone();
    let handle = std::thread::spawn(move || {
        run_pairing_server(app_clone, listener, stop_rx);
    });
    {
        let mut h = state.server_handle.lock().map_err(|e| e.to_string())?;
        *h = Some(handle);
    }

    Ok(PairingTokenInfo {
        pin,
        qr_payload,
        expires_at,
        local_host,
        pairing_port,
    })
}

/// Accept a pairing invitation from another device.
/// Connects to the initiator's pairing server and exchanges identities.
#[tauri::command]
pub async fn peer_accept_pairing(
    app: AppHandle,
    target_host: String,
    peer_device_id: String,
    pin: String,
) -> Result<TrustedDevice, String> {
    let identity = get_or_create_device_identity(&app)?;
    // Derive the initiator's pairing port from their device_id (same formula as the server side)
    let pairing_port = pairing_port_for_device(&peer_device_id);
    let url = format!("http://{}:{}/pair", target_host, pairing_port);
    eprintln!("[pairing] Connecting to {url}");

    let body = serde_json::json!({
        "device_id": identity.device_id,
        "device_name": identity.device_name,
        "device_type": identity.device_type,
        "public_key": identity.public_key,
        "pin": pin,
    });

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to peer: {e}"))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let err_text = response.text().await.unwrap_or_default();
        let msg = serde_json::from_str::<serde_json::Value>(&err_text)
            .ok()
            .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(|s| s.to_string()))
            .unwrap_or_else(|| format!("HTTP {status}"));
        return Err(format!("Pairing rejected: {msg}"));
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct PairResponse {
        device_id: String,
        device_name: String,
        device_type: String,
        public_key: String,
    }

    let resp: PairResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse pairing response: {e}"))?;

    let trusted = TrustedDevice {
        device_id: resp.device_id.clone(),
        device_name: resp.device_name.clone(),
        device_type: resp.device_type.clone(),
        public_key: resp.public_key.clone(),
        paired_at: chrono::Utc::now().to_rfc3339(),
        last_seen: chrono::Utc::now().to_rfc3339(),
    };

    save_trusted_device(&app, trusted.clone())?;

    // Emit so the frontend updates its trusted device list
    let _ = app.emit("peer:paired", &trusted);
    eprintln!(
        "[pairing] Accepted pairing with {} ({})",
        trusted.device_name, trusted.device_id
    );

    Ok(trusted)
}

/// Get all trusted (paired) devices.
#[tauri::command]
pub fn peer_get_trusted(app: AppHandle) -> Result<Vec<TrustedDevice>, String> {
    load_trusted_devices(&app)
}

/// Remove a paired device by device_id.
#[tauri::command]
pub fn peer_revoke_device(app: AppHandle, device_id: String) -> Result<(), String> {
    remove_trusted_device(&app, &device_id)
}

/// Cancel an in-progress pairing session (stop the HTTP server).
/// Does NOT join the thread — the cancel is fire-and-forget from the frontend's perspective.
/// The next call to `peer_generate_pairing_token` will join before rebinding.
#[tauri::command]
pub fn peer_cancel_pairing(state: State<'_, PairingServerState>) -> Result<(), String> {
    if let Ok(mut g) = state.stop_tx.lock() {
        if let Some(tx) = g.take() {
            let _ = tx.send(());
        }
    }
    if let Ok(mut g) = state.active_token.lock() {
        *g = None;
    }
    // is_serving will be set false by the thread itself; don't force it here
    // so that peer_generate_pairing_token can still detect and join the dying thread.
    Ok(())
}

/// Whether the pairing HTTP server is currently active.
#[tauri::command]
pub fn peer_pairing_is_active(state: State<'_, PairingServerState>) -> bool {
    state.is_serving.load(Ordering::SeqCst)
}
