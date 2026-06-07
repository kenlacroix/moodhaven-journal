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
//!   - Version gate: only `new > current` is accepted (no rollback)
//!   - No user-supplied URLs are ever followed; all URLs come from the GitHub API
//!     response (repo-owner/repo-name are hardcoded below)
//!
//! Future: add ed25519 signature verification alongside SHA-256 once CI
//!         signing is set up (private key in GitHub Actions secrets, public
//!         key hardcoded in this file).

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

    // Resolve checksum: if the caller passed one, use it; otherwise fetch from checksums.txt
    // (We re-fetch the release assets just for the checksum resolution)
    let checksum = if !expected_checksum.is_empty() {
        expected_checksum.clone()
    } else {
        // Try to pull checksums.txt from the same release
        let rel_url =
            format!("{GITHUB_API_BASE}/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest");
        let rel_resp = client
            .get(&rel_url)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if rel_resp.status().is_success() {
            let release: GitHubRelease = rel_resp.json().await.map_err(|e| e.to_string())?;
            fetch_checksum(&client, &release.assets, &asset_name).await
        } else {
            String::new()
        }
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
    verify_sha256(&tmp_path, &checksum)?;

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
    use std::io::Write as _;

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
}
