# StillHaven — User Guide

> **Applies to:** Desktop app — v1.5.0+

StillHaven is a bilateral audio stimulation module built into MoodHaven Journal. It plays alternating left-right tones through headphones to support nervous system regulation as a general wellness practice.

**Important:** StillHaven is a wellness tool, not a clinical instrument. It is not a substitute for working with a mental health professional. Read the disclaimer below before your first session.

---

## Before Your First Session

StillHaven requires your consent before it activates. On first use you will see a consent screen with the following information:

- Bilateral audio stimulation — alternating left-right tones — is offered as a general wellness practice.
- It is not a licensed therapeutic tool.
- It may not be appropriate if you are currently experiencing dissociation, flashbacks, or acute crisis. If you are, please close this and reach out to a mental health professional instead.

You must accept this before the module unlocks. You can view the disclaimer again at any time in Settings → StillHaven.

---

## Enabling StillHaven

1. Open **Settings → StillHaven**.
2. Toggle **Enable StillHaven**.

Once enabled, the StillHaven option appears in the sidebar and can be accessed from the journal's session handoff flow.

---

## Starting a Session

1. Navigate to **StillHaven** in the sidebar (or via the Wrist Loop banner if triggered from your watch).
2. You will see the **Welcome** screen. Read the brief orientation and press **Begin**.
3. If you have an unfinished session from a previous visit, you will be offered the option to continue or discard it.

---

## Check-in: Setting Your Activation Level

Before the audio begins, you will be asked to rate your current activation level on a scale from 1 to 10:

| Range | Meaning |
|:---|:---|
| 1–3 | Low activation — calm, perhaps flat or detached |
| 4–6 | Moderate — baseline, some tension present |
| 7–10 | High activation — anxious, stressed, can't settle |

This is your **pre-session activation** score. It shapes the audio speed and is recorded alongside the post-session score so you can track changes over time.

You can optionally enter your HRV manually if you have a reading from a wearable.

---

## Choosing a Protocol

After the check-in, select the protocol that fits your current state:

### Everyday Settling (`general_activation`)

- Base frequency: **0.8 Hz** (approximately one full sweep per 1.25 seconds)
- Use when: you want to feel more present, reduce mental noise, or settle after a busy day.

### Heightened State (`fake_danger`)

- Base frequency: **1.2 Hz** (faster — matches a more activated nervous system)
- Use when: your heart is racing, you are replaying something, or your body won't relax.

The app adapts the playback speed based on your pre-activation score:
- Activation 7–10 → speed multiplied by 1.2 (faster, matching your state)
- Activation 1–3 → speed multiplied by 0.85 (slower, gentle entry)
- Speed is capped between 0.5× and 2.0×.

---

## During the Session

Once you confirm the protocol, the session transitions through:

1. **Submerging** — a brief fade-in period as the audio environment loads.
2. **Live** — the active session. Bilateral tones play through your headphones.
   - The session runs until you choose to end it (there is no forced timer).
   - The environment (underwater, forest, or sky) plays ambient sound alongside the bilateral tones.
3. **Check-out** — when you are ready to finish, press the end button.

**Headphones are required.** The bilateral effect depends on stereo separation; speakers do not provide the left-right alternation.

---

## Check-out: Post-Session Activation

After the session ends, rate your activation level again (same 1–10 scale). This is your **post-session activation** score.

The difference between pre and post scores is the **activation delta**, used in the Session History stats card to show which protocols are most effective for you.

You can also enter a brief note about how you feel.

---

## Session Summary and Journal Handoff

After check-out, a summary screen shows your pre/post scores and the session duration. You are offered the option to write a journal entry immediately.

If you choose to write:
- The editor opens pre-filled with a minimal prompt.
- The journal entry is linked to the StillHaven session and visible in the session history.

If you skip writing now, you can write a related entry later — but it will not be automatically linked to the session.

---

## Session History

In the StillHaven session history view, the **Effect Stats** card shows per-protocol averages:

- Average activation delta (how much your activation typically drops)
- Session count per protocol
- A recommendation chip highlighting the protocol with the best average outcome for your data

---

## Wrist Loop Integration

If you have a Wear OS watch and the Wrist Loop feature is active, tapping the StillHaven shortcut on your watch sends a signal to the desktop app. A banner appears at the top of the app asking if you want to start a StillHaven session. Accepting opens StillHaven with the session linked to the watch signal.

---

## Frequently Asked Questions

**Does StillHaven work with speakers?**

No. The bilateral effect requires headphones. The app does not enforce this technically, but the experience will not work as intended without stereo separation.

**Can I use StillHaven without headphones in a noisy environment?**

You can, but the bilateral effect will be reduced or absent. It is best used in a quiet environment with headphones.

**Is my session data private?**

Yes. Session records (activation scores, protocol, duration) are stored locally in SQLite. They are never sent to any external service. Journal entries written after a session are encrypted with the same AES-256-GCM encryption as all other entries.

**Can I do multiple sessions in a day?**

Yes. There is no enforced limit. Each session is recorded independently.

---

## Related

- Tauri commands: [`docs/tauri-commands.md`](tauri-commands.md) — see the StillHaven section
- Wrist Loop / watch integration: [`docs/watch-companion.md`](watch-companion.md)
- Source: `src/modules/stillhaven/`, `src/lib/stillService.ts`
