-- MoodBloom Database Schema
-- SQLite with encrypted content storage

-- User settings and authentication
CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),  -- Singleton row
    password_hash TEXT NOT NULL,             -- PBKDF2 hash for verification
    password_salt TEXT NOT NULL,             -- Salt used for hashing
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Journal entries with encrypted content
CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,                     -- UUID
    encrypted_content TEXT NOT NULL,         -- JSON: {ciphertext, iv, salt, version}
    mood INTEGER NOT NULL CHECK (mood >= 1 AND mood <= 5),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tags (stored separately, not encrypted for searchability)
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

-- Entry-tag relationship
CREATE TABLE IF NOT EXISTS entry_tags (
    entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (entry_id, tag_id)
);

-- Mood statistics cache (for quick analytics)
CREATE TABLE IF NOT EXISTS mood_daily_stats (
    date TEXT PRIMARY KEY,                   -- YYYY-MM-DD
    average_mood REAL NOT NULL,
    entry_count INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_entries_created_at ON journal_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_mood ON journal_entries(mood);
CREATE INDEX IF NOT EXISTS idx_entries_date ON journal_entries(date(created_at));
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

-- Trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_entry_timestamp
    AFTER UPDATE ON journal_entries
    FOR EACH ROW
BEGIN
    UPDATE journal_entries SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- Trigger to update daily stats on entry insert
CREATE TRIGGER IF NOT EXISTS update_daily_stats_insert
    AFTER INSERT ON journal_entries
BEGIN
    INSERT INTO mood_daily_stats (date, average_mood, entry_count)
    VALUES (
        date(NEW.created_at),
        NEW.mood,
        1
    )
    ON CONFLICT(date) DO UPDATE SET
        average_mood = (
            SELECT AVG(mood) FROM journal_entries
            WHERE date(created_at) = date(NEW.created_at)
        ),
        entry_count = entry_count + 1,
        updated_at = datetime('now');
END;
