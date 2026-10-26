#!/usr/bin/env bash
# Baseline runner for Evolution API 2.4.0-rc2.
# Does not change production behaviour. Does not connect WhatsApp.
set -u
set +e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export DATABASE_PROVIDER="${DATABASE_PROVIDER:-postgresql}"
export DATABASE_CONNECTION_URI="${DATABASE_CONNECTION_URI:-postgresql://evolution:evolution@127.0.0.1:5432/evolution_db?schema=evolution_api}"
export AUTHENTICATION_API_KEY="${AUTHENTICATION_API_KEY:-baseline-global-key-rc2}"
export TELEMETRY_ENABLED="${TELEMETRY_ENABLED:-false}"
export SERVER_PORT="${SERVER_PORT:-8080}"
export BASE_URL="${BASE_URL:-http://127.0.0.1:${SERVER_PORT}}"
RESULTS_DIR="${RESULTS_DIR:-docs/baseline}"
mkdir -p "$RESULTS_DIR"
SUMMARY="$RESULTS_DIR/run-summary.json"
STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

run_step() {
  local name="$1"
  shift
  echo ""
  echo "========== $name =========="
  local log="$RESULTS_DIR/${name}.log"
  set +e
  "$@" >"$log" 2>&1
  local code=$?
  set -e
  echo "exit=$code (log: $log)"
  tail -n 30 "$log" || true
  echo "$name|$code" >>"$RESULTS_DIR/steps.txt"
  return 0
}

: >"$RESULTS_DIR/steps.txt"

echo "postgres:"
PGPASSWORD=evolution psql -h 127.0.0.1 -U evolution -d evolution_db -c 'SELECT 1' || {
  echo "Postgres is not reachable at 127.0.0.1:5432"
}
echo "redis:"
redis-cli ping || echo "Redis is not reachable"

run_step lint-check npm run lint:check
run_step typecheck npx tsc --noEmit
run_step build npm run build
run_step unit-tests npm run test:baseline

echo ""
echo "========== http smoke (license inactive) =========="
node scripts/baseline/seed-local-license.mjs --clear
# Start API in background
API_LOG="$RESULTS_DIR/api-inactive.log"
npx tsx src/main.ts >"$API_LOG" 2>&1 &
API_PID=$!
cleanup() {
  if [[ -n "${API_PID:-}" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

waited=0
until curl -sf "$BASE_URL/license/status" >/dev/null 2>&1 || [[ $waited -ge 60 ]]; do
  sleep 1
  waited=$((waited + 1))
done
echo "API up after ${waited}s (inactive phase), pid=$API_PID"
BASELINE_RESULTS="$RESULTS_DIR/http-smoke-inactive.json" node scripts/baseline/http-smoke.mjs
echo "inactive-http|$?" >>"$RESULTS_DIR/steps.txt"

echo ""
echo "========== http smoke (local license seed) =========="
kill "$API_PID" 2>/dev/null || true
wait "$API_PID" 2>/dev/null || true
node scripts/baseline/seed-local-license.mjs
API_LOG="$RESULTS_DIR/api-active.log"
npx tsx src/main.ts >"$API_LOG" 2>&1 &
API_PID=$!
waited=0
until curl -sf "$BASE_URL/license/status" >/dev/null 2>&1 || [[ $waited -ge 60 ]]; do
  sleep 1
  waited=$((waited + 1))
done
echo "API up after ${waited}s (active phase), pid=$API_PID"
curl -s "$BASE_URL/license/status" || true
echo
BASELINE_RESULTS="$RESULTS_DIR/http-smoke-active.json" node scripts/baseline/http-smoke.mjs
echo "active-http|$?" >>"$RESULTS_DIR/steps.txt"

python3 - <<PY
import json, pathlib, datetime
root = pathlib.Path("$RESULTS_DIR")
steps = []
for line in (root / "steps.txt").read_text().splitlines():
    if "|" in line:
        name, code = line.split("|", 1)
        steps.append({"name": name, "exit": int(code)})
out = {
    "started": "$STARTED",
    "finished": datetime.datetime.utcnow().isoformat() + "Z",
    "steps": steps,
    "commit": "$(git rev-parse HEAD)",
    "branch": "$(git rev-parse --abbrev-ref HEAD)",
}
(root / "run-summary.json").write_text(json.dumps(out, indent=2))
print(json.dumps(out, indent=2))
PY

echo "Baseline finished. See $RESULTS_DIR"
