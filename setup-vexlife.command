#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec /bin/bash "$ROOT/install/vexlife-setup.sh" "$ROOT"
