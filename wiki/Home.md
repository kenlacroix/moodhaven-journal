# MoodHaven Journal — Wiki

Welcome to the MoodHaven Journal wiki. MoodHaven is a local-first, privacy-first journaling app built with Tauri v2 (Rust) + React + TypeScript + SQLite.

No accounts. No cloud required. All encryption on-device.

---

## Getting Started

- **[Download the app](https://moodhaven.app/download)** — Windows, macOS, Linux, or open the web app at [journal.moodhaven.app](https://journal.moodhaven.app)
- **[Building from Source](Building-from-Source)** — prerequisites, platform-specific build steps, release checklist

---

## Architecture & Design

- **[Architecture Overview](Architecture-Overview)** — tech stack, directory structure, data model, encryption design
- **[Tauri Command Reference](Tauri-Command-Reference)** — all ~109 `invoke()` commands with TypeScript signatures
- **[Security Model](Security-Model)** — zero-knowledge design, encryption spec, forbidden patterns, checklist

---

## Features

- **[Peer Sync Security](Peer-Sync-Security)** — LAN sync protocol, threat model, wire format, key derivation
- **[Speech-to-Text](Speech-to-Text)** — whisper.cpp sidecar architecture, model options, privacy guarantees
- **[Watch Companion](Watch-Companion)** — Wear OS recording pipeline, data flow, Tauri integration

---

## Contributing

- **[Contributing Guide](Contributing)** — how to report bugs, submit PRs, run tests
- **[Changelog](https://moodhaven.app/changelog)** — full version history

---

## Key Facts

| Property | Value |
|---|---|
| License | MIT |
| Stack | Tauri v2 · Rust · React · TypeScript · SQLite |
| Encryption | AES-256-GCM, PBKDF2-HMAC-SHA256, 600k iterations |
| Data storage | Local SQLite only — no mandatory cloud |
| Source | [github.com/kenlacroix/moodhaven-journal](https://github.com/kenlacroix/moodhaven-journal) |
