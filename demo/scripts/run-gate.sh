#!/usr/bin/env bash
# Run the shared final gate against a run workspace.
#
#   scripts/run-gate.sh <workspace-dir> [label]
#
# The gate lives outside every run workspace so no run can develop against it.
# It is copied in, executed, and removed again. The workspace's seeded dataset
# is preserved and restored, because the gate installs its own curated fixture.

set -uo pipefail

WORKSPACE="${1:?usage: run-gate.sh <workspace-dir> [label]}"
LABEL="${2:-$(basename "$WORKSPACE")}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$HERE/../gate/acceptance.test.js"
DATA="$WORKSPACE/data/invoices.json"

[ -f "$DATA" ] && cp "$DATA" "$DATA.gatebak"

mkdir -p "$WORKSPACE/.gate"
cp "$GATE" "$WORKSPACE/.gate/acceptance.test.js"

START=$(python3 -c 'import time; print(time.time())')
( cd "$WORKSPACE" && APP_ROOT="$WORKSPACE" node --test .gate/ ) > "$WORKSPACE/.gate/output.txt" 2>&1
STATUS=$?
END=$(python3 -c 'import time; print(time.time())')

PASS=$(grep -cE '^. (pass|✔)' "$WORKSPACE/.gate/output.txt" 2>/dev/null || echo 0)
TOTAL=$(grep -oE '^. tests [0-9]+' "$WORKSPACE/.gate/output.txt" | grep -oE '[0-9]+' | head -1)
FAILED=$(grep -oE '^. fail [0-9]+' "$WORKSPACE/.gate/output.txt" | grep -oE '[0-9]+' | head -1)

echo "--- gate: $LABEL ---"
cat "$WORKSPACE/.gate/output.txt" | grep -E '^(✔|✖|✗|not ok|ok|ℹ (tests|pass|fail))' | tail -25
echo "gate_exit=$STATUS tests=${TOTAL:-?} failed=${FAILED:-?} seconds=$(python3 -c "print(round($END-$START,2))")"

python3 - "$WORKSPACE" "$LABEL" "$STATUS" "${TOTAL:-0}" "${FAILED:-0}" "$START" "$END" <<'PY'
import json, sys, pathlib
ws, label, status, total, failed, start, end = sys.argv[1:8]
out = pathlib.Path(ws) / ".gate" / "result.json"
out.write_text(json.dumps({
    "label": label,
    "gate_passed": int(status) == 0,
    "tests_total": int(total),
    "tests_failed": int(failed),
    "gate_seconds": round(float(end) - float(start), 2),
}, indent=2))
print(f"wrote {out}")
PY

rm -f "$WORKSPACE/.gate/acceptance.test.js"
[ -f "$DATA.gatebak" ] && mv "$DATA.gatebak" "$DATA"
exit $STATUS
