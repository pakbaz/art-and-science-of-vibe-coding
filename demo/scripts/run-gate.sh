#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Compatibility wrapper: use run.js check so timing and logs stay persistent." >&2
exec node "$HERE/run.js" check "$@"
