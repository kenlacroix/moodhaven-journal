#!/usr/bin/env bash
#
# crash-replay.sh — Layer B of the crash-replay harness (the credibility anchor).
#
# For each crash boundary in encrypt_in_place, this:
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

# Boundaries to kill at, in migration order. The expected recovery (old/new) is reported
# by the probe, not asserted here — the harness only requires old XOR new + sentinel intact.
BOUNDARIES=(
  encrypt.after_salt
  encrypt.after_export
  encrypt.after_state_true
  encrypt.before_rename
  encrypt.after_rename
)

# Pending: change_master_password boundaries (active-plans/change-password.md §4, §7). The
# orchestrator already fires these crash_point!s; wiring them here needs a `change-password`
# subcommand in crash_probe.rs that seeds entries/signals/media/TOTP and parks at each. Until
# then they are covered by the Layer-A placeholders (db::crash_replay cmp_b0..b4, #[ignore]d).
#   cmp.before_inner_commit   -> recover OLD
#   cmp.after_inner_commit    -> recover NEW
#   cmp.mid_media             -> recover NEW
#   cmp.before_rekey          -> recover NEW
#   cmp.after_rekey           -> recover NEW

echo "==> building crash_probe (debug)"
( cd "$TAURI_DIR" && cargo build --example crash_probe ) || {
  echo "build failed"; exit 1;
}
[ -x "$BIN" ] || { echo "probe binary not found at $BIN"; exit 1; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/mh_crash_replay.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

declare -a ROWS
FAILS=0

for b in "${BOUNDARIES[@]}"; do
  dir="$WORK/$b"
  ready="$dir/ready"
  mkdir -p "$dir"

  "$BIN" seed "$dir" >/dev/null || { echo "seed failed for $b"; FAILS=$((FAILS+1)); continue; }

  # Run the migration parked at this boundary; kill it once it signals readiness. The
  # brace group's stderr is dropped so the shell's async "Killed" job notice (expected —
  # we sent the SIGKILL) doesn't pollute the exhibit output.
  killed="TIMEOUT"
  {
    MH_CRASH_POINT="$b" MH_CRASH_READY="$ready" "$BIN" migrate "$dir" "$PW" >/dev/null 2>&1 &
    pid=$!
    for _ in $(seq 1 200); do      # ~10s
      if [ -f "$ready" ]; then
        kill -9 "$pid" 2>/dev/null
        wait "$pid"; status=$?
        if [ "$status" -eq 137 ]; then killed="SIGKILL"; else killed="exit:$status"; fi
        break
      fi
      if ! kill -0 "$pid" 2>/dev/null; then
        wait "$pid"; killed="EXITED:$?"   # migrate finished without parking — harness error
        break
      fi
      sleep 0.05
    done
    if [ "$killed" = "TIMEOUT" ]; then
      kill -9 "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
    fi
  } 2>/dev/null

  # Recover + assert the invariant.
  if out="$("$BIN" verify "$dir" "$PW")"; then
    verdict="PASS"
  else
    verdict="FAIL"; FAILS=$((FAILS+1))
  fi
  recovered="$(printf '%s' "$out" | sed -n 's/.*recovered=\([a-z]*\).*/\1/p')"
  sentinel="$(printf '%s' "$out" | sed -n 's/.*sentinel=\([A-Za-z]*\).*/\1/p')"
  [ -n "$recovered" ] || recovered="?"
  [ -n "$sentinel" ] || sentinel="?"
  [ "$killed" = "SIGKILL" ] || FAILS=$((FAILS+1))

  ROWS+=("$(printf '%-26s %-8s %-11s %-8s %s' "$b" "$killed" "$recovered" "$sentinel" "$verdict")")
done

echo
printf '%-26s %-8s %-11s %-8s %s\n' "boundary" "killed" "recovered" "sentinel" "result"
printf '%-26s %-8s %-11s %-8s %s\n' "--------" "------" "---------" "--------" "------"
for r in "${ROWS[@]}"; do echo "$r"; done
echo

total=${#BOUNDARIES[@]}
if [ "$FAILS" -eq 0 ]; then
  echo "→ $total/$total boundaries: data survived a kill -9 at every step"
  exit 0
else
  echo "→ $FAILS failure(s) across $total boundaries — see table above"
  exit 1
fi
