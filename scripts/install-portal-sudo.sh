#!/usr/bin/env bash
# One-time root install: least-privilege NOPASSWD for the catalog SSH user.
# Does not grant docker group, a shell, or ALL.
#
#   sudo ./scripts/install-portal-sudo.sh <ssh_user>
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
	echo "error: run as root, e.g. sudo $0 <ssh_user>" >&2
	exit 1
fi

SSH_USER="${1:-}"
if [[ -z "$SSH_USER" || "$SSH_USER" =~ [^a-zA-Z0-9._-] ]]; then
	echo "usage: sudo $0 <ssh_user>" >&2
	exit 2
fi
if ! id "$SSH_USER" >/dev/null 2>&1; then
	echo "error: no such user: $SSH_USER" >&2
	exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install -o root -g root -m 0755 "$ROOT/config/sbin/portal-deploy" /usr/local/sbin/portal-deploy
install -o root -g root -m 0755 "$ROOT/config/sbin/portal-migrate" /usr/local/sbin/portal-migrate
install -o root -g root -m 0755 "$ROOT/config/sbin/portal-install-sbin" /usr/local/sbin/portal-install-sbin

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
cat "$ROOT/config/sudoers.d/portal-deploy" >"$TMP"
chmod 440 "$TMP"
visudo -c -f "$TMP"
install -o root -g root -m 0440 "$TMP" /etc/sudoers.d/portal-deploy
visudo -c -f /etc/sudoers.d/portal-deploy

groupadd --force portal-deploy
usermod -aG portal-deploy "$SSH_USER"

echo "Installed /etc/sudoers.d/portal-deploy and /usr/local/sbin/portal-{deploy,migrate}."
echo "User $SSH_USER is in group portal-deploy (re-login or: sg portal-deploy -c 'sudo -n -l')."
