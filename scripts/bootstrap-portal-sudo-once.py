#!/usr/bin/env python3
"""One-time: install portal-deploy sudoers using the legacy ubuntu password.

After this succeeds, use ./scripts/deploy-with-systemd.sh (sudo -n). Do not use
this file for routine deploys.
"""
from __future__ import annotations

import os
import pty
import select
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENV_FILE = os.path.join(ROOT, ".env")
INSTALL = os.path.join(ROOT, "scripts", "install-portal-sudo.sh")


def _parse_env(path: str) -> dict[str, str]:
	out: dict[str, str] = {}
	if not os.path.isfile(path):
		return out
	with open(path, encoding="utf-8") as fh:
		for raw in fh:
			line = raw.strip()
			if not line or line.startswith("#") or "=" not in line:
				continue
			key, _, val = line.partition("=")
			out[key.strip()] = val.strip().strip("'").strip('"')
	return out


def load_creds() -> tuple[str, str]:
	env = _parse_env(ENV_FILE)
	user = env.get("DEPLOY_USER") or "ubuntu"
	password = env.get("DEPLOY_SUDO_PASSWORD") or ""
	return user, password


def drain(fd: int, seconds: float) -> None:
	end = time.time() + seconds
	while time.time() < end:
		ready, _, _ = select.select([fd], [], [], 0.2)
		if not ready:
			continue
		try:
			chunk = os.read(fd, 8192)
		except OSError:
			break
		if not chunk:
			break
		sys.stdout.buffer.write(chunk)
		sys.stdout.buffer.flush()


def wait_exit(pid: int) -> int:
	_, status = os.waitpid(pid, 0)
	if hasattr(os, "waitstatus_to_exitcode"):
		return os.waitstatus_to_exitcode(status)
	return status >> 8


def main() -> int:
	who = os.environ.get("USER") or ""
	target = os.environ.get("PORTAL_DEPLOY_SSH_USER") or who or "elfx"
	ubuntu, password = load_creds()
	if not password:
		print("error: one-time bootstrap needs DEPLOY_SUDO_PASSWORD in .env", file=sys.stderr)
		return 2
	os.chmod(INSTALL, 0o755)

	cmd = (
		f"printf '%s\\n' \"$DEPLOY_SUDO_PASSWORD\" | "
		f"sudo -S -k bash {INSTALL} {target}; echo BOOTSTRAP_EXIT:$?"
	)

	pid, fd = pty.fork()
	if pid == 0:
		os.execvp("su", ["su", "-", ubuntu])
	deadline = time.time() + 20.0
	buf = b""
	sent_su = False
	while time.time() < deadline:
		ready, _, _ = select.select([fd], [], [], 0.3)
		if not ready:
			continue
		try:
			chunk = os.read(fd, 4096)
		except OSError:
			chunk = b""
		if not chunk:
			continue
		buf += chunk
		sys.stdout.buffer.write(chunk)
		sys.stdout.buffer.flush()
		if not sent_su and b"assword" in buf:
			os.write(fd, (password + "\n").encode())
			sent_su = True
			buf = b""
			break
	if not sent_su:
		print("error: did not get su password prompt", file=sys.stderr)
		try:
			os.kill(pid, 9)
		except OSError:
			pass
		wait_exit(pid)
		return 1
	drain(fd, 2.0)
	# Export password only in the ubuntu shell for sudo -S; do not echo it.
	os.write(fd, f"export DEPLOY_SUDO_PASSWORD={password!r}\n".encode())
	os.write(fd, (cmd + "\n").encode())
	end = time.time() + 60.0
	out = b""
	while time.time() < end:
		ready, _, _ = select.select([fd], [], [], 0.5)
		if not ready:
			continue
		try:
			chunk = os.read(fd, 8192)
		except OSError:
			break
		if not chunk:
			break
		out += chunk
		sys.stdout.buffer.write(chunk)
		sys.stdout.buffer.flush()
		if b"BOOTSTRAP_EXIT:" in out:
			os.write(fd, b"exit\n")
			drain(fd, 2.0)
			break
	wait_exit(pid)
	if b"BOOTSTRAP_EXIT:0" in out:
		print("bootstrap ok — use ./scripts/deploy-with-systemd.sh (no password)")
		return 0
	print("error: bootstrap failed", file=sys.stderr)
	return 1


if __name__ == "__main__":
	sys.exit(main())
