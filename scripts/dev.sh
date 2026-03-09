#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# MoodBloom dev launcher
#
# Usage:
#   ./scripts/dev.sh                                # Phone only (auto-detect running emulator)
#   ./scripts/dev.sh phone                          # Same
#   ./scripts/dev.sh phone watch                    # Phone + Wear OS emulator (paired)
#   ./scripts/dev.sh watch                          # Wear OS emulator only
#   ./scripts/dev.sh --avd Medium_Phone_API_36.1    # Override phone AVD name
#   ./scripts/dev.sh --watch-avd Wear_OS_Small      # Override watch AVD name
#   ./scripts/dev.sh --list-avds                    # List available AVDs
#   ./scripts/dev.sh --help                         # This message
#
# If the target AVD is already running the script skips launch and uses it.
#
# Prerequisites:
#   - Android SDK: emulator + adb on PATH (or ANDROID_HOME set)
#   - AVD exists (create in Android Studio: Tools → Device Manager)
#   - npm / node installed
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Defaults (override with --avd / --watch-avd or env vars) ─────────────────
PHONE_AVD="${MOODBLOOM_PHONE_AVD:-Medium_Phone_API_36.1}"
WATCH_AVD="${MOODBLOOM_WATCH_AVD:-Wear_OS_Large_Round}"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
EMULATOR="$ANDROID_HOME/emulator/emulator"
ADB="$ANDROID_HOME/platform-tools/adb"
BOOT_TIMEOUT=180        # seconds to wait for emulator boot

# Java 17 JDK required — Java 21 on Ubuntu is JRE-only (no javac for Gradle buildSrc)
# Override with JAVA_HOME env var if your JDK is elsewhere.
JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
export JAVA_HOME

TAURI_DEV="JAVA_HOME=${JAVA_HOME} npm run tauri android dev"

START_PHONE=true
START_WATCH=false

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }
error()   { echo -e "${RED}[ERR]${RESET}  $*" >&2; }
step()    { echo -e "\n${BOLD}${BLUE}▶ $*${RESET}"; }

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    phone)         START_PHONE=true ;;
    watch)         START_WATCH=true ;;
    --avd)         shift; PHONE_AVD="$1" ;;
    --watch-avd)   shift; WATCH_AVD="$1" ;;
    --list-avds)
      echo "Available AVDs:"; "$EMULATOR" -list-avds 2>/dev/null; exit 0 ;;
    --help|-h)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)
      error "Unknown argument: $1 (use --help)"; exit 1 ;;
  esac
  shift
done

# ── Tool check ────────────────────────────────────────────────────────────────
check_tools() {
  step "Checking prerequisites"
  local ok=true
  [[ -x "$EMULATOR" ]] || { error "emulator not found at $EMULATOR"; ok=false; }
  [[ -x "$ADB" ]]      || { error "adb not found at $ADB"; ok=false; }
  command -v npm &>/dev/null || { error "npm not found"; ok=false; }

  # Gradle buildSrc needs a real JDK (javac), not just a JRE
  if [[ ! -x "${JAVA_HOME}/bin/javac" ]]; then
    error "No javac at ${JAVA_HOME}/bin/javac"
    error "Install Java 17 JDK:  sudo apt install openjdk-17-jdk"
    error "Or set: export JAVA_HOME=/path/to/jdk17"
    ok=false
  else
    info "Java: ${JAVA_HOME}/bin/java (javac present)"
  fi

  $ok || exit 1
  success "All tools present"
}

# ── Emulator helpers ──────────────────────────────────────────────────────────

# Return serial of a running emulator whose avd name matches $1, or ""
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

# Return the serial of ANY currently running emulator (first one)
any_running_serial() {
  "$ADB" devices | grep '^emulator-' | grep $'\tdevice' | awk '{print $1}' | head -1
}

# Wait for an emulator serial to finish booting
wait_for_boot() {
  local serial="$1"
  local elapsed=0
  info "Waiting for $serial to boot (up to ${BOOT_TIMEOUT}s)…"
  until "$ADB" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | grep -q "^1"; do
    sleep 3; elapsed=$((elapsed+3))
    printf "."
    if [[ $elapsed -ge $BOOT_TIMEOUT ]]; then
      echo ""; error "Timed out waiting for $serial after ${BOOT_TIMEOUT}s"
      error "Check: $ANDROID_HOME/emulator/emulator -avd $PHONE_AVD"
      return 1
    fi
  done
  echo ""; success "$serial booted"
}

# Launch an AVD and return its serial
launch_avd() {
  local avd="$1"
  local label="$2"

  step "Starting $label emulator: $avd"

  # Already running?
  local serial
  serial=$(find_running_serial "$avd")
  if [[ -n "$serial" ]]; then
    warn "$avd already running as $serial — skipping launch"
    echo "$serial"; return 0
  fi

  # Record serials before launch so we can identify the new one
  local before
  before=$("$ADB" devices | awk '/emulator-/{print $1}' | sort)

  "$EMULATOR" -avd "$avd" -no-snapshot-save -gpu swiftshader_indirect \
    > "/tmp/moodbloom_emu_${avd}.log" 2>&1 &
  local pid=$!
  echo "$pid" > "/tmp/moodbloom_emu_${avd}.pid"
  info "Emulator PID $pid — log: /tmp/moodbloom_emu_${avd}.log"

  # Wait up to 30 s for the new serial to appear in adb devices
  local new_serial=""
  local attempts=0
  while [[ -z "$new_serial" && $attempts -lt 20 ]]; do
    sleep 2; attempts=$((attempts+1))
    local after
    after=$("$ADB" devices | grep '^emulator-' | awk '{print $1}' | sort)
    new_serial=$(comm -13 <(echo "$before") <(echo "$after") | head -1)
  done

  if [[ -z "$new_serial" ]]; then
    error "New emulator did not appear in 'adb devices' — check the log:"
    error "  cat /tmp/moodbloom_emu_${avd}.log"
    return 1
  fi

  info "New emulator detected: $new_serial"
  wait_for_boot "$new_serial"
  echo "$new_serial"
}

pair_watch_to_phone() {
  local phone_serial="$1"
  local watch_serial="$2"
  step "Setting up watch ↔ phone port forwarding"
  "$ADB" -s "$phone_serial" forward tcp:5601 tcp:5601 2>/dev/null || true
  info "Port 5601 forwarded from $phone_serial → $watch_serial"
  info "Open 'Wear OS' companion app on the phone emulator and follow pairing."
}

# ── Cleanup ───────────────────────────────────────────────────────────────────
PHONE_SERIAL=""
WATCH_SERIAL=""

cleanup() {
  echo ""
  info "Cleaning up…"
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
printf "  Phone AVD : %s  (start=%s)\n" "$PHONE_AVD" "$START_PHONE"
printf "  Watch AVD : %s  (start=%s)\n\n" "$WATCH_AVD" "$START_WATCH"

check_tools

if $START_PHONE; then
  PHONE_SERIAL=$(launch_avd "$PHONE_AVD" "Phone") || exit 1
fi

if $START_WATCH; then
  WATCH_SERIAL=$(launch_avd "$WATCH_AVD" "Watch") || exit 1
  if $START_PHONE && [[ -n "$PHONE_SERIAL" ]] && [[ -n "$WATCH_SERIAL" ]]; then
    pair_watch_to_phone "$PHONE_SERIAL" "$WATCH_SERIAL"
  fi
fi

# ── Tauri hot-reload ──────────────────────────────────────────────────────────
if $START_PHONE; then
  step "Starting Tauri Android dev server"
  info "Hot-reload active — save any .tsx/.ts file to see changes instantly"
  info "Ctrl+C to stop everything"
  echo ""
  eval "$TAURI_DEV"
fi

if $START_WATCH && ! $START_PHONE; then
  step "Watch emulator is running (watch-only mode)"
  info "Deploy the wearapp/ module from Android Studio."
  info "Ctrl+C to stop."
  wait
fi
