#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# MoodBloom dev launcher
#
# Usage:
#   ./scripts/dev.sh                                    # Phone only (default)
#   ./scripts/dev.sh phone                              # Phone only
#   ./scripts/dev.sh watch                              # Watch emulator only
#   ./scripts/dev.sh desktop                            # Desktop app only
#   ./scripts/dev.sh phone watch                        # Phone + Watch
#   ./scripts/dev.sh desktop phone                      # Desktop + Phone (sync testing)
#   ./scripts/dev.sh desktop phone watch                # All three
#
#   --avd <name>         Override phone AVD name
#   --watch-avd <name>   Override watch AVD name
#   --no-snapshot        Launch emulators fresh (ignore/discard quick-boot state)
#   --install-wear       Sideload wear APK on phone emulator (Wear OS companion)
#   --list-avds          List available AVDs
#   --help               This message
#
# Emulator state (Wear OS app, paired watch, etc.) is preserved between runs
# via Android quick-boot snapshots. Use --no-snapshot for a clean slate.
# The watch app is always rebuilt and reinstalled on every launch.
#
# Prerequisites:
#   - Android SDK: emulator + adb on PATH (or ANDROID_HOME set)
#   - AVDs exist (create in Android Studio: Tools → Device Manager)
#   - npm / node installed
#   - Java 17 JDK (javac required by Gradle buildSrc)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
PHONE_AVD="${MOODBLOOM_PHONE_AVD:-Medium_Phone_API_35}"
WATCH_AVD="${MOODBLOOM_WATCH_AVD:-Wear_OS_Large_Round}"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
EMULATOR="$ANDROID_HOME/emulator/emulator"
ADB="$ANDROID_HOME/platform-tools/adb"
BOOT_TIMEOUT=360   # Play Store images do a long first cold-boot (no snapshot = no quick-boot)

JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
export JAVA_HOME

START_PHONE=false
START_WATCH=false
START_DESKTOP=false
NO_SNAPSHOT=false
INSTALL_WEAR=false

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# IMPORTANT: all display functions write to STDERR so they are never captured
# when a function is called inside $(...) to return a value (e.g. serial IDs).
info()    { echo -e "${CYAN}[INFO]${RESET} $*"      >&2; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"     >&2; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"    >&2; }
error()   { echo -e "${RED}[ERR]${RESET}  $*"       >&2; }
step()    { echo -e "\n${BOLD}${BLUE}▶ $*${RESET}"  >&2; }

# ── Argument parsing ──────────────────────────────────────────────────────────
[[ $# -eq 0 ]] && START_PHONE=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    phone)           START_PHONE=true ;;
    watch)           START_WATCH=true ;;
    desktop)         START_DESKTOP=true ;;
    --avd)           shift; PHONE_AVD="$1" ;;
    --watch-avd)     shift; WATCH_AVD="$1" ;;
    --no-snapshot)   NO_SNAPSHOT=true ;;
    --install-wear)  INSTALL_WEAR=true ;;
    --list-avds)
      echo "Available AVDs:"; "$EMULATOR" -list-avds 2>/dev/null; exit 0 ;;
    --help|-h)
      sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)
      error "Unknown argument: $1 (use --help)"; exit 1 ;;
  esac
  shift
done

# ── Tool check ────────────────────────────────────────────────────────────────
check_tools() {
  step "Checking prerequisites"
  local ok=true

  if $START_PHONE || $START_WATCH; then
    [[ -x "$EMULATOR" ]] || { error "emulator not found at $EMULATOR"; ok=false; }
    [[ -x "$ADB" ]]      || { error "adb not found at $ADB"; ok=false; }
    if [[ ! -x "${JAVA_HOME}/bin/javac" ]]; then
      error "No javac at ${JAVA_HOME}/bin/javac"
      error "Install: sudo apt install openjdk-17-jdk"
      ok=false
    else
      info "Java: ${JAVA_HOME}/bin/javac ✓"
    fi
  fi

  command -v npm &>/dev/null || { error "npm not found"; ok=false; }
  $ok || exit 1
  success "All tools present"
}

# ── Emulator helpers ──────────────────────────────────────────────────────────

# Print the serial of a running emulator matching the given AVD name, or "".
# Only stdout is used for the return value; all status goes to stderr.
find_running_serial() {
  local avd="$1"
  while IFS= read -r serial; do
    local name
    name=$("$ADB" -s "$serial" emu avd name 2>/dev/null | head -1 | tr -d '\r' | tr ' ' '_')
    if [[ "$name" == "$avd" ]] || [[ "$name" == "${avd// /_}" ]]; then
      echo "$serial"; return
    fi
  done < <("$ADB" devices | grep '^emulator-' | awk '{print $1}')
}

# Wait until $serial finishes booting (sys.boot_completed=1).
wait_for_boot() {
  local serial="$1"
  local elapsed=0
  info "Waiting for $serial to boot (up to ${BOOT_TIMEOUT}s)…"
  until "$ADB" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | grep -q "^1"; do
    sleep 3; elapsed=$((elapsed+3))
    printf "." >&2
    if [[ $elapsed -ge $BOOT_TIMEOUT ]]; then
      echo "" >&2
      error "Timed out waiting for $serial after ${BOOT_TIMEOUT}s"
      return 1
    fi
  done
  echo "" >&2
  success "$serial booted"
}

# Start the emulator process for $avd in the background.
# Does NOT wait for it to appear in adb — call wait_for_serial afterwards.
start_emulator_bg() {
  local avd="$1"
  local kind="${2:-phone}"

  local snapshot_flags=()
  # Use "auto" for phone so the emulator picks the best available GPU mode
  # (matches the AVD's configured hw.gpu.mode). swiftshader_indirect can crash
  # with newer API 36.x images that use virtio-gpu-pipe transport.
  # Watch uses "guest" (no GL acceleration — simpler and stable).
  local gpu_mode="auto"
  local extra_flags=()

  if [[ "$kind" == "watch" ]]; then
    gpu_mode="guest"
    extra_flags+=(-no-boot-anim)
  fi
  if $NO_SNAPSHOT; then
    snapshot_flags=(-no-snapshot-load -no-snapshot-save)
  fi

  "$EMULATOR" -avd "$avd" -gpu "$gpu_mode" \
    "${snapshot_flags[@]+"${snapshot_flags[@]}"}" \
    "${extra_flags[@]+"${extra_flags[@]}"}" \
    > "/tmp/moodbloom_emu_${avd}.log" 2>&1 &
  local pid=$!
  echo "$pid" > "/tmp/moodbloom_emu_${avd}.pid"
  info "Emulator '$avd' PID $pid — log: /tmp/moodbloom_emu_${avd}.log"
}

# Poll adb until the emulator for $avd is visible by name (via find_running_serial).
# This is reliable even when multiple emulators start simultaneously because it
# identifies each device by its actual AVD name, not by "what serial appeared new".
# Prints the serial on stdout; all status to stderr.
# $1 = avd name, $2 = human label (for messages)
wait_for_serial() {
  local avd="$1"
  local label="$2"
  local max_attempts=45   # 45 × 2 s = 90 s
  local serial=""
  local attempts=0

  info "Waiting for $label emulator ($avd) to appear in adb (up to $((max_attempts*2))s)…"
  while [[ -z "$serial" && $attempts -lt $max_attempts ]]; do
    sleep 2; attempts=$((attempts+1))
    printf "." >&2
    serial=$(find_running_serial "$avd")
  done
  echo "" >&2

  if [[ -z "$serial" ]]; then
    error "$label emulator ($avd) did not appear after $((max_attempts*2))s"
    return 1
  fi
  info "$label emulator detected: $serial (AVD: $avd)"
  echo "$serial"   # ← only stdout; captured by caller
}

# Full launch: start in bg, wait for serial by AVD name, wait for boot. Prints serial.
launch_avd() {
  local avd="$1"
  local label="$2"
  local kind="${3:-phone}"

  step "Starting $label emulator: $avd"

  # Already running?
  local serial
  serial=$(find_running_serial "$avd")
  if [[ -n "$serial" ]]; then
    warn "$avd already running as $serial — skipping launch"
    echo "$serial"
    return 0
  fi

  start_emulator_bg "$avd" "$kind"

  local new_serial
  new_serial=$(wait_for_serial "$avd" "$label") || return 1
  wait_for_boot "$new_serial" || return 1
  echo "$new_serial"   # ← only stdout output
}

pair_watch_to_phone() {
  local phone_serial="$1"
  step "Setting up watch ↔ phone port forwarding"
  "$ADB" -s "$phone_serial" forward tcp:5601 tcp:5601 2>/dev/null || true
  info "Port 5601 forwarded on $phone_serial"
  info "Open 'Wear OS' companion app on the phone emulator and follow pairing."
}

# Build the wear APK (if needed) and install it on the watch emulator.
# ANDROID_SERIAL scopes adb to the watch so the phone is untouched.
build_and_install_watch_app() {
  local watch_serial="$1"
  local android_dir
  android_dir="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/gen/android"

  step "Building & installing watch app on $watch_serial"

  local props="$android_dir/local.properties"
  [[ -f "$props" ]] || { echo "sdk.dir=$ANDROID_HOME" > "$props"; info "Created $props"; }

  if ANDROID_SERIAL="$watch_serial" JAVA_HOME="$JAVA_HOME" \
       "$android_dir/gradlew" -p "$android_dir" :wear:installDebug --daemon \
       > /tmp/moodbloom_wear_install.log 2>&1; then
    success "Watch app installed on $watch_serial"
  else
    warn "Watch app install failed — log: /tmp/moodbloom_wear_install.log"
    warn "Retry: cd src-tauri/gen/android && ANDROID_SERIAL=$watch_serial JAVA_HOME=$JAVA_HOME ./gradlew :wear:installDebug"
  fi
}

# Sideload the wear APK onto the phone so it shows in Wear OS companion.
install_wear_apk_on_phone() {
  local phone_serial="$1"
  local android_dir
  android_dir="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/gen/android"
  local apk_path
  apk_path=$(find "$android_dir" -name "*.apk" -path "*/wear/debug/*" 2>/dev/null | head -1)

  if [[ -z "$apk_path" ]]; then
    warn "--install-wear: no debug APK found; building first…"
    local props="$android_dir/local.properties"
    [[ -f "$props" ]] || echo "sdk.dir=$ANDROID_HOME" > "$props"
    JAVA_HOME="$JAVA_HOME" "$android_dir/gradlew" -p "$android_dir" :wear:assembleDebug --daemon \
      > /tmp/moodbloom_wear_build.log 2>&1 \
      || { warn "Build failed — see /tmp/moodbloom_wear_build.log"; return; }
    apk_path=$(find "$android_dir" -name "*.apk" -path "*/wear/debug/*" 2>/dev/null | head -1)
  fi

  step "Sideloading wear APK on phone emulator ($phone_serial)"
  info "APK: $apk_path"
  "$ADB" -s "$phone_serial" install -r "$apk_path" \
    && success "Wear app sideloaded — visible in Wear OS companion" \
    || warn "Install failed — try: adb -s $phone_serial install $apk_path"
}

# ── Vite dev server ───────────────────────────────────────────────────────────
VITE_PID=""

start_vite() {
  step "Starting Vite dev server (shared)"
  npm run dev > /tmp/moodbloom_vite.log 2>&1 &
  VITE_PID=$!
  echo "$VITE_PID" > /tmp/moodbloom_vite.pid
  info "Vite PID $VITE_PID — log: /tmp/moodbloom_vite.log"

  local attempts=0
  printf "  Waiting for Vite on :1420 " >&2
  while ! curl -sf http://localhost:1420 > /dev/null 2>&1; do
    sleep 1; attempts=$((attempts+1))
    printf "." >&2
    if [[ $attempts -ge 30 ]]; then
      echo "" >&2
      error "Vite did not start within 30s — check /tmp/moodbloom_vite.log"
      return 1
    fi
  done
  echo "" >&2
  success "Vite ready on http://localhost:1420"
}

# ── Background dev process tracker ───────────────────────────────────────────
BG_PIDS=()

run_bg() {
  local label="$1"; shift
  local log="/tmp/moodbloom_${label// /_}.log"
  info "Launching [$label] in background — log: $log"
  "$@" > "$log" 2>&1 &
  local pid=$!
  BG_PIDS+=("$pid")
  echo "$pid" > "/tmp/moodbloom_bg_${label// /_}.pid"
}

# ── Cleanup ───────────────────────────────────────────────────────────────────
PHONE_SERIAL=""
WATCH_SERIAL=""

cleanup() {
  echo "" >&2
  info "Cleaning up…"

  for pid in "${BG_PIDS[@]:-}"; do
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null && info "Stopped background process $pid" || true
  done

  if [[ -n "$VITE_PID" ]]; then
    kill "$VITE_PID" 2>/dev/null && info "Stopped Vite PID $VITE_PID" || true
    rm -f /tmp/moodbloom_vite.pid
  fi

  for pid_file in /tmp/moodbloom_emu_*.pid; do
    [[ -f "$pid_file" ]] || continue
    local pid; pid=$(cat "$pid_file")
    kill "$pid" 2>/dev/null && info "Stopped emulator PID $pid" || true
    rm -f "$pid_file"
  done
}
trap cleanup EXIT INT TERM

# ── Main ──────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}${BLUE}MoodBloom Dev Launcher${RESET}"
printf "  Targets  : %s\n" "$(
  parts=()
  $START_DESKTOP && parts+=("desktop")
  $START_PHONE   && parts+=("phone (AVD: $PHONE_AVD)")
  $START_WATCH   && parts+=("watch (AVD: $WATCH_AVD)")
  echo "${parts[*]:-none}"
)"
$NO_SNAPSHOT  && printf "  Snapshots: disabled (--no-snapshot)\n"
$INSTALL_WEAR && printf "  Wear APK : will sideload on phone\n"
echo ""

check_tools

# ── Start emulators in parallel, then wait for both ──────────────────────────
# Start all emulators before waiting for any — they boot in parallel.

if $START_PHONE; then
  existing=$(find_running_serial "$PHONE_AVD")
  if [[ -n "$existing" ]]; then
    warn "$PHONE_AVD already running as $existing — skipping launch"
    PHONE_SERIAL="$existing"
  else
    step "Starting Phone emulator: $PHONE_AVD"
    start_emulator_bg "$PHONE_AVD" "phone"
  fi
fi

if $START_WATCH; then
  existing=$(find_running_serial "$WATCH_AVD")
  if [[ -n "$existing" ]]; then
    warn "$WATCH_AVD already running as $existing — skipping launch"
    WATCH_SERIAL="$existing"
  else
    step "Starting Watch emulator: $WATCH_AVD"
    start_emulator_bg "$WATCH_AVD" "watch"
  fi
fi

# Wait for serials by AVD name (reliable even when both start simultaneously)
if $START_PHONE && [[ -z "$PHONE_SERIAL" ]]; then
  PHONE_SERIAL=$(wait_for_serial "$PHONE_AVD" "Phone") || exit 1
  wait_for_boot "$PHONE_SERIAL" || exit 1
fi

if $START_WATCH && [[ -z "$WATCH_SERIAL" ]]; then
  WATCH_SERIAL=$(wait_for_serial "$WATCH_AVD" "Watch") || exit 1
  wait_for_boot "$WATCH_SERIAL" || exit 1
fi

# ── Post-boot setup ───────────────────────────────────────────────────────────
if $START_PHONE && $INSTALL_WEAR; then
  install_wear_apk_on_phone "$PHONE_SERIAL"
fi

if $START_WATCH; then
  build_and_install_watch_app "$WATCH_SERIAL"
  if $START_PHONE; then
    pair_watch_to_phone "$PHONE_SERIAL"
  fi
fi

# ── Start dev servers ─────────────────────────────────────────────────────────
NEED_ANDROID=$START_PHONE

if $START_DESKTOP && $NEED_ANDROID; then
  start_vite

  step "Starting Tauri Android dev (background)"
  info "Logs: /tmp/moodbloom_android_dev.log"
  if [[ -n "$PHONE_SERIAL" ]]; then
    run_bg "android dev" \
      env JAVA_HOME="$JAVA_HOME" \
      npm run tauri android dev -- "$PHONE_SERIAL" --no-dev-server-wait \
        --config '{"build":{"beforeDevCommand":""}}'
  else
    run_bg "android dev" \
      env JAVA_HOME="$JAVA_HOME" \
      npm run tauri android dev -- --no-dev-server-wait \
        --config '{"build":{"beforeDevCommand":""}}'
  fi

  step "Starting Tauri Desktop dev (foreground)"
  info "Ctrl+C to stop everything"
  echo ""
  npm run tauri dev -- --no-dev-server

elif $START_DESKTOP; then
  step "Starting Tauri Desktop dev"
  info "Ctrl+C to stop"
  echo ""
  npm run tauri dev

elif $NEED_ANDROID; then
  step "Starting Tauri Android dev"
  info "Ctrl+C to stop everything"
  # Pass the serial as a positional arg so the Tauri CLI skips the interactive
  # device-picker prompt. Without this, when the watch emulator is also running,
  # Tauri sees 2 devices and asks the user to type a number.
  # Usage: tauri android dev [OPTIONS] [DEVICE] [-- <ARGS>...]
  echo ""
  if [[ -n "$PHONE_SERIAL" ]]; then
    info "Targeting phone: $PHONE_SERIAL"
    JAVA_HOME="$JAVA_HOME" npm run tauri android dev -- "$PHONE_SERIAL"
  else
    JAVA_HOME="$JAVA_HOME" npm run tauri android dev
  fi

elif $START_WATCH; then
  step "Watch emulator running — watch app installed above"
  info "Ctrl+C to stop."
  wait

else
  error "No targets selected. Try: ./scripts/dev.sh phone | watch | desktop | --help"
  exit 1
fi
