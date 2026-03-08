#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# MoodBloom dev launcher
#
# Usage:
#   ./scripts/dev.sh                  # Phone only (Tauri Android dev)
#   ./scripts/dev.sh phone            # Same as above
#   ./scripts/dev.sh phone watch      # Phone + Wear OS emulator (paired)
#   ./scripts/dev.sh watch            # Wear OS emulator only (no phone)
#   ./scripts/dev.sh --list-avds      # List all available AVDs
#   ./scripts/dev.sh --help           # Show this help
#
# Prerequisites:
#   - Android SDK with `emulator`, `adb` on PATH (or ANDROID_HOME set)
#   - Tauri CLI v2: npm i -g @tauri-apps/cli   (or use npx)
#   - AVDs already created in Android Studio:
#       Phone: "MoodBloom_Phone"   (API 35, Pixel 8)
#       Watch:  "MoodBloom_Watch"  (API 33, Wear OS Large Round)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config (override via env vars) ───────────────────────────────────────────
PHONE_AVD="${MOODBLOOM_PHONE_AVD:-MoodBloom_Phone}"
WATCH_AVD="${MOODBLOOM_WATCH_AVD:-MoodBloom_Watch}"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
EMULATOR="$ANDROID_HOME/emulator/emulator"
ADB="$ANDROID_HOME/platform-tools/adb"
PACKAGE="com.moodbloom.app"

# Tauri dev command — adjust if using bun/yarn
TAURI_DEV="npm run tauri android dev"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }
error()   { echo -e "${RED}[ERR]${RESET}  $*"; }
step()    { echo -e "\n${BOLD}${BLUE}▶ $*${RESET}"; }

# ── Argument parsing ──────────────────────────────────────────────────────────
START_PHONE=true
START_WATCH=false

for arg in "$@"; do
  case "$arg" in
    phone)         START_PHONE=true ;;
    watch)         START_WATCH=true ;;
    phone+watch|watch+phone) START_PHONE=true; START_WATCH=true ;;
    --list-avds)
      info "Available AVDs:"
      "$EMULATOR" -list-avds 2>/dev/null || avdmanager list avd -c 2>/dev/null
      exit 0 ;;
    --help|-h)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      error "Unknown argument: $arg"
      exit 1 ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────

check_tools() {
  step "Checking prerequisites"
  local ok=true

  for tool in "$EMULATOR" "$ADB"; do
    if [[ ! -x "$tool" ]]; then
      error "Not found: $tool"
      ok=false
    fi
  done

  if ! command -v npx &>/dev/null; then
    error "npx not found — install Node.js"
    ok=false
  fi

  $ok || { error "Fix missing tools above, then re-run."; exit 1; }
  success "All tools found"
}

is_avd_running() {
  local avd="$1"
  "$ADB" devices | grep -q "emulator-" && \
    "$ADB" -e shell getprop ro.kernel.qemu.avd_name 2>/dev/null | grep -q "$avd"
}

start_emulator() {
  local avd="$1"
  local label="$2"

  step "Starting $label emulator: $avd"

  if is_avd_running "$avd"; then
    warn "$avd is already running — skipping launch"
    return
  fi

  # Start emulator in background, suppress verbose GPU output
  "$EMULATOR" -avd "$avd" -no-snapshot-save -gpu swiftshader_indirect \
    > /tmp/moodbloom_emulator_${avd}.log 2>&1 &
  local emu_pid=$!
  echo "$emu_pid" > /tmp/moodbloom_emu_${avd}.pid
  info "Emulator PID: $emu_pid — log: /tmp/moodbloom_emulator_${avd}.log"

  # Wait for boot
  info "Waiting for $label to boot (up to 120 s)…"
  local timeout=120
  local elapsed=0
  until "$ADB" -s "emulator-5554" shell getprop sys.boot_completed 2>/dev/null | grep -q "1"; do
    sleep 3
    elapsed=$((elapsed + 3))
    if [[ $elapsed -ge $timeout ]]; then
      error "$label did not boot within ${timeout}s"
      return 1
    fi
    echo -n "."
  done
  echo ""
  success "$label booted"
}

pair_watch_to_phone() {
  step "Pairing watch emulator to phone emulator"

  # The Wear OS emulator on 5556 pairs to phone on 5554 via adb forward
  local watch_serial="emulator-5556"
  local phone_serial="emulator-5554"

  # Forward the Wear pairing port
  "$ADB" -s "$phone_serial" forward tcp:5601 tcp:5601 2>/dev/null || true

  info "Open Wear OS companion app on the phone emulator and follow pairing steps."
  info "Or use: adb -s $watch_serial forward tcp:5601 tcp:5601"
  success "Port forwarding set up — manual pairing step required in companion app"
}

wait_for_confirm() {
  echo ""
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}$1${RESET}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  read -r -p "Press Enter when ready (or Ctrl+C to abort)…"
}

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  echo ""
  info "Shutting down…"
  for pid_file in /tmp/moodbloom_emu_*.pid; do
    [[ -f "$pid_file" ]] || continue
    local pid
    pid=$(cat "$pid_file")
    kill "$pid" 2>/dev/null && info "Stopped emulator PID $pid" || true
    rm -f "$pid_file"
  done
}
trap cleanup EXIT INT TERM

# ── Main ──────────────────────────────────────────────────────────────────────

echo -e "\n${BOLD}${BLUE}MoodBloom Dev Launcher${RESET}"
echo -e "  Phone: ${START_PHONE} | Watch: ${START_WATCH}\n"

check_tools

# ── Start emulators ───────────────────────────────────────────────────────────

if $START_PHONE; then
  start_emulator "$PHONE_AVD" "Phone"
fi

if $START_WATCH; then
  start_emulator "$WATCH_AVD" "Watch"
  if $START_PHONE; then
    pair_watch_to_phone
  fi
fi

# ── Tauri hot-reload ──────────────────────────────────────────────────────────

if $START_PHONE; then
  step "Starting Tauri Android dev server"
  info "Command: $TAURI_DEV"
  info "Hot-reload is active — save any .tsx/.ts file to see changes immediately"
  echo ""

  # Run in foreground so Ctrl+C kills cleanly
  eval "$TAURI_DEV"
fi

# ── Watch-only mode ───────────────────────────────────────────────────────────

if $START_WATCH && ! $START_PHONE; then
  step "Watch emulator running"
  info "Wear OS emulator is up. Use Android Studio to deploy the wearapp/ module."
  info "Press Ctrl+C to stop."
  wait
fi

# ── Test checkpoints ──────────────────────────────────────────────────────────
# (These only print if the Tauri dev server exits cleanly, not on Ctrl+C)

if $START_WATCH; then
  echo ""
  echo -e "${BOLD}${GREEN}✓ Test Checkpoint: Watch-Phone Communication${RESET}"
  echo "  1. In phone app: Settings → About → tap hidden '?' 7× → 'Watch Debug'"
  echo "     → tap 'Simulate Watch Mood Tap' → verify signal appears in timeline"
  echo "  2. Check Logcat (tag=WearListenerService) for 'Watch signal received'"
  echo "  3. Check Logcat (tag=WearPlugin) for 'Emitted wear://signal'"
fi
