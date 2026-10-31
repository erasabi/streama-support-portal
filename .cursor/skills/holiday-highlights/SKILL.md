---
name: holiday-highlights
description: Install and operate Streama holiday dashboard highlights and logos on the ElanFlix host. Use when setting up holiday seasons, the holiday-highlights timer, restoring pre-season highlights, or swapping the Streama logo for Halloween, Christmas/Hanukkah, Valentine's Day, or the 4th of July.
disable-model-invocation: true
---

# Holiday dashboard highlights

Daily host timer applies a holiday highlight list (max 85) and logo, then restores the pre-season list and the default EFLX logo when the window ends.

## Seasons (America/New_York)

| Season | Window | Description | Logo |
|---|---|---|---|
| `halloween` | October | Recommended for Halloween | `logo-halloween.png` |
| `christmas` | December + Jan 1–2 | Recommended for the holidays | `logo-hannukah.png` |
| `valentines` | February | Recommended for Valentine's Day | `logo-valentines-day.png` |
| `july4` | July | Recommended for the 4th of July | default EFLX (no July file yet) |
| off-season | everything else | restore backup | `default-logo-eflx.png` |

Config: `config/holiday-highlights.yml`. Logos: `config/holiday-highlights/logos/`. Do **not** use Streama Settings “Reset to default”.

Halloween 2026 is already live. First October install **seeds** `config/holiday-highlights/seed/highlights-backup-2026-10-30.json` and leaves the current 82 titles + pumpkin logo alone. Nov 1 restores that backup.

## 0. Install / repair the timer

All remote work through `fleetctl`. No ad-hoc SSH. No catalog bindings in git.

After the tree is on the host:

```sh
sudo -n /usr/local/sbin/portal-holiday-highlights
```

That is also invoked from `portal-deploy` / `portal-install-sbin`. First-time sudoers refresh (root, once):

```sh
cd <catalog.remote_root>
sudo ./scripts/install-portal-sudo.sh <catalog.ssh_user>
```

Then `/rfo deploy streama-support-portal prod` (show the fleetctl plan and wait for confirmation).

## 1–4. Reconcile

On the host (catalog `remote_root`):

```sh
python3 scripts/holiday_highlights.py status
python3 scripts/holiday_highlights.py reconcile --dry-run
python3 scripts/holiday_highlights.py reconcile
python3 scripts/holiday_highlights.py seed          # October already-applied path
python3 scripts/holiday_highlights.py reconcile --force-apply halloween
python3 scripts/holiday_highlights.py reconcile --force-restore
```

`reconcile` (timer at 04:00):

1. Window start, not active: backup current `newRelease` rows, match Streama library to the season regexes, replace highlights (cap 85, priority patterns first), set holiday logo.
2. Window start, Halloween seed file present and not yet active: copy seed backup, record current logo id, **do not swap**.
3. Already active: no-op.
4. Window end: restore backup (original descriptions, no cap) and default EFLX logo.

Credentials: host portal `.env` `STREAMA_USERNAME` / `STREAMA_PASSWORD`. API base is `STREAMA_URL` or `http://127.0.0.1:8080` (Streama JAR). State: `<remote_root>/data/holiday-highlights/state.json`.

## Do not

- Put SSH aliases, hostnames, LAN IPs, or `remote_root` in tracked files
- Re-apply Halloween in October 2026 if seed succeeded
- Truncate the restore list
- Call Streama “Reset to default” for the logo
