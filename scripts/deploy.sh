#!/usr/bin/env bash
set -euo pipefail

# Rebuild and restart the Streama Support Portal stack (run as ubuntu or any docker group member).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! docker info >/dev/null 2>&1; then
	echo "error: cannot access Docker (add user to docker group or run as ubuntu)" >&2
	exit 1
fi

echo "==> Stopping existing stack"
docker-compose down

echo "==> Building and starting stack"
docker-compose up --build -d

echo "==> Running database migrations"
docker-compose exec -T server npm run migrate

echo "==> Verifying API"
sleep 3
code_agent="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/agent/v1/jobs)"
code_list="$(curl -s http://127.0.0.1:3000/requests/all | head -c 500)"

echo "agent/v1/jobs HTTP status: ${code_agent} (expect 401)"
echo "requests/all sample: ${code_list}"

if [[ "${code_agent}" != "401" ]]; then
	echo "warning: expected 401 from /agent/v1/jobs — deploy may still be serving old server" >&2
	exit 1
fi

echo "Deploy complete."
