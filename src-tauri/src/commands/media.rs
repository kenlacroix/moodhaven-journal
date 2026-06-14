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

/// Reject a frontend-supplied filename that isn't a bare name.
/// Defense-in-depth before the name reaches any path join: no separators, no `..`.
fn reject_unsafe_filename(filename: &str) -> Result<(), String> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Invalid filename".to_string());
    }
    Ok(())
}

/// Reject media larger than the hard cap, mirroring the path-based command.
fn enforce_media_size_limit(len: usize) -> Result<(), String> {
    if len as u64 > MAX_MEDIA_BYTES {
        return Err(format!(
            "File too large ({} MB, max {} MB)",
            len as u64 / (1024 * 1024),
            MAX_MEDIA_BYTES / (1024 * 1024)
        ));
    }
    Ok(())
}

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

// ── Image compression ───────────────────────────────────────────────────────────

/// Longest-edge cap (px) applied to stored images. A journal is text-first; full-res
/// phone photos (4000px+) bloat the encrypted store with no viewing benefit.
const MAX_IMAGE_EDGE: u32 = 2048;
/// JPEG quality for re-encoded photos — visually lossless at typical viewing sizes.
const JPEG_QUALITY: u8 = 82;

/// Recompress an image before encryption: downscale to [`MAX_IMAGE_EDGE`] on the longest
/// side and re-encode in the *same* format. When recompression happens, encoding from decoded
/// raw pixels also strips EXIF/GPS metadata (a best-effort privacy win — the pass-through
/// cases below keep the original bytes, metadata included). Format is preserved so the
/// stored filename, extension, and MIME type stay correct — JPEG→JPEG (quality-capped),
/// PNG→PNG (lossless).
///
/// Returns `None` to mean "store the original unchanged": the MIME type isn't a format we
/// recompress (GIF may be animated, WebP is already efficient, non-images), decoding fails,
/// or the recompressed bytes wouldn't be smaller — we never inflate the stored blob.
fn compress_image(data: &[u8], mime_type: &str) -> Option<Vec<u8>> {
    let fmt = match mime_type {
        "image/jpeg" => image::ImageFormat::Jpeg,
        "image/png" => image::ImageFormat::Png,
        _ => return None,
    };

    let img = image::load_from_memory_with_format(data, fmt).ok()?;
    let scaled = if img.width().max(img.height()) > MAX_IMAGE_EDGE {
        // thumbnail() preserves aspect ratio and fits within the box.
        img.thumbnail(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE)
    } else {
        img
    };

    let mut out: Vec<u8> = Vec::new();
    match fmt {
        image::ImageFormat::Jpeg => {
            use image::codecs::jpeg::JpegEncoder;
            use image::ExtendedColorType;
            let rgb = scaled.to_rgb8();
            JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY)
                .encode(
                    rgb.as_raw(),
                    rgb.width(),
                    rgb.height(),
                    ExtendedColorType::Rgb8,
                )
                .ok()?;
        }
        image::ImageFormat::Png => {
            scaled
                .write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
                .ok()?;
        }
        _ => return None,
    }

    (out.len() < data.len()).then_some(out)
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

    // Recompress images (downscale + re-encode in the same format) before encryption.
    // Shrinks the encrypted store and strips EXIF/GPS metadata; falls back to the original
    // bytes for non-images, undecodable input, or when compression wouldn't save space.
    let plaintext = match compress_image(&plaintext, &mime_type) {
        Some(compressed) => compressed,
        None => plaintext,
    };
    let size_bytes = plaintext.len() as i64;

    let encrypted = encrypt_to_mbmf(&plaintext, &password)?;
    drop(plaintext);

    let media_id = Uuid::new_v4().to_string();
    let enc_filename = format!("{}.{}.enc", media_id, extension);

    persist_prepared_media(
        &app,
        &db,
        entry_id,
        filename,
        PreparedMedia {
            media_id,
            enc_filename,
            mime_type,
            size_bytes,
            encrypted,
        },
    )
}

/// The side-effect-free result of preparing a base64 media payload for storage:
/// the encrypted on-disk bytes plus the derived metadata the command needs to
/// place the file and write the DB row. Holds no Tauri state, so the whole
/// decode → validate → compress → encrypt pipeline is unit-testable in isolation.
#[cfg_attr(test, derive(Debug))]
struct PreparedMedia {
    media_id: String,
    enc_filename: String,
    mime_type: String,
    size_bytes: i64,
    encrypted: Vec<u8>,
}

/// Pure core of `save_media_attachment_bytes`: decode base64, reject unsafe
/// filenames, enforce the size limit, recompress images, and encrypt to MBMF.
/// No filesystem or DB access — those stay in the thin command wrapper so this
/// can be exercised directly by tests.
fn prepare_media_bytes(
    filename: &str,
    data_base64: &str,
    password: &str,
) -> Result<PreparedMedia, String> {
    // Defense-in-depth: `filename` comes from the frontend, so reject anything
    // that isn't a bare filename before it reaches path joins.
    reject_unsafe_filename(filename)?;

    let extension = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin")
        .to_ascii_lowercase();
    let mime_type = mime_from_filename(filename).to_string();

    let plaintext = STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|e| format!("Invalid base64 media data: {e}"))?;

    // Enforce the same size limit as the path-based command.
    enforce_media_size_limit(plaintext.len())?;

    // Recompress images (downscale + re-encode in the same format) before encryption.
    // Shrinks the encrypted store and strips EXIF/GPS metadata; falls back to the original
    // bytes for non-images, undecodable input, or when compression wouldn't save space.
    let plaintext = match compress_image(&plaintext, &mime_type) {
        Some(compressed) => compressed,
        None => plaintext,
    };
    let size_bytes = plaintext.len() as i64;

    let encrypted = encrypt_to_mbmf(&plaintext, password)?;
    drop(plaintext);

    let media_id = Uuid::new_v4().to_string();
    let enc_filename = format!("{}.{}.enc", media_id, extension);

    Ok(PreparedMedia {
        media_id,
        enc_filename,
        mime_type,
        size_bytes,
        encrypted,
    })
}

/// Attach a file to an entry from in-memory base64 bytes.
/// Used on Android, where the system file picker returns a non-readable
/// `content://` URI rather than a filesystem path; the frontend reads the bytes
/// and passes them as base64. Mirrors `save_media_attachment` but decodes bytes
/// instead of reading from disk. The pure pipeline lives in `prepare_media_bytes`;
/// this wrapper only wires Tauri state (file write + DB insert).
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn save_media_attachment_bytes(
    app: AppHandle,
    db: State<'_, Database>,
    lock: State<'_, AppLockState>,
    rekey: State<'_, crate::RekeyInProgress>,
    entry_id: String,
    filename: String,
    data_base64: String,
    password: String,
) -> Result<MediaAttachment, String> {
    require_unlocked(&lock)?;
    super::require_no_rekey(&rekey)?;

    let prepared = prepare_media_bytes(&filename, &data_base64, &password)?;
    persist_prepared_media(&app, &db, entry_id, filename, prepared)
}

/// Shared persistence tail for both `save_media_attachment` (disk path) and
/// `save_media_attachment_bytes` (Android base64): resolve the per-entry media
/// directory, write the encrypted blob, insert the DB row, and build the
/// `MediaAttachment` response. The relative-path + DB-row construction is split
/// into the pure `build_media_row` helper so it is unit-testable.
fn persist_prepared_media(
    app: &AppHandle,
    db: &Database,
    entry_id: String,
    filename: String,
    prepared: PreparedMedia,
) -> Result<MediaAttachment, String> {
    let media_dir = get_media_dir(app, &entry_id)?;
    let enc_abs = media_dir.join(&prepared.enc_filename);

    std::fs::write(&enc_abs, &prepared.encrypted)
        .map_err(|e| format!("Failed to write encrypted file: {}", e))?;

    let attachment = build_media_row(entry_id, filename, &prepared);

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO entry_media \
             (id, entry_id, filename, mime_type, size_bytes, enc_path, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                attachment.id,
                attachment.entry_id,
                attachment.filename,
                attachment.mime_type,
                attachment.size_bytes,
                attachment.enc_path,
                attachment.created_at,
            ],
        )
        .map_err(|e| format!("DB insert failed: {}", e))?;
    }

    Ok(attachment)
}

/// Build the `MediaAttachment` row from prepared media: derives the stored
/// relative path and a `created_at` timestamp. Pure (no filesystem/DB), so the
/// rel-path and metadata wiring is exercised directly in tests.
fn build_media_row(
    entry_id: String,
    filename: String,
    prepared: &PreparedMedia,
) -> MediaAttachment {
    let enc_path = format!("media/{}/{}", entry_id, prepared.enc_filename);
    let created_at = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    MediaAttachment {
        id: prepared.media_id.clone(),
        entry_id,
        filename,
        mime_type: prepared.mime_type.clone(),
        size_bytes: prepared.size_bytes,
        enc_path,
        created_at,
    }
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
        .query_map(params![entry_id], media_row_from_sql)
        .map_err(|e| format!("Query: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

/// Map a `SELECT id, entry_id, filename, mime_type, size_bytes, enc_path,
/// created_at FROM entry_media` row into a `MediaAttachment`. Shared by
/// `list_entry_media` and `list_all_media`.
fn media_row_from_sql(row: &rusqlite::Row<'_>) -> rusqlite::Result<MediaAttachment> {
    Ok(MediaAttachment {
        id: row.get(0)?,
        entry_id: row.get(1)?,
        filename: row.get(2)?,
        mime_type: row.get(3)?,
        size_bytes: row.get(4)?,
        enc_path: row.get(5)?,
        created_at: row.get(6)?,
    })
}

/// Decrypt a media file to a temp location and open it with the system viewer.
/// The temp file is automatically deleted after 60 seconds.
///
/// Returns the temp file path **on Android only** (empty string on desktop). On
/// desktop the OS viewer is launched here; Android has no `Command` launcher, so
/// the frontend opens the returned path via the `opener` plugin (ACTION_VIEW +
/// FileProvider). The temp file lives under the app cache dir, which the
/// FileProvider already exposes via `cache-path` in `file_paths.xml`.
#[tauri::command]
pub fn open_media_attachment(
    app: AppHandle,
    db: State<'_, Database>,
    lock: State<'_, AppLockState>,
    media_id: String,
    password: String,
) -> Result<String, String> {
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
    let temp_str = temp_path.to_str().ok_or("Non-UTF8 temp path")?.to_string();

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&temp_str)
        .spawn()
        .map_err(|e| format!("open: {}", e))?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &temp_str])
        .spawn()
        .map_err(|e| format!("start: {}", e))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&temp_str)
        .spawn()
        .map_err(|e| format!("xdg-open: {}", e))?;

    // Desktop launchers already opened the file; Android hands the path back to
    // the frontend, which fires an ACTION_VIEW intent via the opener plugin.
    #[cfg(target_os = "android")]
    let result_path = temp_str;
    #[cfg(not(target_os = "android"))]
    let result_path = {
        let _ = temp_str;
        String::new()
    };

    // Auto-cleanup — long enough for a viewer (or the Android app chooser) to read.
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(60));
        let _ = std::fs::remove_file(&temp_path);
    });

    Ok(result_path)
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
        .query_map([], media_row_from_sql)
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
    use super::{media_row_from_sql, validate_entry_id};

    #[test]
    fn media_row_from_sql_maps_all_columns() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE entry_media (id TEXT, entry_id TEXT, filename TEXT, mime_type TEXT, \
             size_bytes INTEGER, enc_path TEXT, created_at TEXT); \
             INSERT INTO entry_media VALUES ('m1','e1','pic.jpg','image/jpeg',123,\
             'media/e1/m1.jpg.enc','2026-01-01T00:00:00');",
        )
        .unwrap();
        let got = conn
            .query_row(
                "SELECT id, entry_id, filename, mime_type, size_bytes, enc_path, created_at \
                 FROM entry_media",
                [],
                media_row_from_sql,
            )
            .unwrap();
        assert_eq!(got.id, "m1");
        assert_eq!(got.entry_id, "e1");
        assert_eq!(got.filename, "pic.jpg");
        assert_eq!(got.mime_type, "image/jpeg");
        assert_eq!(got.size_bytes, 123);
        assert_eq!(got.enc_path, "media/e1/m1.jpg.enc");
        assert_eq!(got.created_at, "2026-01-01T00:00:00");
    }

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

    // ── compress_image ──────────────────────────────────────────────────────────

    use super::{compress_image, MAX_IMAGE_EDGE};

    /// Build a deterministic gradient image and encode it in `fmt`. A gradient (vs a flat
    /// fill) gives JPEG/PNG real content to compress, so size comparisons are meaningful.
    fn gradient_encoded(w: u32, h: u32, fmt: image::ImageFormat) -> Vec<u8> {
        let img = image::RgbImage::from_fn(w, h, |x, y| {
            image::Rgb([(x % 256) as u8, (y % 256) as u8, ((x + y) % 256) as u8])
        });
        let dynimg = image::DynamicImage::ImageRgb8(img);
        let mut out = Vec::new();
        dynimg
            .write_to(&mut std::io::Cursor::new(&mut out), fmt)
            .unwrap();
        out
    }

    #[test]
    fn compress_returns_none_for_non_image_mime() {
        assert!(compress_image(b"%PDF-1.4 not an image", "application/pdf").is_none());
    }

    #[test]
    fn compress_returns_none_for_animated_or_efficient_formats() {
        // GIF (possibly animated) and WebP are intentionally passed through untouched.
        let data = gradient_encoded(64, 64, image::ImageFormat::Png);
        assert!(compress_image(&data, "image/gif").is_none());
        assert!(compress_image(&data, "image/webp").is_none());
    }

    #[test]
    fn compress_returns_none_for_undecodable_bytes() {
        assert!(compress_image(b"\xff\xd8\xff not really a jpeg", "image/jpeg").is_none());
    }

    #[test]
    fn compress_downscales_large_jpeg_to_cap() {
        let big = gradient_encoded(4000, 3000, image::ImageFormat::Jpeg);
        let out = compress_image(&big, "image/jpeg").expect("large jpeg should compress");
        assert!(out.len() < big.len(), "compressed must be smaller");
        let decoded = image::load_from_memory(&out).unwrap();
        assert!(decoded.width().max(decoded.height()) <= MAX_IMAGE_EDGE);
    }

    #[test]
    fn compress_downscales_large_png_to_cap() {
        let big = gradient_encoded(4000, 2000, image::ImageFormat::Png);
        let out = compress_image(&big, "image/png").expect("large png should compress");
        assert!(out.len() < big.len(), "compressed must be smaller");
        let decoded = image::load_from_memory(&out).unwrap();
        assert!(decoded.width().max(decoded.height()) <= MAX_IMAGE_EDGE);
    }

    #[test]
    fn compress_never_inflates() {
        // A small already-compressed image must not be replaced with larger bytes.
        let small = gradient_encoded(48, 48, image::ImageFormat::Jpeg);
        if let Some(out) = compress_image(&small, "image/jpeg") {
            assert!(out.len() < small.len());
        }
    }

    // ── save_media_attachment_bytes guards ───────────────────────────────────────

    use super::{enforce_media_size_limit, reject_unsafe_filename, MAX_MEDIA_BYTES};

    #[test]
    fn bytes_filename_plain_name_accepted() {
        assert!(reject_unsafe_filename("photo.jpg").is_ok());
        assert!(reject_unsafe_filename("my report 2026.pdf").is_ok());
    }

    #[test]
    fn bytes_filename_forward_slash_rejected() {
        assert!(reject_unsafe_filename("a/b.jpg").is_err());
        assert!(reject_unsafe_filename("/etc/passwd").is_err());
    }

    #[test]
    fn bytes_filename_backslash_rejected() {
        assert!(reject_unsafe_filename("a\\b.jpg").is_err());
        assert!(reject_unsafe_filename("..\\secret").is_err());
    }

    #[test]
    fn bytes_filename_dot_dot_rejected() {
        assert!(reject_unsafe_filename("..").is_err());
        assert!(reject_unsafe_filename("evil..jpg").is_err());
    }

    #[test]
    fn bytes_size_within_limit_accepted() {
        assert!(enforce_media_size_limit(0).is_ok());
        assert!(enforce_media_size_limit(1024).is_ok());
        assert!(enforce_media_size_limit(MAX_MEDIA_BYTES as usize).is_ok());
    }

    #[test]
    fn bytes_size_over_limit_rejected() {
        let err = enforce_media_size_limit(MAX_MEDIA_BYTES as usize + 1)
            .expect_err("oversized payload must be rejected");
        assert!(err.contains("too large"), "got: {err}");
    }

    // ── prepare_media_bytes (pure core of save_media_attachment_bytes) ────────────

    use super::{decrypt_mbmf, prepare_media_bytes};
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    #[test]
    fn prepare_round_trips_non_image_payload() {
        // Non-image bytes are stored verbatim (no compression), so decrypting the
        // prepared blob must return exactly the original payload.
        let original = b"the quick brown fox \x00\x01\x02 jumps".to_vec();
        let b64 = STANDARD.encode(&original);
        let prepared =
            prepare_media_bytes("note.pdf", &b64, "correct horse battery").expect("prepare ok");

        assert_eq!(prepared.mime_type, "application/pdf");
        assert!(prepared.enc_filename.ends_with(".pdf.enc"));
        assert!(prepared.enc_filename.starts_with(&prepared.media_id));
        assert_eq!(prepared.size_bytes, original.len() as i64);

        let decrypted =
            decrypt_mbmf(&prepared.encrypted, "correct horse battery").expect("decrypt ok");
        assert_eq!(decrypted, original);
    }

    #[test]
    fn prepare_wrong_password_fails_to_decrypt() {
        let original = b"secret bytes".to_vec();
        let b64 = STANDARD.encode(&original);
        let prepared = prepare_media_bytes("a.bin", &b64, "right-password").expect("prepare ok");
        assert!(decrypt_mbmf(&prepared.encrypted, "wrong-password").is_err());
    }

    #[test]
    fn prepare_rejects_invalid_base64() {
        let err = prepare_media_bytes("a.png", "not%%base64!!", "pw")
            .expect_err("invalid base64 must be rejected");
        assert!(err.contains("Invalid base64"), "got: {err}");
    }

    #[test]
    fn prepare_rejects_unsafe_filename() {
        let b64 = STANDARD.encode(b"x");
        assert!(prepare_media_bytes("../escape.jpg", &b64, "pw").is_err());
        assert!(prepare_media_bytes("dir/file.jpg", &b64, "pw").is_err());
    }

    #[test]
    fn prepare_accepts_within_limit_payload() {
        // The decoded-size boundary itself is covered by `bytes_size_over_limit_rejected`
        // via `enforce_media_size_limit`; here confirm the limit check is wired into the
        // pipeline by passing a comfortably-small payload end-to-end.
        let b64 = STANDARD.encode(vec![0u8; 1024]);
        assert!(prepare_media_bytes("data.bin", &b64, "pw").is_ok());
    }

    #[test]
    fn prepare_unknown_extension_defaults_octet_stream() {
        let b64 = STANDARD.encode(b"blob");
        let prepared = prepare_media_bytes("archive.xyz", &b64, "pw").expect("prepare ok");
        assert_eq!(prepared.mime_type, "application/octet-stream");
        assert!(prepared.enc_filename.ends_with(".xyz.enc"));
    }

    // ── build_media_row (pure persistence-tail metadata) ─────────────────────────

    use super::build_media_row;

    #[test]
    fn build_media_row_derives_rel_path_and_carries_metadata() {
        let b64 = STANDARD.encode(b"payload");
        let prepared = prepare_media_bytes("photo.jpg", &b64, "pw").expect("prepare ok");
        let expected_id = prepared.media_id.clone();
        let expected_enc = prepared.enc_filename.clone();
        let expected_size = prepared.size_bytes;

        let row = build_media_row("entry-42".to_string(), "photo.jpg".to_string(), &prepared);

        assert_eq!(row.id, expected_id);
        assert_eq!(row.entry_id, "entry-42");
        assert_eq!(row.filename, "photo.jpg");
        assert_eq!(row.mime_type, "image/jpeg");
        assert_eq!(row.size_bytes, expected_size);
        assert_eq!(row.enc_path, format!("media/entry-42/{}", expected_enc));
        assert!(!row.created_at.is_empty());
    }

    #[test]
    fn prepare_compresses_large_jpeg_before_encrypt() {
        // A large JPEG should be recompressed: the stored (decrypted) bytes must be
        // smaller than the original and decode to a within-cap image.
        let big = gradient_encoded(4000, 3000, image::ImageFormat::Jpeg);
        let b64 = STANDARD.encode(&big);
        let prepared = prepare_media_bytes("photo.jpg", &b64, "pw").expect("prepare ok");
        assert_eq!(prepared.mime_type, "image/jpeg");
        assert!(prepared.size_bytes < big.len() as i64, "should shrink");

        let decrypted = decrypt_mbmf(&prepared.encrypted, "pw").expect("decrypt ok");
        assert_eq!(decrypted.len() as i64, prepared.size_bytes);
        let img = image::load_from_memory(&decrypted).expect("decodes");
        assert!(img.width().max(img.height()) <= MAX_IMAGE_EDGE);
    }
}
