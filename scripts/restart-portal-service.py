#!/usr/bin/env python3
"""Operator-local helper. Fleetctl never executes this file.

Restart portal.service with fleetctl. Catalog become uses `sudo -n -u` when set;
`su` (password) is rejected. Host users and remote_root live in the private
catalog and gitignored `00_docs/local/` (see `bindings.md`).

The pre-overlay copy is in `00_docs/local/migrated/scripts/`. This tracked
script is inert — do not put catalog bindings or password `su` flows here.
"""
from __future__ import annotations

import sys


def main() -> int:
	print(
		"error: this operator helper is inert in git. "
		"Use fleetctl to restart portal.service. "
		"Bindings: 00_docs/local/bindings.md",
		file=sys.stderr,
	)
	return 2


if __name__ == "__main__":
	sys.exit(main())
