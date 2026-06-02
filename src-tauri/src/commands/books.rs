//! Books (named journals) Tauri commands

use crate::db::{self, Book, Database};
use crate::AppLockState;
use tauri::State;
use uuid::Uuid;

use super::require_unlocked;

/// Maximum number of books. Prevents sync_log DoS via unbounded book creation.
const MAX_BOOKS: i64 = 100;

fn validate_hex_color(color: &str) -> Result<(), String> {
    if color.len() != 7
        || !color.starts_with('#')
        || !color[1..].chars().all(|c| c.is_ascii_hexdigit())
    {
        return Err(format!("Invalid color '{color}': must be #rrggbb"));
    }
    Ok(())
}

/// List all books ordered by sort_order
#[tauri::command]
pub fn list_books(db: State<Database>, lock: State<'_, AppLockState>) -> Result<Vec<Book>, String> {
    require_unlocked(&lock)?;
    db::list_books(&db)
}

/// Create a new book
#[tauri::command]
pub fn create_book(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    name: String,
    emoji: String,
    color: String,
    description: Option<String>,
    settings: Option<String>,
) -> Result<Book, String> {
    require_unlocked(&lock)?;
    if name.trim().is_empty() {
        return Err("Book name cannot be empty".to_string());
    }
    if emoji.len() > 32 {
        return Err("Emoji field too long (max 32 bytes)".to_string());
    }
    validate_hex_color(&color)?;
    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM books", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if count >= MAX_BOOKS {
            return Err(format!("Book limit reached ({MAX_BOOKS})"));
        }
    }
    let id = Uuid::new_v4().to_string();
    db::create_book(
        &db,
        &id,
        name.trim(),
        &emoji,
        &color,
        description.as_deref(),
        settings.as_deref(),
    )
}

/// Update an existing book's name, emoji, color, description, and settings
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_book(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
    name: String,
    emoji: String,
    color: String,
    description: Option<String>,
    settings: Option<String>,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    if name.trim().is_empty() {
        return Err("Book name cannot be empty".to_string());
    }
    if emoji.len() > 32 {
        return Err("Emoji field too long (max 32 bytes)".to_string());
    }
    validate_hex_color(&color)?;
    db::update_book(
        &db,
        &id,
        name.trim(),
        &emoji,
        &color,
        description.as_deref(),
        settings.as_deref(),
    )
}

/// Delete a book (reassigns its entries to 'default')
#[tauri::command]
pub fn delete_book(
    db: State<Database>,
    lock: State<'_, AppLockState>,
    id: String,
) -> Result<(), String> {
    require_unlocked(&lock)?;
    db::delete_book(&db, &id)
}
