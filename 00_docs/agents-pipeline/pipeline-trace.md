# Pipeline trace and dry run

Two admin-only tools for the recurring pre-Streama pipeline bugs. The **trace**
explains what already happened to one request; the **dry run** predicts what
would happen to a title that has not been queued yet.

Both exist because there was no single join of
`requestId → folderName → infoHash → uTorrent status → subs/ inventory →
Streama apiId → highlight row`. Each hop had its own log, so a mismatch could
look "fixed" from any one host.

| Tool | Endpoint | UI |
|---|---|---|
| Trace | `GET /requests/:id/trace` | **Pipeline Trace** field in the admin request modal |
| Dry run | `POST /requests/dry-run`, `GET /requests/dry-run/:id`, `GET /requests/dry-runs` | Admin **Dry Run** next to Request after a title is selected, or **Open dry run** in request details. The overlay opens and the lookup starts only on that click. **Copy for agent** pastes a markdown briefing + JSON. Saved runs for that TMDB id are listed in the overlay. |

Both are gated by `isAdminRequest(req)` server-side and `isAdmin(user) || isSuperuser(user)`
client-side. Non-admins get `403` and never see the buttons.

## Reading a trace

`GET /requests/:id/trace` returns one self-contained JSON document
(`schema: "pipeline-trace/1"`). It is built **local-first** from portal DB rows
that the agents already post, so a trace always renders even when the Prelanflix
or Sortify agent is unreachable — those calls are optional enrichment under
`remote` and fail soft (`unconfigured` / `unreachable` / `skipped`). Pass
`?remote=0` to skip them entirely.

| Section | Answers |
|---|---|
| `identity` | Does `folderName` carry the right `tmdb{id}`? |
| `magnetLookup` | Every endpoint and query tried, the raw torrent list, which torrent was picked and why, which hashes were excluded, and the per-language YIFY subtitle index |
| `fetchPlan` | What the portal decided the downloader should fetch after diffing against the Streama library, plus `plannedVsActual` |
| `jobs` | Per-job claim status, lease, stage, `detail`, `ledger`, and whether any downloader evidence exists at all |
| `encode` | Per-stage file and subtitle inventory by language, and the encoder's embedded-track report |
| `subtitleAcquire` | Post-sort / **Add subtitles** attempts: per-language `kept` / `already_present` / `rejected` / `not_found` |
| `sortifyStreama` | Folder `tmdb` vs matcher `apiId` vs Streama title, and every dashboard highlight row |
| `flags` / `flagSummary` | Auto-detected mismatches (see below) |
| `events` | The `RequestEvent` timeline inline, so the document needs no follow-up queries |

**Copy Trace JSON** puts the whole document on the clipboard. That is the intended
input for a debug agent: paste it as-is and it has the search strings, file
inventories, identity comparisons, and flags for every hop.

### `fetchPlan.plannedVsActual`

This is the section that shows whether the portal asked for the right thing
before blaming the downloader.

| Field | Meaning |
|---|---|
| `requestedEpisodes` | Episode codes the plan derived from the Streama diff |
| `deliveredEpisodes` | Codes actually seen in a stage inventory |
| `plannedNeverDelivered` | Planned but never downloaded |
| `deliveredNotPlanned` | Downloaded but nobody asked for it |
| `stillRemaining` | Open gap after everything that did land |
| `wholeSeasonQueuedWithGapPlan` | A season-mode job ran while an episode-level gap plan existed |

`libraryState` alongside it records what was already in Streama at plan time —
the input to `planTvSeasons` / `missingCodesForSeasons`.

## Flags → bug class

Each flag maps to one of the six recurring reports. Use this to file a title
rather than re-diagnosing it.

| Flag | Severity | Class |
|---|---|---|
| `download_stage_without_active_job` | error | Shows Downloading, rentify empty |
| `download_stage_without_downloader_evidence` | error | Shows Downloading, rentify empty |
| `job_lease_expired` | warn | Shows Downloading, rentify empty |
| `magnet_search_not_recorded` | info | Magnet exists, portal missed |
| `magnet_reported_not_found` | warn | Magnet exists, portal missed |
| `stored_magnet_hash_excluded` | warn | Magnet exists, portal missed |
| `tmdb_identity_mismatch` | error | Right magnet, wrong media |
| `tmdb_identity_unverified` | info | Right magnet, wrong media |
| `duplicate_dashboard_highlights` | error | Duplicate dashboard highlights |
| `duplicate_highlight_events_unverified` | warn | Duplicate dashboard highlights |
| `russian_subtitles_absent` | warn / error | Russian SRT never uploaded |
| `no_subtitles_at_upload` | error | No subs on English-speaking shows |
| `subtitles_lost_between_encode_and_upload` | error | No subs on English-speaking shows |
| `embedded_tracks_never_probed` | info | No subs on English-speaking shows |
| `subtitle_acquire_rejected` | info | OpenSubtitles file discarded by the sync gate |
| `planned_episodes_never_delivered` | warn | Fetch plan vs actual |
| `whole_season_queued_despite_gap_plan` | warn | Fetch plan vs actual |

`russian_subtitles_absent` is **error** when the YIFY index shows a Russian
subtitle was available and still nothing shipped, and **warn** when no Russian
source existed. `tmdb_identity_mismatch` and `tmdb_identity_unverified` are
different findings: unverified means no matcher `apiId` was ever reported, so
identity is unknown — never read it as "ok".

`subtitle_acquire_rejected` is **info**, not an upload error. A post-sort
reject leaves the video in Streama; `no_subtitles_at_upload` still describes
the Prelanflix inventory only.

Request Update or Report Issue with **Add Subtitles** / **Fix Subtitles**
queues the same acquire path for movies and shows already in the library.
That creates a namespaced ticket labeled **Add Subtitles** (not Requested)
and a `PipelineJob` with `detail.kind = subtitle_acquire`. `GET /agent/v1/jobs`
defaults to `kind=download`, so rentify never claims it. Sortify-agent polls
`kind=subtitle_acquire`, writes missing `en`/`ru` sidecars when the sync gate
passes, and attaches them to the existing Streama videos. The library title
stays **Available**. When the job finishes, the ticket is archived and leaves
the queue. A failed job stays on the queue as **Failed**.

`duplicate_dashboard_highlights` fires only on an authoritative
`highlights.rowCount` from the sortify agent. Without the agent the trace can
only see `highlighted` events, and the sortify bridge posts one of those on a
Streama **409** as well — because it treats "already highlighted" as success.
Three re-runs over a single row therefore look exactly like three rows from the
portal side, so that case raises the weaker
`duplicate_highlight_events_unverified` instead.

## Agent inspection API: why there isn't one

`PRELANFLIX_AGENT_URL` and `SORTIFY_AGENT_URL` are **not currently settable to
anything**. Traffic in this system runs one way: `portal-worker.sh` and the
sortify bridge are *clients* that poll and post to the portal's `/agent/v1`.
Neither host runs an HTTP server, so there is no `/pipeline/trace` or
`/sortify/trace` to point them at. Setting them to a guessed URL is worse than
leaving them unset — the trace would spend two 6s timeouts and report
`unreachable`, which reads like a broken agent rather than a missing feature.

Rather than stand up two new services, the identity and highlight findings ride
the event channel the sortify bridge already uses (`POST /agent/v1/events`).
That route **whitelists top-level payload keys**, so new fields must travel
inside `detail`, which is explicitly the loose part of the contract.

Implemented in `agents/sortify-agent` on ElanFlix:

| `detail` field | Source | What the trace does with it |
|---|---|---|
| `apiId` | the Streama matcher result | compared against folder `tmdb{id}` for `tmdb_identity_mismatch` |
| `highlightStatus` | `created` (201) vs `already_exists` (409) | counts real dashboard rows instead of attempts |
| `videoToPlayId` | the highlight request body | `distinctVideoIds` — what defeats the 409 |

`StreamaClient.highlight_on_dashboard_status()` returns
`created` / `already_exists` / `failed`. The old
`highlight_on_dashboard() -> bool` remains as a wrapper so existing callers and
tests are unaffected; it was the bool collapse that lost the distinction.

With `highlightStatus` flowing, `highlights.countSource` becomes
`highlight_status` and `rowCount` is trustworthy without any agent HTTP API.
Traces for titles processed *before* this change still show
`countSource: "events"` and `rowCount: null`, since those events were never
recorded with a status — re-register a title to get a confirmed count.

## Classifying the current dirty titles

Inventory procedure, one pass per title. The point is a filed class, not a repair.

1. In the admin request list, open every request that is **Downloading**,
   **Check Manually**, or **Available** with a suspected duplicate highlight.
2. Expand **Pipeline Trace** and hit **Run Pipeline Trace**.
3. Read `flagSummary` first. Map each flag to a class with the table above.
4. **Copy Trace JSON** and file the dump under that class.
5. If `flags` is empty but the title is still wrong, the trace is missing a
   signal — that is itself the finding. Record which hop had no evidence
   (usually a `remote` section that is `unconfigured`) instead of guessing.

A title can legitimately land in several classes; a single request can raise
identity, highlight, subtitle, and fetch-plan flags at once.

Rules for this pass:

- Do **not** reset jobs, attach one subtitle file by hand, or set
  `pipelineStage=available` to clear a title. That closes an incident and
  destroys the evidence for the class.
- Do **not** edit Streama library rows except as a last-resort **operator**
  action, recorded separately from the engineering fix.
- One trace dump per title, filed under the class it proves.

## Dry run

`POST /requests/dry-run` takes `{ title, tmdbId, mediaType, year?, seasons?, episodes?, requestId? }`
and returns `schema: "pipeline-dry-run/1"`. It creates no `Request`, no
`PipelineJob`, and no torrent. Every successful report is stored as a
`PipelineDryRun` row so it can be reloaded and copied later.

TV source lookup creates a `PipelineDryRun` ticket (`status: ready`) that
Prelanflix `portal-worker` claims and runs as `piratify add --dry-run --json`
(rentify is not called). Movies and skipped-TV reports are stored immediately
(`status: stored`) and are never claimed by the worker. Piratify is **not**
installed on the portal host.
`sideEffects` starts with `none:` and is asserted in the response.

Stages reported: `magnetSearch`, `piratify`, `subtitleForecast`,
`encodeForecast`, `streamaMatch`, `highlightForecast`, plus `flags` and a
`verdict` of `would_fail`, `would_proceed_with_warnings`, or `would_succeed`.

**Copy for agent** puts a markdown briefing plus the full report JSON on the
clipboard. That is the intended paste for a debug agent: verdict, title,
folder, stage summaries, fetch plan, findings, then a `pipeline-dry-run/1`
JSON fence. The response also includes `agentText` with the same document.
The overlay lists **Saved dry runs** for this TMDB id; click one to reload it
(`GET /requests/dry-run/:id`). `GET /requests/dry-runs?tmdbId=` (optional
`requestId`) returns the list.

**Movies:** YTS + YIFY run inside the portal process (same as a real request).

**TV:** first `planTvSeasons` (the same Streama vs TVMaze diff a live request uses). The dry-run panel lists seasons already in Streama, auto-queue seasons, admin-approval gaps, and the `missing[]` episode codes the worker would pass as `piratify add --episodes`. `POST /requests/dry-run` returns immediately with `piratify.status: "pending"` and a ticket id. The UI polls `GET /requests/dry-run/:id` until Prelanflix runs `piratify add --dry-run --json` (next `portal-worker` tick, nothing queued). While that poll is open the UI shows a **Waiting for Prelanflix** banner with elapsed time — it does not show a final verdict yet. Source / subtitle / encode stages stay in a waiting state until the ticket finishes. Close the pre-request modal with **×**, **Close**, Escape, or click outside; that cancels polling. Holding the original POST open hits nginx **504**. If the diff says nothing to fetch, piratify is not called. When the worker finishes, the assembled report is written back onto the ticket.

Filename match still only happens at Streama register. The portal looks up the
TMDB id in Streama with `GET /movie/index.json?apiId=` (or `/tvShow/index.json`)
instead of paging the whole library. If that filter is missing, it falls back
to a bounded index scan; a timeout is `error`, never `missing` (fail closed).
The same lookup runs on **live** requests: TV season planning will not enqueue
when the library is uncertain; movie magnet lookup marks Check Manually and
still searches YTS.

## Where the instrumentation lives

| Hop | What it now records |
|---|---|
| Movie magnet lookup | `magnetSearchLog.js` builds a per-attempt record; `requestPipeline.js` persists it as a `magnet_lookup_detail` event on **found, not_found, and error** |
| YIFY subtitles | `getYifySubtitleIndex` scrapes once and reports per-language availability for English **and** Russian |
| TV picker | piratify emits `searchQueries` and `winningQueries` in `--json` (hash→query attribution, not a guess) |
| Encode | `encode-watch.sh` logs `SUBS probe:` / `SUBS skip:` / `SUBS embedded:` and writes `.subs-report.json` |
| Worker | `portal-worker.sh` posts `detail.downloader` (unit present, torrent name, uTorrent stat) and `detail.embeddedSubtitles` |

See Prelanflix `00_docs/portal-worker.md` and `00_docs/encoding.md` for the
box-side detail.
