#!/usr/bin/env bash
# Rebuild/restart production portal.service on this VM.
#
# Cursor agents run as `catalog.ssh_user` (no docker, no sudo). This script reads
# DEPLOY_SUDO_PASSWORD from .env or .cursor/deploy.secret, su's to ubuntu,
# then `sudo systemctl restart portal.service` and runs migrations.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

python3 "$ROOT/scripts/restart-portal-service.py"

echo "==> Verifying"
sleep 2
code_agent="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/agent/v1/jobs || true)"
echo "/agent/v1/jobs → ${code_agent} (expect 401 once the new server is up)"
if [[ "${code_agent}" != "401" ]]; then
	echo "warning: expected 401 from /agent/v1/jobs — stack may still be building" >&2
	exit 1
fi
echo "Deploy complete."
