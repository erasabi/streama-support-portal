#!/usr/bin/env bash
# Compatibility wrapper. Prefer ./scripts/deploy-with-systemd.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$ROOT/scripts/deploy-with-systemd.sh" "$@"
