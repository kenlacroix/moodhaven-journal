#!/usr/bin/env bash
# dev-peer2.sh — run a second MoodBloom dev instance on the same machine
# for testing local peer sync.
#
# Uses:
#   - VITE_PORT=1421   (avoids conflict with primary dev server on 1420)
#   - XDG_DATA_HOME=/tmp/moodbloom-peer2  (separate identity/data)
#
# Usage:
#   chmod +x scripts/dev-peer2.sh
#   ./scripts/dev-peer2.sh

set -e
cd "$(dirname "$0")/.."

DATA_DIR=/tmp/moodbloom-peer2
VITE_PORT=1421

mkdir -p "$DATA_DIR"

echo ""
echo "┌─────────────────────────────────────────────┐"
echo "│  MoodBloom — Peer 2 dev instance             │"
echo "│  Vite port : $VITE_PORT                          │"
echo "│  Data dir  : $DATA_DIR │"
echo "│  Identity  : separate keypair (auto-created) │"
echo "└─────────────────────────────────────────────┘"
echo ""

# Override the Tauri devUrl to point at the alternate Vite port.
# TAURI_DEV_URL is read by the Tauri CLI before launching.
export VITE_PORT="$VITE_PORT"
export XDG_DATA_HOME="$DATA_DIR"
export TAURI_DEV_URL="http://localhost:$VITE_PORT"

exec npm run tauri dev -- --no-dev-server-wait
