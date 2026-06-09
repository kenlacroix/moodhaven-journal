#!/usr/bin/env bash
#
# crash-replay.sh — Layer B of the crash-replay harness (the credibility anchor).
#
# For each crash boundary in encrypt_in_place AND in change_master_password's atomic flip
# (rekey_in_place), this:
#   1. seeds a fresh plaintext DB with a known sentinel row,
#   2. runs the real migration parked AT the boundary, sends a genuine `kill -9`,
#      and confirms the process died with exit status 137 (SIGKILL),
#   3. boots the recovery path and asserts the data is either fully old or fully new,
#      with the sentinel row intact — never a half-state, never lost.
#
# It prints the exhibit table and exits non-zero if any boundary loses data, so it can
# gate CI. `kill -9` is Linux/macOS only; the same boundaries are covered on Windows by
# the Layer-A state-injection matrix (cargo test db::crash_replay).
#
# Usage: scripts/crash-replay.sh
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAURI_DIR="$REPO_ROOT/src-tauri"
BIN="$TAURI_DIR/target/debug/examples/crash_probe"
PW="correct horse battery staple"

NEWPW="tr0ub4dor & the new passphrase"

# Migration boundaries (encrypt_in_place), in order. The expected recovery (old/new) is
# reported by the probe, not asserted here — the harness only requires old XOR new + sentinel.
MIGRATION_BOUNDARIES=(
  encrypt.after_salt
  encrypt.after_export
  encrypt.after_state_true
  encrypt.before_rename
  encrypt.after_rename
)

# change_master_password boundaries — the atomic-flip core (rekey_in_place). A kill -9 before
# the db_state salt flip recovers OLD; after it recovers NEW. The two media-orchestration
# boundaries (cmp.media_staged / cmp.media_renamed) are covered by the Layer-A matrix
# (db::crash_replay cmp_b1/b2/b3), which injects staged media and asserts the rename resume.
CP_BOUNDARIES=(
  cmp.tmp_built
  cmp.after_db_flip
  cmp.after_promote
)

echo "==> building crash_probe (debug)"
( cd "$TAURI_DIR" && cargo build --example crash_probe ) || {
  echo "build failed"; exit 1;
}
[ -x "$BIN" ] || { echo "probe binary not found at $BIN"; exit 1; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/mh_crash_replay.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

declare -a ROWS
FAILS=0

# replay_boundary <kind> <boundary>
#   kind=migrate → seed plaintext, run `migrate`, verify with PW
#   kind=cp      → seed encrypted (old pw), run `cp-change`, verify with PW/NEWPW
# Seeds a fresh DB, runs the operation parked AT <boundary>, sends a genuine kill -9 once it
# signals readiness, confirms exit 137, then boots recovery and asserts old XOR new + sentinel.
replay_boundary() {
  local kind="$1" b="$2"
  local dir="$WORK/$b" ready
  ready="$dir/ready"
  mkdir -p "$dir"

  if [ "$kind" = "cp" ]; then
    "$BIN" cp-seed "$dir" "$PW" >/dev/null || { echo "cp-seed failed for $b"; FAILS=$((FAILS+1)); return; }
  else
    "$BIN" seed "$dir" >/dev/null || { echo "seed failed for $b"; FAILS=$((FAILS+1)); return; }
  fi

  # Run parked at this boundary; kill once it signals readiness. The brace group's stderr is
  # dropped so the shell's async "Killed" job notice (expected) doesn't pollute the exhibit.
  local killed="TIMEOUT" pid status
  {
    if [ "$kind" = "cp" ]; then
      MH_CRASH_POINT="$b" MH_CRASH_READY="$ready" "$BIN" cp-change "$dir" "$PW" "$NEWPW" >/dev/null 2>&1 &
    else
      MH_CRASH_POINT="$b" MH_CRASH_READY="$ready" "$BIN" migrate "$dir" "$PW" >/dev/null 2>&1 &
    fi
    pid=$!
    for _ in $(seq 1 200); do      # ~10s
      if [ -f "$ready" ]; then
        kill -9 "$pid" 2>/dev/null
        wait "$pid"; status=$?
        if [ "$status" -eq 137 ]; then killed="SIGKILL"; else killed="exit:$status"; fi
        break
      fi
      if ! kill -0 "$pid" 2>/dev/null; then
        wait "$pid"; killed="EXITED:$?"   # finished without parking — harness error
        break
      fi
      sleep 0.05
    done
    if [ "$killed" = "TIMEOUT" ]; then
      kill -9 "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
    fi
  } 2>/dev/null

  # Recover + assert the invariant.
  local out verdict recovered sentinel
  if [ "$kind" = "cp" ]; then
    out="$("$BIN" cp-verify "$dir" "$PW" "$NEWPW")" && verdict="PASS" || { verdict="FAIL"; FAILS=$((FAILS+1)); }
  else
    out="$("$BIN" verify "$dir" "$PW")" && verdict="PASS" || { verdict="FAIL"; FAILS=$((FAILS+1)); }
  fi
  recovered="$(printf '%s' "$out" | sed -n 's/.*recovered=\([a-z]*\).*/\1/p')"
  sentinel="$(printf '%s' "$out" | sed -n 's/.*sentinel=\([A-Za-z]*\).*/\1/p')"
  [ -n "$recovered" ] || recovered="?"
  [ -n "$sentinel" ] || sentinel="?"
  [ "$killed" = "SIGKILL" ] || FAILS=$((FAILS+1))

  ROWS+=("$(printf '%-26s %-8s %-11s %-8s %s' "$b" "$killed" "$recovered" "$sentinel" "$verdict")")
}

for b in "${MIGRATION_BOUNDARIES[@]}"; do replay_boundary migrate "$b"; done
for b in "${CP_BOUNDARIES[@]}"; do replay_boundary cp "$b"; done

echo
printf '%-26s %-8s %-11s %-8s %s\n' "boundary" "killed" "recovered" "sentinel" "result"
printf '%-26s %-8s %-11s %-8s %s\n' "--------" "------" "---------" "--------" "------"
for r in "${ROWS[@]}"; do echo "$r"; done
echo

total=$(( ${#MIGRATION_BOUNDARIES[@]} + ${#CP_BOUNDARIES[@]} ))
if [ "$FAILS" -eq 0 ]; then
  echo "→ $total/$total boundaries: data survived a kill -9 at every step"
  exit 0
else
  echo "→ $FAILS failure(s) across $total boundaries — see table above"
  exit 1
fi
