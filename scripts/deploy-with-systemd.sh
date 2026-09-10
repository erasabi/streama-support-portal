#!/usr/bin/env bash
# Rebuild/restart production portal.service as the catalog SSH user.
# Requires group portal-deploy (NOPASSWD wrappers). No ubuntu hop, no password.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

sudo_n() {
	if sudo -n "$@" 2>/dev/null; then
		return 0
	fi
	sg portal-deploy -c "sudo -n $(printf '%q ' "$@")"
}

if [[ "${1:-}" == "--migrate-only" ]]; then
	sudo_n /usr/local/sbin/portal-migrate
else
	sudo_n /usr/local/sbin/portal-deploy
fi

echo "==> Verifying"
sleep 2
code_agent="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/agent/v1/jobs || true)"
echo "/agent/v1/jobs → ${code_agent} (expect 401 once the new server is up)"
if [[ "${code_agent}" != "401" ]]; then
	echo "warning: expected 401 from /agent/v1/jobs — stack may still be building" >&2
	exit 1
fi
echo "Deploy complete."
