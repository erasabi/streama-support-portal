# Rentify pipeline changes (Prelanflix box)

> **Status: Done** on Prelanflix (`portal-worker.timer` + `portal-worker.sh`).
> Live ops: Prelanflix `00_docs/portal-worker.md`. This file is the original
> contract; prefer the ops doc for current flags (`missing[]` → `piratify add
> --episodes`, disk `paused`, leftover retries).

Goal: the Prelanflix download/encode/sync box pulls claimable jobs from the
portal, runs them through `rentify`, and reports progress back — so the portal
can show a request moving from Downloading → Encoding → Uploading → Arrived
without anyone copying a magnet by hand.

See the existing pipeline docs for CLI/timer behavior that this worker drives:

- `./00_docs/torrent-download.md` (`rentify add`, `rentify l`, `rentify s`)
- `./00_docs/encoding.md` (`ENCODE` state, ffmpeg %)
- `./00_docs/remote-sync.md` (`READY`/`SYNCED` scp to `00_PRE-SORT`)

Shipped (do not treat the steps below as the only path): TV
`missing[]` → `piratify add -f folder --episodes csv --year year title`; empty
`missing[]` fails (no S01 default); disk below 5 GiB posts `paused` without
claim; leftovers retry `--episodes` from `portal-jobs.json`; portal `ledger`
is merged but the worker does not resume from it; no disk janitor.

See Prelanflix `00_docs/` for current CLI/timer behavior.

## New component: `portal-worker`

Add a small script + systemd timer (mirror the `rentify-watch` units) that runs
about every 1 minute.

### Config (env, e.g. `/etc/portal-worker.env`)

| Var | Meaning |
|---|---|
| `PORTAL_BASE_URL` | e.g. `http://catalog.gateway.lan_server_name:3000` |
| `PORTAL_TOKEN` | matches the portal's `PIPELINE_API_TOKEN` |
| `WORKER_ID` | free-form, sent as `claimedBy` (e.g. `prelanflix-1`) |

### Each tick

1. **Claim new work**
   ```
   GET  {BASE}/agent/v1/jobs?status=ready      (Authorization: Bearer TOKEN)
   for each job:
     POST {BASE}/agent/v1/jobs/{jobId}/claim   {"claimedBy": WORKER_ID}
       - 409  → someone else took it, skip
       - 200  → proceed
   ```

2. **Add to rentify** using the folder-name contract so the id survives:
   ```
   rentify add -f "{folderName}" [-s "{subtitleUrl}"] "{sourceUrl}"
   ```
   - `folderName` already looks like `the-matrix-1999-tmdb603`.
   - Quote magnets (they contain `&`). YTS/`.torrent` URLs are auto-`--direct`.
   - If `rentify add` fails:
     ```
     POST {BASE}/agent/v1/jobs/{jobId}/release  {"reason":"rentify add failed: ..."}
     ```
     (job returns to `ready` for a later retry; do not double-add.)
   - Persist a local mapping `{ folderName, infoHash } → jobId` so later ticks
     can report progress for this job.

3. **Report progress** by mapping `rentify` state to portal stages. Use
   `rentify s` (pipeline STAT) and/or `rentify l` / `rentify e`:

   | rentify signal | POST progress `stage` | extra |
   |---|---|---|
   | torrent `DL` (downloading) | `downloading` | `progressPct` from `rentify l`, `detail.eta` |
   | `ENCODE` (in `01_staging`) | `encoding` | `progressPct` + ETA from `rentify e` |
   | `WAIT` / `READY` in `02_encoded` | `ready_to_sync` | — |
   | scp in flight | `syncing` | — |
   | `SYNCED` (copied to remote, local deleted) | `uploaded` | — |
   | `ENCODE FAILED` / repeated failure | `failed` | `detail.error` |

   ```
   POST {BASE}/agent/v1/jobs/{jobId}/progress
        {"stage":"downloading","progressPct":42,"etaSeconds":300,"detail":{...},"infoHash":"...","artifacts":{...}}
   ```
   Include `infoHash` once known so unlinked/CLI events can still correlate.
   Include `artifacts` (download/encode/upload file lists) and re-post when
   the file-name set grows — the portal unions them onto the request.

4. **Heartbeat** any job that is claimed/in-progress but produced no new stage
   this tick, so the portal's lease reaper doesn't requeue it:
   ```
   POST {BASE}/agent/v1/jobs/{jobId}/heartbeat  {}
   ```
   The portal keeps a job `in_progress` (won't requeue) once it is `downloading`
   or later, even if a heartbeat is missed — this avoids double-downloading a
   torrent already in uTorrent. Still, heartbeat while actively working.

5. **Completion**: after `SYNCED`, post `uploaded` (above). Sortify takes over
   from `00_PRE-SORT`; the rentify worker's job is done. You may stop tracking
   that jobId locally.

## Cancellation

The portal cancels jobs when an admin archives a request or marks it
`Unavailable`. The worker should detect this and clean up:

- Periodically check claimed jobs. A cancelled job will no longer appear in
  `?status=ready`, and its request may be archived. Simplest robust approach:
  before/after `rentify add`, confirm the job is still active via a claim/
  heartbeat response; if the portal reports it gone/cancelled, run
  `rentify remove "{folderName}"` **only if** it is still downloading in
  uTorrent (not yet uploaded). Never delete content already synced to the
  remote.

## TV / CLI-initiated adds (no portal job)

If an operator adds a TV pack straight from the CLI, keep the id linkage:

```
rentify add -f "breaking-bad-2008-tmdb1396" "magnet:?..."
```

Then report progress via the generic events endpoint (no jobId):

```
POST {BASE}/agent/v1/events
     {"folderName":"breaking-bad-2008-tmdb1396","stage":"downloading","progressPct":10}
```

The portal recovers the request from `tmdb1396`. If the folder has no `tmdb{id}`
and no unique title match, the event lands in the admin **Unlinked activity**
inbox to attach manually.

## Edge cases to handle

- **Claim race**: 409 on claim → skip; another worker owns it.
- **rentify add fails**: `release` the job; don't leave it claimed.
- **Lease expiry while downloading**: portal keeps it `in_progress`; just resume
  heartbeating — do not re-add.
- **Disk full / SCP fail / encode fail**: post `stage:"failed"` with `detail`.
  The portal shows Failed until a new job or a recovering stage arrives.
- **Duplicate source**: claim before add; the portal only exposes one active job
  per request.
