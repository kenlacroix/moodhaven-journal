# MoodBloom – Claude Prompt Library

## Phase 0 – Planning & Setup
- Suggest the best project structure for a Tauri app using React + TypeScript + TailwindCSS, targeting Windows/Linux/macOS. Include folders, file naming, and dev workflow.
- Generate a template for AI documentation for Claude, including sections for: Feature planning, Security guidance, UI/UX suggestions, Encryption examples, AI journaling features, and Dev tasks.

## Phase 1 – MVP: Secure Local Journaling
- Explain how to implement client-side encryption in Tauri using TypeScript/WebCrypto. Include encrypt/decrypt code for text entries with user password.
- Suggest a clean, calm UI for journaling. Include main writing area, mood selector, entry history. Provide TailwindCSS layout example.
- Provide a method to store/retrieve multiple encrypted entries in SQLite. Include schema suggestions.

## Phase 2 – Cloud Sync (Encrypted Blob)
- Explain how to sync an encrypted blob to Dropbox using Tauri, OAuth2, file upload/download, and conflict resolution.
- Suggest UX patterns for optional cloud sync, emphasizing privacy and security.

## Phase 3 – AI-Enhanced Journaling (Opt-in)
- Suggest privacy-first AI journaling features: prompt generation, summarization, recurring mood/event detection.
- Provide a workflow example for generating AI suggestions while keeping entries encrypted.
- Generate TailwindCSS layouts for visualizing trends in mood/themes offline.

## Phase 4 – Polishing & Cross-Platform Builds
- Suggest best practices for building a polished Tauri app for Windows, Linux, macOS. Include build commands and packaging tips.
- Generate user documentation for MoodBloom: installation, encryption, cloud sync, AI features, privacy practices.

## General Security Prompts
- Suggest the safest encryption algorithms for client-side journaling.
- Explain key derivation (Argon2) and password handling best practices.
- Provide a workflow for offline AI insights without sending unencrypted data to a server.

## UI/UX Prompts
- Generate calm, modern color palettes with rounded corners and soft padding.
- Suggest minimal animations for focus writing mode.
- Propose mood selector UI (emoji or slider).


