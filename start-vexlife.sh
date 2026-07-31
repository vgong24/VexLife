#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$ROOT/scripts/bootstrap.mjs" "$@" || code=$?
if [[ "${code:-0}" != "0" && "${code:-0}" != "3" ]]; then exit "$code"; fi
exec node "$ROOT/scripts/serve-browser.mjs"
# [VXG RealForever]
