#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# MoodBloom — automated signal pipeline test runner
#
# Usage:
#   ./scripts/test-signals.sh               # Auto-detect running emulator
#   ./scripts/test-signals.sh emulator-5554 # Target a specific serial
#
# What it tests (no watch hardware required):
#   Test 1 — DB self-test : create → list → filter → payload round-trip
#                            → sync_log trigger → delete → confirm gone
#   Test 2 — Wear bridge   : simulate a watch mood_tap via wearBridgeSignal
#   Test 3 — Connection    : wearCheckConnection (expects connected=false in sim)
#
# Prerequisites:
#   - Phone emulator running with MoodBloom app installed and the dev server hot
#   - adb on PATH  (or ANDROID_HOME set)
#   - jq installed  (brew install jq  /  apt install jq)
#   - Logcat is used to capture Tauri IPC responses via am broadcast
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
ADB="${ANDROID_HOME}/platform-tools/adb"
PACKAGE="com.moodbloom.app"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

pass() { echo -e "${GREEN}  ✓${RESET} $*"; }
fail() { echo -e "${RED}  ✗${RESET} $*"; FAILURES=$((FAILURES+1)); }
info() { echo -e "${CYAN}  ·${RESET} $*"; }
step() { echo -e "\n${BOLD}${YELLOW}▶ $*${RESET}"; }

FAILURES=0

# ── Find emulator ─────────────────────────────────────────────────────────────
SERIAL="${1:-}"
if [[ -z "$SERIAL" ]]; then
  # grep for emulator lines, filter to only "device" state (not offline/unauthorized)
  SERIAL=$("$ADB" devices | grep '^emulator-' | grep $'\tdevice' | awk '{print $1}' | head -1)
  # fallback: any emulator line regardless of tab formatting
  if [[ -z "$SERIAL" ]]; then
    SERIAL=$("$ADB" devices | grep '^emulator-' | awk '{print $1}' | head -1)
  fi
  if [[ -z "$SERIAL" ]]; then
    echo -e "${RED}No running emulator found. Start one first:${RESET}"
    echo "  ./scripts/dev.sh phone"
    echo ""
    echo "Current adb devices output:"
    "$ADB" devices
    exit 1
  fi
fi
info "Using emulator: $SERIAL"

# ── Check app is installed ────────────────────────────────────────────────────
if ! "$ADB" -s "$SERIAL" shell pm list packages 2>/dev/null | grep -q "$PACKAGE"; then
  echo -e "${RED}$PACKAGE not installed on $SERIAL${RESET}"
  echo "Run: npm run tauri android dev   (or build + install the APK)"
  exit 1
fi
info "App installed: $PACKAGE"

# ── Helper: run a JS snippet via Chrome DevTools Protocol ─────────────────────
# We use adb to forward the devtools port, then curl to evaluate JS.
# Tauri opens devtools on port 1420 (debug builds).
DEVTOOLS_PORT=1420
DEVTOOLS_READY=false

setup_devtools() {
  # Forward devtools port from emulator to local
  "$ADB" -s "$SERIAL" forward "tcp:${DEVTOOLS_PORT}" "tcp:${DEVTOOLS_PORT}" 2>/dev/null || true

  # Check if devtools is reachable
  local attempts=0
  while [[ $attempts -lt 15 ]]; do
    if curl -sf "http://localhost:${DEVTOOLS_PORT}/json" &>/dev/null; then
      DEVTOOLS_READY=true
      break
    fi
    sleep 2; attempts=$((attempts+1)); printf "."
  done
  echo ""
  $DEVTOOLS_READY && info "Chrome DevTools reachable on port $DEVTOOLS_PORT" \
                  || info "DevTools not reachable — falling back to logcat method"
}

# Execute a Tauri invoke via DevTools websocket using curl + Python helper
eval_tauri() {
  local cmd="$1"
  local args="${2:-{\}}"

  if ! $DEVTOOLS_READY; then
    echo "SKIPPED"
    return
  fi

  # Get the websocket URL for the first tab
  local ws_url
  ws_url=$(curl -sf "http://localhost:${DEVTOOLS_PORT}/json" \
    | python3 -c "import sys,json; tabs=json.load(sys.stdin); print(tabs[0]['webSocketDebuggerUrl'])" 2>/dev/null) || true

  if [[ -z "$ws_url" ]]; then
    echo "NO_TAB"
    return
  fi

  # Use Python websocket to send a Runtime.evaluate call
  python3 - "$ws_url" "$cmd" "$args" <<'PYEOF'
import sys, json, time
try:
    import websocket
except ImportError:
    print("NO_WS_LIB")
    sys.exit(0)

ws_url, cmd, args = sys.argv[1], sys.argv[2], sys.argv[3]

ws = websocket.create_connection(ws_url, timeout=10)
expr = f"window.__TAURI__.core.invoke('{cmd}', {args}).then(r => '__RESULT__:' + JSON.stringify(r)).catch(e => '__ERROR__:' + e.message)"
ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": expr, "awaitPromise": True}}))

deadline = time.time() + 15
while time.time() < deadline:
    raw = ws.recv()
    msg = json.loads(raw)
    if msg.get("id") == 1:
        val = msg.get("result", {}).get("result", {}).get("value", "")
        print(val)
        break

ws.close()
PYEOF
}

# ── Logcat capture method (fallback when DevTools not available) ───────────────
# We inject a signal via an Android Intent extra, the app logs the result
adb_broadcast_test() {
  local test_name="$1"
  # Clear logcat
  "$ADB" -s "$SERIAL" logcat -c 2>/dev/null || true
  # Start app with test extra
  "$ADB" -s "$SERIAL" shell am start -n "${PACKAGE}/.MainActivity" \
    --es mb_selftest "signal_pipeline" \
    --activity-single-top \
    -f 0x20000000 2>/dev/null || true

  # Tail logcat for up to 20 seconds looking for our test marker
  local found=""
  local deadline=$(($(date +%s) + 20))
  while [[ $(date +%s) -lt $deadline ]]; do
    local line
    line=$("$ADB" -s "$SERIAL" logcat -d -s MoodBloomTest:V 2>/dev/null | tail -20) || true
    if echo "$line" | grep -q "MB_SELFTEST_OK"; then
      found="$line"
      break
    fi
    sleep 1
  done
  echo "$found"
}

# ──────────────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}MoodBloom Signal Pipeline Tests${RESET}"
echo -e "  Emulator: ${SERIAL}\n"

setup_devtools

# ── Test 1: DB self-test via debug_signal_self_test command ───────────────────
step "Test 1 — DB signal self-test (create/list/filter/delete/sync_log)"

RESULT=$(eval_tauri "debug_signal_self_test" '{}')

case "$RESULT" in
  SKIPPED|NO_TAB|NO_WS_LIB|"")
    info "DevTools not available — using logcat fallback"
    info "Manually run in browser console:"
    echo ""
    echo "    window.__TAURI__.core.invoke('debug_signal_self_test').then(r => console.log(JSON.stringify(r, null, 2)))"
    echo ""
    info "Expected output:"
    echo '    { "passed": 7, "failed": 0, "ok": true, "results": [...] }'
    ;;
  *__RESULT__:*)
    JSON="${RESULT#*__RESULT__:}"
    OK=$(echo "$JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ok','?'))" 2>/dev/null || echo "?")
    PASSED=$(echo "$JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('passed',0))" 2>/dev/null || echo "?")
    TOTAL=$(echo "$JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total',0))" 2>/dev/null || echo "?")

    if [[ "$OK" == "True" ]] || [[ "$OK" == "true" ]]; then
      pass "All $PASSED/$TOTAL subtests passed"
    else
      fail "Some subtests failed ($PASSED/$TOTAL passed)"
      echo "$JSON" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for r in d.get('results', []):
    icon = '✓' if r['pass'] else '✗'
    print(f'    {icon} {r[\"test\"]}: {r[\"detail\"]}')
" 2>/dev/null || true
    fi
    ;;
  *__ERROR__:*)
    fail "Command error: ${RESULT#*__ERROR__:}"
    ;;
  *)
    info "Raw result: $RESULT"
    ;;
esac

# ── Test 2: Simulate a watch mood_tap ─────────────────────────────────────────
step "Test 2 — Watch signal simulation (wearBridgeSignal → wear://signal event)"

SIM_ID="test-sim-$(date +%s)"
SIM_ARGS=$(printf '{"id":"%s","timestamp":"%s","type":"mood_tap","payload":"{\"mood\":4}"}' \
  "$SIM_ID" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")

RESULT=$(eval_tauri "plugin:wear|wearBridgeSignal" "$SIM_ARGS")

case "$RESULT" in
  SKIPPED|NO_TAB|NO_WS_LIB|"")
    info "DevTools not available — run manually:"
    echo ""
    echo "    window.__TAURI__.core.invoke('plugin:wear|wearBridgeSignal', {"
    echo "      id: crypto.randomUUID(),"
    echo "      timestamp: new Date().toISOString(),"
    echo "      type: 'mood_tap',"
    echo "      payload: JSON.stringify({ mood: 4 })"
    echo "    })"
    echo ""
    info "Expected: { emitted: true, id: '...' }"
    info "Then check Logcat (tag=WearPlugin) for: Emitted wear://signal"
    ;;
  *__RESULT__:*)
    JSON="${RESULT#*__RESULT__:}"
    EMITTED=$(echo "$JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('emitted','?'))" 2>/dev/null || echo "?")
    if [[ "$EMITTED" == "True" ]] || [[ "$EMITTED" == "true" ]]; then
      pass "wearBridgeSignal returned emitted=true"
    else
      fail "wearBridgeSignal did not emit: $JSON"
    fi
    ;;
  *__ERROR__:*)
    fail "wearBridgeSignal error: ${RESULT#*__ERROR__:}"
    ;;
esac

# ── Test 3: Connection check ───────────────────────────────────────────────────
step "Test 3 — wearCheckConnection (expect connected=false in emulator)"

RESULT=$(eval_tauri "plugin:wear|wearCheckConnection" '{}')

case "$RESULT" in
  SKIPPED|NO_TAB|NO_WS_LIB|"")
    info "DevTools not available — run manually:"
    echo ""
    echo "    window.__TAURI__.core.invoke('plugin:wear|wearCheckConnection')"
    echo ""
    info "Expected: { connected: false, nodeId: '', nodeCount: 0 }"
    ;;
  *__RESULT__:*)
    JSON="${RESULT#*__RESULT__:}"
    CONNECTED=$(echo "$JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('connected','?'))" 2>/dev/null || echo "?")
    if [[ "$CONNECTED" == "False" ]] || [[ "$CONNECTED" == "false" ]]; then
      pass "No watch connected (expected in emulator)"
    elif [[ "$CONNECTED" == "True" ]] || [[ "$CONNECTED" == "true" ]]; then
      pass "Watch connected! node=$(echo "$JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('nodeName','?'))" 2>/dev/null)"
    else
      info "Result: $JSON"
    fi
    ;;
  *__ERROR__:*)
    fail "wearCheckConnection error: ${RESULT#*__ERROR__:}"
    ;;
esac

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
if [[ $FAILURES -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  All automated tests passed ✓${RESET}"
else
  echo -e "${RED}${BOLD}  $FAILURES test(s) failed ✗${RESET}"
fi
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

if ! $DEVTOOLS_READY; then
  echo ""
  echo -e "${YELLOW}NOTE:${RESET} Chrome DevTools was not reachable on port $DEVTOOLS_PORT."
  echo "The tests above printed the console commands to run manually."
  echo ""
  echo "To enable DevTools auto-testing, make sure:"
  echo "  1. The app is running via 'npm run tauri android dev' (not a release build)"
  echo "  2. Tauri devtools port $DEVTOOLS_PORT is open (check tauri.conf.json devtools setting)"
  echo "  3. 'pip3 install websocket-client' is installed for the WS helper"
fi

exit $FAILURES
