# Sortify agent — portal bridge (ElanFlix box)

> **Status: implemented** in `catalog.ssh_alias/agents/sortify-agent` (`lib/portal_bridge.py`,
> hooks in `runner.py`, `presort_bridge.py`, `streama_bridge.py`). This doc is the
> design reference. Live operator docs: `agents/sortify-agent/docs/README.md`.

Goal: sortify reports pipeline progress back to the portal and, after
registering media in Streama, adds it to the **Dashboard Highlights** with a
description that credits the requesting user. This closes the loop so a portal
request reaches "Available" with no manual Streama work.

## Config

Add a `portal:` block to `agents/sortify-agent/config/agent.yaml`:

```yaml
portal:
  enabled: true
  base_url: "http://catalog.gateway.lan_server_name:3000"   # portal API
  token: ""                            # matches portal SORTIFY_API_TOKEN
  # optional: only emit these stages
  events: [uploaded, sorting, deferred, acquiring_subtitles, registering, pending_approval, highlighted, failed]
```

Keep the token out of git (read from `~/.config/catalog.ssh_alias/portal.env` like the
Streama creds, or an env var).

## New module: `lib/portal_bridge.py`

A minimal HTTP client (stdlib `urllib`, mirroring `streama_bridge.StreamaClient`):

```python
def post_event(payload: dict) -> dict        # POST /agent/v1/events
def get_request_by_tmdb(tmdb_id: str) -> dict | None   # GET /agent/v1/requests/by-tmdb/:id
```

- Always send `Authorization: Bearer {token}`.
- Never let a portal failure break sorting/registration — log and continue
  (portal reporting is best-effort, exactly like Streama registration is guarded).

### Resolving the request id

Recover the portal request id from the pipeline folder name (the contract from
[overview.md](overview.md)): parse `tmdb(\d+)` from the TO-SORT / storage path
or the `.streama` sidecar.

- **Movie:** `tmdb{id}` is the TMDB movie id → the portal request id.
- **TV:** use the **show** id (`tmdb_tv_id` from the sidecar / `agent.yaml`
  `match.tmdb_show_ids`, or the `tmdb{id}` in the pack folder). **Do not** use
  the episode matcher `apiId` — that is the episode's TMDB id, not the show id.

If you can't resolve an id, still call `post_event` with `folderName` (and
`title`/`year` when known) so the portal can fuzzy-match or file it under the
admin Unlinked inbox.

## Hook points

| Where (existing code) | When | Portal call |
|---|---|---|
| `lib/presort_bridge.py::promote_presort_ready` | item promoted PRE-SORT → TO-SORT | `post_event({folderName, stage:"uploaded"})` |
| `lib/runner.py::run_agent` after successful `apply_plan` (moved to storage, pre-Streama) | files placed | `post_event({folderName, stage:"sorting"})` |
| `lib/subtitle_acquire.py::acquire_for_planned` | missing en/ru after sort | `post_event({..., stage:"acquiring_subtitles", detail.subtitleAcquire})` |
| `sortify-check` every tick | remedia Add subtitles jobs | poll `GET /agent/v1/jobs?kind=subtitle_acquire` |
| `lib/defer_queue.py::mark_deferred` | item deferred | `post_event({folderName, stage:"deferred", detail:{reason}})` |
| `lib/runner.py::run_streama_stage` start | registration begins | `post_event({..., stage:"registering"})` |
| `lib/streama_bridge.register_sorted_media` result | per-title registered | see below |

### After Streama registration

For each registered title, look up the request and report:

```python
req = portal.get_request_by_tmdb(tmdb_id)   # gives requestUser, title, mediaType
portal.post_event({
    "requestId": req["requestId"],          # or folderName if req is None
    "stage": "pending_approval",
    "streamaMediaId": movie_or_show_id,
    "streamaVideoId": video_id,
})
```

Treat `already_in_library` (matcher status 2) as success for portal purposes —
the title is playable. Only use `stage:"failed"` for genuine registration
failures (after the existing pending-streama retry path gives up).

### Dashboard Highlights (the requestUser payoff)

After registration succeeds, add the title to the dashboard highlight queue and
then report `highlighted` so the portal flips the request to **Available**:

```python
# Streama highlight endpoint (from streamaserver/streama):
# POST /notificationQueue/highlightOnDashboard.json
#   { "mediaId": <id>, "mediaType": "movie"|"tvShow"|"genericVideo",
#     "videoToPlay": { "id": <videoId> },
#     "description": f"Requested by {req['requestUser']}" }
resp = streama_client.highlight_on_dashboard(media_id, media_type, video_id,
                                             description=f"Requested by {request_user}")
# 409 "You already have a highlight for this Video" → treat as success.

portal.post_event({"requestId": req["requestId"], "stage": "highlighted"})
```

`requestUser` comes from `get_request_by_tmdb`. This is why the portal exposes
it on the agent lookup — the highlight description credits the requester.

Until the highlight step is implemented, stop at `pending_approval`; the portal
shows "Pending Approval" and the request stays visible (not yet Available).

## Edge cases

- **No portal match**: post with `folderName`; unmatched → portal Unlinked inbox.
  Never invent a request.
- **TV Rolling Episodes**: reporting `pending_approval`/`highlighted` for a
  season must not force the whole show to Available if an admin set
  `Rolling Episodes` — the portal's admin override handles this; just report
  per-title events.
- **Manual drop (not requested in portal)**: sortify still registers in Streama;
  the portal event is unlinked and ignored/attached by an admin.
- **Portal unreachable**: log and continue; sorting/registration must not fail.
- **Highlight duplicate (409)**: treat as success and still post `highlighted`.
