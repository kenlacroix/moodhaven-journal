# STT multi-ISA whisper via ggml runtime CPU dispatch

> **Status:** Planned (future enhancement). Follow-up to the "STT CPU portability" PR
> (`fix/stt-cpu-portability`), which made the shipped sidecar a single **SSE4.2 baseline**
> binary + a graceful "unsupported CPU" message.
> **Decision gate:** only build this if baseline SSE4.2 transcription proves too slow in
> practice. Voice-memo transcription is async/background and not latency-critical, so the
> baseline is likely good enough — this recovers AVX2/AVX-512 speed *without* losing the
> run-everywhere guarantee, at the cost of a multi-file sidecar bundle.

---

## Problem this solves

The baseline build trades speed for reach: one binary compiled to SSE4.2 runs on every
x86-64 CPU but leaves AVX2/FMA/AVX-512 performance on the table for modern machines (often
2–4× slower matmul on long clips / larger models). We want **both**: fast on capable CPUs,
still working on old ones.

## Approach: ggml runtime backend dispatch

ggml (whisper.cpp's tensor lib) can build **multiple CPU variants** and pick the best one at
runtime by probing CPU features. Two cmake flags:

- `-DGGML_BACKEND_DL=ON` — build the CPU backend as a **dynamically loaded** module rather
  than statically linked into `whisper-cli`.
- `-DGGML_CPU_ALL_VARIANTS=ON` — emit one module per micro-arch tier:
  `sse42`, `sandybridge` (AVX), `haswell` (AVX2+FMA+BMI2), `skylakex`/`icelake` (AVX-512), …
  At startup ggml loads the highest variant the running CPU supports and falls back down to
  `sse42`.

`GGML_BACKEND_DL` requires shared libs, so this also flips `-DBUILD_SHARED_LIBS=ON`. The
sidecar stops being a single static `.exe`/ELF and becomes `whisper-cli` **plus** a set of
loadable libraries (`libggml-base`, `libggml-cpu-haswell`, `libggml-cpu-sse42`, …) that must
travel with it.

Scope: **x86-64 only.** macOS arm64 (and any aarch64 target) is a single NEON variant — keep
it static, no change. So the matrix forks: arm64 stays as-is, the three x86-64 targets get the
multi-variant treatment.

---

## Work breakdown

### 1. CI build (`.github/workflows/build.yml`)
- For the three x86-64 whisper builds, replace the baseline-ISA `cmake_extra` with:
  `-DBUILD_SHARED_LIBS=ON -DGGML_BACKEND_DL=ON -DGGML_CPU_ALL_VARIANTS=ON`.
  (Drop the explicit `-DGGML_AVX*=OFF` flags — variants now cover the full range.)
- After build, collect **all** produced artifacts, not just `whisper-cli`:
  `whisper-cli(.exe)` + `ggml*`/`libggml*` core libs + every `*ggml-cpu-*` variant lib
  (`.dll` on Windows, `.so` on Linux, `.dylib` on macOS). Stage them into a per-target
  sidecar resource dir.
- arm64 macOS keeps the current single-binary path.
- Bump the whisper cache key again (artifact set changed).

### 2. Tauri bundling (`src-tauri/tauri.conf.json`)
- `externalBin` still points at `whisper-cli` (the launchable sidecar).
- Add the variant/core libs to `bundle.resources` (per-platform) so they ship next to the
  sidecar. Confirm the resource layout that lands them in a directory the loader can find on
  each OS (NSIS/MSI on Windows, AppImage/.deb on Linux, .app on macOS).

### 3. Runtime library resolution (`src-tauri/src/commands/speech_to_text.rs`, `voice_memos.rs`)
- ggml-DL finds backend modules via its search path; the cleanest cross-platform knob is the
  `GGML_BACKEND_PATH` env var (or running the sidecar with its CWD set to the resource dir).
- When spawning the sidecar (`shell.sidecar("whisper")`), resolve the bundled resource dir via
  Tauri's path API and set the env/CWD so the loader sees the variant libs. Centralise this in
  one helper used by all three spawn sites.
- Keep `cpu_unsupported_message` as the final safety net (a machine lacking even SSE4.2, or a
  missing-libs misconfiguration, still degrades to a clear message).

### 4. Verification (owner, on real hardware)
- **AVX2 machine** (laptop): run a transcribe; confirm ggml's stderr log reports it loaded the
  `haswell` (or higher) variant, and measure speed vs the baseline build on the same clip.
- **No-AVX2 VM** (Pentium G4560): confirm it loads `sse42` and transcribes without
  `STATUS_ILLEGAL_INSTRUCTION` — i.e. the fallback path still works.
- Confirm the bundled installer actually carries the variant libs (inspect the installed dir).

---

## Risks / open questions
- **Bundle size & file count.** Several extra MB of variant libs per platform; more files for
  AV/code-signing to flag. Windows SmartScreen / macOS notarization must cover every `.dll`/
  `.dylib`, not just the exe.
- **Loader path fragility.** Getting `GGML_BACKEND_PATH`/CWD right across NSIS, AppImage, and
  .app layouts is the main integration risk; a wrong path silently loses dispatch (or fails to
  load any backend). Needs explicit on-device checks per OS.
- **`GGML_BACKEND_DL` maturity.** Pin the whisper.cpp tag and verify the variant set it emits;
  the tier names/flags have shifted across ggml releases.
- **Marginal benefit for our default model.** If users mostly run `tiny.en`/`base.en` on short
  voice memos, the baseline may already be fast enough — measure (step 4) before committing to
  the added complexity.

## Out of scope
- Any change to the privacy model (still 100% local, no cloud STT).
- arm64 / Android / iOS paths (NEON single-variant; iOS has no sidecar at all).

## Process
- New worktree off `main`; conventional commits (`feat(stt):` / `chore(ci):`).
- Land only after the baseline PR (`fix/stt-cpu-portability`) merges — this builds on top of it.
- Owner verifies on AVX2 + non-AVX2 hardware before merge (CI can't prove runtime dispatch).
