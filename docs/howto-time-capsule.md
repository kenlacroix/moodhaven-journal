# Time Capsule — User Guide

> **Applies to:** Desktop app — v1.6.0+

The Time Capsule feature lets you seal a journal entry and have it revealed to you at a future date. You might write a letter to your future self, lock away a reflection you want to revisit in six months, or simply mark an anniversary memory to resurface each year.

---

## Sealing an Entry

Any existing journal entry can be sealed. You cannot seal an entry that has not been saved yet — write and save the entry first, then seal it.

1. Open the entry you want to seal (navigate to it in All Entries or the calendar).
2. Click the **...** menu (top-right of the entry) to open the entry actions.
3. Choose **Seal as Time Capsule**.
4. A modal will appear asking for two things:
   - **Unlock date** — the earliest date the entry can be revealed. The minimum is two days from today.
   - **Capsule type** — see below.
5. Set the date and type, then confirm.

The entry immediately disappears from your timeline and cannot be read until the unlock date arrives.

### Capsule types

| Type | When to use |
|:---|:---|
| **Letter** | A personal message to your future self. The reveal modal shows it with a "letter from the past" framing. |
| **Vault** | Locked away with no special framing — you simply get access to the entry on the date you choose. |

---

## When a Capsule Becomes Due

On unlock, the app checks for any due capsules once per session. If a capsule's unlock date has passed, a reveal modal appears automatically.

The modal shows:
- How long ago the entry was written.
- Your mood at the time it was written.
- Your average mood since then (so you can see how things have changed).
- A **Reveal** button to decrypt and read the entry.

You can choose to read it or dismiss the modal and revisit later. The entry is not marked as revealed until you click **Reveal**.

---

## Anniversary Reveals

If you have **Anniversary Reveal** enabled (Settings → Journal → Time Capsule), the app will automatically surface entries on the anniversary of their creation date — for example, an entry written on June 6, 2025 will appear on June 6, 2026.

Anniversary reveals are separate from manually sealed capsules. Any entry can trigger an anniversary reveal; you do not need to seal it explicitly.

To control this behavior:
- **Settings → Journal → Time Capsule → Enable Time Capsule** — master toggle for all capsule functionality.
- **Settings → Journal → Time Capsule → Anniversary Reveal** — controls whether unsent anniversary prompts appear.

---

## Reading a Revealed Entry

Once revealed, the entry is fully decrypted and visible again in your timeline, like any other entry. The `unsealed_at` timestamp is recorded and the entry is no longer hidden.

There is no way to re-seal a revealed entry.

---

## Frequently Asked Questions

**Can I see which entries are sealed?**

Not directly. Sealed entries are intentionally hidden from the timeline and search to preserve the surprise. If you need to track what you have sealed, keep a note elsewhere.

**Can I change the unlock date after sealing?**

No. The unlock date is fixed at the time of sealing. If you need to change it, you would need to wait until it reveals naturally (or the date passes), then re-seal it if desired.

**What happens if I change my password?**

Time capsule entries use the same AES-256-GCM encryption as all other entries. If you change your password, your entries are re-encrypted with the new key. Sealed capsules are affected in the same way as all other entries.

**What happens to sealed entries during peer sync?**

Sealed entries sync normally between devices. The `sealed_until` and `capsule_type` fields are included in the sync manifest. On the receiving device, the entry is also sealed until the same date.

---

## Related

- Architecture overview (encryption): [`docs/architecture.md`](architecture.md)
- Tauri commands: [`docs/tauri-commands.md`](tauri-commands.md) — see the Time Capsule section
- Source: `src/hooks/useTimeCapsule.ts`, `src/components/timecapsule/`
