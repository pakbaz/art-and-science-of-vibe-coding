#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Compatibility wrapper: preparing a non-destructive CLI rehearsal." >&2
node "$HERE/run.js" prepare "$@"
echo "Next run: node demo/run.js worktrees --trial <id>" >&2
