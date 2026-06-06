# Getting Started with MoodHaven Journal

> **Applies to:** Desktop app (Windows, Linux, macOS) — v1.6.0+

This guide walks you through setting up MoodHaven Journal for the first time, from downloading the app to writing your first entry. By the end you will have a password-protected, encrypted journal ready to use.

---

## Before You Begin

- Download the installer for your platform from the GitHub releases page.
- MoodHaven Journal stores all data locally on your device. No account is required.
- Your password is the key that encrypts your journal. If you forget it, your entries cannot be recovered unless you saved a Recovery Key during setup.

---

## Choosing a Setup Path

When you open the app for the first time, you will see a welcome screen with two options:

- **Get Started** — the standard path for new users, covered below.
- **Advanced Setup** — exposes additional options for recovery keys, local encryption preferences, and importing existing data.
- **Sync from Another Device** — for users who already have MoodHaven Journal on another device and want to transfer their data over the local network.

If this is your first time, choose **Get Started**.

---

## Standard Setup (Recommended)

### Step 1 — Welcome

Read the brief introduction. Press **Continue** when ready.

### Step 2 — Create a Password

Enter a password you will use to unlock your journal each session.

**Important:** This password is not stored anywhere. It is used to derive the encryption key for your entries. If you forget it:
- You can use a Recovery Key (if you save one later via Settings → Privacy).
- Otherwise, the only option is **Erase & Start Fresh**, which permanently deletes all entries.

Choose something memorable. Long passphrases (e.g., four random words) work well.

Press **Create Journal** to continue.

### Step 3 — You're Ready

Your journal is created. Press **Open Journal** to enter the app.

---

## Advanced Setup

Choose **Advanced Setup** on the welcome screen if you want control over:

- **Recovery Key** — generates a 24-character code you can store offline. This is the only way to recover your journal if you forget your password. It is shown once and never stored.
- **Security options** — configure auto-lock timeout and optional 2FA from the start.
- **Import** — import a `.moodhaven` backup from a previous installation.
- **Devices** — set a device name that identifies this machine during peer sync.

The advanced setup guides you through 8 steps. You can skip any optional step.

---

## Sync from Another Device

If you already have MoodHaven Journal running on another computer on the same network:

1. On the **new device**, choose **Sync from Another Device** at the welcome screen.
2. Enter your password (must be the same password you use on the other device).
3. On the **existing device**, open Settings → Devices → Add Device and display the QR code or PIN.
4. On the new device, scan the QR code or enter the PIN.
5. The new device downloads your entries over the local network.

Both devices must be on the same Wi-Fi network for this to work. See [`docs/peer-sync-security.md`](peer-sync-security.md) for the security model.

---

## Writing Your First Entry

Once setup is complete:

1. The app opens to the **Write** view — a blank editor with a mood selector at the top.
2. Select a mood (1–5 stars or the emoji icons below the editor).
3. Type your entry. Your work is auto-saved after every few words.
4. To finish and close, simply navigate away — the entry is saved automatically.

### Tips for the editor

- Press `/` to open the slash command menu for headings, bullet lists, and other blocks.
- Click the toolbar icons for bold, italic, links, and code.
- Click the microphone icon to dictate (requires Speech-to-Text to be enabled in Settings and a model downloaded).

---

## Locking and Unlocking

The app locks automatically after the timeout configured in Settings → Privacy → Auto-lock (default: 5 minutes of inactivity). You can also lock manually via the lock icon in the sidebar header.

To unlock, enter your password. If you have 2FA enabled, you will be prompted for your authenticator code as well.

---

## What's Next

- **Sync across devices** — Settings → Devices → Add Device to pair another computer.
- **Cloud backup** — Settings → Sync → WebDAV to set up an encrypted backup to a cloud server.
- **AI insights** — Settings → AI to enable contextual writing prompts (opt-in, metadata only — your journal text is never sent anywhere).
- **Books** — organise entries into named journals via the sidebar.

---

## Related

- Security model: [`.claude/docs/security.md`](../.claude/docs/security.md)
- Peer sync: [`docs/peer-sync-security.md`](peer-sync-security.md)
- Cloud sync: [`docs/cloud-sync.md`](cloud-sync.md)
