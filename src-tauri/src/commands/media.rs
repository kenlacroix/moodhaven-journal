//! Media attachment commands for MoodHaven Journal
//!
//! Handles encrypted file storage for images, PDFs, audio, and video.
//! Files are stored on the filesystem under app_data_dir/media/<entry_id>/
//! using the MBMF (MoodHaven Media File) encrypted format.
//!
//! Format layout (on disk):
//!   [32 bytes: PBKDF2 salt]
//!   [8 bytes:  magic "MBMEDIA1"]
//!   [1 byte:   mode — 0x00 single-pass, 0x01 chunked]
//!   [8 bytes:  original file size, u64 LE]
//!   ... encrypted payload (see mode) ...
//!
//! Single-pass (≤50 MB):
//!   [12 bytes nonce][AES-256-GCM ciphertext + 16-byte tag]
//!
//! Chunked (>50 MB):
//!   [4 bytes: chunk count, u32 LE]
//!   per chunk: [4 bytes: encrypted chunk len, u32 LE][12 bytes nonce][ciphertext + tag]

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use pbkdf2::pbkdf2_hmac;
use rand::{rngs::OsRng, RngCore};
use rusqlite::params;
use sha2::Sha256;
use std::path::Path;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::db::Database;
use crate::AppLockState;

const MAX_MEDIA_BYTES: u64 = 500 * 1024 * 1024; // 500 MB hard cap

use super::require_unlocked;

// ── Constants ─────────────────────────────────────────────────────────────────

const MBMF_MAGIC: &[u8; 8] = b"MBMEDIA1";
const SALT_LEN: usize = 32;
const NONCE_LEN: usize = 12;
const CHUNK_SIZE: usize = 4 * 1024 * 1024; // 4 MB per chunk
const SINGLE_PASS_LIMIT: u64 = 50 * 1024 * 1024; // 50 MB threshold
const PBKDF2_ROUNDS: u32 = 600_000;

// ── Public types ───────────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MediaAttachment {
    pub id: String,
    pub entry_id: String,
    pub filename: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub enc_path: String,
    pub created_at: String,
}

// ── Crypto helpers ─────────────────────────────────────────────────────────────

/// Derive a 256-bit AES key from a password + salt using PBKDF2-HMAC-SHA256.
fn derive_key(password: &str, salt: &[u8]) -> Zeroizing<[u8; 32]> {
    let mut key = Zeroizing::new([0u8; 32]);
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, PBKDF2_ROUNDS, &mut *key);
    key
}

/// Encrypt `plaintext` with AES-256-GCM. Returns `nonce || ciphertext+tag`.
fn aes_encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("Cipher init: {}", e))?;
    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("Encrypt: {}", e))?;
    let mut out = Vec::with_capacity(NONCE_LEN + ct.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    Ok(out)
}

/// Decrypt `nonce || ciphertext+tag` with AES-256-GCM.
fn aes_decrypt(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < NONCE_LEN {
        return Err("Data too short".to_string());
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("Cipher init: {}", e))?;
    let nonce = Nonce::from_slice(&data[..NONCE_LEN]);
    cipher
        .decrypt(nonce, &data[NONCE_LEN..])
        .map_err(|_| "Decryption failed — wrong password or corrupted file".to_string())
}

/// Build the complete MBMF on-disk bytes from plaintext.
fn encrypt_to_mbmf(plaintext: &[u8], password: &str) -> Result<Vec<u8>, String> {
    let mut salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);
    let key = derive_key(password, &salt);
    let orig_size = plaintext.len() as u64;

    let mut out: Vec<u8> = Vec::new();
    out.extend_from_slice(&salt);
    out.extend_from_slice(MBMF_MAGIC);

    if orig_size <= SINGLE_PASS_LIMIT {
        out.push(0x00);
        out.extend_from_slice(&orig_size.to_le_bytes());
        let encrypted = aes_encrypt(&key, plaintext)?;
        out.extend_from_slice(&encrypted);
    } else {
        out.push(0x01);
        out.extend_from_slice(&orig_size.to_le_bytes());
        let chunks: Vec<&[u8]> = plaintext.chunks(CHUNK_SIZE).collect();
        out.extend_from_slice(&(chunks.len() as u32).to_le_bytes());
        for chunk in chunks {
            let encrypted = aes_encrypt(&key, chunk)?;
            out.extend_from_slice(&(encrypted.len() as u32).to_le_bytes());
            out.extend_from_slice(&encrypted);
        }
    }
    Ok(out)
}

/// Decrypt MBMF bytes back to the original plaintext.
fn decrypt_mbmf(data: &[u8], password: &str) -> Result<Vec<u8>, String> {
    const HDR: usize = SALT_LEN + 8 + 1 + 8; // salt + magic + mode + orig_size
    if data.len() < HDR {
        return Err("File too short to be a valid MBMF file".to_string());
    }
    let salt = &data[..SALT_LEN];
    if &data[SALT_LEN..SALT_LEN + 8] != MBMF_MAGIC {
        return Err("Not a MoodHaven media file (bad magic)".to_string());
    }
    let mode = data[SALT_LEN + 8];
    let orig_size = u64::from_le_bytes(data[SALT_LEN + 9..SALT_LEN + 17].try_into().unwrap());
    let payload = &data[SALT_LEN + 17..];
    let key = derive_key(password, salt);

    match mode {
        0x00 => {
            let pt = aes_decrypt(&key, payload)?;
            if pt.len() as u64 != orig_size {
                return Err("Size mismatch after decryption".to_string());
            }
            Ok(pt)
        }
        0x01 => {
            if payload.len() < 4 {
                return Err("Malformed chunked file".to_string());
            }
            let chunk_count = u32::from_le_bytes(payload[..4].try_into().unwrap()) as usize;
            let mut pos = 4;
            let mut result: Vec<u8> = Vec::with_capacity(orig_size as usize);
            for _ in 0..chunk_count {
                if pos + 4 > payload.len() {
                    return Err("Unexpected end of chunk index".to_string());
                }
                let chunk_len =
                    u32::from_le_bytes(payload[pos..pos + 4].try_into().unwrap()) as usize;
                pos += 4;
                if pos + chunk_len > payload.len() {
                    return Err("Chunk data truncated".to_string());
                }
                let decrypted = aes_decrypt(&key, &payload[pos..pos + chunk_len])?;
                result.extend_from_slice(&decrypted);
                pos += chunk_len;
            }
            Ok(result)
        }
        _ => Err(format!("Unknown MBMF mode: 0x{:02x}", mode)),
    }
}

/// Re-encrypt one MBMF blob from `old_password` to `new_password` — the pure transform
/// behind `change_master_password`'s media step (active-plans/change-password.md §4.5).
/// Decrypts under the old key and re-encrypts under a fresh per-file salt/key derived
/// from the new password. Pure and side-effect-free so it can be unit-tested in isolation;
/// the orchestrator wraps it with stage-then-rename + per-file progress for crash-safety.
#[allow(dead_code)] // wired up by change_master_password in the implementation pass (§4.5)
pub(crate) fn reencrypt_mbmf(
    data: &[u8],
    old_password: &str,
    new_password: &str,
) -> Result<Vec<u8>, String> {
    let plaintext = decrypt_mbmf(data, old_password)?;
    encrypt_to_mbmf(&plaintext, new_password)
}

/// Suffix appended to a media file's on-disk path while its re-encrypted copy is staged
/// but not yet promoted over the original. A `<file>.rekeytmp` sibling is the on-disk
/// record of "this file's NEW-password copy exists but the rename hasn't happened yet" —
/// the discriminator both the keyless forward-finish and the rollback scan use.
pub(crate) const STAGING_SUFFIX: &str = ".rekeytmp";

/// Visit every staging file (`*.rekeytmp`) under `<app_data_dir>/media/`. Media live at
/// `media/<entry_id>/<file>.enc`, so staging files are one directory deep; we walk the
/// two-level tree without recursion. Taking `app_data_dir` (not an `AppHandle`) lets the
/// db-layer crash recovery — which only has `self.path` — drive the same keyless finish.
fn for_each_staging_file(app_data_dir: &Path, mut f: impl FnMut(&Path)) -> Result<(), String> {
    let root = app_data_dir.join("media");
    let Ok(entries) = std::fs::read_dir(&root) else {
        return Ok(()); // no media dir yet → nothing staged
    };
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        if let Ok(files) = std::fs::read_dir(&dir) {
            for file in files.flatten() {
                let p = file.path();
                if p.to_string_lossy().ends_with(STAGING_SUFFIX) {
                    f(&p);
                }
            }
        }
    }
    Ok(())
}

/// Stage re-encryption of every media file from `old_password` to `new_password` — the
/// KEYED, reversible first half of `change_master_password`'s media step (§4.5). For each
/// `entry_media` row: read the MBMF bytes → [`reencrypt_mbmf`] → write to a `<file>.rekeytmp`
/// staging sibling → fsync. Originals are left completely untouched, so a crash anywhere in
/// here leaves only orphan staging files (cleaned by [`cleanup_media_staging`]) and the live
/// data wholly on the old password. The actual swap is the keyless [`finish_media_renames`],
/// run only AFTER the atomic DB flip. Returns the number of files staged. `progress(done,total)`
/// is invoked after each file for the FE progress UI.
pub(crate) fn stage_reencrypt_media(
    app_data_dir: &Path,
    db: &Database,
    old_password: &str,
    new_password: &str,
    mut progress: impl FnMut(usize, usize),
) -> Result<usize, String> {
    // Snapshot the file list under a brief lock, then release it before touching the FS.
    let rel_paths: Vec<String> = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT enc_path FROM entry_media ORDER BY id ASC")
            .map_err(|e| format!("prepare media list: {e}"))?;
        let rows: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| format!("query media list: {e}"))?
            .filter_map(|r| r.ok())
            .collect();
        rows
    };

    let total = rel_paths.len();
    for (i, rel) in rel_paths.iter().enumerate() {
        let orig = abs_enc_path_in(app_data_dir, rel)?;
        // A missing file is not fatal: the DB row may reference a file deleted out-of-band.
        // Skip it rather than abort the whole change.
        if !orig.exists() {
            progress(i + 1, total);
            continue;
        }
        let data = std::fs::read(&orig).map_err(|e| format!("read media {rel}: {e}"))?;
        let reencrypted = reencrypt_mbmf(&data, old_password, new_password)?;
        let staging = staging_path(&orig);
        {
            let mut f = std::fs::File::create(&staging)
                .map_err(|e| format!("create staging {}: {e}", staging.display()))?;
            use std::io::Write;
            f.write_all(&reencrypted)
                .map_err(|e| format!("write staging {}: {e}", staging.display()))?;
            f.sync_all()
                .map_err(|e| format!("fsync staging {}: {e}", staging.display()))?;
        }
        progress(i + 1, total);
    }
    Ok(total)
}

/// The `<file>.rekeytmp` staging sibling for an original media path.
fn staging_path(orig: &Path) -> std::path::PathBuf {
    let mut s = orig.as_os_str().to_os_string();
    s.push(STAGING_SUFFIX);
    std::path::PathBuf::from(s)
}

/// Promote every staged `*.rekeytmp` over its original — the KEYLESS, idempotent second half
/// of the media step (§4.5), run only AFTER the atomic DB flip. Renames need no key (the
/// staged bytes are already re-encrypted under the new password), so this is exactly the work
/// startup recovery can finish unattended after a post-commit crash. Returns the count renamed.
pub(crate) fn finish_media_renames(app_data_dir: &Path) -> Result<usize, String> {
    let mut to_rename: Vec<std::path::PathBuf> = Vec::new();
    for_each_staging_file(app_data_dir, |p| to_rename.push(p.to_path_buf()))?;
    let mut n = 0usize;
    for staging in to_rename {
        let orig = staging
            .to_string_lossy()
            .strip_suffix(STAGING_SUFFIX)
            .map(std::path::PathBuf::from)
            .ok_or("staging path lost its suffix")?;
        std::fs::rename(&staging, &orig)
            .map_err(|e| format!("promote media {}: {e}", orig.display()))?;
        n += 1;
    }
    Ok(n)
}

/// Delete every staged `*.rekeytmp` — the rollback when a change is abandoned BEFORE the DB
/// flip (originals are still the live, old-password data). Keyless and idempotent. Returns the
/// count removed.
pub(crate) fn cleanup_media_staging(app_data_dir: &Path) -> Result<usize, String> {
    let mut to_remove: Vec<std::path::PathBuf> = Vec::new();
    for_each_staging_file(app_data_dir, |p| to_remove.push(p.to_path_buf()))?;
    let mut n = 0usize;
    for staging in to_remove {
        if std::fs::remove_file(&staging).is_ok() {
            n += 1;
        }
    }
    Ok(n)
}

// ── Filesystem helpers ─────────────────────────────────────────────────────────

/// Returns Ok(()) if entry_id is safe to use as a path component, Err otherwise.
/// Extracted from get_media_dir for unit testing.
pub(crate) fn validate_entry_id(entry_id: &str) -> Result<(), String> {
    if entry_id.is_empty()
        || entry_id.contains('/')
        || entry_id.contains('\\')
        || entry_id.contains('\0')
        || entry_id.contains(':')
        || entry_id == ".."
        || entry_id.starts_with('.')
    {
        return Err(format!(
            "Invalid entry_id for media directory: {:?}",
            entry_id
        ));
    }
    Ok(())
}

fn get_media_dir(app: &AppHandle, entry_id: &str) -> Result<std::path::PathBuf, String> {
    validate_entry_id(entry_id)?;

    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))?;
    let dir = base.join("media").join(entry_id);

    // Canonicalize and verify containment — mirrors the abs_enc_path pattern.
    // canonicalize() fails if the path doesn't exist yet; fall back to the
    // non-canonical path and re-verify after create_dir_all.
    let base_canonical = base.canonicalize().unwrap_or_else(|_| base.clone());
    if let Ok(canonical) = dir.canonicalize() {
        if !canonical.starts_with(&base_canonical) {
            return Err("Refusing to access path outside app data directory".to_string());
        }
    }

    std::fs::create_dir_all(&dir).map_err(|e| format!("create_dir_all: {}", e))?;

    // Re-verify after the directory is created.
    let canonical = dir
        .canonicalize()
        .map_err(|e| format!("canonicalize media dir: {}", e))?;
    if !canonical.starts_with(&base_canonical) {
        let _ = std::fs::remove_dir(&canonical);
        return Err("Refusing to access path outside app data directory".to_string());
    }

    Ok(canonical)
}

fn get_preview_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("app_cache_dir: {}", e))?
        .join("mb_preview");
    std::fs::create_dir_all(&dir).map_err(|e| format!("create_dir_all: {}", e))?;
    Ok(dir)
}

fn abs_enc_path(app: &AppHandle, rel_path: &str) -> Result<std::path::PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))?;
    let joined = base.join(rel_path);

    // Reject paths containing `..` at the component level.  This must be done
    // before the canonicalize fallback, because when the target file does not
    // yet exist, `canonicalize()` fails and we fall back to the raw `joined`
    // path.  `starts_with()` on raw paths is a string-prefix check, not a
    // semantic containment check — "app_data/../evil" would pass it.  Checking
    // components explicitly closes this gap without requiring the path to exist.
    use std::path::Component;
    if joined.components().any(|c| c == Component::ParentDir) {
        return Err(
            "Refusing to access path containing '..' components outside app data directory"
                .to_string(),
        );
    }

    // Canonicalize to resolve symlinks if the file already exists.
    let base_canonical = base.canonicalize().unwrap_or(base.clone());
    let canonical = joined.canonicalize().unwrap_or_else(|_| joined.clone());
    if !canonical.starts_with(&base_canonical) {
        return Err("Refusing to access path outside app data directory".to_string());
    }
    Ok(canonical)
}

/// Resolve a stored `enc_path` (e.g. `media/<entry>/<file>.enc`) against an explicit
/// `app_data_dir`, rejecting `..` traversal — the `AppHandle`-free variant of
/// [`abs_enc_path`] used by the change-password media staging and the db-layer crash
/// recovery (which only have a directory path, not an `AppHandle`).
fn abs_enc_path_in(app_data_dir: &Path, rel_path: &str) -> Result<std::path::PathBuf, String> {
    use std::path::Component;
    let joined = app_data_dir.join(rel_path);
    if joined.components().any(|c| c == Component::ParentDir) {
        return Err("Refusing to access media path with '..' components".to_string());
    }
    Ok(joined)
}

fn mime_from_filename(filename: &str) -> &'static str {
    let ext = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "heic" | "heif" => "image/heic",
        "pdf" => "application/pdf",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        _ => "application/octet-stream",
    }
}

// ── Tauri commands ─────────────────────────────────────────────────────────────

/// Attach a file to an entry.
/// Reads from `file_path`, encrypts with the master password, and stores under
/// `app_data_dir/media/<entry_id>/`. Returns the metadata record.
#[tauri::command]
pub fn save_media_attachment(
    app: AppHandle,
    db: State<'_, Database>,
    lock: State<'_, AppLockState>,
    rekey: State<'_, crate::RekeyInProgress>,
    entry_id: String,
    file_path: String,
    password: String,
) -> Result<MediaAttachment, String> {
    require_unlocked(&lock)?;
    super::require_no_rekey(&rekey)?;
    let src = Path::new(&file_path);
    let filename = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid file path — no filename")?
        .to_string();
    let extension = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin")
        .to_ascii_lowercase();
    let mime_type = mime_from_filename(&filename).to_string();

    // Reject files that are too large before reading them into memory.
    let file_size = std::fs::metadata(src).map(|m| m.len()).unwrap_or(0);
    if file_size > MAX_MEDIA_BYTES {
        return Err(format!(
            "File too large ({} MB, max {} MB)",
            file_size / (1024 * 1024),
            MAX_MEDIA_BYTES / (1024 * 1024)
        ));
    }

    let plaintext =
        std::fs::read(src).map_err(|e| format!("Failed to read '{}': {}", filename, e))?;
    let size_bytes = plaintext.len() as i64;

    let encrypted = encrypt_to_mbmf(&plaintext, &password)?;
    drop(plaintext);

    let media_id = Uuid::new_v4().to_string();
    let enc_filename = format!("{}.{}.enc", media_id, extension);
    let media_dir = get_media_dir(&app, &entry_id)?;
    let enc_abs = media_dir.join(&enc_filename);

    std::fs::write(&enc_abs, &encrypted)
        .map_err(|e| format!("Failed to write encrypted file: {}", e))?;

    let rel_path = format!("media/{}/{}", entry_id, enc_filename);
    let created_at = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO entry_media \
             (id, entry_id, filename, mime_type, size_bytes, enc_path, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![media_id, entry_id, filename, mime_type, size_bytes, rel_path, created_at],
        )
        .map_err(|e| format!("DB insert failed: {}", e))?;
    }

    Ok(MediaAttachment {
        id: media_id,
        entry_id,
        filename,
        mime_type,
        size_bytes,
        enc_path: rel_path,
        created_at,
    })
}

/// Return all media attachments for a journal entry, ordered by creation time.
#[tauri::command]
pub fn list_entry_media(
    db: State<'_, Database>,
    lock: State<'_, AppLockState>,
    entry_id: String,
) -> Result<Vec<MediaAttachment>, String> {
    require_unlocked(&lock)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, entry_id, filename, mime_type, size_bytes, enc_path, created_at \
             FROM entry_media WHERE entry_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| format!("Prepare: {}", e))?;

    let rows: Vec<MediaAttachment> = stmt
        .query_map(params![entry_id], |row| {
            Ok(MediaAttachment {
                id: row.get(0)?,
                entry_id: row.get(1)?,
                filename: row.get(2)?,
                mime_type: row.get(3)?,
                size_bytes: row.get(4)?,
                enc_path: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

/// Decrypt a media file to a temp location and open it with the system viewer.
/// The temp file is automatically deleted after 60 seconds.
#[tauri::command]
pub fn open_media_attachment(
    app: AppHandle,
    db: State<'_, Database>,
    lock: State<'_, AppLockState>,
    media_id: String,
    password: String,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    let (enc_path, filename) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT enc_path, filename FROM entry_media WHERE id = ?1",
            params![media_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|_| format!("Media not found: {}", media_id))?
    };

    let encrypted = std::fs::read(abs_enc_path(&app, &enc_path)?)
        .map_err(|e| format!("Read encrypted file: {}", e))?;
    let plaintext = decrypt_mbmf(&encrypted, &password)?;

    let preview_dir = get_preview_dir(&app)?;
    let temp_name = format!("{}_{}", Uuid::new_v4(), filename);
    let temp_path = preview_dir.join(&temp_name);
    std::fs::write(&temp_path, &plaintext).map_err(|e| format!("Write temp file: {}", e))?;

    // Open with platform default viewer
    let _temp_str = temp_path.to_str().ok_or("Non-UTF8 temp path")?.to_string();

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&_temp_str)
        .spawn()
        .map_err(|e| format!("open: {}", e))?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &_temp_str])
        .spawn()
        .map_err(|e| format!("start: {}", e))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&_temp_str)
        .spawn()
        .map_err(|e| format!("xdg-open: {}", e))?;

    // Auto-cleanup after 10 s
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(10));
        let _ = std::fs::remove_file(&temp_path);
    });

    Ok(())
}

/// Decrypt an image attachment and return a base64-encoded JPEG thumbnail
/// (max 400×400 px). Returns an error for non-image MIME types.
#[tauri::command]
pub fn get_media_thumbnail(
    app: AppHandle,
    db: State<'_, Database>,
    lock: State<'_, AppLockState>,
    media_id: String,
    password: String,
) -> Result<String, String> {
    require_unlocked(&lock)?;
    let (enc_path, mime_type) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT enc_path, mime_type FROM entry_media WHERE id = ?1",
            params![media_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|_| format!("Media not found: {}", media_id))?
    };

    if !mime_type.starts_with("image/") {
        return Err("Not an image attachment".to_string());
    }

    let encrypted = std::fs::read(abs_enc_path(&app, &enc_path)?)
        .map_err(|e| format!("Read encrypted file: {}", e))?;
    let plaintext = decrypt_mbmf(&encrypted, &password)?;

    let img = image::load_from_memory(&plaintext).map_err(|e| format!("Decode image: {}", e))?;

    let thumb = img.thumbnail(400, 400).to_rgb8();

    let mut jpeg_bytes: Vec<u8> = Vec::new();
    use image::codecs::jpeg::JpegEncoder;
    use image::ExtendedColorType;
    JpegEncoder::new_with_quality(&mut jpeg_bytes, 80)
        .encode(
            thumb.as_raw(),
            thumb.width(),
            thumb.height(),
            ExtendedColorType::Rgb8,
        )
        .map_err(|e| format!("JPEG encode: {}", e))?;

    Ok(STANDARD.encode(&jpeg_bytes))
}

/// Delete a media attachment — removes the encrypted file and the DB record.
#[tauri::command]
pub fn delete_media_attachment(
    app: AppHandle,
    db: State<'_, Database>,
    lock: State<'_, AppLockState>,
    media_id: String,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    let enc_path = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT enc_path FROM entry_media WHERE id = ?1",
            params![media_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|_| format!("Media not found: {}", media_id))?
    };

    let abs = abs_enc_path(&app, &enc_path)?;
    if abs.exists() {
        std::fs::remove_file(&abs).map_err(|e| format!("Delete file: {}", e))?;
    }

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM entry_media WHERE id = ?1", params![media_id])
            .map_err(|e| format!("DB delete: {}", e))?;
    }

    Ok(())
}

/// List every media attachment across all entries (used during WebDAV sync).
#[tauri::command]
pub fn list_all_media(
    db: State<'_, Database>,
    lock: State<'_, AppLockState>,
) -> Result<Vec<MediaAttachment>, String> {
    require_unlocked(&lock)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, entry_id, filename, mime_type, size_bytes, enc_path, created_at \
             FROM entry_media ORDER BY created_at ASC",
        )
        .map_err(|e| format!("Prepare: {}", e))?;

    let rows: Vec<MediaAttachment> = stmt
        .query_map([], |row| {
            Ok(MediaAttachment {
                id: row.get(0)?,
                entry_id: row.get(1)?,
                filename: row.get(2)?,
                mime_type: row.get(3)?,
                size_bytes: row.get(4)?,
                enc_path: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

/// For sync: read the raw encrypted MBMF bytes of a media file and return them
/// as a base64-encoded JSON payload. The bytes are NOT decrypted — we transfer
/// the already-encrypted file so the receiving device can store it as-is.
/// Any device with the same password can decrypt with `decrypt_mbmf`.
#[tauri::command]
pub fn read_media_for_sync(
    app: AppHandle,
    db: State<'_, Database>,
    lock: State<'_, AppLockState>,
    media_id: String,
) -> Result<serde_json::Value, String> {
    require_unlocked(&lock)?;
    let (entry_id, filename, mime_type, size_bytes, enc_path, created_at) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT entry_id, filename, mime_type, size_bytes, enc_path, created_at \
             FROM entry_media WHERE id = ?1",
            params![media_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .map_err(|_| format!("Media not found: {}", media_id))?
    };

    let bytes = std::fs::read(abs_enc_path(&app, &enc_path)?)
        .map_err(|e| format!("Cannot read media file: {}", e))?;

    Ok(serde_json::json!({
        "id": media_id,
        "entryId": entry_id,
        "filename": filename,
        "mimeType": mime_type,
        "sizeBytes": size_bytes,
        "createdAt": created_at,
        "dataBase64": STANDARD.encode(&bytes),
    }))
}

/// For sync: receive an encrypted media file from another device, write it to
/// disk under `app_data_dir/media/<entry_id>/`, and insert the DB record.
/// Uses `INSERT OR IGNORE` so this is idempotent on repeated sync runs.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn write_media_from_sync(
    app: AppHandle,
    db: State<'_, Database>,
    lock: State<'_, AppLockState>,
    rekey: State<'_, crate::RekeyInProgress>,
    entry_id: String,
    media_id: String,
    filename: String,
    mime_type: String,
    size_bytes: i64,
    created_at: String,
    data_base64: String,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    super::require_no_rekey(&rekey)?;
    // `media_id` comes from an untrusted peer's media manifest and is interpolated
    // into the on-disk filename — validate it as a safe path component (same rules
    // as entry_id) to block traversal writes outside the media directory.
    validate_entry_id(&media_id)
        .map_err(|e| format!("write_media_from_sync: invalid media_id: {e}"))?;
    // Idempotency: skip if this media ID already exists locally
    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM entry_media WHERE id = ?1",
                params![media_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            > 0;
        if exists {
            return Ok(());
        }
    }

    let bytes = STANDARD
        .decode(&data_base64)
        .map_err(|e| format!("Base64 decode: {}", e))?;

    let ext = std::path::Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin")
        .to_ascii_lowercase();
    let enc_filename = format!("{}.{}.enc", media_id, ext);
    let media_dir = get_media_dir(&app, &entry_id)?;
    let enc_abs = media_dir.join(&enc_filename);
    let rel_path = format!("media/{}/{}", entry_id, enc_filename);

    std::fs::write(&enc_abs, &bytes).map_err(|e| format!("Write media file: {}", e))?;

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR IGNORE INTO entry_media \
             (id, entry_id, filename, mime_type, size_bytes, enc_path, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![media_id, entry_id, filename, mime_type, size_bytes, rel_path, created_at],
        )
        .map_err(|e| format!("DB insert: {}", e))?;
    }

    Ok(())
}

/// Sweep the preview temp directory and delete any leftover files.
/// Called on app startup to clean up files from previous sessions.
#[tauri::command]
pub fn sweep_preview_temp(app: AppHandle) -> Result<(), String> {
    let preview_dir = get_preview_dir(&app)?;
    if let Ok(entries) = std::fs::read_dir(&preview_dir) {
        for entry in entries.flatten() {
            let _ = std::fs::remove_file(entry.path());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_entry_id;

    #[test]
    fn valid_uuid_accepted() {
        assert!(validate_entry_id("550e8400-e29b-41d4-a716-446655440000").is_ok());
    }

    #[test]
    fn valid_alphanum_accepted() {
        assert!(validate_entry_id("abc123XYZ").is_ok());
    }

    #[test]
    fn empty_rejected() {
        assert!(validate_entry_id("").is_err());
    }

    #[test]
    fn slash_rejected() {
        assert!(validate_entry_id("../../etc").is_err());
    }

    #[test]
    fn backslash_rejected() {
        assert!(validate_entry_id("..\\etc").is_err());
    }

    #[test]
    fn null_byte_rejected() {
        assert!(validate_entry_id("evil\0id").is_err());
    }

    #[test]
    fn colon_rejected() {
        assert!(validate_entry_id("NUL:COM1").is_err());
    }

    #[test]
    fn dot_dot_rejected() {
        assert!(validate_entry_id("..").is_err());
    }

    #[test]
    fn dot_prefix_rejected() {
        assert!(validate_entry_id(".hidden").is_err());
    }

    #[test]
    fn path_traversal_rejected() {
        assert!(validate_entry_id("evil/../../../etc/passwd").is_err());
    }
}
