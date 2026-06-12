# Using a Password Manager with MoodHaven

> **Applies to:** Desktop app (Windows, Linux, macOS) — v1.8.2+

You can absolutely keep your MoodHaven password in a password manager (Proton Pass, Bitwarden, 1Password, KeePass, Apple Passwords, etc.). This guide explains how, and is honest about one limitation: your password manager **cannot autofill MoodHaven's unlock screen**. Here is why, and what to do instead.

---

## Why autofill doesn't work on the unlock screen

Password-manager autofill is delivered by a **browser extension** that injects itself into web pages and matches them by their web address (origin/URL).

MoodHaven's unlock screen is **not a web page in a browser** — it is a native application window (a Tauri WebView: WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux). These windows have:

- no browser extension runtime for your password manager to load into, and
- no web address (`https://...`) for it to match against — the screen loads from a local app protocol, not from `moodhaven.app`.

This is an architectural property of native desktop apps, not a setting we can flip on. **No password manager can autofill a native app's unlock field this way.** We would rather tell you plainly than imply autofill that can't exist.

---

## The recommended workflow: save and paste

1. In your password manager, create a login item for MoodHaven and store the password you use to unlock the journal.
2. When MoodHaven asks for your password, copy it from your password manager and **paste** it into the unlock field.

That's it. This works today with every password manager on every platform, and MoodHaven stores nothing new — your password stays in your already-encrypted vault instead of on a sticky note.

A short reminder of this appears as a hint beneath the unlock field.

---

## Clear your clipboard after pasting

The one transient exposure with copy-paste is your system clipboard, which briefly holds the password. MoodHaven can clear it for you:

- **Settings → Privacy → Clear clipboard on lock** (on by default).

With this enabled, the clipboard is wiped when the app locks, so a pasted password doesn't linger. You can also clear your clipboard manually after unlocking.

---

## What MoodHaven deliberately does *not* do

To preserve the zero-knowledge model (your password is never stored, only used to derive the encryption key in memory), MoodHaven does **not**:

- **Store a password-manager access token on your device** to fetch the password automatically. A stored vault token is at least as sensitive as the journal password itself — keeping one on-device would *weaken* security, not improve it. Advanced users who want non-interactive retrieval can script their own PM CLI (`pass`, `bw get`, `op read`) to fetch and paste the password without MoodHaven holding any token.
- **Accept a password-manager "passkey" as an unlock method.** Software passkeys synced by a password manager are presented through the browser/OS WebAuthn flow, which does not function inside a native Tauri WebView ([tauri#7926](https://github.com/tauri-apps/tauri/issues/7926)). They cannot reach this unlock screen.

---

## Faster unlock without typing your full password

If the goal is to avoid typing a long password every time, MoodHaven has built-in options that keep the zero-knowledge model intact:

- **PIN unlock** — a 4–6 digit PIN that decrypts a wrapped copy of your password (rate-limited). Settings → Privacy → PIN Unlock.
- **Biometric / OS-keyring unlock** — Face ID, Touch ID, Windows Hello, or your OS credential store. Settings → Privacy → Biometric.
- **Hardware security key (FIDO2)** — a physical key (e.g. YubiKey) as a second factor today, with first-class unlock planned. Note this is a *physical* FIDO2 key, **not** a password-manager passkey.

---

## Related

- Security model: [`.claude/docs/security.md`](../.claude/docs/security.md)
- Getting started: [`docs/howto-getting-started.md`](howto-getting-started.md)
- Source: `src/pages/LockScreen.tsx`, `src/components/settings/tabs/PrivacyAutoLock.tsx`
