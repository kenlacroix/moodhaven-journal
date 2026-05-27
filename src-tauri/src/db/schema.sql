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

-- Trigger to update updated_at timestamp (local time)
CREATE TRIGGER IF NOT EXISTS update_entry_timestamp
    AFTER UPDATE ON journal_entries
    FOR EACH ROW
BEGIN
    UPDATE journal_entries SET updated_at = strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime') WHERE id = OLD.id;
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

-- Trigger to update daily stats on entry update (mood change)
CREATE TRIGGER IF NOT EXISTS update_daily_stats_update
    AFTER UPDATE ON journal_entries
    WHEN OLD.mood != NEW.mood
BEGIN
    UPDATE mood_daily_stats
    SET average_mood = (
        SELECT AVG(mood) FROM journal_entries
        WHERE date(created_at) = date(NEW.created_at)
    ),
    updated_at = datetime('now')
    WHERE date = date(NEW.created_at);
END;

-- Trigger to update daily stats on entry delete
CREATE TRIGGER IF NOT EXISTS update_daily_stats_delete
    AFTER DELETE ON journal_entries
BEGIN
    UPDATE mood_daily_stats
    SET average_mood = COALESCE(
        (SELECT AVG(mood) FROM journal_entries WHERE date(created_at) = date(OLD.created_at)),
        0
    ),
    entry_count = (
        SELECT COUNT(*) FROM journal_entries WHERE date(created_at) = date(OLD.created_at)
    ),
    updated_at = datetime('now')
    WHERE date = date(OLD.created_at);

    -- Remove row if no entries left for that date
    DELETE FROM mood_daily_stats
    WHERE date = date(OLD.created_at) AND entry_count = 0;
END;

-- Two-Factor Authentication settings
CREATE TABLE IF NOT EXISTS two_factor_auth (
    id INTEGER PRIMARY KEY CHECK (id = 1),  -- Singleton row
    enabled INTEGER NOT NULL DEFAULT 0,      -- 0 = disabled, 1 = enabled
    method TEXT,                             -- 'totp', 'webauthn', 'both', or NULL
    totp_secret TEXT,                        -- Encrypted TOTP secret (Base32)
    webauthn_credentials TEXT,               -- JSON array of registered credentials
    backup_codes TEXT,                       -- JSON array of SHA-256 hashed codes
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Settings table for storing application settings
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- StillHaven: somatic session event log (append-only)
CREATE TABLE IF NOT EXISTS still_sessions (
    id               TEXT PRIMARY KEY,
    protocol         TEXT NOT NULL,
    environment      TEXT NOT NULL DEFAULT 'underwater',
    bilateral_mode   TEXT NOT NULL DEFAULT 'audio',
    duration_seconds INTEGER NOT NULL,
    started_at       TEXT NOT NULL,
    completed_at     TEXT,
    abandoned_at     TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS still_activation_samples (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT NOT NULL REFERENCES still_sessions(id) ON DELETE CASCADE,
    phase       TEXT NOT NULL CHECK (phase IN ('pre', 'post')),
    activation  INTEGER NOT NULL CHECK (activation >= 1 AND activation <= 10),
    hrv_manual  INTEGER,
    hrv_source  TEXT,
    note        TEXT,
    sampled_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_still_sessions_started  ON still_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_still_sessions_protocol ON still_sessions(protocol);
CREATE INDEX IF NOT EXISTS idx_still_samples_session   ON still_activation_samples(session_id);
