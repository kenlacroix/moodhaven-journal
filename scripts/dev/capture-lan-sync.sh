#!/usr/bin/env bash
# =============================================================================
# MoodBloom LAN Sync — Network Diagnostic Capture
# =============================================================================
# Captures all LAN sync traffic into a .pcap file for Wireshark analysis.
#
# Captures four traffic layers:
#   1. mDNS/DNS-SD  — peer discovery  (UDP 5353, multicast 224.0.0.251)
#   2. UDP fallback — probe/pong      (UDP 4243)
#   3. TCP pairing  — QR/PIN exchange (TCP 43000–43999, plaintext HTTP)
#   4. TCP sync     — handshake+data  (TCP 44000–44999, AES-256-GCM)
#
# Usage:
#   ./scripts/capture-lan-sync.sh [options]
#
# Options:
#   --iface  <name>   Network interface (default: auto-detect)
#   --out    <file>   Output .pcap file (default: lan-sync-<timestamp>.pcap)
#   --duration <sec>  Stop after N seconds (default: run until Ctrl-C)
#   --help            Show this help
#
# Requirements:
#   tcpdump  (sudo apt install tcpdump  /  brew install tcpdump)
#   Wireshark (optional, for viewing — https://www.wireshark.org/)
#
# Example:
#   sudo ./scripts/capture-lan-sync.sh --iface wlan0 --duration 60
# =============================================================================

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
DIM='\033[2m'
RESET='\033[0m'

# ── Defaults ─────────────────────────────────────────────────────────────────
IFACE=""
OUT_FILE=""
DURATION=""
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOCAL_MODE=0   # set to 1 when both peers are on the same machine (dev-peer2)

# ── BPF filter ───────────────────────────────────────────────────────────────
# mDNS (5353) + UDP fallback (4243) + TCP pairing (43000-43999) + TCP sync (44000-44999)
BPF_FILTER="udp port 5353 or udp port 4243 or (tcp and portrange 43000-44999)"

# ── Parse args ────────────────────────────────────────────────────────────────
usage() {
  sed -n '/^# Usage:/,/^# ======/p' "$0" | grep '^#' | sed 's/^# \{0,2\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --iface)    IFACE="$2";    shift 2 ;;
    --out)      OUT_FILE="$2"; shift 2 ;;
    --duration) DURATION="$2"; shift 2 ;;
    --local)    LOCAL_MODE=1;  shift   ;;   # both peers on same machine (dev-peer2)
    --help|-h)  usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

# ── Prerequisite checks ───────────────────────────────────────────────────────
if ! command -v tcpdump &>/dev/null; then
  echo -e "${RED}Error:${RESET} tcpdump not found."
  echo "  Ubuntu/Debian : sudo apt install tcpdump"
  echo "  macOS         : brew install tcpdump"
  exit 1
fi

# tcpdump needs root (or CAP_NET_RAW) to capture
if [[ $EUID -ne 0 ]]; then
  echo -e "${YELLOW}Warning:${RESET} Not running as root. Trying anyway — tcpdump may fail."
  echo "  Re-run with:  sudo $0 $*"
  echo ""
fi

# ── Auto-detect interface ─────────────────────────────────────────────────────
if [[ -z "$IFACE" ]]; then
  if [[ "$LOCAL_MODE" -eq 1 ]]; then
    # Both peers on same machine → all TCP traffic is loopback
    # Use 'any' so we also catch mDNS on whichever interface the mdns-sd crate binds
    IFACE="any"
  else
    # Try default route first
    if command -v ip &>/dev/null; then
      IFACE=$(ip -4 route show default 2>/dev/null | awk '/^default/ {print $5; exit}')
    fi

    # macOS fallback
    if [[ -z "$IFACE" ]] && command -v route &>/dev/null; then
      IFACE=$(route -n get default 2>/dev/null | awk '/interface:/ {print $2}')
    fi

    # Last resort: first non-loopback up interface
    if [[ -z "$IFACE" ]]; then
      if command -v ip &>/dev/null; then
        IFACE=$(ip link show up 2>/dev/null | awk -F': ' '/^[0-9]+: [^l]/ {gsub(/@.*/, "", $2); print $2; exit}')
      else
        IFACE=$(ifconfig 2>/dev/null | awk '/^[a-z]/ && !/^lo/ {gsub(/:/, "", $1); print $1; exit}')
      fi
    fi

    if [[ -z "$IFACE" ]]; then
      echo -e "${RED}Error:${RESET} Could not auto-detect a network interface."
      echo "  Specify one with:  --iface <name>"
      echo "  For local dev-peer2 testing, use:  --local"
      echo "  Available interfaces:"
      if command -v ip &>/dev/null; then
        ip link show | awk -F': ' '/^[0-9]+:/ {print "    " $2}'
      else
        ifconfig | awk '/^[a-z]/ {print "    " $1}'
      fi
      exit 1
    fi
  fi
fi

# ── Output file ───────────────────────────────────────────────────────────────
if [[ -z "$OUT_FILE" ]]; then
  OUT_FILE="lan-sync-${TIMESTAMP}.pcap"
fi

# ── Protocol legend ───────────────────────────────────────────────────────────
print_legend() {
  echo -e "${BOLD}${CYAN}MoodBloom LAN Sync — Protocol Map${RESET}"
  echo -e "${DIM}─────────────────────────────────────────────────────────────${RESET}"
  echo -e " ${BOLD}Discovery layer${RESET}  (mDNS / DNS-SD)"
  echo -e "   UDP 5353 → multicast 224.0.0.251"
  echo -e "   Service:  _moodbloom._tcp.local"
  echo -e "   Records:  PTR → SRV → TXT (device_id, pubkey_hint)"
  echo ""
  echo -e " ${BOLD}UDP fallback${RESET}     (Phase 4 — when mDNS is blocked)"
  echo -e "   UDP 4243 → broadcast / unicast"
  echo -e "   Probe: {t:\"probe\",did,name}   Pong: {t:\"pong\",...}"
  echo ""
  echo -e " ${BOLD}TCP pairing${RESET}      (ports 43000–43999, deterministic per device)"
  echo -e "   Port formula: 43000 + (first_4_hex_of_device_id as u16) % 1000"
  echo -e "   ⚠ PLAINTEXT HTTP — PIN and public keys visible in capture"
  echo ""
  echo -e "   Initiator opens QR/PIN flow → starts HTTP listener on pairing port"
  echo -e "   Joiner scans QR / enters PIN → POST to initiator's pairing port:"
  echo -e "   ${GREEN}POST /pair${RESET}  {pin, device_id, device_name, public_key}  ${DIM}← plaintext${RESET}"
  echo -e "   ${GREEN}200 OK${RESET}      {device_id, device_name, public_key}        ${DIM}← plaintext${RESET}"
  echo -e "   Both sides write each other to trusted_devices.json and close."
  echo ""
  echo -e " ${BOLD}TCP sync engine${RESET}  (ports 44000–44999, deterministic per device)"
  echo -e "   Port formula: 44000 + (first_4_hex_of_device_id as u16) % 1000"
  echo ""
  echo -e "   Handshake sequence:"
  echo -e "   ${GREEN}→ HELLO${RESET}  {t:\"hello\",did}          ${DIM}← plaintext JSON${RESET}"
  echo -e "   ${GREEN}← OK${RESET}     {t:\"ok\",name}            ${DIM}← plaintext JSON${RESET}"
  echo -e "   ${YELLOW}→ MANIFEST${RESET} {t:\"manifest\",entries}  ${DIM}← AES-256-GCM encrypted${RESET}"
  echo -e "   ${YELLOW}← MANIFEST${RESET} {t:\"manifest\",entries}  ${DIM}← AES-256-GCM encrypted${RESET}"
  echo -e "   ${YELLOW}← ENTRY×N${RESET}  {t:\"entry\",row:{...}}  ${DIM}← AES-256-GCM encrypted${RESET}"
  echo -e "   ${YELLOW}← DONE${RESET}    {t:\"done\",sent:N}       ${DIM}← AES-256-GCM encrypted${RESET}"
  echo -e "   ${YELLOW}→ ENTRY×M${RESET}  {t:\"entry\",row:{...}}  ${DIM}← AES-256-GCM encrypted${RESET}"
  echo -e "   ${YELLOW}→ DONE${RESET}    {t:\"done\",sent:M}       ${DIM}← AES-256-GCM encrypted${RESET}"
  echo -e "   ${YELLOW}← DONE_ACK${RESET} {t:\"done_ack\",recv:M}  ${DIM}← AES-256-GCM encrypted${RESET}"
  echo -e "   ${YELLOW}→ DONE_ACK${RESET} {t:\"done_ack\",recv:N}  ${DIM}← AES-256-GCM encrypted${RESET}"
  echo ""
  echo -e " ${BOLD}Encrypted sync wire frame${RESET} (after HELLO/OK):"
  echo -e "   [4 bytes BE length][12 bytes nonce][AES-GCM ciphertext + auth tag]"
  echo -e "   ${DIM}Transport key = SHA-256(\"moodbloom-sync-v1:\" || sorted(pubkeyA,pubkeyB))${RESET}"
  echo -e "${DIM}─────────────────────────────────────────────────────────────${RESET}"
}

print_wireshark_tips() {
  echo ""
  echo -e "${BOLD}${CYAN}Wireshark — Suggested Display Filters${RESET}"
  echo -e "${DIM}─────────────────────────────────────────────────────────────${RESET}"
  echo -e " ${BOLD}mDNS discovery${RESET}"
  echo -e "   mdns"
  echo -e "   mdns.dns.resp.name contains \"moodbloom\""
  echo ""
  echo -e " ${BOLD}TCP pairing only${RESET}"
  echo -e "   tcp.port >= 43000 && tcp.port <= 43999"
  echo ""
  echo -e " ${BOLD}TCP sync only${RESET}"
  echo -e "   tcp.port >= 44000 && tcp.port <= 44999"
  echo ""
  echo -e " ${BOLD}TCP sync handshake only${RESET}"
  echo -e "   (tcp.port >= 44000 && tcp.port <= 44999) && tcp.flags.syn == 1"
  echo ""
  echo -e " ${BOLD}Plaintext frames — pairing POST + sync HELLO/OK${RESET}"
  echo -e "   (tcp.port >= 43000 && tcp.port <= 44999) && tcp.len > 10 && tcp.len < 400"
  echo ""
  echo -e " ${BOLD}UDP fallback probes${RESET}"
  echo -e "   udp.port == 4243"
  echo ""
  echo -e " ${BOLD}Full session (discovery → pairing → sync → done)${RESET}"
  echo -e "   mdns or (tcp.port >= 43000 && tcp.port <= 44999) or udp.port == 4243"
  echo ""
  echo -e " ${DIM}Tip: In Wireshark, right-click a TCP stream → Follow → TCP Stream${RESET}"
  echo -e " ${DIM}     to see the raw bytes — you can spot the HELLO JSON in the first frame.${RESET}"
  echo -e "${DIM}─────────────────────────────────────────────────────────────${RESET}"
}

# ── Cleanup on exit ───────────────────────────────────────────────────────────
TCPDUMP_PID=""
SUMMARY_PID=""

cleanup() {
  echo ""
  # Kill background processes gracefully
  [[ -n "$TCPDUMP_PID" ]] && kill "$TCPDUMP_PID" 2>/dev/null || true
  [[ -n "$SUMMARY_PID" ]] && kill "$SUMMARY_PID" 2>/dev/null || true
  wait 2>/dev/null || true

  echo -e "${BOLD}${GREEN}Capture complete.${RESET}"

  if [[ -f "$OUT_FILE" ]]; then
    SIZE=$(du -sh "$OUT_FILE" 2>/dev/null | cut -f1)
    echo -e " File : ${BOLD}$OUT_FILE${RESET}  (${SIZE})"
    echo ""
    echo -e " Open in Wireshark:"
    echo -e "   ${CYAN}wireshark \"$OUT_FILE\" &${RESET}"
    echo -e "   ${DIM}or: tshark -r \"$OUT_FILE\" -Y 'mdns' -T fields -e dns.qry.name${RESET}"
  else
    echo -e " ${YELLOW}Warning:${RESET} Output file not found — tcpdump may have exited early."
  fi

  print_wireshark_tips
}

trap cleanup EXIT INT TERM

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
print_legend
echo ""
echo -e "${BOLD}Starting capture${RESET}"
echo -e " Interface : ${BOLD}$IFACE${RESET}"
echo -e " Output    : ${BOLD}$OUT_FILE${RESET}"
echo -e " Filter    : ${DIM}$BPF_FILTER${RESET}"
[[ -n "$DURATION" ]] && echo -e " Duration  : ${BOLD}${DURATION}s${RESET}" || echo -e " Duration  : ${BOLD}until Ctrl-C${RESET}"
if [[ "$LOCAL_MODE" -eq 1 ]]; then
  echo -e " Mode      : ${YELLOW}local (dev-peer2) — capturing loopback + all interfaces${RESET}"
  echo -e " ${DIM}Note: mDNS multicast (224.0.0.251) may not appear on loopback.${RESET}"
  echo -e " ${DIM}      TCP pairing (43000-43999) and sync (44000-44999) fully visible.${RESET}"
fi
echo ""
echo -e "${DIM}Tip: Trigger a sync from MoodBloom → Settings → Devices → Sync Now${RESET}"
echo -e "${DIM}─────────────────────────────────────────────────────────────${RESET}"
echo ""

# ── Build tcpdump args ────────────────────────────────────────────────────────
TCPDUMP_ARGS=(-i "$IFACE" -n -s 0)
[[ -n "$DURATION" ]] && TCPDUMP_ARGS+=(-G "$DURATION" -W 1)

# ── Live summary (text mode, parallel process) ────────────────────────────────
# A second tcpdump instance in line-buffered text mode for human-readable output.
# We silence errors since it may start a moment after the pcap instance.
tcpdump "${TCPDUMP_ARGS[@]}" -l "$BPF_FILTER" 2>/dev/null \
  | awk '
    /\.5353/ || /224\.0\.0\.251/ { tag="[mDNS  ]" }
    /\.4243/                      { tag="[UDP FB]" }
    /\.4[3][0-9][0-9][0-9]/      { tag="[PAIR  ]" }
    /\.4[4-9][0-9][0-9][0-9]/    { tag="[SYNC  ]" }
    !tag                          { tag="[?     ]" }
    { printf "  %s %s\n", tag, $0; tag="" }
  ' &
SUMMARY_PID=$!

# ── Main pcap capture ─────────────────────────────────────────────────────────
tcpdump "${TCPDUMP_ARGS[@]}" -w "$OUT_FILE" "$BPF_FILTER" 2>&1 \
  | grep -v "^tcpdump: listening" || true &
TCPDUMP_PID=$!

# Wait for tcpdump to finish (timed) or for user Ctrl-C (indefinite)
wait "$TCPDUMP_PID" 2>/dev/null || true
