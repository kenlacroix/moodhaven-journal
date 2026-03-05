//! Books (named journals) Tauri commands

use crate::db::{self, Book, Database};
use tauri::State;
use uuid::Uuid;

/// List all books ordered by sort_order
#[tauri::command]
pub fn list_books(db: State<Database>) -> Result<Vec<Book>, String> {
    db::list_books(&db)
}

/// Create a new book
#[tauri::command]
pub fn create_book(
    db: State<Database>,
    name: String,
    emoji: String,
    color: String,
) -> Result<Book, String> {
    if name.trim().is_empty() {
        return Err("Book name cannot be empty".to_string());
    }
    let id = Uuid::new_v4().to_string();
    db::create_book(&db, &id, name.trim(), &emoji, &color)
}

/// Update an existing book's name, emoji, and color
#[tauri::command]
pub fn update_book(
    db: State<Database>,
    id: String,
    name: String,
    emoji: String,
    color: String,
) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("Book name cannot be empty".to_string());
    }
    db::update_book(&db, &id, name.trim(), &emoji, &color)
}

/// Delete a book (reassigns its entries to 'default')
#[tauri::command]
pub fn delete_book(db: State<Database>, id: String) -> Result<(), String> {
    db::delete_book(&db, &id)
}
