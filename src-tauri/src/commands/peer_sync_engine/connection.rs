//! TCP frame I/O and encrypted message read/write for the peer sync engine.

use std::io::{Read, Write};
use std::net::TcpStream;

use super::crypto::{decrypt_payload, encrypt_payload};
use super::protocol::Msg;

// ── Frame I/O ─────────────────────────────────────────────────────────────────

/// Write a length-prefixed frame: [4-byte big-endian length][payload]
pub fn write_frame(stream: &mut TcpStream, payload: &[u8]) -> Result<(), String> {
    let len = payload.len() as u32;
    stream
        .write_all(&len.to_be_bytes())
        .map_err(|e| format!("write frame length: {e}"))?;
    stream
        .write_all(payload)
        .map_err(|e| format!("write frame payload: {e}"))?;
    Ok(())
}

/// Read exactly the next length-prefixed frame bytes.
/// Capped at 16 MB for all regular protocol messages (HELLO, MANIFEST, entries, etc.).
/// Use `read_frame_enc_binary` for the DB restore path which needs up to 256 MB.
pub fn read_frame_bytes(stream: &mut TcpStream) -> Result<Vec<u8>, String> {
    read_frame_bytes_with_limit(stream, 16 * 1024 * 1024)
}

fn read_frame_bytes_with_limit(stream: &mut TcpStream, max: usize) -> Result<Vec<u8>, String> {
    let mut len_buf = [0u8; 4];
    stream
        .read_exact(&mut len_buf)
        .map_err(|e| format!("read frame length: {e}"))?;
    let len = u32::from_be_bytes(len_buf) as usize;
    if len > max {
        return Err(format!("Frame too large: {len} bytes (limit {max})"));
    }
    let mut buf = vec![0u8; len];
    stream
        .read_exact(&mut buf)
        .map_err(|e| format!("read frame payload: {e}"))?;
    Ok(buf)
}

/// Write an AES-GCM encrypted binary frame for DB restore chunks.
/// Overhead: 12-byte nonce + 16-byte GCM tag per chunk.
pub fn write_frame_enc_binary(
    stream: &mut TcpStream,
    key: &[u8; 32],
    data: &[u8],
) -> Result<(), String> {
    let encrypted = super::crypto::encrypt_payload(key, data)?;
    write_frame(stream, &encrypted)
}

/// Read and decrypt an AES-GCM encrypted binary frame for DB restore chunks.
/// Uses a 256 MB + overhead limit.
pub fn read_frame_enc_binary(stream: &mut TcpStream, key: &[u8; 32]) -> Result<Vec<u8>, String> {
    // 256 MB plaintext + 28 bytes AES-GCM overhead (12 nonce + 16 tag)
    let encrypted = read_frame_bytes_with_limit(stream, 256 * 1024 * 1024 + 28)?;
    super::crypto::decrypt_payload(key, &encrypted)
}

// ── Message I/O ───────────────────────────────────────────────────────────────

/// Send a plaintext JSON message (used for HELLO/OK before key exchange).
pub fn write_msg(stream: &mut TcpStream, msg: &Msg) -> Result<(), String> {
    let json = serde_json::to_vec(msg).map_err(|e| format!("serialize msg: {e}"))?;
    write_frame(stream, &json)
}

/// Send an AES-GCM encrypted JSON message.
pub fn write_msg_enc(stream: &mut TcpStream, key: &[u8; 32], msg: &Msg) -> Result<(), String> {
    let json = serde_json::to_vec(msg).map_err(|e| format!("serialize msg: {e}"))?;
    let payload = encrypt_payload(key, &json)?;
    write_frame(stream, &payload)
}

/// Read and parse a plaintext JSON message.
pub fn read_msg(stream: &mut TcpStream) -> Result<Msg, String> {
    let bytes = read_frame_bytes(stream)?;
    serde_json::from_slice(&bytes).map_err(|e| format!("parse msg: {e}"))
}

/// Read and decrypt an AES-GCM encrypted JSON message.
pub fn read_msg_enc(stream: &mut TcpStream, key: &[u8; 32]) -> Result<Msg, String> {
    let bytes = read_frame_bytes(stream)?;
    let plain = decrypt_payload(key, &bytes)?;
    serde_json::from_slice(&plain).map_err(|e| format!("parse decrypted msg: {e}"))
}
