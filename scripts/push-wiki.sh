#!/usr/bin/env bash
# push-wiki.sh — Publish wiki pages to the GitHub wiki repo.
# Usage: ./scripts/push-wiki.sh
# Requires: git, write access to the wiki repo.

set -euo pipefail

REPO="git@github.com:kenlacroix/moodhaven-journal.wiki.git"
WIKI_DIR="$(mktemp -d)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

echo "Cloning wiki repo..."
git clone "$REPO" "$WIKI_DIR"

echo "Copying wiki pages..."

# Core wiki pages (from wiki/ staging dir)
cp "$ROOT/wiki/Home.md"         "$WIKI_DIR/Home.md"
cp "$ROOT/wiki/Contributing.md" "$WIKI_DIR/Contributing.md"

# Pages sourced from docs/ (renamed to wiki title case)
cp "$ROOT/docs/architecture.md"       "$WIKI_DIR/Architecture-Overview.md"
cp "$ROOT/docs/tauri-commands.md"     "$WIKI_DIR/Tauri-Command-Reference.md"
cp "$ROOT/.claude/docs/security.md"   "$WIKI_DIR/Security-Model.md"
cp "$ROOT/docs/peer-sync-security.md" "$WIKI_DIR/Peer-Sync-Security.md"
cp "$ROOT/docs/speech-to-text.md"     "$WIKI_DIR/Speech-to-Text.md"
cp "$ROOT/docs/watch-companion.md"    "$WIKI_DIR/Watch-Companion.md"
cp "$ROOT/.claude/docs/build.md"      "$WIKI_DIR/Building-from-Source.md"

cd "$WIKI_DIR"

if [[ -z "$(git status --porcelain)" ]]; then
  echo "No changes to wiki. Exiting."
  rm -rf "$WIKI_DIR"
  exit 0
fi

git add -A
git commit -m "docs: sync wiki from repo docs/ and wiki/ ($(date +%Y-%m-%d))"
git push origin master

echo "Wiki published."
rm -rf "$WIKI_DIR"
