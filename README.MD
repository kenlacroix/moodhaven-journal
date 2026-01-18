# MoodBloom

**MoodBloom** is a privacy-first journaling app for desktop (Windows, macOS, Linux) built with **Tauri**, **React**, **TypeScript**, and **TailwindCSS**.  

It is designed for users who want to store their deepest thoughts securely while optionally benefiting from AI-driven insights, mood tracking, and thematic analysis.

---

## Features

- **Encrypted journaling**: All entries are encrypted client-side using password-based encryption (AES-256/Argon2).  
- **Local storage**: Entries stored securely in SQLite.  
- **Optional cloud sync**: Encrypted blobs can be synced to Dropbox or other cloud storage.  
- **AI-driven insights (opt-in)**: Journaling prompts, mood/event pattern detection, and entry summarization.  
- **History & analytics**: Review past entries, connect themes, track trends over time.  
- **Cross-platform**: Desktop apps for Windows, macOS, and Linux.  
- **Clean modern UI**: Calm colors, rounded corners, minimal distractions (inspired by Oura).

---

## Tech Stack

- **Frontend**: React + TypeScript + TailwindCSS  
- **Desktop Wrapper**: Tauri (Rust + Node.js)  
- **Local DB**: SQLite  
- **Encryption**: libsodium / WebCrypto with Argon2 password derivation  
- **Optional AI**: Claude or local embeddings for offline insights  

---

## Getting Started

1. **Clone the repo**
```bash
git clone https://github.com/yourusername/moodbloom.git
cd moodbloom
Install dependencies

npm install


Run dev server

npm run tauri dev


Build for production

npm run tauri build

Contribution

This project is initially personal, but contributions are welcome if you want to help with:

UI/UX improvements

Encryption and security audits

AI features and analytics

Notes

All entries are encrypted; losing your password will prevent decryption.

Cloud sync is optional and encrypted end-to-end.

AI features are strictly opt-in.
