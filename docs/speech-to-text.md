# Speech-to-Text — Architecture & User Guide

> **Status:** In Progress — Tauri commands scaffolded; model download + transcription functional; recording UI in WritingView pending.

---

## Overview

MoodHaven Journal's speech-to-text (STT) feature lets you **dictate journal entries using your microphone**. All audio processing happens on your device — no cloud speech APIs, no audio ever leaves your machine.

The engine is [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — a C/C++ port of OpenAI's Whisper model that runs fully offline.

---

## Architecture

```
Microphone
    │  Web Audio API (in WebView)
    │  Captured as PCM → encoded to 16 kHz mono WAV
    ▼
Temp WAV file
    │  invoke('stt_transcribe', { audioBase64, modelName })
    ▼
Rust: speech_to_text.rs
    │  Writes WAV to temp file
    │  Spawns whisper-cli sidecar process:
    │      whisper-cli -m models/{model} -f audio.wav --output-txt
    │  Reads stdout → transcription text
    │  Deletes temp WAV file
    ▼
Transcription text returned to frontend
    │
    ▼
Inserted at cursor position in TipTap editor
```

**Key properties:**
- The audio file is deleted immediately after transcription.
- whisper.cpp runs as a child process (Tauri sidecar) — it is isolated from the app.
- No network requests are made during transcription.
- Model files are downloaded once and cached in `{app_data_dir}/models/`.

---

## Model Options

| Model | File | Size | Quality | Speed |
|:---|:---|:---|:---|:---|
| Tiny (English) | `ggml-tiny.en.bin` | ~75 MB | Acceptable | Fast |
| Base (English) | `ggml-base.en.bin` | ~142 MB | Good | Fast |
| Small (English) | `ggml-small.en.bin` | ~466 MB | Very good | Moderate |
| Medium (English) | `ggml-medium.en.bin` | ~1.5 GB | Excellent | Slower |

Models are downloaded on demand from Hugging Face (`ggerganov/whisper.cpp`). No account or API key is required.

**Recommendation:** Start with `ggml-base.en.bin`. It offers good accuracy at a manageable size and transcribes fast enough that most users won't notice the delay.

---

## Tauri Commands

### `stt_check_sidecar`

Check if the `whisper-cli` sidecar binary is bundled and executable.

```typescript
invoke('stt_check_sidecar') → Promise<boolean>
```

Returns `false` if the app was built without the sidecar (e.g., development builds without the binary present).

---

### `stt_get_models_dir`

Get the absolute path to the directory where models are stored.

```typescript
invoke('stt_get_models_dir') → Promise<string>
// e.g. "/home/user/.local/share/com.moodhaven.app/models"
```

---

### `stt_check_model`

Check whether a specific model has been downloaded.

```typescript
invoke('stt_check_model', { modelName: 'ggml-base.en.bin' })
→ Promise<{ exists: boolean; size_bytes: number | null }>
```

---

### `stt_download_model`

Download a model. Emits progress events to the frontend.

```typescript
invoke('stt_download_model', { modelName: 'ggml-base.en.bin' })
// Emits: 'stt:download_progress' → { modelName, bytesDownloaded, totalBytes, percent }
// Emits: 'stt:download_complete' → { modelName }
// Emits: 'stt:download_error' → { modelName, error }
```

Progress events allow the UI to show a download progress bar.

---

### `stt_delete_model`

Delete a downloaded model to free disk space.

```typescript
invoke('stt_delete_model', { modelName: 'ggml-base.en.bin' }) → Promise<void>
```

---

### `stt_transcribe`

Transcribe a base64-encoded WAV audio file.

```typescript
invoke('stt_transcribe', {
  audioBase64: string,   // base64-encoded 16 kHz mono WAV
  modelName: string,     // e.g. 'ggml-base.en.bin'
}) → Promise<string>     // transcription text
```

The WAV is written to a temp file, whisper-cli is invoked, the result is returned, and the temp file is deleted — all within this command.

---

## Frontend Integration

### Hooks

| Hook | Purpose |
|:---|:---|
| `useSpeechToText` | Model status, download, transcription |
| `useAudioRecorder` | Microphone capture, WAV encoding |

### `useSpeechToText`

```typescript
const {
  isAvailable,          // sidecar present + model downloaded
  isTranscribing,
  selectedModel,
  downloadProgress,
  downloadModel,        // () => void
  deleteModel,          // () => void
  transcribe,           // (audioBase64: string) => Promise<string>
} = useSpeechToText();
```

### `useAudioRecorder`

```typescript
const {
  isRecording,
  duration,             // seconds elapsed
  start,                // () => void
  stop,                 // () => Promise<string>  (base64 WAV)
  discard,              // () => void
} = useAudioRecorder();
```

### Recording Flow (Writing View — planned)

1. User clicks the mic button in the TipTap toolbar.
2. `useAudioRecorder.start()` — requests mic permission, begins capture.
3. A recording indicator appears (timer, pulse animation, stop button).
4. User clicks stop → `useAudioRecorder.stop()` → returns base64 WAV.
5. `useSpeechToText.transcribe(audioBase64)` → transcription text.
6. Text is inserted at the current cursor position in the editor.
7. Temp audio data is discarded from memory.

---

## Settings

Speech-to-text is configured under **Settings → Speech to Text**:

- **Enable toggle** — off by default; must be explicitly turned on.
- **Model selector** — choose which model to use (shows download status + file size).
- **Download button** — triggers `stt_download_model` with a progress bar.
- **Delete button** — removes the model file to reclaim disk space.

The mic button in the WritingView editor toolbar is hidden until:
1. The feature is enabled in settings.
2. At least one model is downloaded.

---

## Building with the Sidecar

The `whisper-cli` binary must be compiled for the target platform and placed in the correct location for Tauri to bundle it.

### Sidecar Configuration (`tauri.conf.json`)

```json
{
  "bundle": {
    "externalBin": ["sidecar/whisper-cli"]
  }
}
```

### Building whisper-cli

```bash
# Clone whisper.cpp
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp

# Build the CLI binary
make whisper-cli

# Copy to project sidecar directory
cp whisper-cli /path/to/moodhaven-journal/sidecar/whisper-cli-{platform}-{arch}
```

Platform suffixes follow Tauri's sidecar naming convention:
- Linux x86_64: `whisper-cli-x86_64-unknown-linux-gnu`
- macOS x86_64: `whisper-cli-x86_64-apple-darwin`
- macOS ARM: `whisper-cli-aarch64-apple-darwin`
- Windows x86_64: `whisper-cli-x86_64-pc-windows-msvc.exe`

In CI, this step runs during the build matrix before `npm run tauri build`.

---

## Privacy Guarantees

- **No cloud.** Transcription uses only the local whisper-cli binary and local model files.
- **Temp file lifecycle.** The WAV file is written to a temp path and deleted immediately after whisper-cli exits, regardless of success or failure.
- **No logging.** The transcription result is returned directly to the frontend — it is not written to any log file.
- **Permission.** Microphone access uses the standard browser `getUserMedia` API; the OS will prompt the user to grant permission the first time.
- **Model source.** Models are downloaded from `huggingface.co/ggerganov/whisper.cpp` — no custom server. The URL is hardcoded and not user-configurable (to prevent model substitution attacks).
