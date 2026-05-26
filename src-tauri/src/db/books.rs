use rusqlite::params;
use serde::{Deserialize, Serialize};

use super::Database;

/// A named journal (book) that groups entries
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Book {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub color: String,
    pub sort_order: i32,
    pub description: Option<String>,
    pub settings: Option<String>, // JSON-encoded BookSettings
    pub created_at: String,
    pub updated_at: String,
}

/// List all books ordered by sort_order
pub fn list_books(db: &Database) -> Result<Vec<Book>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, emoji, color, sort_order, description, settings, created_at,
                    COALESCE(updated_at, created_at)
             FROM books ORDER BY sort_order ASC, created_at ASC",
        )
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let books = stmt
        .query_map([], |row| {
            Ok(Book {
                id: row.get(0)?,
                name: row.get(1)?,
                emoji: row.get(2)?,
                color: row.get(3)?,
                sort_order: row.get(4)?,
                description: row.get(5)?,
                settings: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row parsing failed: {}", e))?;

    Ok(books)
}

/// Create a new book
pub fn create_book(
    db: &Database,
    id: &str,
    name: &str,
    emoji: &str,
    color: &str,
    description: Option<&str>,
    settings: Option<&str>,
) -> Result<Book, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let sort_order: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order) + 1, 1) FROM books",
            [],
            |row| row.get(0),
        )
        .unwrap_or(1);

    conn.execute(
        "INSERT INTO books (id, name, emoji, color, sort_order, description, settings, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, strftime('%Y-%m-%dT%H:%M:%S','now','localtime'), strftime('%Y-%m-%dT%H:%M:%S','now','localtime'))",
        params![id, name, emoji, color, sort_order, description, settings],
    )
    .map_err(|e| format!("Failed to create book: {}", e))?;

    conn.query_row(
        "SELECT id, name, emoji, color, sort_order, description, settings, created_at,
                COALESCE(updated_at, created_at)
         FROM books WHERE id = ?1",
        params![id],
        |row| {
            Ok(Book {
                id: row.get(0)?,
                name: row.get(1)?,
                emoji: row.get(2)?,
                color: row.get(3)?,
                sort_order: row.get(4)?,
                description: row.get(5)?,
                settings: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        },
    )
    .map_err(|e| format!("Failed to fetch created book: {}", e))
}

/// Update a book's name, emoji, color, description, and/or settings
pub fn update_book(
    db: &Database,
    id: &str,
    name: &str,
    emoji: &str,
    color: &str,
    description: Option<&str>,
    settings: Option<&str>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let rows = conn
        .execute(
            "UPDATE books SET name = ?1, emoji = ?2, color = ?3, description = ?4, settings = ?5,
                              updated_at = strftime('%Y-%m-%dT%H:%M:%S','now','localtime')
             WHERE id = ?6",
            params![name, emoji, color, description, settings, id],
        )
        .map_err(|e| format!("Failed to update book: {}", e))?;

    if rows == 0 {
        return Err("Book not found".to_string());
    }
    Ok(())
}

/// Delete a book — moves its entries to 'default'; cannot delete 'default'
pub fn delete_book(db: &Database, id: &str) -> Result<(), String> {
    if id == "default" {
        return Err("Cannot delete the default journal".to_string());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE journal_entries SET book_id = 'default' WHERE book_id = ?1",
        params![id],
    )
    .map_err(|e| format!("Failed to reassign entries: {}", e))?;

    conn.execute("DELETE FROM books WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete book: {}", e))?;

    Ok(())
}
