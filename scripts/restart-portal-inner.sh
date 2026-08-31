#!/usr/bin/env bash
# Runs as the deploy user (after su). Do not invoke this directly as catalog.ssh_user.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
	echo "PORTAL_DEPLOY_FAIL missing_.env"
	exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a
if [[ -z "${DEPLOY_SUDO_PASSWORD:-}" && -f .cursor/deploy.secret ]]; then
	DEPLOY_SUDO_PASSWORD="$(head -n 1 .cursor/deploy.secret)"
fi
if [[ -z "${DEPLOY_SUDO_PASSWORD:-}" ]]; then
	echo "PORTAL_DEPLOY_FAIL missing_password"
	exit 1
fi

api_http_code() {
	curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$1" || true
}

wait_for_server() {
	echo "==> waiting for API"
	local ok=0
	local i
	for i in $(seq 1 180); do
		# /requests/all can 500 until migrations run; /agent/v1/jobs is enough to
		# know the Node process is listening (401 without a bearer token).
		code="$(api_http_code http://127.0.0.1:3000/agent/v1/jobs)"
		if [[ "$code" != "000" && -n "$code" ]]; then
			echo "==> API listening (HTTP ${code})"
			ok=1
			break
		fi
		sleep 3
	done
	if [[ "$ok" != 1 ]]; then
		echo "PORTAL_DEPLOY_FAIL api_down"
		exit 1
	fi
}

run_migrate() {
	echo "==> migrations"
	docker-compose exec -T server npm run migrate
}

if [[ "${1:-}" != "--migrate-only" ]]; then
	echo "==> sudo systemctl restart portal.service"
	printf '%s\n' "$DEPLOY_SUDO_PASSWORD" | sudo -S -k systemctl restart portal.service
fi

wait_for_server
run_migrate

echo "==> waiting for /requests/all after migrate"
ok=0
for _ in $(seq 1 30); do
	code="$(api_http_code http://127.0.0.1:3000/requests/all)"
	if [[ "$code" == "200" ]]; then
		ok=1
		break
	fi
	sleep 2
done
if [[ "$ok" != 1 ]]; then
	echo "PORTAL_DEPLOY_FAIL requests_all_not_200 (last HTTP ${code:-none})"
	exit 1
fi

echo PORTAL_DEPLOY_DONE
