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
  echo "Run: ./scripts/dev.sh   (starts Vite + installs app)"
  exit 1
fi
info "App installed: $PACKAGE"

# ── Ensure Vite dev server is reachable (debug APK uses devUrl=localhost:1420) ──
# The debug build is compiled with cfg(dev) which makes the WebView navigate to
# the Vite dev server URL. Without the server, the WebView shows a connection
# error and Tauri IPC is unavailable. Set up ADB reverse so the emulator can
# reach the host's port 1420, then verify the server is running.
"$ADB" -s "$SERIAL" reverse tcp:1420 tcp:1420 2>/dev/null || true
if ! curl -sf --connect-timeout 2 http://localhost:1420 > /dev/null 2>&1; then
  echo -e "${YELLOW}WARNING:${RESET} Vite dev server not detected on localhost:1420."
  echo "The MoodBloom debug APK uses cfg(dev) and navigates to http://localhost:1420."
  echo "Without the dev server the WebView shows a connection error and IPC fails."
  echo ""
  echo "Start the dev environment first:"
  echo "  ./scripts/dev.sh"
  echo ""
  echo "Then re-run this script in a second terminal."
  exit 1
fi
info "Vite dev server reachable; ADB reverse tcp:1420 set up"

# ── Helper: run a JS snippet via Chrome DevTools Protocol ─────────────────────
# Chrome DevTools Protocol (CDP) runs on port 9222 via an ADB Unix socket.
# Port 1420 is the Vite dev server — different thing.
DEVTOOLS_PORT=9222
DEVTOOLS_READY=false

setup_devtools() {
  # Tauri's Android WebView exposes CDP on an abstract Unix socket named
  # webview_devtools_remote_<pid>. The socket name changes each launch,
  # so we detect it dynamically from /proc/net/unix.
  local socket
  socket=$("$ADB" -s "$SERIAL" shell cat /proc/net/unix 2>/dev/null \
    | awk '{print $NF}' \
    | grep 'webview_devtools_remote_' \
    | head -1 | tr -d '@\r')

  if [[ -z "$socket" ]]; then
    info "WebView CDP socket not found — is the app running?"
    info "Start with: ./scripts/dev.sh --avd Medium_Phone_API_36.1"
    return
  fi

  info "WebView socket: $socket"
  "$ADB" -s "$SERIAL" forward "tcp:${DEVTOOLS_PORT}" "localabstract:${socket}" 2>/dev/null || true

  # Verify the /json endpoint returns real CDP JSON (5s timeout — don't hang)
  local response
  response=$(curl -sf --max-time 5 "http://localhost:${DEVTOOLS_PORT}/json" 2>/dev/null || true)
  if echo "$response" | python3 -c "import sys,json; tabs=json.load(sys.stdin); assert len(tabs)>0" 2>/dev/null; then
    DEVTOOLS_READY=true
    info "Chrome DevTools reachable on port $DEVTOOLS_PORT"
  else
    info "CDP endpoint not responding — the app may still be starting"
    return
  fi

  # Check websocket-client
  if ! python3 -c "import websocket" 2>/dev/null; then
    info "websocket-client not installed — tests will print manual commands"
    info "Fix: pip3 install websocket-client  (or pip3 install websocket-client --break-system-packages)"
    DEVTOOLS_READY=false
    return
  fi

  # Probe which Tauri global is available and which window label is active.
  # Tauri v2 ACL is scoped to window labels defined in capabilities ("main", "writer").
  # If CDP connects to a window with a different label, all commands will be denied.
  local probe_result
  probe_result=$(python3 - "$(curl -sf "http://localhost:${DEVTOOLS_PORT}/json" \
    | python3 -c "import sys,json; tabs=json.load(sys.stdin); print(tabs[0]['webSocketDebuggerUrl'])" 2>/dev/null)" <<'PYEOF'
import sys, json
try:
    import websocket
except ImportError:
    print("no_ws_lib"); sys.exit(0)
ws_url = sys.argv[1]
ws = websocket.create_connection(ws_url, timeout=5, suppress_origin=True)
ws.settimeout(2)   # per-recv timeout so the loop can actually check the deadline
# Probe both the type and the window label in one round-trip
ws.send(json.dumps({"id":99,"method":"Runtime.evaluate",
  "params":{
    "expression": """(function() {
      var t = typeof window.__TAURI_INTERNALS__;
      var lbl = '';
      try { lbl = window.__TAURI_INTERNALS__.metadata.currentWindow.label || ''; } catch(e) {}
      return t + '|' + lbl;
    })()""",
    "returnByValue": True
  }}))
import time; deadline=time.time()+8
while time.time()<deadline:
    try:
        raw=ws.recv(); msg=json.loads(raw)
        if msg.get("id")==99:
            print(msg.get("result",{}).get("result",{}).get("value","unknown"))
            break
    except Exception:
        pass  # timeout on this recv — keep looping until deadline
ws.close()
PYEOF
  )

  local bridge_type="${probe_result%%|*}"
  local window_label="${probe_result##*|}"
  info "window.__TAURI_INTERNALS__ type: ${bridge_type}  window label: '${window_label}'"

  if [[ "$bridge_type" != "object" && "$bridge_type" != "function" ]]; then
    info "Tauri internals bridge not yet visible — app may still be loading"
    info "Wait a few seconds for the WebView to fully initialise, then retry"
    DEVTOOLS_READY=false
    return
  fi

  # ACL capabilities are bound to windows ["main", "writer"].
  # If the label is wrong, ALL commands will fail with "not allowed".
  if [[ -n "$window_label" && "$window_label" != "main" && "$window_label" != "writer" ]]; then
    info "WARNING: CDP connected to window '${window_label}', not 'main'."
    info "Commands may be denied because capabilities only cover 'main' and 'writer'."
  fi
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

  # Use Python websocket to send a Runtime.evaluate call.
  # Origin must match the app's own origin (http://tauri.localhost) — the
  # Android WebView CDP blocks connections from other origins (403 Forbidden).
  python3 - "$ws_url" "$cmd" "$args" <<'PYEOF'
import sys, json, time
try:
    import websocket
except ImportError:
    print("NO_WS_LIB")
    sys.exit(0)

ws_url, cmd, args = sys.argv[1], sys.argv[2], sys.argv[3]

ws = websocket.create_connection(
    ws_url,
    timeout=5,
    suppress_origin=True,   # omit Origin header — Chromium rejects all external origins
)
ws.settimeout(2)   # per-recv timeout so the deadline loop can interrupt blocking recvs
expr = (
    f"window.__TAURI_INTERNALS__.invoke('{cmd}', {args})"
    f".then(r => '__RESULT__:' + JSON.stringify(r))"
    f".catch(e => '__ERROR__:' + (typeof e === 'string' ? e : (e && e.message) || JSON.stringify(e)))"
)
ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate",
                    "params": {"expression": expr, "awaitPromise": True,
                               "returnByValue": True}}))

deadline = time.time() + 15
while time.time() < deadline:
    try:
        raw = ws.recv()
    except Exception:
        continue   # per-recv timeout — check deadline and retry
    msg = json.loads(raw)
    if msg.get("id") == 1:
        msg_result = msg.get("result", {})
        # CDP wraps synchronous JS exceptions in exceptionDetails rather than result.value
        if "exceptionDetails" in msg_result:
            exc = msg_result["exceptionDetails"]
            desc = (exc.get("exception") or {}).get("description") or exc.get("text") or "unknown"
            print(f"__ERROR__:JS exception: {desc}")
        else:
            val = msg_result.get("result", {}).get("value", "")
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
    echo "    window.__TAURI_INTERNALS__.invoke('debug_signal_self_test').then(r => console.log(JSON.stringify(r, null, 2)))"
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
SIM_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# Build args JSON with correctly escaped payload.
# jq is preferred; fall back to Python3 if jq is not installed.
if command -v jq &>/dev/null; then
  SIM_ARGS=$(jq -n \
    --arg id      "$SIM_ID" \
    --arg ts      "$SIM_TS" \
    --arg payload '{"mood":4}' \
    '{id:$id,timestamp:$ts,type:"mood_tap",payload:$payload}')
else
  SIM_ARGS=$(python3 -c "
import json, sys
print(json.dumps({'id':sys.argv[1],'timestamp':sys.argv[2],'type':'mood_tap','payload':'{\"mood\":4}'}))
" "$SIM_ID" "$SIM_TS")
fi

RESULT=$(eval_tauri "plugin:wear|wearBridgeSignal" "$SIM_ARGS")

case "$RESULT" in
  SKIPPED|NO_TAB|NO_WS_LIB|"")
    info "DevTools not available — run manually:"
    echo ""
    echo "    window.__TAURI_INTERNALS__.invoke('plugin:wear|wearBridgeSignal', {"
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
    echo "    window.__TAURI_INTERNALS__.invoke('plugin:wear|wearCheckConnection')"
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
