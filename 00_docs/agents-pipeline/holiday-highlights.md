# Holiday dashboard highlights

Daily systemd timer on the Streama host swaps dashboard highlights and the header logo for configured holiday windows, then restores the pre-season highlight list and the default EFLX logo.

Operator skill: `.cursor/skills/holiday-highlights/SKILL.md`.

## Seasons

Source: `config/holiday-highlights.yml` (timezone `America/New_York`, `max_highlights: 85`).

| Season | Window | Highlight description | Logo file |
|---|---|---|---|
| halloween | October | Recommended for Halloween | `config/holiday-highlights/logos/logo-halloween.png` |
| christmas | December and 1–2 January | Recommended for the holidays | `config/holiday-highlights/logos/logo-hannukah.png` |
| valentines | February | Recommended for Valentine's Day | `config/holiday-highlights/logos/logo-valentines-day.png` |
| july4 | July | Recommended for the 4th of July | default (no July PNG yet) |
| *(none)* | other days | restore backup | `config/holiday-highlights/logos/default-logo-eflx.png` |

July uses the default EFLX mark until a 4th-of-July PNG is added to the logos folder and referenced from the YAML.

Do not use Streama Settings → Logo → Reset to default. That restores the stock Streama asset, not the EFLX default.

## Runtime

| Piece | Role |
|---|---|
| `scripts/holiday_highlights.py` | `reconcile` / `seed` / `status` |
| `holiday-highlights.timer` | `OnCalendar` 04:00 daily (host clock), `Persistent=true`. Season membership uses `America/New_York`. |
| `holiday-highlights.service` | oneshot `python3 … reconcile` |
| `config/sbin/portal-holiday-highlights` | install units; fill `WorkingDirectory` / `EnvironmentFile` from catalog `remote_root` on the host |
| `data/holiday-highlights/state.json` | `{ active, backup, logoFileIds }` (host only; gitignored) |
| `data/holiday-highlights/highlights-backup-*.json` | pre-season snapshot (`raw` + `restore`) |

Match is Streama-library-side: movie/generic titles and `originalFilename` against season regexes. One highlight per media id. Priority patterns first, then the rest, then cap 85. Restore is not capped.

Logo: `POST /file/upload.json?isPublic=true` then `POST /settings/updateMultiple.json` with `name=logo` value `upload:<id>`. File ids are cached in `state.json`.

Credentials: portal `.env` `STREAMA_USERNAME` / `STREAMA_PASSWORD`. The host timer sets `STREAMA_URL=http://127.0.0.1:8080` (Streama JAR). It ignores `host.docker.internal` and does not use `STREAMA_ENDPOINT`.

## Install

One-time (root-capable login), after the release tree is on disk:

```sh
cd <catalog.remote_root>
sudo ./scripts/install-portal-sudo.sh <catalog.ssh_user>
```

Routine: `/rfo deploy streama-support-portal prod` (or `sudo -n /usr/local/sbin/portal-deploy`). `portal-deploy` and `portal-install-sbin` refresh `/usr/local/sbin/portal-holiday-highlights` and enable the timer.

Manual:

```sh
python3 scripts/holiday_highlights.py status
python3 scripts/holiday_highlights.py reconcile --dry-run
sudo -n systemctl status holiday-highlights.timer
sudo -n systemctl start holiday-highlights.service
```

## This October

Halloween highlights and the pumpkin logo are already live. `config/holiday-highlights/seed/highlights-backup-2026-10-30.json` is the pre-season list. First reconcile in October copies that seed into the data dir, sets `active: halloween`, records the current logo id, and **does not** replace highlights. 1 November restores the seed list and the default EFLX logo.

## Troubleshooting

| Symptom | Check |
|---|---|
| Timer never fires | `systemctl list-timers holiday-highlights.timer` — `NEXT` must not be n/a; unit uses `OnCalendar`, not only `OnUnitActiveSec` |
| Season applied twice | `data/holiday-highlights/state.json` `active` should match the window |
| November restored Halloween | seed was skipped; backup path in state must be the Oct 30 seed, not a snapshot of the 82 holiday rows |
| Logo went back to stock Streama | Settings reset was used; run `reconcile` or `--force-restore` so the job uploads `default-logo-eflx.png` |
| 401 / not logged in | portal `.env` has `STREAMA_USERNAME` / `STREAMA_PASSWORD`; job talks to `http://127.0.0.1:8080`, not nginx `:80` or the public hostname |
