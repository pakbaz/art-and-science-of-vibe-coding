#!/usr/bin/env bash
# Build the two run workspaces from the same baseline.
#
#   scripts/setup-runs.sh
#
# Run A is the repository exactly as it is today. Nothing is removed and nothing
# is degraded: it is what anyone gets by opening the repo and asking for the
# feature.
#
# Run B adds the preparation described in the session: a short task brief, a
# curated 100-case fixture and a test command that targets it. The preparation
# never implements the requested feature.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO="$(cd "$HERE/.." && pwd)"

rm -rf "$DEMO/runs/A" "$DEMO/runs/B"
mkdir -p "$DEMO/runs"

for RUN in A B; do
  cp -R "$DEMO/baseline" "$DEMO/runs/$RUN"
  rm -rf "$DEMO/runs/$RUN/.gate"
  rm -f "$DEMO/runs/$RUN/data/invoices.json"
  cp "$DEMO/FEATURE-REQUEST.md" "$DEMO/runs/$RUN/FEATURE-REQUEST.md"
done

# ---------------------------------------------------------------- run B prep
cp "$DEMO/prep/AGENTS.md" "$DEMO/runs/B/AGENTS.md"
cp "$DEMO/prep/fixture-100.json" "$DEMO/runs/B/data/fixture-100.json"
cp "$DEMO/prep/store.js" "$DEMO/runs/B/data/store.js"
cp "$DEMO/prep/package.json" "$DEMO/runs/B/package.json"

echo "run A: $DEMO/runs/A  (baseline as-is)"
echo "run B: $DEMO/runs/B  (brief + 100-case fixture + targeted test command)"
