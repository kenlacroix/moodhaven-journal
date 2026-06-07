#!/usr/bin/env bash
# Verify that VERSION, package.json, and Cargo.toml all agree.
# Exits 1 and prints a diff if they diverge.
set -euo pipefail

VERSION_FILE=$(cat "$(dirname "$0")/../VERSION" | tr -d '[:space:]')
PKG_VERSION=$(node -e "process.stdout.write(require('./package.json').version)" 2>/dev/null || \
              python3 -c "import json,sys; print(json.load(open('package.json'))['version'], end='')")
CARGO_VERSION=$(grep '^version' src-tauri/Cargo.toml | head -1 | sed 's/version = "\(.*\)"/\1/')

MISMATCH=0
if [ "$VERSION_FILE" != "$PKG_VERSION" ]; then
  echo "VERSION mismatch: VERSION=$VERSION_FILE  package.json=$PKG_VERSION"
  MISMATCH=1
fi
if [ "$VERSION_FILE" != "$CARGO_VERSION" ]; then
  echo "VERSION mismatch: VERSION=$VERSION_FILE  Cargo.toml=$CARGO_VERSION"
  MISMATCH=1
fi

if [ "$MISMATCH" -eq 0 ]; then
  echo "All version files agree: $VERSION_FILE"
fi
exit "$MISMATCH"
