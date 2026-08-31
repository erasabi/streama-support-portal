# Cursor prompt: Prelanflix `portal-worker` (rentify)

Copy everything below the line into a Cursor agent on the **Prelanflix** (pipeline) machine.

---

Implement the portal integration worker on this Prelanflix host so `rentify` pulls magnets from the Streama Support Portal and reports download/encode/sync progress back. The portal API is **already live**; do not change portal code.

## Read first (required)

These three docs are available to you. Read all of them before writing code:

1. `00_docs/overview.md` — identity contract (`{title}-{year}-tmdb{id}`), stages you may post, `/agent/v1` API, auth
2. `00_docs/rentify-pipeline-changes.md` — **this is your implementation spec**
3. `00_docs/sortify-agent-changes.md` — context only (sortify takes over after `uploaded` / PRE-SORT); do not implement sortify here

Then read the existing pipeline docs and code on this machine:

- `.cursor/00_docs/README.md`, `torrent-download.md`, `encoding.md`, `remote-sync.md`, `folder-layout.md`
- How `rentify-watch` service/timer is installed (mirror that pattern for the new worker)
- `rentify add` / `l` / `e` / `s` / `remove` behavior (especially `-f` folder grouping, quoting magnets, YTS auto-`--direct`)

After the worker exists, **update** `.cursor/00_docs/` (and the pipeline README if needed) to document the new unit, env vars, and portal flow. Match existing doc style.

## What to build (backup existing version before any changes in case we need to revert back)

A new **~1 min systemd timer + oneshot service** (same style as `rentify-watch`): a `portal-worker` that:

### Config

Env file (e.g. `/etc/portal-worker.env` or next to other pipeline env), **not committed with secrets**:

| Var | Meaning |
|---|---|
| `PORTAL_BASE_URL` | e.g. `http://catalog.gateway.lan_server_name:3000` |
| `PORTAL_TOKEN` | portal `PIPELINE_API_TOKEN` |
| `WORKER_ID` | sent as `claimedBy` (e.g. hostname / `prelanflix-1`) |

All HTTP calls: `Authorization: Bearer $PORTAL_TOKEN`.

### Each tick

1. `GET {BASE}/agent/v1/jobs?status=ready`
2. For each job: `POST .../jobs/{jobId}/claim` with `{ "claimedBy": WORKER_ID }`
   - **409** → skip (lost the race)
   - **200** → continue
3. `rentify add -f "{folderName}"` and if `subtitleUrl` is set, `-s "{subtitleUrl}"`, then `"{sourceUrl}"`
   - Quote magnets (`&` is special in bash)
   - Use the portal `folderName` **verbatim** so `tmdb{id}` survives encode + sync
   - If `rentify add` fails: `POST .../jobs/{jobId}/release` with `{ "reason": "..." }` — do **not** leave the job claimed
4. Persist a local map `{ folderName, infoHash } → jobId` (survive reboots) so later ticks can report progress
5. Map live `rentify l` / `rentify e` / `rentify s` to portal stages and `POST .../jobs/{jobId}/progress`:

| rentify | `stage` | extras |
|---|---|---|
| `DL` | `downloading` | `progressPct`, `etaSeconds` / `detail.eta`, `infoHash` when known |
| `ENCODE` | `encoding` | pct + ETA from `rentify e` |
| `WAIT` / `READY` | `ready_to_sync` | |
| scp in flight | `syncing` | |
| `SYNCED` | `uploaded` | then stop tracking that jobId locally |
| encode/scp/disk failure | `failed` | `detail.error` |

Only post agent stages from `overview.md` (`downloading`, `encoding`, `ready_to_sync`, `syncing`, `uploaded`, `failed`). Do **not** post portal-internal stages (`requested`, `looking_up_magnet`, `not_yet_available`, `needs_manual_check`, `season_approval`, `magnet_ready`, `claimed`).

6. Heartbeat claimed/in-progress jobs that had no stage change this tick: `POST .../jobs/{jobId}/heartbeat`
   - If already `downloading` or later, do **not** `rentify add` again after a missed heartbeat

### Cancellation

If a claimed job is cancelled/gone (heartbeat/claim-style check fails, or request archived): `rentify remove` by folder/name **only if still in uTorrent / not yet uploaded**. Never delete remote PRE-SORT copies.

### CLI / TV without a portal job

If `rentify` is used by hand with `-f "...-tmdbNNNN"`, report via:

`POST {BASE}/agent/v1/events` `{ "folderName": "...", "stage": "...", "progressPct": ... }`

Do not invent a portal request.

## Guardrails

- Claim **before** `rentify add`
- 409 on claim → skip
- Failed add → `release`
- Do not double-add a torrent already in uTorrent
- Portal HTTP failures: log, retry next tick; do not crash the rest of the pipeline timers
- `flock` so ticks do not overlap

## Done when

- Timer is installable and documented (how to enable, env file, logs)
- A ready portal job is claimed, added with the correct `-f folderName`, and progress posts through at least downloading → encoding or ready_to_sync → `uploaded` on SYNCED
- Failed `rentify add` releases the job
- `.cursor/00_docs/` updated for the new worker
- Tests or a dry-run/mocked HTTP path if the repo already tests automation this way; otherwise a small unit test for STAT→stage mapping

Do not implement sortify, Streama highlights, or portal server changes.
