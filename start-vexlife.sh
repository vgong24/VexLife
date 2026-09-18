#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$ROOT/scripts/macos-lifecycle.mjs" --operation auto --repo "$ROOT" "$@"
# [VXG RealForever]
