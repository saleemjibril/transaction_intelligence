#!/usr/bin/env bash
#
# End-to-end smoke test for the transaction API.
#
# Requires the API to be running and the database seeded:
#   cd backend && npm run dev
#
# Usage:
#   ./scripts/smoke.sh [base-url]
#
set -uo pipefail

BASE="${1:-http://localhost:3000/api/v1}"
ROOT="${BASE%/api/v1}"

PASS=0
FAIL=0

pass() { printf '  PASS  %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL + 1)); }

check() {
  if [ "$2" = "$3" ]; then
    pass "$1"
  else
    fail "$1 (expected '$3', got '$2')"
  fi
}

# jfield 'd["token"]' reads a field from JSON on stdin.
jfield() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null; }

status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
body() { curl -s "$@"; }

echo "Smoke testing $BASE"
echo

# --- preflight ------------------------------------------------------------
if [ "$(status "$ROOT/health")" != "200" ]; then
  fail "API not reachable at $ROOT"
  echo
  echo "Start it first:  cd backend && npm run dev"
  exit 1
fi
pass "health endpoint responds"

TOKEN=$(body -X POST "$BASE/auth/login" -H 'content-type: application/json' \
  -d '{"email":"admin@acme.ng","password":"password123"}' | jfield 'd["token"]')
if [ -z "$TOKEN" ]; then
  fail "Acme login (is the database seeded?)"
  exit 1
fi
pass "Acme login returns a token"

ACC=$(body "$BASE/accounts" -H "authorization: Bearer $TOKEN" | jfield 'd[0]["id"]')
[ -n "$ACC" ] && pass "Acme accounts listed" || { fail "Acme accounts listed"; exit 1; }

RUN=$(date +%s)
AUTH="authorization: Bearer $TOKEN"
JSON="content-type: application/json"

# --- browse ---------------------------------------------------------------
echo
echo "browse"
PAGE=$(body "$BASE/transactions?limit=5" -H "$AUTH")
check "returns 5 rows" "$(printf '%s' "$PAGE" | jfield 'len(d["data"])')" "5"

AMT=$(printf '%s' "$PAGE" | jfield 'd["data"][0]["amount"]')
case "$AMT" in
  *.*) pass "amount is a decimal string ($AMT)" ;;
  *)   fail "amount should be a decimal string, got '$AMT'" ;;
esac

SEARCH=$(body "$BASE/transactions?search=payroll" -H "$AUTH")
check "search finds matching rows" "$(printf '%s' "$SEARCH" | jfield 'len(d["data"])>0')" "True"

DIRFILTER=$(body "$BASE/transactions?direction=CREDIT" -H "$AUTH")
check "direction filter returns only credits" \
  "$(printf '%s' "$DIRFILTER" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(all(t["direction"]=="CREDIT" for t in d["data"]) and len(d["data"])>0)')" "True"

P1=$(body "$BASE/transactions?limit=3" -H "$AUTH")
CUR=$(printf '%s' "$P1" | jfield 'd["nextCursor"]')
P2=$(body "$BASE/transactions?limit=3&cursor=$CUR" -H "$AUTH")
OVERLAP=$(python3 - "$P1" "$P2" <<'PY'
import sys, json
a = {t["id"] for t in json.loads(sys.argv[1])["data"]}
b = {t["id"] for t in json.loads(sys.argv[2])["data"]}
print(len(a & b))
PY
)
check "cursor pages do not overlap" "$OVERLAP" "0"

# --- import ---------------------------------------------------------------
echo
echo "single import"
import_one() {
  local ref="$1" amount="$2" key="${3:-}"
  local payload="{\"externalRef\":\"$ref\",\"accountId\":\"$ACC\",\"amount\":\"$amount\",\"direction\":\"CREDIT\",\"description\":\"Smoke import\",\"date\":\"2026-10-13T10:00:00.000Z\"}"
  if [ -n "$key" ]; then
    body -X POST "$BASE/transactions" -H "$AUTH" -H "$JSON" -H "idempotency-key: $key" -d "$payload"
  else
    body -X POST "$BASE/transactions" -H "$AUTH" -H "$JSON" -d "$payload"
  fi
}

IMP=$(import_one "SMOKE-$RUN-a" "12999.75")
check "stores the amount exactly" "$(printf '%s' "$IMP" | jfield 'd["amount"]')" "12999.75"

DUP=$(status -X POST "$BASE/transactions" -H "$AUTH" -H "$JSON" \
  -d "{\"externalRef\":\"SMOKE-$RUN-a\",\"accountId\":\"$ACC\",\"amount\":\"12999.75\",\"direction\":\"CREDIT\",\"description\":\"Smoke import\",\"date\":\"2026-10-13T10:00:00.000Z\"}")
check "duplicate external ref rejected" "$DUP" "409"

A=$(import_one "SMOKE-$RUN-i" "500.00" "smoke-key-$RUN")
B=$(import_one "SMOKE-$RUN-i" "500.00" "smoke-key-$RUN")
check "idempotent retry returns the same id" \
  "$(printf '%s' "$A" | jfield 'd["id"]')" "$(printf '%s' "$B" | jfield 'd["id"]')"

# --- batch ----------------------------------------------------------------
echo
echo "batch import"
BATCH_BODY=$(cat <<JSON
{"transactions":[
  {"externalRef":"SMOKE-$RUN-b1","accountId":"$ACC","amount":"100.00","direction":"CREDIT","description":"batch ok 1","date":"2026-10-13T10:00:00.000Z"},
  {"externalRef":"SMOKE-$RUN-b2","accountId":"$ACC","amount":"not-a-number","direction":"CREDIT","description":"batch broken","date":"2026-10-13T10:00:00.000Z"},
  {"externalRef":"SMOKE-$RUN-b3","accountId":"$ACC","amount":"300.00","direction":"DEBIT","description":"batch ok 2","date":"2026-10-13T10:00:00.000Z"}
]}
JSON
)
BATCH=$(body -X POST "$BASE/transactions/batch" -H "$AUTH" -H "$JSON" -d "$BATCH_BODY")
check "imports the 2 valid rows" "$(printf '%s' "$BATCH" | jfield 'len(d["imported"])')" "2"
check "reports the 1 invalid row" "$(printf '%s' "$BATCH" | jfield 'len(d["failed"])')" "1"

# --- isolation ------------------------------------------------------------
echo
echo "tenant isolation"
GTOKEN=$(body -X POST "$BASE/auth/login" -H "$JSON" \
  -d '{"email":"admin@globex.ng","password":"password123"}' | jfield 'd["token"]')
check "missing token is rejected" "$(status "$BASE/transactions")" "401"

GID=$(body "$BASE/transactions?limit=1" -H "authorization: Bearer $GTOKEN" | jfield 'd["data"][0]["id"]')
check "cross-org transaction read returns 404" \
  "$(status "$BASE/transactions/$GID" -H "$AUTH")" "404"

GACC=$(body "$BASE/accounts" -H "authorization: Bearer $GTOKEN" | jfield 'd[0]["id"]')
CROSS=$(status -X POST "$BASE/transactions" -H "$AUTH" -H "$JSON" \
  -d "{\"externalRef\":\"SMOKE-$RUN-x\",\"accountId\":\"$GACC\",\"amount\":\"10.00\",\"direction\":\"CREDIT\",\"description\":\"cross org\",\"date\":\"2026-10-13T10:00:00.000Z\"}")
check "cross-org account id rejected" "$CROSS" "400"

# --- cleanup --------------------------------------------------------------
PSQL=""
for c in psql /opt/homebrew/opt/postgresql@16/bin/psql; do
  if command -v "$c" >/dev/null 2>&1; then PSQL="$c"; break; fi
done
if [ -n "$PSQL" ]; then
  "$PSQL" -d sycamore -q -c "DELETE FROM \"Transaction\" WHERE \"externalRef\" LIKE 'SMOKE-%';" >/dev/null 2>&1 \
    && echo && echo "Cleaned up smoke test rows."
fi

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
