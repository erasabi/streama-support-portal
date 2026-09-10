# Recurrence fix order (gated)

Six pipeline reports keep coming back because past work closed **incidents**,
not **classes**: a Russian subtitle attached once on disk, a one-line early
return in magnet lookup, a "uTorrent cap" explanation for a 0%-downloading
title. None of those left a probe that fails when the same thing returns.

This doc is the gate. **Do not implement a fix here until a real trace confirms
the mechanism for that class.** Classify titles first — see
[pipeline-trace.md](pipeline-trace.md).

## What is instrumentation vs what is a fix

Everything shipped so far is instrumentation and probes. Behavior is
deliberately unchanged, and the current behavior is pinned by characterization
tests marked `// PINS CURRENT BEHAVIOUR (gated fix: ...)`. Those tests fail
loudly when the corresponding fix lands, which is the signal to update them.

Still true today, by design:

- Russian subtitle availability is **recorded** via `getYifySubtitleIndex` but
  still **not attached** — `subtitleUrl` remains English-only
- `claimed` is still labelled "Downloading" in `status.js`
- `portal-worker.sh` still posts `downloading` the same way; it only reports
  more `detail`

## Fix order

Highest blast radius first. Each row lists the probe that must be red before
the fix and green after.

### 1. Identity gate — wrong media

Pass folder `tmdb{id}` into the Streama match, or refuse bulk-add and highlight
when `matcher.apiId != folder tmdb`. Streama's `BulkCreateService.matchMetaDataFromFiles`
goes filename → TMDB text search → `results[0]` and never reads the folder id,
so the portal's identity contract is dropped at exactly the point it matters.

- **Confirmed by:** `tmdb_identity_mismatch` on a real trace
- **Probe:** `pipelineTrace.test.js` identity cases; `folder tmdb` must equal
  matcher `apiId` (or show id)
- **Lives in:** ElanFlix `agents/sortify-agent`, Streama `BulkCreateService`
- **Detection is now wired:** the sortify bridge posts the matcher `apiId` in
  `detail`, so a mismatch is visible on a local trace. Detecting it is not the
  same as refusing it — the gate itself is still unbuilt.

### 2. Highlight idempotency — duplicate dashboard rows

Treat an existing highlight on the same Streama movie/show as success. Streama
returns 409 only when media **and** `videoToPlay` match, so a TV re-run or a new
episode creates a second dashboard row.

- **Confirmed by:** `duplicate_dashboard_highlights`
- **Probe:** highlight idempotency per movie/show (or per portal request), not
  per episode video
- **Detection is now wired:** `highlightStatus` in `detail` separates a created
  row from a 409, so the trace counts rows rather than attempts. Streama's
  409-on-`(media, videoToPlay)` semantics are unchanged.
- **Open product question:** whether a new season should intentionally bump the
  dashboard. Do not guess — ask before collapsing rows.
- **Lives in:** Streama `NotificationQueueController`, sortify agent

### 3. Download contract — "Downloading" with nothing downloading

Label `claimed` as Queued/Claimed rather than Downloading. Post `downloading`
only when rentify/uTorrent actually has the hash, and surface uTorrent
waiting/hash-check state in `detail` so the badge stops lying.

- **Confirmed by:** `download_stage_without_active_job`,
  `download_stage_without_downloader_evidence`
- **Probe:** `test-portal-worker.sh` downloader-snapshot probe (already asserts
  `detail.downloader.hasUnit`); `pipelineTrace.test.js` `downloaderEvidence` cases
- **Lives in:** `server/services/status.js`, `portal-worker.sh`

### 4. Magnet miss taxonomy — magnet exists, portal says no

Persist the raw YTS outcome (already done) and then act on it: disambiguate
same-title TMDB collisions, and stop reporting a TV piratify miss as
"magnet not found." Movies search the YTS mirror only, so `movie.id === 0`
means "not in this mirror", not "does not exist".

- **Confirmed by:** `magnet_reported_not_found` with a `missReason`, or
  `stored_magnet_hash_excluded`
- **Probe:** `magnetLookup.test.js` — timeout vs `id === 0` vs empty torrent
  list vs all hashes excluded
- **Lives in:** `server/services/magnetLookup.js`, `requestPipeline.js`

### 5. Subtitle acquire and register

ElanFlix now has a real acquire path for **missing en/ru** after sort (and via
Request Update / Report Issue **Add Subtitles**): OpenSubtitles → `ffsubsync`
→ confidence gate → place sidecar → Streama register / `addLocalFile`. Fail
closed on the subtitle, fail open on the video. **Sidecars on disk are not
player tracks.** Recurrence: TV nested as `sNN/release-folder/episode.mp4`
made `subtitle_paths_for_video` miss `sNN/subs/`, so register attached the
video with no subs; remedia then treated `already_present` on disk as done
and skipped `addLocalFile`. Register now walks the nested release layout;
Add Subtitles always attaches kept/on-disk files to the Streama video and
fails the ticket on `attach_failed`. `addLocalFile` uses the `media/` symlink
path, not `/mnt/<uuid>/` (Streama 406). Trace section `subtitleAcquire` and flag
`subtitle_acquire_rejected` (info) record discarded downloads. This does
**not** change Prelanflix YIFY attach (`subtitleUrl` remains English-only)
and does not rewrite `no_subtitles_at_upload` (that flag is still the upload
inventory).

Still open on the Prelanflix / encode side:

- **Movies, Russian at download:** fetch **en + ru** from YIFY. `rentify`
  already supports repeat `-s`; the portal still sends a single English URL.
- **Encode extract:** `SUB_LANGS="en ru"` covers **embedded text tracks only**.
  PGS is still skipped.

- **Confirmed by:** `russian_subtitles_absent` (error variant),
  `no_subtitles_at_upload`, `subtitles_lost_between_encode_and_upload`,
  `embedded_tracks_never_probed`, `subtitle_acquire_rejected`
- **Probe:** `subtitleInventory.test.js` language detection;
  `pipelineTrace.test.js` subtitle acquire; ElanFlix
  `tests/test_subtitle_acquire.py` gate
- **Note:** `SUB_LANGS="en ru"` in encode covers **embedded text tracks only**.
  Reading that as "Russian is uploaded like English" is the recurrence trap
  itself.

## Definition of done

A class is only addressed when:

1. A real trace named the mechanism (not a hypothesis from this doc)
2. The probe fails on the old behavior and passes after the change
3. The implementation PR maps 1:1 to that probe, not to a chat incident

## Explicitly not a fix

- Declaring `SUB_LANGS="en ru"` or the stage-inventory UI the subtitle fix
- A one-off Streama attach, or setting `pipelineStage=available` by hand
- More uTorrent cap tweaks without showing `claimed` vs actual torrent state on
  the same trace
- Closing a title from the portal UI while rentify and sortify disagree
