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
#   --install-wear       Install wear APK on phone after it boots
#   --list-avds          List available AVDs
#   --help               This message
#
# Emulator state (Wear OS app, paired watch, etc.) is preserved between runs
# via Android quick-boot snapshots. Use --no-snapshot for a clean slate.
#
# Prerequisites:
#   - Android SDK: emulator + adb on PATH (or ANDROID_HOME set)
#   - AVDs exist (create in Android Studio: Tools → Device Manager)
#   - npm / node installed
#   - Java 17 JDK (javac required by Gradle buildSrc)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
PHONE_AVD="${MOODBLOOM_PHONE_AVD:-Medium_Phone_API_36.1}"
WATCH_AVD="${MOODBLOOM_WATCH_AVD:-Wear_OS_Large_Round}"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
EMULATOR="$ANDROID_HOME/emulator/emulator"
ADB="$ANDROID_HOME/platform-tools/adb"
BOOT_TIMEOUT=180        # seconds to wait for emulator boot

JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
export JAVA_HOME

# Target flags
START_PHONE=false
START_WATCH=false
START_DESKTOP=false

# Emulator options
NO_SNAPSHOT=false       # if true: -no-snapshot-load -no-snapshot-save
INSTALL_WEAR=false      # auto-install wear APK on phone after boot

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }
error()   { echo -e "${RED}[ERR]${RESET}  $*" >&2; }
step()    { echo -e "\n${BOLD}${BLUE}▶ $*${RESET}"; }

# ── Argument parsing ──────────────────────────────────────────────────────────
# No positional args → default to phone
if [[ $# -eq 0 ]]; then
  START_PHONE=true
fi

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
      sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)
      error "Unknown argument: $1 (use --help)"; exit 1 ;;
  esac
  shift
done

# If only watch/desktop requested and phone was not explicitly requested, don't start phone
# (overrides the old "phone=true by default" behaviour when other targets are given)

# ── Tool check ────────────────────────────────────────────────────────────────
check_tools() {
  step "Checking prerequisites"
  local ok=true

  if $START_PHONE || $START_WATCH; then
    [[ -x "$EMULATOR" ]] || { error "emulator not found at $EMULATOR"; ok=false; }
    [[ -x "$ADB" ]]      || { error "adb not found at $ADB"; ok=false; }
  fi

  command -v npm &>/dev/null || { error "npm not found"; ok=false; }

  if $START_PHONE || $START_WATCH; then
    if [[ ! -x "${JAVA_HOME}/bin/javac" ]]; then
      error "No javac at ${JAVA_HOME}/bin/javac"
      error "Install Java 17 JDK:  sudo apt install openjdk-17-jdk"
      error "Or set: export JAVA_HOME=/path/to/jdk17"
      ok=false
    else
      info "Java: ${JAVA_HOME}/bin/javac ✓"
    fi
  fi

  $ok || exit 1
  success "All tools present"
}

# ── Emulator helpers ──────────────────────────────────────────────────────────

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

wait_for_boot() {
  local serial="$1"
  local elapsed=0
  info "Waiting for $serial to boot (up to ${BOOT_TIMEOUT}s)…"
  until "$ADB" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | grep -q "^1"; do
    sleep 3; elapsed=$((elapsed+3))
    printf "."
    if [[ $elapsed -ge $BOOT_TIMEOUT ]]; then
      echo ""; error "Timed out waiting for $serial after ${BOOT_TIMEOUT}s"
      return 1
    fi
  done
  echo ""; success "$serial booted"
}

# Launch an AVD, return its serial.
# $1 = avd name, $2 = human label, $3 = "watch" for watch-tuned flags
launch_avd() {
  local avd="$1"
  local label="$2"
  local kind="${3:-phone}"

  step "Starting $label emulator: $avd"

  local serial
  serial=$(find_running_serial "$avd")
  if [[ -n "$serial" ]]; then
    warn "$avd already running as $serial — skipping launch"
    echo "$serial"; return 0
  fi

  local before
  before=$("$ADB" devices | awk '/emulator-/{print $1}' | sort)

  # Phone: enable quick-boot snapshots by default so state (installed apps,
  # Wear OS pairing) persists between sessions. --no-snapshot overrides this.
  # Watch: signed Wear OS images use -gpu guest; -no-boot-anim speeds things up.
  local snapshot_flags=()
  local gpu_mode="swiftshader_indirect"
  local extra_flags=()

  if [[ "$kind" == "watch" ]]; then
    gpu_mode="guest"
    extra_flags+=(-no-boot-anim)
  fi
  if $NO_SNAPSHOT; then
    snapshot_flags=(-no-snapshot-load -no-snapshot-save)
  fi
  # Default (phone & watch): no snapshot flags → quick-boot is used (state is preserved)
  # The watch app is always reinstalled after boot, so a stale snapshot is fine.

  "$EMULATOR" -avd "$avd" -gpu "$gpu_mode" \
    "${snapshot_flags[@]}" \
    "${extra_flags[@]}" \
    > "/tmp/moodbloom_emu_${avd}.log" 2>&1 &
  local pid=$!
  echo "$pid" > "/tmp/moodbloom_emu_${avd}.pid"
  info "Emulator PID $pid — log: /tmp/moodbloom_emu_${avd}.log"

  # Wait up to 90 s for the new serial (Wear emulators are slow to register)
  local max_attempts=45
  local new_serial=""
  local attempts=0
  while [[ -z "$new_serial" && $attempts -lt $max_attempts ]]; do
    sleep 2; attempts=$((attempts+1))
    printf "."
    local after
    after=$("$ADB" devices | grep '^emulator-' | awk '{print $1}' | sort)
    new_serial=$(comm -13 <(echo "$before") <(echo "$after") | head -1)
  done
  echo ""

  if [[ -z "$new_serial" ]]; then
    error "New emulator did not appear in 'adb devices' after $((max_attempts*2))s"
    error "  cat /tmp/moodbloom_emu_${avd}.log"
    return 1
  fi

  info "New emulator detected: $new_serial"
  wait_for_boot "$new_serial"
  echo "$new_serial"
}

pair_watch_to_phone() {
  local phone_serial="$1"
  step "Setting up watch ↔ phone port forwarding"
  "$ADB" -s "$phone_serial" forward tcp:5601 tcp:5601 2>/dev/null || true
  info "Port 5601 forwarded on $phone_serial"
  info "Open 'Wear OS' companion app on the phone emulator and follow pairing."
}

# Build the wear APK and install it directly on the watch emulator via Gradle's
# installDebug task. ANDROID_SERIAL targets the specific watch serial so this
# works even when both phone and watch emulators are connected simultaneously.
build_and_install_watch_app() {
  local watch_serial="$1"
  local android_dir
  android_dir="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/gen/android"

  step "Building & installing watch app on $watch_serial"

  # Ensure local.properties exists (Gradle needs sdk.dir)
  local props="$android_dir/local.properties"
  if [[ ! -f "$props" ]]; then
    echo "sdk.dir=$ANDROID_HOME" > "$props"
    info "Created $props"
  fi

  if ANDROID_SERIAL="$watch_serial" JAVA_HOME="$JAVA_HOME" \
       "$android_dir/gradlew" -p "$android_dir" :wear:installDebug --daemon \
       > /tmp/moodbloom_wear_install.log 2>&1; then
    success "Watch app installed on $watch_serial"
  else
    warn "Watch app install failed — see log: /tmp/moodbloom_wear_install.log"
    warn "Retry manually:"
    warn "  cd src-tauri/gen/android && ANDROID_SERIAL=$watch_serial JAVA_HOME=$JAVA_HOME ./gradlew :wear:installDebug"
  fi
}

# Install a pre-built wear APK on the phone emulator (--install-wear flag).
# The phone emulator needs the MoodBloom watch app sideloaded so it appears
# in the Wear OS companion app's "apps on your phone" list.
install_wear_apk_on_phone() {
  local phone_serial="$1"
  local android_dir
  android_dir="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/gen/android"
  local apk_path
  apk_path=$(find "$android_dir" -name "*.apk" -path "*/wear/debug/*" 2>/dev/null | head -1)

  if [[ -z "$apk_path" ]]; then
    warn "--install-wear: wear debug APK not found; building first…"
    local props="$android_dir/local.properties"
    [[ -f "$props" ]] || echo "sdk.dir=$ANDROID_HOME" > "$props"
    JAVA_HOME="$JAVA_HOME" "$android_dir/gradlew" -p "$android_dir" :wear:assembleDebug --daemon \
      > /tmp/moodbloom_wear_build.log 2>&1 || { warn "Build failed — check /tmp/moodbloom_wear_build.log"; return; }
    apk_path=$(find "$android_dir" -name "*.apk" -path "*/wear/debug/*" 2>/dev/null | head -1)
  fi

  step "Installing wear APK on phone emulator ($phone_serial)"
  info "APK: $apk_path"
  "$ADB" -s "$phone_serial" install -r "$apk_path" && \
    success "Wear app sideloaded on phone — visible in Wear OS companion" || \
    warn "Install failed — try: adb -s $phone_serial install $apk_path"
}

# ── Vite dev server ───────────────────────────────────────────────────────────
VITE_PID=""

# Start Vite in background and wait until port 1420 is ready.
# Used when running desktop + android in parallel (both share one Vite instance).
start_vite() {
  step "Starting Vite dev server (shared)"
  npm run dev > /tmp/moodbloom_vite.log 2>&1 &
  VITE_PID=$!
  echo "$VITE_PID" > /tmp/moodbloom_vite.pid
  info "Vite PID $VITE_PID — log: /tmp/moodbloom_vite.log"

  local attempts=0
  printf "  Waiting for Vite on :1420 "
  while ! curl -sf http://localhost:1420 > /dev/null 2>&1; do
    sleep 1; attempts=$((attempts+1))
    printf "."
    if [[ $attempts -ge 30 ]]; then
      echo ""
      error "Vite did not start within 30s — check /tmp/moodbloom_vite.log"
      return 1
    fi
  done
  echo ""; success "Vite ready on http://localhost:1420"
}

# ── Background dev process tracker ───────────────────────────────────────────
BG_PIDS=()

# Run a command in background, track its PID, tee output to a log file
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
  echo ""
  info "Cleaning up…"

  # Stop background dev processes
  for pid in "${BG_PIDS[@]:-}"; do
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null && info "Stopped background process $pid" || true
  done

  # Stop Vite if we started it
  if [[ -n "$VITE_PID" ]]; then
    kill "$VITE_PID" 2>/dev/null && info "Stopped Vite PID $VITE_PID" || true
    rm -f /tmp/moodbloom_vite.pid
  fi

  # Stop emulators
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
$INSTALL_WEAR && printf "  Wear APK : will auto-install on phone\n"
echo ""

check_tools

# ── Start emulators ───────────────────────────────────────────────────────────
if $START_PHONE; then
  PHONE_SERIAL=$(launch_avd "$PHONE_AVD" "Phone" "phone") || exit 1
  if $INSTALL_WEAR; then
    install_wear_apk_on_phone "$PHONE_SERIAL"
  fi
fi

if $START_WATCH; then
  WATCH_SERIAL=$(launch_avd "$WATCH_AVD" "Watch" "watch") || exit 1
  # Always build + install the watch app on the watch emulator automatically.
  # ANDROID_SERIAL targets only the watch so the phone emulator is not affected.
  build_and_install_watch_app "$WATCH_SERIAL"
  if $START_PHONE && [[ -n "$PHONE_SERIAL" ]]; then
    pair_watch_to_phone "$PHONE_SERIAL"
  fi
fi

# ── Start dev servers ─────────────────────────────────────────────────────────
#
# Combinations:
#   desktop only        → tauri dev (manages its own Vite)
#   phone/watch only    → tauri android dev (manages its own Vite)
#   desktop + android   → start shared Vite once, then both tauri processes
#                         with --no-dev-server (desktop) / --no-dev-server-wait
#                         + config override (android)
#

NEED_ANDROID=$START_PHONE  # android dev only runs when phone is selected

if $START_DESKTOP && $NEED_ANDROID; then
  # ── Shared Vite + parallel targets ──────────────────────────────────────────
  start_vite

  step "Starting Tauri Android dev (background)"
  info "Hot-reload active for Android — logs: /tmp/moodbloom_android_dev.log"
  run_bg "android dev" \
    env JAVA_HOME="$JAVA_HOME" \
    npm run tauri android dev -- --no-dev-server-wait \
      --config '{"build":{"beforeDevCommand":""}}'

  step "Starting Tauri Desktop dev (foreground)"
  info "Hot-reload active for Desktop — Ctrl+C to stop everything"
  echo ""
  npm run tauri dev -- --no-dev-server

elif $START_DESKTOP; then
  # ── Desktop only ────────────────────────────────────────────────────────────
  step "Starting Tauri Desktop dev"
  info "Hot-reload active — Ctrl+C to stop"
  echo ""
  npm run tauri dev

elif $NEED_ANDROID; then
  # ── Android only (phone ± watch) ────────────────────────────────────────────
  step "Starting Tauri Android dev"
  info "Hot-reload active — Ctrl+C to stop everything"
  echo ""
  JAVA_HOME="$JAVA_HOME" npm run tauri android dev

elif $START_WATCH; then
  # ── Watch emulator only (no phone, no desktop) ───────────────────────────────
  step "Watch emulator is running (watch-only mode)"
  info "Watch app already installed above. Ctrl+C to stop."
  wait

else
  error "No targets selected. Try: ./scripts/dev.sh phone | watch | desktop | --help"
  exit 1
fi
