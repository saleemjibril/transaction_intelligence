#!/usr/bin/env bash
#
# Demonstration of transaction import and automatic categorisation.
#
# Shows the full pipeline: import (API) -> PENDING -> background worker
# categorises -> flags anything needing review.
#
# Requires the backend running (cd backend && npm run dev).
# Usage:  ./scripts/demo.sh
#
set -uo pipefail

BASE="${1:-http://localhost:3000/api/v1}"
ROOT="${BASE%/api/v1}"
PAUSE="${PAUSE:-1}"

pause() {
  if [ "$PAUSE" = "1" ]; then
    printf '\n  [press Enter to continue]'
    read -r _
  fi
}

jfield() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null; }

if [ "$(curl -s -o /dev/null -w '%{http_code}' "$ROOT/health")" != "200" ]; then
  echo "Backend not reachable at $ROOT. Start it with:  cd backend && npm run dev"
  exit 1
fi

TOKEN=$(curl -s -X POST "$BASE/auth/login" -H 'content-type: application/json' \
  -d '{"email":"admin@acme.ng","password":"password123"}' | jfield 'd["token"]')
ACC=$(curl -s "$BASE/accounts" -H "authorization: Bearer $TOKEN" | jfield 'd[0]["id"]')
AUTH="authorization: Bearer $TOKEN"

# Clear rows from any previous run, so re-runs stay clean (no self-duplicates).
# Flags and classification logs reference the transaction, so delete those first.
PSQL=""
for c in psql /opt/homebrew/opt/postgresql@16/bin/psql; do
  command -v "$c" >/dev/null 2>&1 && PSQL="$c" && break
done
if [ -n "$PSQL" ]; then
  if "$PSQL" -d sycamore -q -v ON_ERROR_STOP=1 -c "
    DELETE FROM \"TransactionFlag\" WHERE \"transactionId\" IN (SELECT id FROM \"Transaction\" WHERE \"externalRef\" LIKE 'DEMO-%');
    DELETE FROM \"ClassificationLog\" WHERE \"transactionId\" IN (SELECT id FROM \"Transaction\" WHERE \"externalRef\" LIKE 'DEMO-%');
    DELETE FROM \"Transaction\" WHERE \"externalRef\" LIKE 'DEMO-%';
  " >/dev/null 2>&1; then
    echo "Cleared rows from previous demo runs."
  fi
fi

RUN=$(date +%s)

echo "======================================================================"
echo " Transaction import and categorisation demo"
echo "======================================================================"
echo
echo "Step 1. Import a batch of three transactions."
echo "  - a payroll payment      (should categorise confidently)"
echo "  - a large contract       (should be flagged as a large amount)"
echo "  - an unrecognised vendor (should be flagged as low confidence)"
echo

BATCH=$(cat <<JSON
{"transactions":[
  {"externalRef":"DEMO-$RUN-1","accountId":"$ACC","amount":"1850000.00","direction":"DEBIT","description":"Monthly staff payroll","merchant":"Access Bank","date":"2026-10-14T09:00:00.000Z"},
  {"externalRef":"DEMO-$RUN-2","accountId":"$ACC","amount":"8000000.00","direction":"CREDIT","description":"Large contract milestone payment","merchant":"Zaria Wholesalers","date":"2026-10-14T09:00:00.000Z"},
  {"externalRef":"DEMO-$RUN-3","accountId":"$ACC","amount":"45000.00","direction":"DEBIT","description":"Office cleaning service","merchant":"CleanCo","date":"2026-10-14T09:00:00.000Z"}
]}
JSON
)

IMPORT=$(curl -s -X POST "$BASE/transactions/batch" -H "$AUTH" -H 'content-type: application/json' -d "$BATCH")
echo "$IMPORT" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("  imported:",len(d["imported"]),"duplicates:",len(d["duplicates"]),"failed:",len(d["failed"]))'
IDS=$(echo "$IMPORT" | python3 -c 'import sys,json;print(" ".join(t["transaction"]["id"] for t in json.load(sys.stdin)["imported"]))')

echo
echo "Step 2. Import returned immediately. The transactions are stored as"
echo "        PENDING_CATEGORIZATION. Check the Transactions page in the UI:"
echo "        they show status PENDING_CATEGORIZATION with no category yet."
echo
echo "        This is the key design point: ingestion does not wait for the AI."
pause

echo
echo "Step 3. The background worker picks them up and categorises them."
printf "        waiting for the worker"
for _ in $(seq 1 20); do
  PENDING=0
  for id in $IDS; do
    s=$(curl -s "$BASE/transactions/$id" -H "$AUTH" | jfield 'd["status"]')
    [ "$s" = "PENDING_CATEGORIZATION" ] && PENDING=$((PENDING + 1))
  done
  [ "$PENDING" = "0" ] && break
  printf "."
  sleep 1
done
echo " done."
echo

for id in $IDS; do
  curl -s "$BASE/transactions/$id" -H "$AUTH" | python3 -c '
import sys, json
t = json.load(sys.stdin)
conf = "%.2f" % t["confidence"] if t["confidence"] is not None else "-"
print("  %-34s %-14s %-18s %s" % (t["description"][:33], t["category"] or "-", t["status"], conf))
'
done

echo
echo "        Refresh the Transactions page: the payroll row is now CATEGORIZED."
echo "        The other two are REVIEW_REQUIRED, because they were flagged."
pause

echo
echo "Step 4. The two flagged transactions are now in the review queue."
echo

curl -s "$BASE/review" -H "$AUTH" | python3 -c '
import sys, json
ids = set(sys.argv[1].split())
items = [t for t in json.load(sys.stdin)["data"] if t["id"] in ids]
if not items:
    print("  (nothing from this run is awaiting review)")
for t in items:
    print("  %s  (%s)" % (t["description"], t["amount"]))
    for f in t["flags"]:
        print("      [%s] %s" % (f["type"], f["explanation"]))
' "$IDS"

echo
echo "        Open the Review page to see these cards, correct a category,"
echo "        or resolve/dismiss the flags."
echo
echo "======================================================================"
echo " Demo complete. Rows are labelled DEMO-<timestamp>."
echo " To remove them (children first, due to foreign keys):"
echo "   psql -d sycamore -c \"DELETE FROM \\\"TransactionFlag\\\" WHERE \\\"transactionId\\\" IN (SELECT id FROM \\\"Transaction\\\" WHERE \\\"externalRef\\\" LIKE 'DEMO-%'); DELETE FROM \\\"ClassificationLog\\\" WHERE \\\"transactionId\\\" IN (SELECT id FROM \\\"Transaction\\\" WHERE \\\"externalRef\\\" LIKE 'DEMO-%'); DELETE FROM \\\"Transaction\\\" WHERE \\\"externalRef\\\" LIKE 'DEMO-%';\""
echo "======================================================================"
