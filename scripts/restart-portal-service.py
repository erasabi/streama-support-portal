#!/usr/bin/env python3
"""Restart or migrate production via passwordless sudo wrappers.

Catalog SSH user must be in group portal-deploy
(`/etc/sudoers.d/portal-deploy`). No ubuntu hop and no password.
"""
from __future__ import annotations

import subprocess
import sys


def _run(argv: list[str]) -> int:
	direct = subprocess.run(["sudo", "-n", *argv])
	if direct.returncode == 0:
		return 0
	quoted = " ".join(argv)
	nested = subprocess.run(["sg", "portal-deploy", "-c", f"sudo -n {quoted}"])
	return nested.returncode


def main() -> int:
	if "--migrate-only" in sys.argv:
		return _run(["/usr/local/sbin/portal-migrate"])
	return _run(["/usr/local/sbin/portal-deploy"])


if __name__ == "__main__":
	sys.exit(main())
