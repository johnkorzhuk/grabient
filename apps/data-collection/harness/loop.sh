#!/usr/bin/env bash
# Runs Claude Code in a loop to generate and curate training data.
#
# Requires: claude CLI on PATH (logged in - iterations run on your Claude Code
# subscription), and env vars
#   DC_API_URL  - deployed Worker URL (e.g. https://grabient-data-collection.<acct>.workers.dev)
#   DC_API_KEY  - value of the HARNESS_API_KEY secret
# Both are auto-loaded from harness/.env (gitignored) if it exists.
#
# Usage: pnpm harness:loop [max_iterations]   (default: run forever)
set -uo pipefail

cd "$(dirname "$0")/.."

if [ -f harness/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . harness/.env
  set +a
fi

: "${DC_API_URL:?set DC_API_URL to the deployed worker URL}"
: "${DC_API_KEY:?set DC_API_KEY to the HARNESS_API_KEY secret}"
export DC_API_URL DC_API_KEY

MAX_ITERATIONS="${1:-0}" # 0 = forever
SLEEP_BETWEEN=30
FAILURE_BACKOFF=300
JUDGE_BACKLOG_THRESHOLD=150
ITERATION_TIMEOUT="15m"
LOG_DIR="harness/logs"
mkdir -p "$LOG_DIR"

# Housekeeping so an unattended loop doesn't fill the disk.
find "$LOG_DIR" -name '*.log' -mtime +7 -delete 2>/dev/null || true
find harness/renders -type f -mtime +2 -delete 2>/dev/null || true

api() {
  curl -sf -H "Authorization: Bearer $DC_API_KEY" "$DC_API_URL$1"
}

iteration=0
consecutive_failures=0

while true; do
  iteration=$((iteration + 1))
  if [ "$MAX_ITERATIONS" -gt 0 ] && [ "$iteration" -gt "$MAX_ITERATIONS" ]; then
    echo "done: reached $MAX_ITERATIONS iterations"
    break
  fi

  pending=$(api /api/stats | python3 -c 'import json,sys; print(json.load(sys.stdin).get("pairs",{}).get("pending",0))' 2>/dev/null || echo 0)

  # Mode schedule: keep the judge queue drained, sample coeff space every 3rd
  # iteration (then caption what it produced), audit every 12th, else generate.
  if [ "$pending" -gt "$JUDGE_BACKLOG_THRESHOLD" ]; then
    mode="judge"
  elif [ $((iteration % 12)) -eq 0 ]; then
    mode="audit"
  elif [ $((iteration % 3)) -eq 0 ]; then
    mode="caption"
  else
    mode="generate-forward"
  fi

  # Volume modes run on sonnet to stretch subscription usage; judge/audit are
  # the dataset's quality gate and get the stronger model. Turn caps are
  # generous on purpose - an undersized cap kills the iteration mid-work and
  # wastes everything it spent. Tighten per-mode only after logs show real
  # turn counts well under the cap.
  case "$mode" in
    judge|audit) model="opus"   ;;
    *)           model="sonnet" ;;
  esac
  max_turns=50

  # Decorrelate generation: fresh contexts given identical prompts converge on
  # the same favorite palettes. Two random themes per iteration - the collision
  # of unrelated concepts is where the unusual queries come from.
  focus=""
  if [ "$mode" = "generate-forward" ] && [ -s harness/themes.txt ]; then
    focus="$(shuf -n2 harness/themes.txt | paste -sd'|')"
  fi

  run_id="$(date +%Y%m%d-%H%M%S)-$mode"
  log_file="$LOG_DIR/$run_id.log"
  echo "[$(date +%H:%M:%S)] iteration $iteration mode=$mode model=$model run=$run_id (pending pairs: $pending)${focus:+ focus='$focus'}"

  curl -sf -X POST -H "Authorization: Bearer $DC_API_KEY" -H "Content-Type: application/json" \
    -d "{\"id\":\"$run_id\",\"mode\":\"$mode\"}" "$DC_API_URL/api/runs" >/dev/null || true

  # Deterministic coeff-space sampling runs before captioning so there is
  # always something to caption.
  if [ "$mode" = "caption" ]; then
    npx tsx harness/sample.ts --run-id "$run_id" >>"$log_file" 2>&1 || true
  fi
  # Judge works best with rendered previews; pre-render the queue to PNGs.
  if [ "$mode" = "judge" ] || [ "$mode" = "audit" ]; then
    npx tsx harness/render.ts --mode "$mode" --run-id "$run_id" >>"$log_file" 2>&1 || true
  fi

  if timeout "$ITERATION_TIMEOUT" claude -p "/$mode run_id=$run_id${focus:+ focus=\"$focus\"}" \
    --model "$model" \
    --allowedTools "Bash(curl:*),Bash(npx tsx harness/*),Read" \
    --max-turns "$max_turns" >>"$log_file" 2>&1; then
    status="done"
    consecutive_failures=0
  else
    status="failed"
    consecutive_failures=$((consecutive_failures + 1))
    echo "  iteration failed (see $log_file)"
  fi

  curl -sf -X PATCH -H "Authorization: Bearer $DC_API_KEY" -H "Content-Type: application/json" \
    -d "{\"status\":\"$status\"}" "$DC_API_URL/api/runs/$run_id" >/dev/null || true

  tail -2 "$log_file" 2>/dev/null | sed 's/^/  /'

  if [ "$consecutive_failures" -ge 3 ]; then
    echo "  3 consecutive failures; backing off ${FAILURE_BACKOFF}s"
    sleep "$FAILURE_BACKOFF"
    consecutive_failures=0
  else
    sleep "$SLEEP_BETWEEN"
  fi
done
