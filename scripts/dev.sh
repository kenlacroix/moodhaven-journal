#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# MoodBloom dev launcher — emulators & real hardware
#
# Usage:
#   ./scripts/dev.sh                        # Phone only (default)
#   ./scripts/dev.sh phone                  # Phone only
#   ./scripts/dev.sh watch                  # Watch only
#   ./scripts/dev.sh phone watch            # Phone + Watch
#   ./scripts/dev.sh desktop                # Desktop only
#   ./scripts/dev.sh desktop phone          # Desktop + Phone
#   ./scripts/dev.sh desktop phone watch    # All three
#
# Device selection:
#   --real                   Real hardware for BOTH phone and watch
#   --real-phone             Real phone, emulator watch
#   --real-watch             Real watch, emulator phone
#
#   --phone-serial <serial>  Explicit phone ADB serial
#   --watch-serial <serial>  Explicit watch ADB serial (skips pairing wizard)
#   --watch-port   <port>    Phone-bridge forward port (default: 4444)
#   --watch-ip     <ip>      Watch IP for direct Wi-Fi ADB
#   --watch-wifi-port <p>    Watch Wi-Fi debug port (default: 5555)
#
# Emulator options (ignored for real hardware):
#   --avd <n>             Phone AVD (default: Medium_Phone_API_35)
#   --watch-avd <n>       Watch AVD (default: Wear_OS_Large_Round)
#   --no-snapshot            Start emulators fresh (no quick-boot)
#
# Laptop AP (creates a Wi-Fi hotspot so phone can reach the Vite dev server):
#   --laptop-ap              Create a Wi-Fi hotspot on the laptop before launching.
#                            Tauri replaces devUrl with the laptop's detected IP — the
#                            phone must be on the same network as the laptop to reach it.
#                            When the phone IS the hotspot gateway this is impossible
#                            (Android NAT blocks gateway→client).  --laptop-ap fixes that
#                            by making the laptop the AP and the phone a regular client.
#   --ap-ssid <name>         Hotspot network name     (default: MoodBloomDev)
#   --ap-password <pass>     Hotspot WPA2 password    (default: moodbloom123)
#   --ap-iface <iface>       Wi-Fi interface to use   (default: wlo1, env: MOODBLOOM_WIFI_IFACE)
#
# Other:
#   --install-wear           Sideload wear APK onto phone (companion pairing)
#   --logcat                 Stream filtered logcat after launch
#   --logcat-tag <tag>       Extra logcat tag filter (repeatable)
#   --pair-watch             Run the watch pairing wizard then exit
#   --reconnect-watch        Reconnect already-paired watch (new ephemeral port, no code needed)
#   --list-avds              List AVDs and real devices then exit
#   --help                   This message
#
# Real device topology (preferred → fallback):
#   1. Bluetooth bridge: laptop ← USB → phone ← BT → watch  [stable, preferred]
#      adb -s PHONE forward tcp:4444 localabstract:/adb-hub
#      Requires: watch BT-paired to phone + Developer Options → ADB debugging on watch
#   2. Wi-Fi ADB direct: laptop ← Wi-Fi → watch              [fallback, ephemeral ports]
#      Requires: watch Developer Options → Wireless Debugging
#
# First-time watch setup (run once, or when bridge breaks):
#   ./scripts/dev.sh --pair-watch
#
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
PHONE_AVD="${MOODBLOOM_PHONE_AVD:-Medium_Phone_API_35}"
WATCH_AVD="${MOODBLOOM_WATCH_AVD:-Wear_OS_Large_Round}"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_HOME
EMULATOR="$ANDROID_HOME/emulator/emulator"
ADB="${ADB:-$ANDROID_HOME/platform-tools/adb}"
command -v "$ADB" &>/dev/null || ADB="adb"
BOOT_TIMEOUT=360

JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
export JAVA_HOME

# Persists the working watch serial across runs so auto-connect is instant
WATCH_STATE_FILE="${HOME}/.moodbloom_watch_serial"

# Targets
START_PHONE=false
START_WATCH=false
START_DESKTOP=false
PAIR_WATCH_ONLY=false
RECONNECT_WATCH_ONLY=false

# Hardware mode
REAL_PHONE=false
REAL_WATCH=false

# Explicit overrides
PHONE_SERIAL_OVERRIDE=""
WATCH_SERIAL_OVERRIDE=""

# Watch connection config
WATCH_BRIDGE_PORT=4444
WATCH_WIFI_IP=""
WATCH_WIFI_PORT=5555

# Misc
NO_SNAPSHOT=false
INSTALL_WEAR=false
DO_LOGCAT=false
LOGCAT_TAGS=("MoodBloom" "WearDataLayer" "WearOS" "Tauri")

# Laptop AP hotspot
LAPTOP_AP=false
AP_SSID="MoodBloomDev"
AP_PASSWORD="moodbloom123"
AP_IFACE="${MOODBLOOM_WIFI_IFACE:-wlo1}"
AP_CON_NAME="MoodBloom-AP"
AP_ACTIVE=false

# Runtime serials (populated during launch)
PHONE_SERIAL=""
WATCH_SERIAL=""

# Set to true when the Bluetooth ADB bridge forward is active (cleanup uses this)
BT_BRIDGE_ACTIVE=false

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m';  GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; MAGENTA='\033[0;35m'
BOLD='\033[1m';    DIM='\033[2m';      RESET='\033[0m'

# All display helpers write to stderr so $(...) captures remain clean.
info()    { echo -e "${CYAN}[INFO]${RESET}  $*"         >&2; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"        >&2; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"        >&2; }
error()   { echo -e "${RED}[ERR]${RESET}   $*"          >&2; }
step()    { echo -e "\n${BOLD}${BLUE}>> $*${RESET}"     >&2; }
detail()  { echo -e "  ${DIM}$*${RESET}"                >&2; }
prompt()  { echo -e "\n${BOLD}${MAGENTA}? $*${RESET}"   >&2; }
divider() { echo -e "${DIM}------------------------------------------${RESET}" >&2; }
banner()  { echo -e "\n${BOLD}${MAGENTA}  $*${RESET}\n" >&2; }

# ── Argument parsing ──────────────────────────────────────────────────────────
[[ $# -eq 0 ]] && START_PHONE=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    phone)              START_PHONE=true ;;
    watch)              START_WATCH=true ;;
    desktop)            START_DESKTOP=true ;;

    --real)             REAL_PHONE=true; REAL_WATCH=true ;;
    --real-phone)       REAL_PHONE=true ;;
    --real-watch)       REAL_WATCH=true ;;

    --phone-serial)     shift; PHONE_SERIAL_OVERRIDE="$1" ;;
    --watch-serial)     shift; WATCH_SERIAL_OVERRIDE="$1" ;;
    --watch-port)       shift; WATCH_BRIDGE_PORT="$1" ;;
    --watch-ip)         shift; WATCH_WIFI_IP="$1" ;;
    --watch-wifi-port)  shift; WATCH_WIFI_PORT="$1" ;;

    --avd)              shift; PHONE_AVD="$1" ;;
    --watch-avd)        shift; WATCH_AVD="$1" ;;
    --no-snapshot)      NO_SNAPSHOT=true ;;
    --install-wear)     INSTALL_WEAR=true ;;
    --logcat)           DO_LOGCAT=true ;;
    --logcat-tag)       shift; LOGCAT_TAGS+=("$1") ;;

    --laptop-ap)        LAPTOP_AP=true ;;
    --ap-ssid)          shift; AP_SSID="$1" ;;
    --ap-password)      shift; AP_PASSWORD="$1" ;;
    --ap-iface)         shift; AP_IFACE="$1" ;;

    --pair-watch)       PAIR_WATCH_ONLY=true; REAL_WATCH=true ;;
    --reconnect-watch)  RECONNECT_WATCH_ONLY=true; REAL_WATCH=true ;;

    --list-avds)
      echo -e "\n${BOLD}Available AVDs:${RESET}"
      "$EMULATOR" -list-avds 2>/dev/null | sed 's/^/  /' || true
      echo -e "\n${BOLD}Connected real devices:${RESET}"
      "$ADB" devices -l 2>/dev/null | sed 's/^/  /'
      exit 0 ;;

    --help|-h)
      sed -n '2,55p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;

    *)
      error "Unknown argument: '$1'  (use --help)"
      exit 1 ;;
  esac
  shift
done

# ── Tool check ────────────────────────────────────────────────────────────────
check_tools() {
  step "Checking prerequisites"
  local ok=true

  if ! command -v "$ADB" &>/dev/null; then
    error "adb not found — install Android platform-tools or set ANDROID_HOME"
    ok=false
  else
    detail "adb  : $(command -v "$ADB") ok"
  fi

  if ($START_PHONE && ! $REAL_PHONE) || ($START_WATCH && ! $REAL_WATCH); then
    if [[ ! -x "$EMULATOR" ]]; then
      error "emulator not found at $EMULATOR"
      ok=false
    else
      detail "emu  : $EMULATOR ok"
    fi
    if [[ ! -x "${JAVA_HOME}/bin/javac" ]]; then
      error "No javac at ${JAVA_HOME}/bin/javac  (sudo apt install openjdk-17-jdk)"
      ok=false
    else
      detail "java : ${JAVA_HOME}/bin/javac ok"
    fi
  fi

  if ! command -v npm &>/dev/null; then
    error "npm not found"
    ok=false
  else
    detail "npm  : $(command -v npm) ok"
  fi

  [[ "$ok" == "true" ]] || exit 1
  success "All required tools present"
}

# ── Low-level ADB helpers ─────────────────────────────────────────────────────

# Poll until a serial reaches state "device", up to $timeout seconds.
# Prints "device" on success, "" on timeout. No output to stderr.
wait_for_online() {
  local serial="$1"
  local timeout="${2:-12}"
  local elapsed=0
  while [[ $elapsed -lt $timeout ]]; do
    local state
    state=$("$ADB" -s "$serial" get-state 2>/dev/null | tr -d '[:space:]' || true)
    [[ "$state" == "device" ]] && { echo "device"; return 0; }
    sleep 1; elapsed=$((elapsed+1))
  done
  echo ""
}

# Attempt adb connect to a target; returns serial on success or "" on failure.
# Handles "connected", "already connected", and the brief offline->online race.
try_adb_connect() {
  local target="$1"
  local label="${2:-$target}"
  local conn_out
  conn_out=$("$ADB" connect "$target" 2>&1 || true)
  detail "adb connect $target -> $conn_out"

  # Hard failure keywords mean the socket actively refused
  if echo "$conn_out" | grep -qiE "^(failed|unable|refused|error|cannot)"; then
    echo ""; return 0
  fi

  # Need at least "connected" in the output to proceed
  echo "$conn_out" | grep -qi "connected" || { echo ""; return 0; }

  # Poll for the device to become ready (it may briefly show as offline)
  local ok
  ok=$(wait_for_online "$target" 10)
  if [[ "$ok" == "device" ]]; then
    success "$label online: $target"
    echo "$target"
  else
    warn "$target responded to connect but did not reach 'device' state"
    echo ""
  fi
}

# Returns true if the given ADB serial is a Wear OS watch (checks ro.build.characteristics).
# stdin is explicitly redirected to /dev/null so this is safe to call inside
# `while read` loops without consuming the loop's pipe.
_is_watch_device() {
  local serial="$1"
  local chars
  chars=$("$ADB" -s "$serial" shell getprop ro.build.characteristics </dev/null 2>/dev/null | tr -d '\r\n' || true)
  [[ "$chars" == *watch* ]]
}

# Return the first USB/hardware watch serial (non-emulator, non-IP:PORT).
# $1 = phone serial to exclude (optional).
# Always uses _is_watch_device() to confirm via ro.build.characteristics — never
# assumes a device is the watch just because nothing else is connected.
find_real_watch_serial() {
  local exclude_serial="${1:-}"
  while IFS= read -r line; do
    local s state
    s=$(awk '{print $1}' <<< "$line")
    state=$(awk '{print $2}' <<< "$line")
    [[ "$state" != "device" ]]                                        && continue
    [[ "$s" == emulator-* ]]                                          && continue
    [[ "$s" == "$exclude_serial" ]]                                   && continue
    # Skip IP:PORT / localhost:PORT (Wi-Fi ADB / BT bridge) — want raw USB only
    [[ "$s" =~ ^(localhost|[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+): ]]       && continue
    _is_watch_device "$s" && { echo "$s"; return; }
  done < <("$ADB" devices 2>/dev/null | tail -n +2)
}

# Return the first USB/hardware phone serial (non-emulator, non-IP:PORT, non-watch).
find_real_phone_serial() {
  if [[ -n "$PHONE_SERIAL_OVERRIDE" ]]; then
    echo "$PHONE_SERIAL_OVERRIDE"; return
  fi
  while IFS= read -r line; do
    local s state
    s=$(awk '{print $1}' <<< "$line")
    state=$(awk '{print $2}' <<< "$line")
    [[ "$state" != "device" ]]                                     && continue
    [[ "$s" == emulator-* ]]                                       && continue
    # Skip IP:PORT entries (bridge/Wi-Fi serials)
    [[ "$s" =~ ^(localhost|[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+): ]]   && continue
    # Skip Wear OS devices connected via USB
    _is_watch_device "$s"                                          && continue
    echo "$s"; return
  done < <("$ADB" devices -l 2>/dev/null | tail -n +2)
}

# ── Watch state file helpers ──────────────────────────────────────────────────
# State file format (simple key=value per line):
#   mode=bt|wifi              Connection mode that was last used successfully
#   serial=<adb-serial>       e.g. localhost:4444  OR  10.246.104.165:43177
#   bt_port=<port>            Local port used for the Bluetooth ADB bridge (bt mode)
#   tcp_ip=<ip>               Watch IP (wifi mode)
#   tcp_port=<port>           Watch TCP port (wifi mode; ephemeral — changes each restart)
#
# Bluetooth mode (stable, preferred):
#   Connects via phone port forward: adb -s PHONE forward tcp:PORT localabstract:/adb-hub
#   No Wireless Debugging needed on the watch — just BT pairing + ADB debugging.
#
# Wi-Fi mode (fallback):
#   Connects directly to watch Wi-Fi ADB.  TCP port is ephemeral; mDNS auto-discovery
#   or --reconnect-watch recovers a new port without a pairing code.

_state_get() {
  local key="$1"
  [[ -f "$WATCH_STATE_FILE" ]] || { echo ""; return; }
  grep "^${key}=" "$WATCH_STATE_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '[:space:]'
}

_state_save_wifi() {
  local serial="$1" ip="$2" port="$3"
  printf 'mode=wifi\nserial=%s\ntcp_ip=%s\ntcp_port=%s\n' "$serial" "$ip" "$port" > "$WATCH_STATE_FILE"
  detail "Watch state saved (wifi): $serial"
}

_state_save_bt() {
  local serial="$1" port="$2"
  printf 'mode=bt\nserial=%s\nbt_port=%s\n' "$serial" "$port" > "$WATCH_STATE_FILE"
  detail "Watch state saved (bt): $serial"
}

# ── Watch connection strategies ───────────────────────────────────────────────

# Connect via saved or provided IP:port.  Runs adb connect; returns serial or "".
_wifi_connect() {
  local ip="$1"
  local port="$2"
  try_adb_connect "$ip:$port" "Watch (Wi-Fi $ip:$port)"
}

# Connect to watch via Bluetooth ADB bridge through the phone.
#
# How it works:
#   adb -s PHONE forward tcp:PORT localabstract:/adb-hub
#   adb connect localhost:PORT
#
# The phone's adb-hub Unix socket proxies ADB over the Bluetooth link to any
# paired Wear OS device that has ADB debugging enabled.  No Wireless Debugging
# required on the watch — just Developer Options → ADB debugging.
#
# $1 = phone ADB serial   $2 = local bridge port (default: WATCH_BRIDGE_PORT)
# Returns serial (localhost:PORT) on success, "" on failure.
_bt_bridge_connect() {
  local phone_serial="$1"
  local port="${2:-$WATCH_BRIDGE_PORT}"

  # Remove any stale forward on this port, then (re-)create it
  "$ADB" -s "$phone_serial" forward --remove tcp:$port >/dev/null 2>&1 || true
  local fwd_out
  fwd_out=$("$ADB" -s "$phone_serial" forward tcp:$port localabstract:/adb-hub 2>&1 || true)
  detail "bt forward tcp:$port -> adb-hub: $fwd_out"

  if echo "$fwd_out" | grep -qiE "error|fail|refused|cannot|not found"; then
    detail "BT bridge forward failed: $fwd_out"
    echo ""; return
  fi

  local serial
  serial=$(try_adb_connect "localhost:$port" "Watch (BT bridge → $phone_serial)")
  if [[ -n "$serial" ]]; then
    BT_BRIDGE_ACTIVE=true
    _state_save_bt "$serial" "$port"
    echo "$serial"
  else
    # Clean up the dangling forward
    "$ADB" -s "$phone_serial" forward --remove tcp:$port >/dev/null 2>&1 || true
    echo ""
  fi
}

# Discover watch TCP connect port via ADB mDNS (requires Wireless Debugging active).
# $1 = optional watch IP to filter results.  Prints "IP:PORT" or "".
_mdns_discover_watch() {
  local watch_ip="${1:-}"
  local mdns_out
  mdns_out=$("$ADB" mdns services 2>/dev/null || true)
  [[ -z "$mdns_out" ]] && { echo ""; return; }
  while IFS= read -r line; do
    # _adb-tls-connect entries are the actual debug-connect port (not the pairing port)
    echo "$line" | grep -q "_adb-tls-connect" || continue
    local addr
    addr=$(echo "$line" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:[0-9]+' | head -1)
    [[ -z "$addr" ]] && continue
    if [[ -n "$watch_ip" ]]; then
      [[ "$addr" == "${watch_ip}:"* ]] || continue
    fi
    echo "$addr"; return
  done <<< "$mdns_out"
  echo ""
}

# Reconnect a watch without a pairing code.
# Priority: BT bridge (via phone) → mDNS → prompt for Wi-Fi port.
# $1 = saved watch IP (used for mDNS filter / Wi-Fi fallback)
# $2 = phone serial (optional, needed for BT bridge)
# Returns serial or "".
reconnect_watch_by_port() {
  local saved_ip="$1"
  local phone_serial="${2:-$PHONE_SERIAL}"

  # 1. Bluetooth bridge — most stable, no Wi-Fi instability
  if [[ -n "$phone_serial" ]]; then
    detail "Trying Bluetooth ADB bridge..."
    local s
    s=$(_bt_bridge_connect "$phone_serial" "$WATCH_BRIDGE_PORT")
    if [[ -n "$s" ]]; then info "Reconnected via Bluetooth bridge"; echo "$s"; return; fi
  fi

  # 2. mDNS — fully automatic when Wireless Debugging is on and watch is on Wi-Fi
  if [[ -n "$saved_ip" ]]; then
    detail "Trying mDNS auto-discovery for $saved_ip..."
    local mdns_addr
    mdns_addr=$(_mdns_discover_watch "$saved_ip")
    if [[ -n "$mdns_addr" ]]; then
      info "mDNS found watch at $mdns_addr"
      local s
      s=$(try_adb_connect "$mdns_addr" "Watch (mDNS $mdns_addr)")
      if [[ -n "$s" ]]; then
        _state_save_wifi "$s" "${mdns_addr%%:*}" "${mdns_addr##*:}"
        echo "$s"; return
      fi
    fi
  fi

  # 3. Prompt for Wi-Fi port only (no code needed since watch is already paired)
  banner "Watch Reconnect"
  echo -e "  ${BOLD}Bluetooth bridge unavailable${RESET} — falling back to Wi-Fi ADB." >&2
  echo -e "  Your watch is already ${BOLD}paired${RESET} (ADB key stored), just enter the new port.\n" >&2
  echo -e "  On your ${BOLD}Pixel Watch 3${RESET}:" >&2
  echo -e "    Developer options -> Wireless debugging" >&2
  echo -e "    The main screen shows: ${BOLD}IP address and port${RESET}" >&2
  [[ -n "$saved_ip" ]] && echo -e "    e.g. ${DIM}$saved_ip:43271${RESET}  ← enter only the ${BOLD}port${RESET} part\n" >&2 || echo "" >&2
  divider

  local tcp_port
  while true; do
    printf "  Current port from watch Wireless Debugging screen: " >&2
    read -r tcp_port
    [[ "$tcp_port" =~ ^[0-9]+$ ]] && break
    echo -e "  ${YELLOW}Numbers only (just the port, not the full IP:port)${RESET}" >&2
  done

  local serial
  serial=$(try_adb_connect "$saved_ip:$tcp_port" "Watch ($saved_ip:$tcp_port)")
  if [[ -n "$serial" ]]; then
    _state_save_wifi "$serial" "$saved_ip" "$tcp_port"
    echo "$serial"
  else
    error "Could not connect to $saved_ip:$tcp_port"
    echo ""
  fi
}

# Find a watch that is already online in adb devices.
# Matches: USB serial (Wear OS), IP:PORT (Wi-Fi), or localhost:PORT (BT bridge). Excludes the phone.
_find_existing_watch() {
  local phone_serial="${1:-}"
  local phone_ip=""

  if [[ -n "$phone_serial" ]]; then
    phone_ip=$("$ADB" -s "$phone_serial" shell ip route 2>/dev/null \
      | awk '/wlan0/{print $9; exit}' | tr -d '\r\n' || true)
  fi

  while IFS= read -r line; do
    local s state
    s=$(awk '{print $1}' <<< "$line")
    state=$(awk '{print $2}' <<< "$line")
    [[ "$state" != "device" ]]                && continue
    [[ "$s" == emulator-* ]]                  && continue
    [[ "$s" == "$phone_serial" ]]             && continue
    [[ -n "$phone_ip" && "$s" == "${phone_ip}:"* ]] && continue

    # IP:PORT (Wi-Fi ADB) or localhost:PORT (BT bridge) — always a watch candidate
    if [[ "$s" =~ ^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|localhost):[0-9]+$ ]]; then
      echo "$s"; return
    fi

    # USB serial — accept only if the device identifies itself as a watch
    if [[ ! "$s" =~ ^(localhost|[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+): ]]; then
      _is_watch_device "$s" && { echo "$s"; return; }
    fi
  done < <("$ADB" devices 2>/dev/null | tail -n +2)
}

# Silent auto-connect with priority: BT bridge > saved Wi-Fi > mDNS > explicit IP.
# Returns watch serial or "".
auto_connect_watch() {
  local phone_serial="${1:-}"

  # 1. Already online in adb — covers both BT (localhost:PORT) and Wi-Fi (IP:PORT)
  local found
  found=$(_find_existing_watch "$phone_serial")
  if [[ -n "$found" ]]; then
    detail "Watch already online in adb: $found"
    # If it's the BT bridge serial and the flag isn't set, mark it active
    [[ "$found" == localhost:* ]] && BT_BRIDGE_ACTIVE=true
    echo "$found"; return
  fi

  # 2. Bluetooth bridge via phone — most stable, preferred over Wi-Fi ADB
  #    Requires: watch paired to phone via BT + ADB debugging on watch
  if [[ -n "$phone_serial" ]]; then
    detail "Trying Bluetooth ADB bridge via phone ($phone_serial)..."
    local s
    s=$(_bt_bridge_connect "$phone_serial" "$WATCH_BRIDGE_PORT")
    if [[ -n "$s" ]]; then echo "$s"; return; fi
    detail "BT bridge unavailable (watch ADB debugging may be off, or not BT-paired to phone)"
  fi

  # 3. Saved Wi-Fi coordinates (mode=wifi in state file)
  local saved_ip saved_port
  saved_ip=$(_state_get "tcp_ip")
  saved_port=$(_state_get "tcp_port")
  if [[ -n "$saved_ip" && -n "$saved_port" ]]; then
    detail "Trying saved Wi-Fi address: $saved_ip:$saved_port"
    local s
    s=$(_wifi_connect "$saved_ip" "$saved_port")
    if [[ -n "$s" ]]; then echo "$s"; return; fi
    detail "Saved Wi-Fi address did not respond — watch may have a new ephemeral port"
  fi

  # 4. mDNS auto-discovery — finds the new TCP port if Wireless Debugging restarted
  local mdns_addr
  mdns_addr=$(_mdns_discover_watch "${saved_ip:-}")
  if [[ -n "$mdns_addr" ]]; then
    detail "mDNS found watch at $mdns_addr"
    local s
    s=$(try_adb_connect "$mdns_addr" "Watch (mDNS $mdns_addr)")
    if [[ -n "$s" ]]; then
      local new_ip="${mdns_addr%%:*}" new_port="${mdns_addr##*:}"
      _state_save_wifi "$s" "$new_ip" "$new_port"
      echo "$s"; return
    fi
  fi

  # 5. Explicit --watch-ip flag
  if [[ -n "$WATCH_WIFI_IP" ]]; then
    local s
    s=$(_wifi_connect "$WATCH_WIFI_IP" "$WATCH_WIFI_PORT")
    if [[ -n "$s" ]]; then echo "$s"; return; fi
    warn "Direct Wi-Fi ($WATCH_WIFI_IP:$WATCH_WIFI_PORT) failed"
  fi

  echo ""
}

# ── Watch pairing wizard ──────────────────────────────────────────────────────
#
# Assumes the watch already has Wireless Debugging enabled.
# Asks for the IP:port and 6-digit code shown on the "Pair new device" screen,
# runs `adb pair`, then auto-discovers the TCP connect port from adb devices
# (no need to ask for a second port).  Saves credentials for future auto-connect.
#
# Prints the watch serial on stdout; all UI goes to stderr.
#
pair_watch_wizard() {

  banner "Watch Pairing"
  echo -e "  On your ${BOLD}Pixel Watch 3A${RESET}:" >&2
  echo -e "    Developer options -> Wireless debugging -> ${BOLD}Pair new device${RESET}" >&2
  echo -e "  The screen shows an ${BOLD}IP:port${RESET} and a ${BOLD}6-digit code${RESET} — enter them below." >&2
  echo -e "  ${DIM}(Ctrl+C to abort)${RESET}\n" >&2
  divider

  local pair_target pair_ip pair_port pair_code

  # ── Collect IP:port and code ─────────────────────────────────────────────
  echo "" >&2

  # Accept "IP:port" as a single token or two separate prompts
  while true; do
    printf "  IP:port from watch  (e.g. 10.246.104.165:35371): " >&2
    read -r pair_target
    # Accept bare IP:port
    if [[ "$pair_target" =~ ^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+):([0-9]+)$ ]]; then
      pair_ip="${BASH_REMATCH[1]}"
      pair_port="${BASH_REMATCH[2]}"
      break
    fi
    echo -e "  ${YELLOW}Enter as IP:port, e.g. 10.246.104.165:35371${RESET}" >&2
  done

  while true; do
    printf "  6-digit pairing code: " >&2
    read -r pair_code
    [[ "$pair_code" =~ ^[0-9]{6}$ ]] && break
    echo -e "  ${YELLOW}Must be exactly 6 digits${RESET}" >&2
  done

  # ── Run adb pair ──────────────────────────────────────────────────────────
  echo "" >&2
  info "Pairing: adb pair $pair_ip:$pair_port"

  local pair_out
  pair_out=$(echo "$pair_code" | "$ADB" pair "$pair_ip:$pair_port" 2>&1 || true)
  detail "adb pair -> $pair_out"

  # Known quirk in newer ADB on Linux: piped input produces
  #   "error: protocol fault (couldn't read status message): Success"
  # The ": Success" suffix = strerror(0) = errno 0 = no real OS error.
  # Despite the "error:" prefix the pairing actually completed — verify via adb devices.
  local tentative_ok=false
  if echo "$pair_out" | grep -qi "protocol fault" && \
     echo "$pair_out" | grep -qiE ": *[Ss]uccess"; then
    tentative_ok=true
  fi

  if echo "$pair_out" | grep -qiE "error|fail|refused|unable" && ! $tentative_ok; then
    error "Pairing failed: $pair_out"
    echo -e "\n  ${YELLOW}Common causes:${RESET}" >&2
    echo -e "    • Wrong IP/port — re-read from the watch 'Pair new device' screen" >&2
    echo -e "    • Code expired  — tap 'Pair new device' again for a fresh code" >&2
    echo -e "    • Not on same network — watch and laptop must share the same Wi-Fi" >&2
    exit 1
  fi

  if echo "$pair_out" | grep -qi "successfully paired"; then
    success "Paired successfully"
  elif $tentative_ok; then
    info "adb pair reported a known benign protocol quirk (errno=0) — verifying via device scan..."
  else
    warn "Unexpected pair output (may still be OK): $pair_out"
  fi

  # ── Discover the TCP connect port ─────────────────────────────────────────
  # After adb pair, the watch's TCP port is discoverable by scanning adb devices
  # for a new IP:port entry matching our watch IP.  We try adb connect on the
  # same port first (some watches reuse it), then fall back to scanning.
  local watch_serial tcp_port=""

  # Snapshot of devices before connecting so we can diff afterwards
  local before_devices
  before_devices=$("$ADB" devices 2>/dev/null)

  # Attempt 1: try connecting to same IP with the pairing port (sometimes works)
  info "Trying adb connect $pair_ip:$pair_port"
  watch_serial=$(try_adb_connect "$pair_ip:$pair_port" "Watch")

  # Attempt 2: scan adb devices for a new IP:port on our watch's IP
  if [[ -z "$watch_serial" ]]; then
    detail "Pairing port not connectable — scanning adb devices for TCP port..."
    # Give adb-server a moment to register the paired device
    sleep 2
    while IFS= read -r line; do
      local s state
      s=$(awk '{print $1}' <<< "$line")
      state=$(awk '{print $2}' <<< "$line")
      # Look for any IP:port on our watch IP that wasn't there before
      [[ "$s" =~ ^${pair_ip}:([0-9]+)$ ]] || continue
      tcp_port="${BASH_REMATCH[1]}"
      [[ "$tcp_port" == "$pair_port" ]] && continue  # skip pairing port itself
      # Try connecting to it
      local s2
      s2=$(try_adb_connect "$pair_ip:$tcp_port" "Watch ($pair_ip:$tcp_port)")
      if [[ -n "$s2" ]]; then watch_serial="$s2"; break; fi
    done < <("$ADB" devices 2>/dev/null | tail -n +2)
  fi

  # Attempt 3: prompt user for the TCP port shown on the main Wireless Debugging screen
  if [[ -z "$watch_serial" ]]; then
    echo "" >&2
    warn "Could not auto-discover TCP port."
    echo -e "  On your watch, go back to the ${BOLD}Wireless Debugging${RESET} main screen." >&2
    echo -e "  It shows a second IP:port (different from the pairing screen).\n" >&2
    while true; do
      printf "  TCP connect port shown on Wireless Debugging screen: " >&2
      read -r tcp_port
      [[ "$tcp_port" =~ ^[0-9]+$ ]] && break
      echo -e "  ${YELLOW}Numbers only${RESET}" >&2
    done
    watch_serial=$(try_adb_connect "$pair_ip:$tcp_port" "Watch")
    if [[ -z "$watch_serial" ]]; then
      error "adb connect $pair_ip:$tcp_port failed."
      detail "Try manually: adb connect $pair_ip:$tcp_port"
      exit 1
    fi
  fi

  tcp_port="${watch_serial##*:}"  # extract port from the working serial

  # ── Handle RSA key prompt on watch ───────────────────────────────────────
  local state
  state=$("$ADB" -s "$watch_serial" get-state 2>/dev/null | tr -d '[:space:]' || true)
  if [[ "$state" == "unauthorized" ]]; then
    echo -e "\n  ${YELLOW}Watch is prompting: 'Allow ADB debugging?'${RESET}" >&2
    echo -e "  Tap ${BOLD}Always allow from this computer${RESET} on the watch." >&2
    prompt "Press Enter after tapping Allow"
    read -r
    local ok
    ok=$(wait_for_online "$watch_serial" 12)
    [[ "$ok" == "device" ]] || { error "Still unauthorized after Allow tap."; exit 1; }
  fi

  local ok
  ok=$(wait_for_online "$watch_serial" 8)
  if [[ "$ok" != "device" ]]; then
    error "Watch not in 'device' state (current: ${state:-unknown})"
    exit 1
  fi

  # ── Save and report ───────────────────────────────────────────────────────
  _state_save_wifi "$watch_serial" "$pair_ip" "$tcp_port"

  echo "" >&2
  divider
  local watch_model wear_ver
  watch_model=$("$ADB" -s "$watch_serial" shell getprop ro.product.model 2>/dev/null | tr -d '\r\n' || true)
  wear_ver=$("$ADB" -s "$watch_serial" shell getprop ro.build.version.release 2>/dev/null | tr -d '\r\n' || true)

  success "Watch connected!"
  detail "Serial  : $watch_serial"
  detail "Model   : ${watch_model:-unknown}"
  detail "Android : ${wear_ver:-unknown}"
  echo "" >&2
  echo -e "  ${DIM}Saved: next run reconnects automatically — no code needed.${RESET}" >&2
  echo "" >&2

  echo "$watch_serial"
}
# ── High-level watch resolver ─────────────────────────────────────────────────
# Tries silent auto-connect first (saved TCP address or already online);
# launches the pairing wizard only when that fails.
resolve_real_watch() {
  local phone_serial="${1:-}"

  if [[ -n "$WATCH_SERIAL_OVERRIDE" ]]; then
    info "Using explicit watch serial: $WATCH_SERIAL_OVERRIDE"
    echo "$WATCH_SERIAL_OVERRIDE"; return
  fi

  step "Resolving real watch"

  # Fast-path: USB-connected watch detected directly (works without a phone).
  # In watch-only mode (phone_serial="") we accept any USB non-emulator device.
  # When a phone is also connected we use _is_watch_device() to distinguish them.
  local usb_watch
  usb_watch=$(find_real_watch_serial "$phone_serial")
  if [[ -n "$usb_watch" ]]; then
    success "USB watch detected: $usb_watch"
    echo "$usb_watch"; return
  fi

  info "No USB watch found — trying automatic connection (BT bridge preferred)..."

  local serial
  serial=$(auto_connect_watch "$phone_serial")

  if [[ -n "$serial" ]]; then
    # Persist Wi-Fi coordinates for a new Wi-Fi serial that isn't saved yet
    local saved_mode; saved_mode=$(_state_get "mode")
    if [[ -z "$saved_mode" && "$serial" =~ ^([0-9.]+):([0-9]+)$ ]]; then
      _state_save_wifi "$serial" "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
    fi
    echo "$serial"; return
  fi

  # Auto-connect failed.  If any prior state exists the watch is known — try reconnect
  # (BT bridge re-attempt + mDNS + port prompt) before resorting to full pairing wizard.
  local saved_mode; saved_mode=$(_state_get "mode")
  local saved_ip;   saved_ip=$(_state_get "tcp_ip")
  if [[ -n "$saved_mode" || -n "$saved_ip" ]]; then
    warn "Auto-connect failed — attempting reconnect..."
    serial=$(reconnect_watch_by_port "$saved_ip" "$phone_serial")
    if [[ -n "$serial" ]]; then echo "$serial"; return; fi
    warn "Reconnect failed — falling back to Wi-Fi pairing wizard"
    echo "" >&2
  else
    warn "No saved watch state — launching pairing wizard"
    echo "" >&2
  fi

  serial=$(pair_watch_wizard)
  echo "$serial"
}

resolve_real_phone() {
  find_real_phone_serial
}

# ── Emulator helpers ──────────────────────────────────────────────────────────

find_running_emulator_serial() {
  local avd="$1"
  while IFS= read -r serial; do
    local name
    name=$("$ADB" -s "$serial" emu avd name 2>/dev/null | head -1 | tr -d '\r' | tr ' ' '_')
    if [[ "$name" == "$avd" || "$name" == "${avd// /_}" ]]; then
      echo "$serial"; return
    fi
  done < <("$ADB" devices 2>/dev/null | grep '^emulator-' | awk '{print $1}')
}

wait_for_boot() {
  local serial="$1"
  local label="${2:-device}"
  local elapsed=0
  info "Waiting for $label ($serial) to finish booting..."
  until "$ADB" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | grep -q "^1"; do
    sleep 3; elapsed=$((elapsed+3))
    printf "." >&2
    if [[ $elapsed -ge $BOOT_TIMEOUT ]]; then
      echo "" >&2
      error "Timed out waiting for $label after ${BOOT_TIMEOUT}s"
      return 1
    fi
  done
  echo "" >&2
  success "$label ($serial) boot complete"
}

start_emulator_bg() {
  local avd="$1"
  local kind="${2:-phone}"
  local snapshot_flags=()
  local extra_flags=()
  local gpu_mode="auto"

  [[ "$kind" == "watch" ]] && { gpu_mode="guest"; extra_flags+=(-no-boot-anim); }
  $NO_SNAPSHOT && snapshot_flags=(-no-snapshot-load -no-snapshot-save)

  "$EMULATOR" -avd "$avd" -gpu "$gpu_mode" \
    "${snapshot_flags[@]+"${snapshot_flags[@]}"}" \
    "${extra_flags[@]+"${extra_flags[@]}"}" \
    > "/tmp/moodbloom_emu_${avd}.log" 2>&1 &
  local pid=$!
  echo "$pid" > "/tmp/moodbloom_emu_${avd}.pid"
  info "Emulator '$avd' launched (PID $pid)"
  detail "log: /tmp/moodbloom_emu_${avd}.log"
}

wait_for_emulator_serial() {
  local avd="$1"
  local label="$2"
  local max=45
  local serial=""
  local attempts=0
  info "Waiting for $label emulator to appear in adb (up to $((max*2))s)..."
  while [[ -z "$serial" && $attempts -lt $max ]]; do
    sleep 2; attempts=$((attempts+1))
    printf "." >&2
    serial=$(find_running_emulator_serial "$avd")
  done
  echo "" >&2
  if [[ -z "$serial" ]]; then
    error "$label emulator ($avd) did not appear after $((max*2))s"
    return 1
  fi
  info "$label emulator registered: $serial"
  echo "$serial"
}

pair_emulator_watch_to_phone() {
  local phone_serial="$1"
  step "Setting up watch <-> phone port forwarding (emulator)"
  "$ADB" -s "$phone_serial" forward tcp:5601 tcp:5601 2>/dev/null || true
  info "Port 5601 forwarded -- open Wear OS companion app on phone emulator to pair"
}

# ── Build & install ───────────────────────────────────────────────────────────

_project_root() { cd "$(dirname "$0")/.." && pwd; }
_android_dir()  { echo "$(_project_root)/src-tauri/gen/android"; }

_ensure_local_props() {
  local android_dir="$1"
  local props="$android_dir/local.properties"
  [[ -f "$props" ]] || { echo "sdk.dir=$ANDROID_HOME" > "$props"; info "Created $props"; }
}

# Disconnect mDNS aliases (adb-GUID._adb-tls-connect._tcp) and stale offline
# IP:port entries for the watch before Gradle runs.
# Gradle/ddmlib enumerates ALL adb devices and will timeout trying to probe
# the mDNS-format serial, even when ANDROID_SERIAL is set to the IP:port serial.
_cleanup_watch_aliases() {
  local watch_serial="$1"          # e.g. 10.246.104.165:44123
  local watch_ip="${watch_serial%%:*}"

  while IFS= read -r line; do
    local s state
    s=$(awk '{print $1}' <<< "$line")
    state=$(awk '{print $2}' <<< "$line")
    [[ "$s" == "$watch_serial" ]] && continue   # keep our working serial

    # Stale offline IP:port entries for this watch IP (e.g. old pairing port)
    if [[ "$s" =~ ^${watch_ip}: ]] && [[ "$state" == "offline" ]]; then
      detail "Disconnecting stale offline entry: $s"
      "$ADB" disconnect "$s" >/dev/null 2>&1 || true
    fi

    # mDNS transport alias — adb-GUID._adb-tls-connect._tcp
    # These confuse Gradle ddmlib (TimeoutException on property fetch)
    if [[ "$s" =~ \._adb-tls-connect\._tcp$ ]]; then
      detail "Disconnecting mDNS alias: $s"
      "$ADB" disconnect "$s" >/dev/null 2>&1 || true
    fi
  done < <("$ADB" devices 2>/dev/null | tail -n +2)
}

build_and_install_watch_app() {
  local watch_serial="$1"
  local android_dir
  android_dir=$(_android_dir)

  step "Building & installing watch app on $watch_serial"
  _ensure_local_props "$android_dir"

  # We intentionally split build and install into two steps:
  #
  #   1. Gradle :wear:assembleDebug  — builds the APK (no device I/O)
  #   2. adb -s SERIAL install       — installs directly to the target device
  #
  # Using installDebug would route through Gradle's bundled ddmlib, which
  # enumerates ALL adb devices and spawns a PropertyFetcher thread for each.
  # ADB mDNS auto-discovery keeps re-adding the watch under its mDNS transport
  # name (adb-GUID._adb-tls-connect._tcp); ddmlib cannot fetch properties over
  # that transport and throws TimeoutException, failing the whole task even
  # though ANDROID_SERIAL is set.  Direct adb install bypasses ddmlib entirely.

  local build_log=/tmp/moodbloom_wear_build.log
  local install_log=/tmp/moodbloom_wear_install.log

  info "Building wear APK (assembleDebug)..."
  if ! JAVA_HOME="$JAVA_HOME" \
       "$android_dir/gradlew" -p "$android_dir" :wear:assembleDebug --daemon \
       > "$build_log" 2>&1; then
    warn "Watch app build failed -- see $build_log"
    warn "Retry: cd src-tauri/gen/android && JAVA_HOME=$JAVA_HOME ./gradlew :wear:assembleDebug"
    return
  fi

  local apk_path
  apk_path=$(find "$android_dir" -name "wear-debug.apk" -path "*/wear/debug/*" 2>/dev/null | head -1 || true)
  # Fallback: any debug APK in the wear output directory
  [[ -z "$apk_path" ]] && \
    apk_path=$(find "$android_dir/wear/build/outputs/apk/debug" -name "*.apk" 2>/dev/null | head -1 || true)

  if [[ -z "$apk_path" ]]; then
    warn "Watch APK not found after assembleDebug -- see $build_log"
    return
  fi
  detail "APK: $apk_path"

  info "Installing APK via adb (bypasses Gradle ddmlib)..."
  local install_ok=false
  if "$ADB" -s "$watch_serial" install -r "$apk_path" > "$install_log" 2>&1; then
    install_ok=true
  elif grep -q "INSTALL_FAILED_VERSION_DOWNGRADE" "$install_log" 2>/dev/null; then
    # A stale higher-versionCode build (e.g. phone app accidentally pushed to watch)
    # is blocking install.  Uninstall it and retry.
    warn "Version downgrade detected — uninstalling existing package and retrying..."
    "$ADB" -s "$watch_serial" uninstall com.moodbloom.app >/dev/null 2>&1 || true
    if "$ADB" -s "$watch_serial" install -r "$apk_path" >> "$install_log" 2>&1; then
      install_ok=true
    fi
  fi

  if $install_ok; then
    success "Watch app installed on $watch_serial"
    # Launch the app so it appears immediately (sideloaded apps don't auto-start).
    "$ADB" -s "$watch_serial" shell am start \
      -n com.moodbloom.app/com.moodbloom.wear.MainActivity \
      >/dev/null 2>&1 || true
  else
    warn "Watch app install failed -- see $install_log"
    warn "Retry: $ADB -s $watch_serial install -r $apk_path"
  fi
}

install_wear_apk_on_phone() {
  local phone_serial="$1"
  local android_dir
  android_dir=$(_android_dir)

  local apk_path
  apk_path=$(find "$android_dir" -name "*.apk" -path "*/wear/debug/*" 2>/dev/null | head -1 || true)

  if [[ -z "$apk_path" ]]; then
    warn "--install-wear: no debug APK found -- building..."
    _ensure_local_props "$android_dir"
    JAVA_HOME="$JAVA_HOME" "$android_dir/gradlew" -p "$android_dir" :wear:assembleDebug --daemon \
      > /tmp/moodbloom_wear_build.log 2>&1 \
      || { warn "Build failed -- see /tmp/moodbloom_wear_build.log"; return; }
    apk_path=$(find "$android_dir" -name "*.apk" -path "*/wear/debug/*" 2>/dev/null | head -1 || true)
  fi

  [[ -z "$apk_path" ]] && { warn "APK still not found after build"; return; }

  step "Sideloading wear APK on phone ($phone_serial)"
  detail "APK: $apk_path"
  "$ADB" -s "$phone_serial" install -r "$apk_path" \
    && success "Wear app sideloaded on phone" \
    || warn "Sideload failed.  Retry: adb -s $phone_serial install $apk_path"
}

# ── Logcat streaming ──────────────────────────────────────────────────────────
BG_PIDS=()

stream_logcat() {
  local phone_serial="${1:-}"
  local watch_serial="${2:-}"

  step "Starting logcat streams"
  local tag_pattern
  tag_pattern=$(IFS='|'; echo "${LOGCAT_TAGS[*]}")

  if [[ -n "$phone_serial" ]]; then
    : > /tmp/moodbloom_logcat_phone.log
    info "Phone logcat -> /tmp/moodbloom_logcat_phone.log  (tags: $tag_pattern)"
    "$ADB" -s "$phone_serial" logcat -v time 2>/dev/null \
      | grep --line-buffered -E "$tag_pattern" \
      | sed -u "s/^/[PHONE] /" \
      >> /tmp/moodbloom_logcat_phone.log 2>&1 &
    BG_PIDS+=($!)
  fi

  if [[ -n "$watch_serial" ]]; then
    : > /tmp/moodbloom_logcat_watch.log
    info "Watch logcat  -> /tmp/moodbloom_logcat_watch.log  (tags: $tag_pattern)"
    "$ADB" -s "$watch_serial" logcat -v time 2>/dev/null \
      | grep --line-buffered -E "$tag_pattern" \
      | sed -u "s/^/[WATCH] /" \
      >> /tmp/moodbloom_logcat_watch.log 2>/dev/null &
    BG_PIDS+=($!)
  fi

  local tail_args=()
  [[ -n "$phone_serial" ]] && tail_args+=(/tmp/moodbloom_logcat_phone.log)
  [[ -n "$watch_serial" ]]  && tail_args+=(/tmp/moodbloom_logcat_watch.log)

  if [[ ${#tail_args[@]} -gt 0 ]]; then
    for f in "${tail_args[@]}"; do [[ -f "$f" ]] || touch "$f"; done
    info "Tailing combined logcat (Ctrl+C stops everything)"
    divider
    tail -f "${tail_args[@]}" 2>/dev/null &
    BG_PIDS+=($!)
  fi
}

# ── Vite dev server ───────────────────────────────────────────────────────────
VITE_PID=""

start_vite() {
  step "Starting Vite dev server"
  : > /tmp/moodbloom_vite.log
  npm run dev >> /tmp/moodbloom_vite.log 2>&1 &
  VITE_PID=$!
  echo "$VITE_PID" > /tmp/moodbloom_vite.pid
  detail "PID $VITE_PID -- log: /tmp/moodbloom_vite.log"

  local attempts=0
  printf "  Waiting for Vite on :1420 " >&2
  while ! curl -sf http://localhost:1420 > /dev/null 2>&1; do
    sleep 1; attempts=$((attempts+1))
    printf "." >&2
    if [[ $attempts -ge 30 ]]; then
      echo "" >&2
      error "Vite did not start within 30s -- check /tmp/moodbloom_vite.log"
      return 1
    fi
  done
  echo "" >&2
  success "Vite ready at http://localhost:1420"
}

# ── Background runner ─────────────────────────────────────────────────────────
run_bg() {
  local label="$1"; shift
  local log="/tmp/moodbloom_${label// /_}.log"
  info "[$label] starting in background -- log: $log"
  "$@" > "$log" 2>&1 &
  local pid=$!
  BG_PIDS+=("$pid")
  echo "$pid" > "/tmp/moodbloom_bg_${label// /_}.pid"
}

# ── Laptop Wi-Fi AP ───────────────────────────────────────────────────────────
#
# Creates a Wi-Fi hotspot on the laptop using NetworkManager so the phone can
# connect as a regular client and reach the Vite dev server by IP.
#
# Background: Tauri CLI forcibly replaces the devUrl host with the laptop's
# detected network IP (e.g. 10.42.0.1) — we cannot override this.  Vite is
# configured with host:true (0.0.0.0) so it answers on that IP.  The phone
# must be a regular Wi-Fi client on the same subnet to reach it.  When the
# phone is the hotspot gateway, Android NAT prevents it from initiating
# connections to its own clients — hence this flag.
#
# The watch does NOT need to join this AP:
#   • ADB deploys  → USB cable (already working)
#   • App data     → Bluetooth / Wear OS data layer (already working)
start_laptop_ap() {
  step "Creating laptop Wi-Fi hotspot"

  if ! command -v nmcli &>/dev/null; then
    error "nmcli not found — install NetworkManager (sudo apt install network-manager)"
    exit 1
  fi

  # Tear down any leftover session from a previous run
  nmcli connection down  "$AP_CON_NAME" 2>/dev/null || true
  nmcli connection delete "$AP_CON_NAME" 2>/dev/null || true

  info "Starting hotspot '${AP_SSID}' on ${AP_IFACE} (band: 2.4 GHz)..."

  local out
  if ! out=$(nmcli device wifi hotspot \
      ifname    "$AP_IFACE"    \
      con-name  "$AP_CON_NAME" \
      ssid      "$AP_SSID"     \
      password  "$AP_PASSWORD" \
      band      bg             2>&1); then
    error "nmcli hotspot failed: $out"
    error "Retry manually: nmcli device wifi hotspot ifname $AP_IFACE ssid '$AP_SSID' password '$AP_PASSWORD' band bg"
    exit 1
  fi

  AP_ACTIVE=true

  # NetworkManager assigns 10.42.0.1 by default; read it back to be sure
  local ap_ip
  ap_ip=$(nmcli -g IP4.ADDRESS connection show "$AP_CON_NAME" 2>/dev/null \
          | head -1 | cut -d/ -f1 | tr -d ' ')
  [[ -z "$ap_ip" ]] && ap_ip="10.42.0.1"

  success "Hotspot active"
  detail "SSID     : ${BOLD}${AP_SSID}${RESET}"
  detail "Password : ${BOLD}${AP_PASSWORD}${RESET}"
  detail "Laptop IP: ${BOLD}${ap_ip}${RESET}  (Vite will be reachable at ${ap_ip}:1420)"
  echo "" >&2
  echo -e "  ${BOLD}Connect your Pixel 9 to '${AP_SSID}'${RESET}" >&2
  echo -e "  ${DIM}(watch stays on USB + Bluetooth — no Wi-Fi change needed)${RESET}" >&2
  echo "" >&2
  printf "  Press Enter once the phone shows connected... " >&2
  read -r
  echo "" >&2
}

# ── Cleanup ───────────────────────────────────────────────────────────────────
cleanup() {
  echo "" >&2
  info "Shutting down..."
  for pid in "${BG_PIDS[@]:-}"; do
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
  done
  if [[ -n "$VITE_PID" ]]; then
    kill "$VITE_PID" 2>/dev/null || true
    rm -f /tmp/moodbloom_vite.pid
  fi
  for pid_file in /tmp/moodbloom_emu_*.pid; do
    [[ -f "$pid_file" ]] || continue
    local pid; pid=$(cat "$pid_file")
    kill "$pid" 2>/dev/null || true
    rm -f "$pid_file"
  done
  # Remove the Bluetooth ADB bridge port forward if we set one up
  if $BT_BRIDGE_ACTIVE && [[ -n "$PHONE_SERIAL" ]]; then
    "$ADB" -s "$PHONE_SERIAL" forward --remove tcp:$WATCH_BRIDGE_PORT >/dev/null 2>&1 || true
    detail "Removed BT bridge forward (tcp:$WATCH_BRIDGE_PORT)"
  fi
  # Tear down the laptop Wi-Fi hotspot if we created one
  if $AP_ACTIVE; then
    nmcli connection down   "$AP_CON_NAME" >/dev/null 2>&1 || true
    nmcli connection delete "$AP_CON_NAME" >/dev/null 2>&1 || true
    detail "Hotspot '${AP_CON_NAME}' removed"
  fi
}
trap cleanup EXIT INT TERM

# ── Tauri android dev ─────────────────────────────────────────────────────────
run_tauri_android_dev() {
  local phone_serial="${1:-}"
  # Set ANDROID_SERIAL so Tauri/Gradle target only the phone when the watch
  # is also visible in adb (otherwise Tauri shows an interactive device picker)
  [[ -n "$phone_serial" ]] && export ANDROID_SERIAL="$phone_serial"

  # ── USB reverse tunnel (belt-and-suspenders) ─────────────────────────────
  # Tauri CLI *always* replaces the devUrl host with the laptop's detected
  # network IP for physical Android devices — there is no override for this.
  # The primary path is therefore: phone WiFi → laptop IP:1420 (Vite on 0.0.0.0).
  #
  # Requirement: phone and laptop must be on the SAME WiFi network where
  # the phone can initiate connections to the laptop (e.g. both connected to
  # a shared hotspot or home router). The phone cannot reach the laptop when
  # the phone itself is the hotspot gateway (Android NAT blocks gateway→client).
  #
  # adb reverse is still set up as a fallback for any localhost references.
  if [[ -n "$phone_serial" ]]; then
    "$ADB" -s "$phone_serial" reverse tcp:1420 tcp:1420 >/dev/null 2>&1 \
      && detail "adb reverse tcp:1420 set up (fallback)" \
      || true
  fi

  JAVA_HOME="$JAVA_HOME" npm run tauri android dev -- \
    --no-dev-server-wait \
    --config '{"build":{"beforeDevCommand":""}}'
}

# ──────────────────────────────────────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}${BLUE}MoodBloom Dev Launcher${RESET}"
divider

target_str=""
$START_DESKTOP        && target_str+="desktop  "
$PAIR_WATCH_ONLY      && target_str="pair-watch"
$RECONNECT_WATCH_ONLY && target_str="reconnect-watch"
if ! $PAIR_WATCH_ONLY && ! $RECONNECT_WATCH_ONLY; then
  $START_PHONE && { $REAL_PHONE && target_str+="phone[real]  " || target_str+="phone[emu:$PHONE_AVD]  "; }
  $START_WATCH && { $REAL_WATCH && target_str+="watch[real]  " || target_str+="watch[emu:$WATCH_AVD]  "; }
fi

printf "  Targets  : %s\n"  "${target_str:-none}"
$NO_SNAPSHOT  && printf "  Snapshots: disabled\n"
$INSTALL_WEAR && printf "  Wear APK : sideload on phone\n"
$DO_LOGCAT    && printf "  Logcat   : streaming (%s)\n" "$(IFS='|'; echo "${LOGCAT_TAGS[*]}")"
$LAPTOP_AP    && printf "  Hotspot  : %s (iface: %s)\n" "$AP_SSID" "$AP_IFACE"
divider
echo ""

check_tools

# ── Laptop AP (must come before device resolution so Tauri detects the right IP)
if $LAPTOP_AP; then
  start_laptop_ap
fi

# ── Pair-watch-only mode ──────────────────────────────────────────────────────
# Wi-Fi pairing is direct laptop -> watch; phone is not required.
if $PAIR_WATCH_ONLY; then
  WATCH_SERIAL=$(pair_watch_wizard)
  echo "" >&2
  success "Pairing complete.  You can now run:"
  echo -e "  ${BOLD}./scripts/dev.sh phone watch --real --logcat${RESET}\n" >&2
  exit 0
fi

# ── Reconnect-watch-only mode ─────────────────────────────────────────────────
# Watch is already paired; just need the new ephemeral TCP port (no code).
if $RECONNECT_WATCH_ONLY; then
  saved_ip=$(_state_get "tcp_ip")
  saved_mode=$(_state_get "mode")
  if [[ -z "$saved_ip" && -z "$saved_mode" ]]; then
    error "No saved watch state — run --pair-watch first to pair the watch."
    exit 1
  fi
  # Resolve the phone serial first so BT bridge can be attempted
  PHONE_SERIAL=$(resolve_real_phone)
  WATCH_SERIAL=$(reconnect_watch_by_port "$saved_ip" "$PHONE_SERIAL")
  if [[ -z "$WATCH_SERIAL" ]]; then
    error "Reconnect failed.  If the watch was factory reset, run --pair-watch to re-pair."
    exit 1
  fi
  echo "" >&2
  success "Watch reconnected.  You can now run:"
  echo -e "  ${BOLD}./scripts/dev.sh phone watch --real --logcat${RESET}\n" >&2
  exit 0
fi

# ──────────────────────────────────────────────────────────────────────────────
# PHASE 1 — Resolve / launch devices
# ──────────────────────────────────────────────────────────────────────────────

# ── Phone ─────────────────────────────────────────────────────────────────────
if $START_PHONE; then
  if $REAL_PHONE; then
    step "Resolving real phone"
    PHONE_SERIAL=$(resolve_real_phone)
    if [[ -z "$PHONE_SERIAL" ]]; then
      error "No real phone found."
      detail "Connect via USB, or: adb pair <ip>:<pair-port> && adb connect <ip>:<tcp-port>"
      exit 1
    fi
    phone_model=$("$ADB" -s "$PHONE_SERIAL" shell getprop ro.product.model 2>/dev/null | tr -d '\r\n' || true)
    phone_android=$("$ADB" -s "$PHONE_SERIAL" shell getprop ro.build.version.release 2>/dev/null | tr -d '\r\n' || true)
    success "Phone: $PHONE_SERIAL"
    detail "Model: ${phone_model:-unknown}  |  Android ${phone_android:-unknown}"
  else
    # Hint: if a real USB phone is already connected, suggest using it
    usb_phone=$(find_real_phone_serial)
    if [[ -n "$usb_phone" ]]; then
      local _model
      _model=$("$ADB" -s "$usb_phone" shell getprop ro.product.model 2>/dev/null | tr -d '\r\n' || true)
      warn "Real phone detected: $usb_phone (${_model:-unknown})"
      info "Tip: add ${BOLD}--real${RESET} to use your physical device instead of the emulator"
    fi
    existing=$(find_running_emulator_serial "$PHONE_AVD")
    if [[ -n "$existing" ]]; then
      warn "$PHONE_AVD already running ($existing) -- reusing"
      PHONE_SERIAL="$existing"
    else
      step "Starting phone emulator: $PHONE_AVD"
      start_emulator_bg "$PHONE_AVD" "phone"
    fi
  fi
fi

# ── Watch ─────────────────────────────────────────────────────────────────────
if $START_WATCH; then
  if $REAL_WATCH; then
    WATCH_SERIAL=$(resolve_real_watch "$PHONE_SERIAL")
    if [[ -z "$WATCH_SERIAL" ]]; then
      error "Could not connect to watch."
      local _saved_ip; _saved_ip=$(_state_get "tcp_ip")
      if [[ -n "$_saved_ip" ]]; then
        detail "Watch paired at $_saved_ip — port may have changed. Try: ./scripts/dev.sh --reconnect-watch"
      else
        detail "First time? Pair with: ./scripts/dev.sh --pair-watch"
      fi
      exit 1
    fi
    watch_model=$("$ADB" -s "$WATCH_SERIAL" shell getprop ro.product.model 2>/dev/null | tr -d '\r\n' || true)
    wear_ver=$("$ADB" -s "$WATCH_SERIAL" shell getprop ro.build.version.release 2>/dev/null | tr -d '\r\n' || true)
    success "Watch: $WATCH_SERIAL"
    detail "Model: ${watch_model:-unknown}  |  Wear OS / Android ${wear_ver:-unknown}"
  else
    existing=$(find_running_emulator_serial "$WATCH_AVD")
    if [[ -n "$existing" ]]; then
      warn "$WATCH_AVD already running ($existing) -- reusing"
      WATCH_SERIAL="$existing"
    else
      step "Starting watch emulator: $WATCH_AVD"
      start_emulator_bg "$WATCH_AVD" "watch"
    fi
  fi
fi

# ── Wait for emulators ────────────────────────────────────────────────────────
if $START_PHONE && ! $REAL_PHONE && [[ -z "$PHONE_SERIAL" ]]; then
  PHONE_SERIAL=$(wait_for_emulator_serial "$PHONE_AVD" "Phone") || exit 1
  wait_for_boot "$PHONE_SERIAL" "Phone" || exit 1
fi

if $START_WATCH && ! $REAL_WATCH && [[ -z "$WATCH_SERIAL" ]]; then
  WATCH_SERIAL=$(wait_for_emulator_serial "$WATCH_AVD" "Watch") || exit 1
  wait_for_boot "$WATCH_SERIAL" "Watch" || exit 1
fi

# ──────────────────────────────────────────────────────────────────────────────
# PHASE 2 — Post-boot setup
# ──────────────────────────────────────────────────────────────────────────────

if $START_PHONE && $INSTALL_WEAR; then
  install_wear_apk_on_phone "$PHONE_SERIAL"
fi

if $START_WATCH; then
  build_and_install_watch_app "$WATCH_SERIAL"
  if ! $REAL_WATCH && $START_PHONE && ! $REAL_PHONE; then
    pair_emulator_watch_to_phone "$PHONE_SERIAL"
  fi
fi

# ── Device summary ────────────────────────────────────────────────────────────
echo ""
step "Device summary"
$START_PHONE && info "Phone : ${PHONE_SERIAL:-n/a}  [$($REAL_PHONE && echo real || echo emulator)]"
$START_WATCH && info "Watch : ${WATCH_SERIAL:-n/a}  [$($REAL_WATCH && echo real || echo emulator)]"

# ──────────────────────────────────────────────────────────────────────────────
# PHASE 3 — Logcat
# ──────────────────────────────────────────────────────────────────────────────
if $DO_LOGCAT; then
  stream_logcat "$PHONE_SERIAL" "$WATCH_SERIAL"
fi

# ──────────────────────────────────────────────────────────────────────────────
# PHASE 4 — Dev servers
# ──────────────────────────────────────────────────────────────────────────────
NEED_ANDROID=false
$START_PHONE && NEED_ANDROID=true

if $START_DESKTOP && $NEED_ANDROID; then
  start_vite
  step "Starting Tauri Android dev (background)"
  run_bg "android dev" bash -c \
    "ANDROID_SERIAL='$PHONE_SERIAL' JAVA_HOME='$JAVA_HOME' \
     npm run tauri android dev -- --no-dev-server-wait \
     --config '{\"build\":{\"beforeDevCommand\":\"\"}}'"
  step "Starting Tauri Desktop dev (foreground -- Ctrl+C stops all)"
  npm run tauri dev -- --no-dev-server

elif $START_DESKTOP; then
  step "Starting Tauri Desktop dev (foreground -- Ctrl+C to stop)"
  npm run tauri dev

elif $NEED_ANDROID; then
  step "Starting Tauri Android dev (foreground -- Ctrl+C stops all)"
  start_vite
  echo ""
  run_tauri_android_dev "$PHONE_SERIAL"

elif $START_WATCH && ! $START_PHONE && ! $START_DESKTOP; then
  step "Watch-only mode -- app installed above"
  $DO_LOGCAT && info "Logcat streaming to /tmp/moodbloom_logcat_watch.log"
  info "Ctrl+C to stop"
  wait

else
  error "No runnable targets.  Use --help."
  exit 1
fi
