//! Update manager — checks GitHub Releases API for new versions,
//! downloads the correct platform asset, verifies SHA-256 integrity,
//! and runs the platform-appropriate installer.
//!
//! Architecture:
//!   - GitHub Releases API is the single source of truth (no separate manifest file)
//!   - Changelog comes from the GitHub release `body` markdown field directly
//!   - SHA-256 checksums are verified against a `checksums.txt` release asset
//!   - All network requests use HTTPS; the GitHub owner/repo is hardcoded at compile time
//!   - The calling frontend drives the UX; this module only performs I/O
//!
//! Security properties:
//!   - HTTPS transport (system TLS) prevents casual MITM
//!   - SHA-256 content verification catches corrupted/tampered downloads
//!   - minisign signature verification proves authenticity (the bundle was
//!     signed by the holder of the CI private key) — the actual trust anchor.
//!     The public key is compiled in (`MINISIGN_PUBKEY`) so it cannot be
//!     swapped at runtime. SHA-256 stays as an additional integrity check.
//!   - Version gate: only `new > current` is accepted (no rollback)
//!   - No user-supplied URLs are ever followed; all URLs come from the GitHub API
//!     response (repo-owner/repo-name are hardcoded below)

use base64::Engine as _;
use minisign_verify::{PublicKey, Signature};
use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::io::Write as IoWrite;
use tauri::{AppHandle, Emitter};

// ── Hardcoded repository identity ─────────────────────────────────────────────
// Changing these requires a new signed release — they cannot be overridden at runtime.
const GITHUB_OWNER: &str = "kenlacroix";
const GITHUB_REPO: &str = "moodhaven-journal";
const GITHUB_API_BASE: &str = "https://api.github.com";
// Reserved for future use (e.g. fetching latest.json from a raw URL)
#[allow(dead_code)]
const GITHUB_RAW_BASE: &str = "https://raw.githubusercontent.com";

// User-Agent required by GitHub API (arbitrary string identifying the app)
const USER_AGENT_STRING: &str = concat!("MoodHaven/", env!("CARGO_PKG_VERSION"));

// Maximum size of a downloaded update binary (200 MB)
const MAX_UPDATE_BYTES: u64 = 200 * 1024 * 1024;

// ── Authenticity: compiled-in minisign public key ─────────────────────────────
// This is the base64-encoded minisign `.pub` file (the exact same value held in
// `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`). It is a compile-time
// `const` so it cannot be swapped at runtime / via config. CI signs every bundle
// with the matching private key (`TAURI_SIGNING_PRIVATE_KEY`) and uploads the
// `<asset>.sig`. The updater downloads that `.sig` and verifies it against this
// key before installing — minisign is the trust anchor; SHA-256 is integrity.
const MINISIGN_PUBKEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDY2RDc3NzUyRTM4QUMwRjUKUldUMXdJcmpVbmZYWnVTL0RkRDRLaXlNVTMxVS95T0loRlVsd2tXQUxiNWNTYzZHcnpoNUNFNTcK";

// ── Security-severity floor ───────────────────────────────────────────────────
// Any running version below this is treated as a "security" update (the
// plaintext-DB, pre-SQLCipher cohort). SQLCipher encryption-at-rest landed in
// 1.8.0, so users below it must be prompted with a non-skippable banner.
const SECURITY_FLOOR: (u64, u64, u64) = (1, 8, 0);

// ── Platform detection ─────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
const CURRENT_OS: &str = "linux";
#[cfg(target_os = "windows")]
const CURRENT_OS: &str = "windows";
#[cfg(target_os = "macos")]
const CURRENT_OS: &str = "macos";
#[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
const CURRENT_OS: &str = "other";

#[cfg(target_arch = "x86_64")]
const CURRENT_ARCH: &str = "x86_64";
#[cfg(target_arch = "aarch64")]
const CURRENT_ARCH: &str = "aarch64";
#[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
const CURRENT_ARCH: &str = "unknown";

// ── Asset filename patterns ────────────────────────────────────────────────────
// CI must name release assets following these patterns exactly.
//
//   Linux   x86_64  → moodhaven-journal_VERSION_amd64.AppImage
//   Linux   aarch64 → moodhaven-journal_VERSION_arm64.AppImage
//   Windows x86_64  → moodhaven-journal_VERSION_x64-setup.exe
//   Windows aarch64 → moodhaven-journal_VERSION_arm64-setup.exe
//   macOS   x86_64  → MoodHaven_VERSION_x64.dmg
//   macOS   aarch64 → MoodHaven_VERSION_aarch64.dmg

fn expected_asset_suffix() -> Option<&'static str> {
    match (CURRENT_OS, CURRENT_ARCH) {
        ("linux", "x86_64") => Some("_amd64.AppImage"),
        ("linux", "aarch64") => Some("_arm64.AppImage"),
        ("windows", "x86_64") => Some("_x64-setup.exe"),
        ("windows", "aarch64") => Some("_arm64-setup.exe"),
        ("macos", "x86_64") => Some("_x64.dmg"),
        ("macos", "aarch64") => Some("_aarch64.dmg"),
        _ => None,
    }
}

// ── GitHub API types (only fields we use) ─────────────────────────────────────

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
    #[allow(dead_code)]
    name: Option<String>,
    body: Option<String>,
    published_at: Option<String>,
    html_url: String,
    assets: Vec<GitHubAsset>,
}

#[derive(Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

// ── Public response types (sent to the frontend) ──────────────────────────────

#[derive(Serialize, Clone)]
pub struct UpdateInfo {
    /// Version string from the GitHub release tag, e.g. "v1.2.3"
    pub version: String,
    /// Currently running version
    pub current_version: String,
    /// Release notes markdown (GitHub release body)
    pub notes: String,
    /// ISO-8601 publish date
    pub pub_date: String,
    /// Release page URL for "View on GitHub" links
    pub release_url: String,
    /// true when version > current_version and a matching asset was found
    pub is_available: bool,
    /// Info about the asset for the current platform
    pub asset: Option<UpdateAsset>,
    /// "other" platforms (Android, unknown) cannot self-update
    pub can_self_update: bool,
    /// Platform string for display
    pub platform: String,
    /// Update urgency: "security" | "recommended" | "optional".
    /// "security" updates are non-skippable in the UI.
    pub severity: String,
}

#[derive(Serialize, Clone)]
pub struct UpdateAsset {
    pub name: String,
    pub download_url: String,
    /// Bytes
    pub size: u64,
    /// Human-readable size string
    pub size_label: String,
    /// SHA-256 hex digest (from checksums.txt) — empty string if not found
    pub checksum: String,
}

/// Events emitted to the frontend during download
#[derive(Serialize, Clone)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
    percent: u8,
}

#[derive(Serialize, Clone)]
struct DownloadFinished {
    success: bool,
    message: String,
    /// true if SHA-256 was verified; false if checksums.txt was absent
    /// and the update was installed without hash verification.
    checksum_verified: bool,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn build_http_client() -> Result<reqwest::Client, String> {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_STRING));
    headers.insert(
        "Accept",
        HeaderValue::from_static("application/vnd.github.v3+json"),
    );
    reqwest::Client::builder()
        .default_headers(headers)
        .https_only(true) // never follow redirects to plain HTTP
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))
}

/// Parse a version string like "v1.2.3" or "1.2.3" into (major, minor, patch).
fn parse_version(v: &str) -> (u64, u64, u64) {
    let v = v.trim_start_matches('v');
    let parts: Vec<u64> = v.split('.').filter_map(|p| p.parse().ok()).collect();
    (
        parts.first().copied().unwrap_or(0),
        parts.get(1).copied().unwrap_or(0),
        parts.get(2).copied().unwrap_or(0),
    )
}

fn is_newer(candidate: &str, current: &str) -> bool {
    parse_version(candidate) > parse_version(current)
}

/// Classify update urgency from the currently-running version.
///
/// Rule: any version below the `SECURITY_FLOOR` (the pre-SQLCipher,
/// plaintext-DB cohort) is told that the update is a **security** update.
/// Everything else is "recommended". The frontend makes "security" banners
/// non-skippable.
fn compute_severity(current: &str) -> &'static str {
    if parse_version(current) < SECURITY_FLOOR {
        "security"
    } else {
        "recommended"
    }
}

fn human_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{bytes} B")
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}

/// Fetch the SHA-256 checksum for `asset_name` from the `checksums.txt`
/// release asset (if present). Returns an empty string on any failure —
/// the caller should treat an absent checksum as "unverified" rather than
/// "failed", since older releases may not include checksums.txt.
async fn fetch_checksum(
    client: &reqwest::Client,
    assets: &[GitHubAsset],
    asset_name: &str,
) -> String {
    let checksum_asset = assets.iter().find(|a| a.name == "checksums.txt");
    let Some(cs_asset) = checksum_asset else {
        return String::new();
    };

    let Ok(resp) = client.get(&cs_asset.browser_download_url).send().await else {
        return String::new();
    };
    let Ok(text) = resp.text().await else {
        return String::new();
    };

    parse_checksum_for_asset(&text, asset_name)
}

/// Parse `sha256sum`-format checksum text and return the hex digest for
/// `asset_name`, or an empty string if the file isn't listed.
///
/// Format per line: `"<sha256hex>  <filename>\n"` (two spaces separate the
/// digest from the filename, matching `sha256sum` output).
fn parse_checksum_for_asset(text: &str, asset_name: &str) -> String {
    for line in text.lines() {
        let parts: Vec<&str> = line.splitn(2, "  ").collect();
        if parts.len() == 2 && parts[1].trim() == asset_name {
            return parts[0].trim().to_string();
        }
    }
    String::new()
}

/// Verify a downloaded file's SHA-256 against an expected hex digest.
///
/// Returns `Ok(true)` when the digest matched, `Ok(false)` when `expected`
/// is empty (checksums.txt absent — caller should warn the user), and
/// `Err(...)` on mismatch or I/O failure.
fn verify_sha256(path: &std::path::Path, expected: &str) -> Result<bool, String> {
    if expected.is_empty() {
        // No checksum available — skip verification but signal the caller.
        log::warn!(
            "[updater] WARNING: no checksums.txt found for this release; \
                   SHA-256 verification was skipped. The update may be unverified."
        );
        return Ok(false);
    }
    use sha2::{Digest, Sha256};
    let data = std::fs::read(path).map_err(|e| format!("Read error: {e}"))?;
    let digest = hex::encode(Sha256::digest(&data));
    if digest != expected.to_lowercase() {
        Err(format!(
            "Checksum mismatch!\n  Expected: {expected}\n  Got:      {digest}"
        ))
    } else {
        Ok(true)
    }
}

/// Decode the compiled-in minisign public key.
///
/// `MINISIGN_PUBKEY` is the base64-encoded `.pub` file (the value Tauri stores
/// in `tauri.conf.json`). We base64-decode it back into the two-line minisign
/// file format, then parse it.
fn load_pubkey() -> Result<PublicKey, String> {
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(MINISIGN_PUBKEY)
        .map_err(|e| format!("Invalid compiled-in public key (base64): {e}"))?;
    let pub_str =
        String::from_utf8(decoded).map_err(|e| format!("Invalid public key (utf8): {e}"))?;
    PublicKey::decode(pub_str.trim())
        .map_err(|e| format!("Invalid compiled-in public key (format): {e}"))
}

/// Verify a minisign signature over a downloaded file.
///
/// `sig_text` is the raw contents of the `<asset>.sig` file produced by CI.
/// Returns `Ok(())` only when the signature is valid for `path` under the
/// compiled-in public key. Any failure (bad key, malformed signature,
/// mismatch) is an error — the caller must abort and delete the temp file.
///
/// Tauri's minisign signatures are prehashed (BLAKE2b), so legacy signatures
/// are rejected (`allow_legacy = false`).
fn verify_minisign(path: &std::path::Path, sig_text: &str) -> Result<(), String> {
    let public_key = load_pubkey()?;
    let signature =
        Signature::decode(sig_text).map_err(|e| format!("Malformed signature file: {e}"))?;
    let data = std::fs::read(path).map_err(|e| format!("Read error: {e}"))?;
    public_key
        .verify(&data, &signature, false)
        .map_err(|e| format!("Signature verification failed: {e}"))
}

/// Download the `<asset>.sig` signature file for `asset_name` from the release.
/// Returns the raw text, or an error if the `.sig` asset is absent or the
/// download fails. A missing `.sig` is a hard error — we never install an
/// unsigned update.
async fn fetch_signature(
    client: &reqwest::Client,
    assets: &[GitHubAsset],
    asset_name: &str,
) -> Result<String, String> {
    let sig_name = format!("{asset_name}.sig");
    let sig_asset = assets
        .iter()
        .find(|a| a.name == sig_name)
        .ok_or_else(|| format!("No signature ({sig_name}) found for this release"))?;
    let resp = client
        .get(&sig_asset.browser_download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download signature: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "Failed to download signature: HTTP {}",
            resp.status()
        ));
    }
    resp.text()
        .await
        .map_err(|e| format!("Failed to read signature: {e}"))
}

// ── Tauri commands ─────────────────────────────────────────────────────────────

/// Check GitHub for a newer release. Returns UpdateInfo whether or not an
/// update is available — `is_available` distinguishes the two cases.
///
/// This command is fast (~200 ms) and safe to call on startup.
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<UpdateInfo, String> {
    let current_version = app.package_info().version.to_string();
    let client = build_http_client()?;

    let url = format!("{GITHUB_API_BASE}/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest");
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if resp.status() == 404 {
        // No releases published yet
        let severity = compute_severity(&current_version).to_string();
        return Ok(UpdateInfo {
            version: current_version.clone(),
            current_version,
            notes: String::new(),
            pub_date: String::new(),
            release_url: String::new(),
            is_available: false,
            asset: None,
            can_self_update: CURRENT_OS != "other",
            platform: format!("{CURRENT_OS}/{CURRENT_ARCH}"),
            severity,
        });
    }

    if !resp.status().is_success() {
        return Err(format!("GitHub API returned HTTP {}", resp.status()));
    }

    let release: GitHubRelease = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {e}"))?;

    let new_ver = release.tag_name.clone();
    let available = is_newer(&new_ver, &current_version);
    let can_self_update = CURRENT_OS != "other" && expected_asset_suffix().is_some();

    // Find the matching asset for this platform
    let asset = if available && can_self_update {
        let suffix = expected_asset_suffix().unwrap();
        let ver_clean = new_ver.trim_start_matches('v');
        release
            .assets
            .iter()
            .find(|a| a.name.ends_with(suffix) && a.name.contains(ver_clean))
            .map(|a| {
                // We'll fetch the checksum lazily — returned as empty here,
                // download_and_install_update will verify it.
                UpdateAsset {
                    name: a.name.clone(),
                    download_url: a.browser_download_url.clone(),
                    size: a.size,
                    size_label: human_size(a.size),
                    checksum: String::new(), // populated by download command
                }
            })
    } else {
        None
    };

    let severity = compute_severity(&current_version).to_string();
    Ok(UpdateInfo {
        version: new_ver,
        current_version,
        notes: release.body.unwrap_or_default(),
        pub_date: release.published_at.unwrap_or_default(),
        release_url: release.html_url,
        is_available: available && asset.is_some(),
        asset,
        can_self_update,
        platform: format!("{CURRENT_OS}/{CURRENT_ARCH}"),
        severity,
    })
}

/// Download the update asset for this platform, verify SHA-256, then hand
/// off to the OS installer. Streams progress events to the window.
///
/// Events emitted on the window:
///   "update-progress"  → DownloadProgress { downloaded, total, percent }
///   "update-finished"  → DownloadFinished { success, message }
///
/// On success the installer is launched; the app should exit (or wait for
/// the "update-finished" success event and prompt restart).
#[tauri::command]
pub async fn download_and_install_update(
    app: AppHandle,
    download_url: String,
    asset_name: String,
    expected_checksum: String,
) -> Result<(), String> {
    // Validate asset_name — must be a plain filename (no path components)
    // to prevent path traversal when joining with the temp directory.
    crate::commands::voice_memos::validate_incoming_filename(&asset_name)
        .map_err(|e| format!("Invalid asset_name: {e}"))?;

    // Safety: reject any URL that isn't github.com or objects.githubusercontent.com
    let allowed_hosts = [
        "github.com",
        "objects.githubusercontent.com",
        "raw.githubusercontent.com",
    ];
    let parsed =
        reqwest::Url::parse(&download_url).map_err(|_| "Invalid download URL".to_string())?;
    let host = parsed.host_str().unwrap_or("");
    if !allowed_hosts
        .iter()
        .any(|h| host == *h || host.ends_with(&format!(".{h}")))
    {
        return Err(format!("Download URL host '{host}' is not allowed"));
    }

    let client = build_http_client()?;

    // Fetch the release once — we need its asset list to resolve both the
    // checksum (if the caller didn't pass one) and the minisign `.sig` URL.
    let rel_url = format!("{GITHUB_API_BASE}/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest");
    let rel_resp = client
        .get(&rel_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch release metadata: {e}"))?;
    if !rel_resp.status().is_success() {
        return Err(format!(
            "Failed to fetch release metadata: HTTP {}",
            rel_resp.status()
        ));
    }
    let release: GitHubRelease = rel_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse release metadata: {e}"))?;

    // Fetch the minisign signature up-front — a missing `.sig` is a hard error;
    // we never install an unsigned update.
    let signature_text = fetch_signature(&client, &release.assets, &asset_name).await?;

    // Resolve checksum: if the caller passed one, use it; otherwise fetch from checksums.txt.
    let checksum = if !expected_checksum.is_empty() {
        expected_checksum.clone()
    } else {
        fetch_checksum(&client, &release.assets, &asset_name).await
    };

    // Stream the download to a temp file
    let tmp_dir = std::env::temp_dir();
    let tmp_path = tmp_dir.join(&asset_name);

    let resp = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Download error: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Download failed: HTTP {}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut file =
        std::fs::File::create(&tmp_path).map_err(|e| format!("Cannot create temp file: {e}"))?;

    let mut stream = resp.bytes_stream();
    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {e}"))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Write error: {e}"))?;
        downloaded += chunk.len() as u64;
        if downloaded > MAX_UPDATE_BYTES {
            drop(file);
            let _ = std::fs::remove_file(&tmp_path);
            return Err(format!(
                "Update too large (>{} MB)",
                MAX_UPDATE_BYTES / (1024 * 1024)
            ));
        }
        let percent = (downloaded * 100)
            .checked_div(total)
            .map(|p| p.min(100) as u8)
            .unwrap_or(0);
        let _ = app.emit(
            "update-progress",
            DownloadProgress {
                downloaded,
                total,
                percent,
            },
        );
    }
    drop(file);

    // Require SHA-256 verification — abort if checksums.txt was absent.
    if checksum.is_empty() {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(
            "Cannot install update: no checksums.txt found for this release. \
             Download aborted for safety."
                .to_string(),
        );
    }
    if let Err(e) = verify_sha256(&tmp_path, &checksum) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(e);
    }

    // Authenticity gate: verify the minisign signature against the compiled-in
    // public key. This proves the bundle was signed by CI's private key — the
    // actual trust anchor. Any failure aborts and deletes the temp file.
    if let Err(e) = verify_minisign(&tmp_path, &signature_text) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(e);
    }

    // Hand off to platform installer
    let install_result = install_update(&tmp_path, &asset_name);
    match &install_result {
        Ok(_) => {
            let message = "Update downloaded and verified. Installer launched.".into();
            let _ = app.emit(
                "update-finished",
                DownloadFinished {
                    success: true,
                    message,
                    checksum_verified: true,
                },
            );
        }
        Err(e) => {
            let _ = app.emit(
                "update-finished",
                DownloadFinished {
                    success: false,
                    message: e.clone(),
                    checksum_verified: false,
                },
            );
        }
    }
    install_result
}

/// Platform-specific installer launch
fn install_update(path: &std::path::Path, _asset_name: &str) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        install_linux_appimage(path)
    }
    #[cfg(target_os = "windows")]
    {
        install_windows_exe(path)
    }
    #[cfg(target_os = "macos")]
    {
        install_macos_dmg(path)
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        let _ = (path, _asset_name);
        Err("Self-update is not supported on this platform".to_string())
    }
}

// ── Linux: replace AppImage in-place ─────────────────────────────────────────

#[cfg(target_os = "linux")]
fn install_linux_appimage(new_appimage: &std::path::Path) -> Result<(), String> {
    // $APPIMAGE is set by the AppImage runtime — it's the path to the running binary
    let current_path = std::env::var("APPIMAGE").map_err(|_| {
        "APPIMAGE environment variable not set. \
                       Are you running from an AppImage?"
            .to_string()
    })?;
    let current = std::path::Path::new(&current_path);

    // Make the downloaded file executable
    use std::os::unix::fs::PermissionsExt;
    let mut perms = std::fs::metadata(new_appimage)
        .map_err(|e| format!("Cannot read permissions: {e}"))?
        .permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(new_appimage, perms)
        .map_err(|e| format!("Cannot set permissions: {e}"))?;

    // Atomically replace the current AppImage
    std::fs::rename(new_appimage, current).or_else(|_| {
        // rename fails across filesystems — fall back to copy + delete
        std::fs::copy(new_appimage, current)
            .map(|_| ())
            .map_err(|e| format!("Copy failed: {e}"))
    })?;

    // Re-launch the updated binary and exit
    std::process::Command::new(current)
        .spawn()
        .map_err(|e| format!("Failed to launch updated app: {e}"))?;
    std::process::exit(0);
}

// ── Windows: run NSIS installer (handles UAC internally) ──────────────────────

#[cfg(target_os = "windows")]
fn install_windows_exe(installer: &std::path::Path) -> Result<(), String> {
    std::process::Command::new(installer)
        .spawn()
        .map_err(|e| format!("Failed to launch installer: {e}"))?;
    // Exit so NSIS can replace the running binary
    std::process::exit(0);
}

// ── macOS: open the DMG (Finder mounts it; user drags app to Applications) ───

#[cfg(target_os = "macos")]
fn install_macos_dmg(dmg: &std::path::Path) -> Result<(), String> {
    // `open` mounts the DMG and brings it to the foreground
    std::process::Command::new("open")
        .arg(dmg)
        .spawn()
        .map_err(|e| format!("Failed to open DMG: {e}"))?;
    Ok(())
    // On macOS we do NOT auto-exit — the user drags the .app themselves.
    // A restart prompt in the UI is sufficient.
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    fn write_temp(bytes: &[u8]) -> std::path::PathBuf {
        let mut path = std::env::temp_dir();
        let unique = format!(
            "moodhaven_updater_test_{}_{:?}.bin",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        path.push(unique);
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(bytes).unwrap();
        path
    }

    // ── verify_sha256 ─────────────────────────────────────────────────────────

    #[test]
    fn verify_sha256_correct_checksum_passes() {
        let data = b"moodhaven update payload";
        let expected = hex::encode(Sha256::digest(data));
        let path = write_temp(data);

        let result = verify_sha256(&path, &expected);
        let _ = std::fs::remove_file(&path);

        assert_eq!(result, Ok(true));
    }

    #[test]
    fn verify_sha256_accepts_uppercase_expected_digest() {
        let data = b"case insensitive digest";
        let expected = hex::encode(Sha256::digest(data)).to_uppercase();
        let path = write_temp(data);

        let result = verify_sha256(&path, &expected);
        let _ = std::fs::remove_file(&path);

        assert_eq!(result, Ok(true));
    }

    #[test]
    fn verify_sha256_tampered_byte_is_rejected() {
        let data = b"original payload";
        // Compute the digest of the real file, then flip a byte on disk so the
        // stored digest no longer matches — emulates a tampered download.
        let expected = hex::encode(Sha256::digest(data));
        let mut tampered = data.to_vec();
        tampered[0] ^= 0xFF;
        let path = write_temp(&tampered);

        let result = verify_sha256(&path, &expected);
        let _ = std::fs::remove_file(&path);

        assert!(result.is_err(), "tampered file must not verify");
        assert!(result.unwrap_err().contains("Checksum mismatch"));
    }

    #[test]
    fn verify_sha256_wrong_checksum_string_is_rejected() {
        let data = b"some bytes";
        let path = write_temp(data);

        // A syntactically valid but incorrect 64-char hex digest.
        let wrong = "0".repeat(64);
        let result = verify_sha256(&path, &wrong);
        let _ = std::fs::remove_file(&path);

        assert!(result.is_err());
    }

    #[test]
    fn verify_sha256_empty_checksum_returns_unverified_not_failed() {
        let data = b"no checksum available";
        let path = write_temp(data);

        // Empty expected → Ok(false): "unverified", not an error. The caller
        // (download_and_install_update) is responsible for treating this as a
        // hard failure; verify_sha256 itself must not error.
        let result = verify_sha256(&path, "");
        let _ = std::fs::remove_file(&path);

        assert_eq!(result, Ok(false));
    }

    #[test]
    fn verify_sha256_missing_file_is_io_error() {
        let mut path = std::env::temp_dir();
        path.push("moodhaven_updater_test_does_not_exist.bin");
        let result = verify_sha256(&path, &"a".repeat(64));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Read error"));
    }

    // ── parse_checksum_for_asset (checksums.txt line parsing) ─────────────────

    #[test]
    fn parse_checksum_matches_asset_line() {
        let text = "\
aaaa1111  other-asset.AppImage
bbbb2222  moodhaven-journal_1.2.3_amd64.AppImage
cccc3333  checksums.txt
";
        assert_eq!(
            parse_checksum_for_asset(text, "moodhaven-journal_1.2.3_amd64.AppImage"),
            "bbbb2222"
        );
    }

    #[test]
    fn parse_checksum_returns_empty_when_asset_absent() {
        let text = "aaaa1111  some-other-file.exe\n";
        assert_eq!(parse_checksum_for_asset(text, "missing.AppImage"), "");
    }

    #[test]
    fn parse_checksum_empty_text_returns_empty() {
        assert_eq!(parse_checksum_for_asset("", "anything"), "");
    }

    #[test]
    fn parse_checksum_ignores_malformed_lines() {
        // Lines without the two-space separator must not match or panic.
        let text = "\
not-a-valid-line
deadbeef single-space asset.exe
abc123  target.exe
";
        assert_eq!(parse_checksum_for_asset(text, "target.exe"), "abc123");
        // The single-space line does not split into [digest, name] on "  ".
        assert_eq!(parse_checksum_for_asset(text, "asset.exe"), "");
    }

    #[test]
    fn parse_checksum_trims_trailing_whitespace_on_filename() {
        // sha256sum may emit trailing whitespace / CRLF — filename is trimmed.
        let text = "feedface  app.dmg  \r\n";
        assert_eq!(parse_checksum_for_asset(text, "app.dmg"), "feedface");
    }

    // ── parse_version / is_newer (version gate guarding the download) ─────────

    #[test]
    fn parse_version_handles_v_prefix_and_missing_parts() {
        assert_eq!(parse_version("v1.2.3"), (1, 2, 3));
        assert_eq!(parse_version("1.2.3"), (1, 2, 3));
        assert_eq!(parse_version("v2"), (2, 0, 0));
        assert_eq!(parse_version("garbage"), (0, 0, 0));
    }

    #[test]
    fn is_newer_only_accepts_strictly_greater() {
        assert!(is_newer("v1.2.4", "1.2.3"));
        assert!(is_newer("2.0.0", "1.9.9"));
        assert!(!is_newer("1.2.3", "1.2.3"));
        assert!(!is_newer("1.2.2", "1.2.3"));
    }

    // ── compute_severity (security-update gate) ───────────────────────────────

    #[test]
    fn compute_severity_flags_pre_security_floor_as_security() {
        // Anything below 1.8.0 (the plaintext-DB cohort) is a security update.
        assert_eq!(compute_severity("1.7.5"), "security");
        assert_eq!(compute_severity("1.7.0"), "security");
        assert_eq!(compute_severity("0.9.0"), "security");
        assert_eq!(compute_severity("v1.6.0"), "security");
    }

    #[test]
    fn compute_severity_at_or_above_floor_is_recommended() {
        assert_eq!(compute_severity("1.8.0"), "recommended");
        assert_eq!(compute_severity("1.8.1"), "recommended");
        assert_eq!(compute_severity("2.0.0"), "recommended");
    }

    // ── minisign signature verification (authenticity trust anchor) ───────────
    //
    // These tests synthesize a real minisign keypair + prehashed signature so we
    // exercise the same code path the production updater uses. The compiled-in
    // `MINISIGN_PUBKEY` is a fixed CI key, so `verify_minisign` is parameterised
    // here via a locally generated key for testability; the production wiring is
    // covered by the integration of `load_pubkey()` + `verify()`.

    use blake2::digest::consts::U64;
    use blake2::Blake2b;
    use ed25519_dalek::{Signer, SigningKey};

    /// A self-contained minisign signing fixture mirroring `rsign`/`minisign`:
    /// prehashed (BLAKE2b-512) ed25519 signatures, algorithm `ED` (0x45 0x44).
    struct MinisignFixture {
        pubkey_file: String,
        signing_key: SigningKey,
        key_id: [u8; 8],
    }

    impl MinisignFixture {
        fn generate() -> Self {
            // Deterministic-but-arbitrary key material for the test.
            let secret_bytes: [u8; 32] = [7u8; 32];
            let signing_key = SigningKey::from_bytes(&secret_bytes);
            let verifying = signing_key.verifying_key();
            let key_id: [u8; 8] = [0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6, 0x07, 0x18];

            // Public key file body: algo (ED) + key_id + 32-byte public key.
            let mut pk_bin = Vec::with_capacity(42);
            pk_bin.extend_from_slice(&[0x45, 0x64]); // "Ed" — minisign pubkey algo tag
            pk_bin.extend_from_slice(&key_id);
            pk_bin.extend_from_slice(verifying.as_bytes());
            let pk_b64 = base64::engine::general_purpose::STANDARD.encode(&pk_bin);
            let pubkey_file = format!("untrusted comment: minisign public key\n{pk_b64}\n");

            MinisignFixture {
                pubkey_file,
                signing_key,
                key_id,
            }
        }

        /// Base64-encode the `.pub` file the way `tauri.conf.json` stores it.
        fn pubkey_config_value(&self) -> String {
            base64::engine::general_purpose::STANDARD.encode(self.pubkey_file.as_bytes())
        }

        /// Produce a valid prehashed `.sig` file for `data`.
        fn sign(&self, data: &[u8]) -> String {
            let prehash = <Blake2b<U64> as Digest>::digest(data);

            let sig = self.signing_key.sign(&prehash);
            let mut sig_blob = Vec::with_capacity(74);
            sig_blob.extend_from_slice(&[0x45, 0x44]); // "ED" — prehashed algo tag
            sig_blob.extend_from_slice(&self.key_id);
            sig_blob.extend_from_slice(&sig.to_bytes());

            let trusted_comment = "trusted comment: test fixture";
            let comment_body = "test fixture"; // the part after "trusted comment: "
            let mut global_input = Vec::new();
            global_input.extend_from_slice(&sig.to_bytes());
            global_input.extend_from_slice(comment_body.as_bytes());
            let global_sig = self.signing_key.sign(&global_input);

            let sig_b64 = base64::engine::general_purpose::STANDARD.encode(&sig_blob);
            let global_b64 =
                base64::engine::general_purpose::STANDARD.encode(global_sig.to_bytes());

            format!(
                "untrusted comment: minisign signature\n{sig_b64}\n{trusted_comment}\n{global_b64}\n"
            )
        }
    }

    /// Verify a downloaded file against an explicit pubkey-config value, reusing
    /// the exact decode+verify logic of `verify_minisign` but with a test key.
    fn verify_minisign_with_key(
        path: &std::path::Path,
        sig_text: &str,
        pubkey_config: &str,
    ) -> Result<(), String> {
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(pubkey_config)
            .map_err(|e| format!("pubkey base64: {e}"))?;
        let pub_str = String::from_utf8(decoded).map_err(|e| format!("pubkey utf8: {e}"))?;
        let public_key =
            PublicKey::decode(pub_str.trim()).map_err(|e| format!("pubkey format: {e}"))?;
        let signature =
            Signature::decode(sig_text).map_err(|e| format!("Malformed signature file: {e}"))?;
        let data = std::fs::read(path).map_err(|e| format!("Read error: {e}"))?;
        public_key
            .verify(&data, &signature, false)
            .map_err(|e| format!("Signature verification failed: {e}"))
    }

    #[test]
    fn verify_minisign_valid_signature_passes() {
        let fx = MinisignFixture::generate();
        let data = b"moodhaven verified update payload";
        let sig = fx.sign(data);
        let path = write_temp(data);

        let result = verify_minisign_with_key(&path, &sig, &fx.pubkey_config_value());
        let _ = std::fs::remove_file(&path);

        assert!(result.is_ok(), "valid signature must verify: {result:?}");
    }

    #[test]
    fn verify_minisign_tampered_payload_is_rejected() {
        let fx = MinisignFixture::generate();
        let data = b"original payload";
        let sig = fx.sign(data);

        // Flip a byte on disk — the signature no longer covers these bytes.
        let mut tampered = data.to_vec();
        tampered[0] ^= 0xFF;
        let path = write_temp(&tampered);

        let result = verify_minisign_with_key(&path, &sig, &fx.pubkey_config_value());
        let _ = std::fs::remove_file(&path);

        assert!(result.is_err(), "tampered payload must not verify");
    }

    #[test]
    fn verify_minisign_tampered_signature_is_rejected() {
        let fx = MinisignFixture::generate();
        let data = b"payload with corrupted sig";
        let mut sig = fx.sign(data);
        // Corrupt the base64 signature body line (second line).
        let mut lines: Vec<String> = sig.lines().map(|l| l.to_string()).collect();
        // Flip a character in the signature blob to make it invalid but still decodable.
        let body = &mut lines[1];
        let ch = body.chars().next().unwrap();
        let replacement = if ch == 'A' { 'B' } else { 'A' };
        *body = format!("{replacement}{}", &body[1..]);
        sig = lines.join("\n") + "\n";
        let path = write_temp(data);

        let result = verify_minisign_with_key(&path, &sig, &fx.pubkey_config_value());
        let _ = std::fs::remove_file(&path);

        assert!(result.is_err(), "tampered signature must not verify");
    }

    #[test]
    fn verify_minisign_wrong_key_is_rejected() {
        let signer = MinisignFixture::generate();
        let data = b"signed by key A, verified with key B";
        let sig = signer.sign(data);

        // A different key (different secret material) must reject the signature.
        let mut other = MinisignFixture::generate();
        let other_secret: [u8; 32] = [9u8; 32];
        other.signing_key = SigningKey::from_bytes(&other_secret);
        // Rebuild the pub file for the other key, keeping the signer's key_id so
        // we get past the key_id check and exercise the actual crypto rejection.
        let verifying = other.signing_key.verifying_key();
        let mut pk_bin = Vec::with_capacity(42);
        pk_bin.extend_from_slice(&[0x45, 0x64]);
        pk_bin.extend_from_slice(&signer.key_id);
        pk_bin.extend_from_slice(verifying.as_bytes());
        let pk_b64 = base64::engine::general_purpose::STANDARD.encode(&pk_bin);
        let other_pub_file = format!("untrusted comment: minisign public key\n{pk_b64}\n");
        let other_config =
            base64::engine::general_purpose::STANDARD.encode(other_pub_file.as_bytes());

        let path = write_temp(data);
        let result = verify_minisign_with_key(&path, &sig, &other_config);
        let _ = std::fs::remove_file(&path);

        assert!(result.is_err(), "wrong key must not verify");
    }

    #[test]
    fn verify_minisign_malformed_signature_is_rejected() {
        let fx = MinisignFixture::generate();
        let data = b"payload";
        let path = write_temp(data);

        // A `.sig` that isn't minisign-formatted at all.
        let result = verify_minisign_with_key(&path, "not a signature", &fx.pubkey_config_value());
        let _ = std::fs::remove_file(&path);

        assert!(result.is_err(), "malformed signature must be rejected");
    }

    #[test]
    fn load_pubkey_decodes_compiled_in_key() {
        // The production compiled-in key must always parse.
        let result = load_pubkey();
        assert!(result.is_ok(), "compiled-in pubkey must decode: {result:?}");
    }
}
