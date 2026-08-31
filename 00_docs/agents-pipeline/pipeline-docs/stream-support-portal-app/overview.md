# Portal ↔ Pipeline Integration Overview

> **Canonical docs:** `streama-support-portal/docs/README.md` (portal repo) ·
> **Sortify operator docs:** `agents/sortify-agent/docs/README.md` (this box)

The Streama Support Portal is the source of truth for media requests. It stores
magnets, auto-marks unreleased movies, exposes a claim/progress API for the
Prelanflix pipeline (`rentify`) and the Sortify agent, keeps an append-only
admin history, and drives the request all the way to "Available" once media is
registered in Streama and highlighted on the dashboard.

This document is the **integration contract** (identity rules, stages, `/agent/v1`).
Companion docs in this folder:

- [rentify-pipeline-changes.md](rentify-pipeline-changes.md) — Prelanflix download/encode/sync box
- [sortify-agent-changes.md](sortify-agent-changes.md) — Sortify agent on this box

## Implementation status

| Piece | Status |
|---|---|
| Portal server + client (`/agent/*`, jobs, poller, UI) | **Done** (`streama-support-portal`) |
| Sortify `portal_bridge` + dashboard highlights | **Done** — `agents/sortify-agent` |
| Prelanflix `portal-worker` (poll, claim, rentify progress) | **Not done** — [rentify-pipeline-changes.md](rentify-pipeline-changes.md) |

Prelanflix pipeline mechanics: `~/.cursor/00_docs/` on the download box.

## End-to-end flow

```
user request (portal)
   │  movie: portal looks up magnet (TMDB → YTS mirror), stores it, retries hourly
   │  tv:    empty sourceUrl job with `seasons` (first+latest if new; Request
   │         Update auto-queues every incomplete or missing aired season).
   │         Seasons that already have every aired episode in Streama are
   │         listed as `presentSeasons` and are not re-queued. Incomplete
   │         seasons (missing episodes) are queued. File `{id}` stubs count.
   │         Streama errors / missing config fail closed (Check Manually) for
   │         new released titles, never treated as a new show. Unreleased titles
   │         stay Not Yet Available. Fetch New Seasons / Request Update sets
   │         the row to Requested immediately (Coming Soon) and plans seasons
   │         in the background. Streama lookups time out; they do not hang
   │         Submit. It does not demote an already-Available badge if Streama
   │         is down after the card is showing.
   │         Jobs include `presentSeasons`; the worker will not re-add those.
   │         portal-worker runs piratify.
   │         Admin-attached magnet/URL still uses rentify.
   ▼
PipelineJob (claimStatus=ready)  ← rentify worker polls GET /agent/v1/jobs?status=ready
   │  claim → rentify add -f <folderName> [-s subtitleUrl] <sourceUrl>
   │       or piratify add -f <folderName> --seasons N,M <title>  (TV, no sourceUrl)
   ▼
download → encode → scp to 00_PRE-SORT   (rentify posts progress back)
   ▼
sortify: PRE-SORT → TO-SORT → STORAGE → Streama register   (sortify posts progress back)
   ▼
sortify: highlightOnDashboard (description includes "Requested by <requestUser>")
   ▼
request displayStatus = Available
```

## The identity contract (critical)

Every request has an `id`:

- **Movie / TV request:** the TMDB id (movie id or show id) as a string.
  TV **Fetch New Seasons** uses this same id (never `update:{tmdb}:{ts}`), so
  `folderName` stays `{title}-{year}-tmdb{id}`.
- **Issue / non-season update rows:** namespaced (`update:{tmdb}:{ts}` /
  `issue:{tmdb}:{ts}`) so they never collide with a pipeline request.

The portal carries that id through the pipeline via a **folder name**:

```
{title-slug}-{year}-tmdb{id}     e.g. the-matrix-1999-tmdb603
```

- `rentify add -f "<folderName>"` groups the download in that folder; it survives
  staging → encode → sync name-normalization (lowercase/hyphens) and still
  contains `tmdb{id}`.
- Later stages recover the request id by parsing `tmdb(\d+)` from the folder.
- For movies, the Streama matcher `apiId` is a backup key. **Never** use an
  episode `apiId` to look up a TV request — that is the episode TMDB id, not the
  show id. Use the show id from the folder or the sidecar `tmdb_tv_id`.

## Status stages

The portal derives a user-facing status from pipeline/sortify events. Agents
report `stage` values from this set:

| stage (posted by agent) | portal user label | posted by |
|---|---|---|
| `downloading` | Downloading | rentify |
| `encoding` | Encoding | rentify |
| `ready_to_sync` / `syncing` | Uploading | rentify |
| `uploaded` | Arrived | rentify (SYNCED) or sortify (PRE-SORT promote) |
| `sorting` | Sorting | sortify |
| `deferred` | Needs attention | sortify |
| `registering` | Adding to library | sortify |
| `pending_approval` | Pending Approval | sortify (registered, not highlighted) |
| `highlighted` / `available` | Available | sortify (after dashboard highlight) |
| `failed` | Failed | any agent |

Portal-internal stages you do **not** post: `requested`, `looking_up_magnet`,
`not_yet_available`, `needs_manual_check`, `season_approval`, `magnet_ready`, `claimed`.
Zero-torrent / YTS misses are classified on the portal: **Not Yet Available**
only for unreleased titles (TV premiere still in the future, or movies still
in theaters / without a digital-physical date). Released titles with no source
become **Check Manually**.

Rules the portal enforces:

- Progress never regresses (a late `downloading` after `pending_approval` is
  ignored), except `failed` (always accepted) and recovery out of `failed`.
- An admin status override (`Unavailable`, `Rolling Episodes`,
  `Complete Collection`, `Request Update`, `Report Issue`) wins over derived
  progress for display, but events are still recorded.
- `Unavailable` stops magnet retries and cancels `ready` jobs.

## Authentication + network

- Agent routes require `Authorization: Bearer <token>`.
  - `PIPELINE_API_TOKEN` — rentify worker.
  - `SORTIFY_API_TOKEN` — sortify agent.
- The pipeline box and the ElanFlix box must be able to reach the portal API
  over HTTP (LAN, e.g. `http://catalog.gateway.lan_server_name:3000`, or a reverse proxy). Configure
  the base URL + token on each agent.

## Agent API reference (`/agent/v1`)

All requests need the bearer token.

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/agent/v1/jobs?status=ready` | — | `[{ jobId, requestId, mediaType, folderName, sourceUrl, subtitleUrl, title, requestUser, seasons, presentSeasons, allowPresentSeasons }]` |
| POST | `/agent/v1/jobs/:id/claim` | `{ claimedBy?, leaseMs? }` | `{ jobId, requestId, folderName, sourceUrl, subtitleUrl, mediaType, seasons, presentSeasons, allowPresentSeasons, leaseUntil }` or 409 |
| POST | `/agent/v1/jobs/:id/heartbeat` | `{ leaseMs? }` | `{ jobId, leaseUntil }` |
| POST | `/agent/v1/jobs/:id/progress` | `{ stage, progressPct?, etaSeconds?, detail?, infoHash?, folderName?, artifacts? }` | `{ jobId, stage }` |
| POST | `/agent/v1/jobs/:id/release` | `{ reason? }` | `{ jobId, claimStatus }` |
| POST | `/agent/v1/events` | `{ requestId?, folderName?, infoHash?, tmdbId?, title?, year?, stage, progressPct?, etaSeconds?, detail?, artifacts?, streamaMediaId?, streamaVideoId? }` | `{ linked: true, requestId }` or `{ linked: false }` (202) |
| GET | `/agent/v1/requests/by-tmdb/:id` | — | `{ requestId, title, mediaType, requestUser, displayStatus, adminOverride }` |

`POST /agent/v1/events` resolves the request from (in order) `requestId` →
`tmdb{n}` in `folderName` → `tmdbId` → unique fuzzy title(+year). If nothing
matches uniquely, the event is stored **unlinked** for the admin inbox instead
of guessing — no request row is invented.

## Portal-side data (for reference)

- `PipelineJob`: `claimStatus` = `ready | claimed | in_progress | completed | failed | cancelled`,
  plus `leaseUntil` (crash-safe claim), `stage`, `progressPct`, `etaSeconds`, `detail`.
- `RequestEvent`: append-only history (`actor`, `type`, `payload`, `createdAt`).
- `Request`: `magnetLookupStatus` = `pending | found | not_found | not_applicable | error | stopped`,
  `pipelineStage`, `pipelineArtifacts` (unioned download/encode/upload file
  lists; owner/admin on `GET /requests/:id` only), `streamaMediaId`,
  `streamaVideoId`, `highlightedAt`, `archivedAt` (soft-delete).

### Stage artifacts (`artifacts` on progress / events)

Workers post a top-level `artifacts` object. The portal **merges** it onto
`Request.pipelineArtifacts` by file name (union, never shrinks) so a later
`{error,stat}` tick cannot wipe the inventory. Do not put file lists in
`detail` — that field is overwritten every tick.

```json
{
  "stage": "encoding",
  "progressPct": 40,
  "artifacts": {
    "download": {
      "folderName": "the-matrix-1999-tmdb603",
      "torrentName": "The.Matrix.1999.1080p.BluRay",
      "files": [{ "name": "The.Matrix.1999.1080p.mkv", "kind": "video", "bytes": 123 }]
    },
    "encode": {
      "files": [{ "name": "The.Matrix.1999.1080p.mp4", "kind": "video" }],
      "subtitles": [{ "name": "en_The.Matrix.1999.srt", "language": "en" }]
    },
    "upload": {
      "files": [{ "name": "The.Matrix.1999.1080p.mp4", "kind": "video" }],
      "subtitles": [{ "name": "en_The.Matrix.1999.srt", "language": "en" }]
    }
  }
}
```

Post again when the file-name set grows (incremental TV), not only when stage
or `%` changes. Cap each list at ~500 names. Capture encode/upload lists
**before** local files are deleted after verified scp.
