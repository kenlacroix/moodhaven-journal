#!/usr/bin/env bash
# Build whisper-cli sidecar binaries.
# Run this once before `npm run tauri dev` or `npm run tauri build`.
#
# Usage:
#   ./scripts/build-whisper.sh              # build for current Linux arch
#   ./scripts/build-whisper.sh --windows    # cross-compile for Windows x86_64 (requires mingw-w64)
#   ./scripts/build-whisper.sh --clean      # wipe /tmp/whisper before building
#   ./scripts/build-whisper.sh --windows --clean
#
# Requirements:
#   Linux native:   cmake gcc g++ build-essential
#   Windows cross:  sudo apt install mingw-w64

set -euo pipefail

WHISPER_DIR="/tmp/whisper"
BINARIES_DIR="$(cd "$(dirname "$0")/../src-tauri/binaries" && pwd)"

# Parse flags
BUILD_WINDOWS=false
CLEAN=false
for arg in "$@"; do
  case "$arg" in
    --windows) BUILD_WINDOWS=true ;;
    --clean)   CLEAN=true ;;
  esac
done

# Clean if requested
if [[ "$CLEAN" == "true" ]]; then
  echo "==> Cleaning $WHISPER_DIR"
  rm -rf "$WHISPER_DIR"
fi

# Clone if not present
if [[ ! -d "$WHISPER_DIR/.git" ]]; then
  echo "==> Cloning whisper.cpp..."
  git clone --depth 1 https://github.com/ggerganov/whisper.cpp "$WHISPER_DIR"
else
  echo "==> whisper.cpp already cloned (use --clean to refresh)"
fi

# ── Windows cross-compile ────────────────────────────────────────────────────
if [[ "$BUILD_WINDOWS" == "true" ]]; then
  if ! command -v x86_64-w64-mingw32-gcc &>/dev/null; then
    echo "ERROR: mingw-w64 not installed."
    echo "       Run: sudo apt-get install -y mingw-w64"
    exit 1
  fi

  TARGET="x86_64-pc-windows-msvc"
  DEST="$BINARIES_DIR/whisper-$TARGET.exe"
  BUILD_DIR="$WHISPER_DIR/build-windows"

  echo "==> Cross-compiling whisper-cli for Windows x86_64"
  echo "    Destination: $DEST"

  # Ubuntu MinGW headers lack THREAD_POWER_THROTTLING_STATE (added in newer Win SDK).
  # Patch the guard to check symbol availability instead of _WIN32_WINNT version.
  local GGML_CPU="$WHISPER_DIR/ggml/src/ggml-cpu/ggml-cpu.c"
  if grep -q '_WIN32_WINNT >= 0x0602' "$GGML_CPU" 2>/dev/null; then
    sed -i 's/#if _WIN32_WINNT >= 0x0602/#if defined(THREAD_POWER_THROTTLING_CURRENT_VERSION)/' "$GGML_CPU"
    echo "    (patched ggml-cpu.c for MinGW header compatibility)"
  fi

  cmake -S "$WHISPER_DIR" -B "$BUILD_DIR" \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_SHARED_LIBS=OFF \
    -DGGML_NATIVE=OFF \
    -DCMAKE_SYSTEM_NAME=Windows \
    -DCMAKE_C_COMPILER=x86_64-w64-mingw32-gcc \
    -DCMAKE_CXX_COMPILER=x86_64-w64-mingw32-g++ \
    -DCMAKE_RC_COMPILER=x86_64-w64-mingw32-windres \
    -DCMAKE_C_FLAGS="-D_WIN32_WINNT=0x0A00" \
    -DCMAKE_CXX_FLAGS="-D_WIN32_WINNT=0x0A00"

  cmake --build "$BUILD_DIR" --config Release --target whisper-cli -j"$(nproc)"

  cp "$BUILD_DIR/bin/whisper-cli.exe" "$DEST"
  echo ""
  echo "==> Done: $DEST ($(du -sh "$DEST" | cut -f1))"
  echo "    NOTE: Built with MinGW (GCC), not MSVC — fully compatible with Windows 10/11"
  echo "    Copy to Windows VM and test: whisper-cli.exe --help"
  exit 0
fi

# ── Native Linux build ───────────────────────────────────────────────────────
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  TARGET="x86_64-unknown-linux-gnu" ;;
  aarch64) TARGET="aarch64-unknown-linux-gnu" ;;
  *)
    echo "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

DEST="$BINARIES_DIR/whisper-$TARGET"
BUILD_DIR="$WHISPER_DIR/build"

echo "==> Building whisper-cli for $TARGET"
echo "    Destination: $DEST"

cmake -S "$WHISPER_DIR" -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DGGML_NATIVE=OFF

cmake --build "$BUILD_DIR" --config Release --target whisper-cli -j"$(nproc)"

cp "$BUILD_DIR/bin/whisper-cli" "$DEST"
chmod +x "$DEST"

echo ""
echo "==> Done: $DEST ($(du -sh "$DEST" | cut -f1))"
echo ""
echo "    Dependencies (should be system libs only):"
ldd "$DEST" | sed 's/^/    /'
echo ""
echo "    Test run:"
"$DEST" --help 2>&1 | head -3 | sed 's/^/    /'
