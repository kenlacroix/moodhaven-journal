# Getting Started — AI image prompts (optional polish)

The `/getting-started` page ships complete using the **real app screenshots** already in
`public/images/` (`app-writing-view.png`, etc.). It needs no new images to look finished.

These prompts are for *optional* decorative art if you want a softer, friendlier hero or
section illustrations. Paste them into your image generator (Midjourney, DALL·E, Ideogram,
Adobe Firefly, etc.), export, and drop the file at the listed path.

## Brand direction (paste as a style suffix on any prompt)
> Soft, calm, modern flat illustration. Muted lavender/violet primary (#8b5cf6) with sage and
> warm-paper accents. Generous negative space, gentle gradients, no harsh outlines, no text,
> no logos. Cozy, trustworthy, unintimidating. Light background (#faf9fc).

---

## 1. Hero illustration — ✅ DONE (`hero.webp`, gpt-image-1, 1536×1024 → 75 KB webp)
Already generated and wired into the page hero. To regenerate, run:
`python3 /tmp/gen_image.py "<prompt + brand direction>" public/images/getting-started/hero.png 1536x1024`
then convert to webp (PIL, quality 82) and delete the heavy PNG.

## 2. Per-OS spot illustrations (optional — small icons above each install tab)
**Files:** `windows.png`, `macos.png`, `linux.png` · **Aspect:** 1:1 · **~600×600**

> A small, friendly flat icon representing [a window / an apple / a penguin] resting on a
> soft rounded card, single subject, centered, lots of padding. + brand direction above.

## 3. "First two minutes" illustration — ✅ DONE (`first-entry.webp`, 1024×1024 → 62 KB)
Already generated (padlock opening into a notebook) and wired into the "Your first two minutes"
section. Regenerate the same way as the hero, at size `1024x1024`.

---

## ⚠️ Do NOT AI-generate the OS security warning dialogs
The Windows SmartScreen / macOS Gatekeeper steps are the trust-critical moment. A faked or
slightly-wrong dialog reads as a phishing screenshot and *erodes* trust. If you want visuals
there, use a **real screenshot** captured on each OS during an actual install, cropped tightly.
Drop them at `windows-warning.png` / `macos-warning.png` and add an `<Image>` inside Step 3.
