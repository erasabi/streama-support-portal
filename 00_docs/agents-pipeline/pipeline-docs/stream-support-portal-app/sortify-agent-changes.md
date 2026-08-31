# Sortify agent — portal bridge (ElanFlix box)

> **Status: implemented** in `agents/sortify-agent/` (`lib/portal_bridge.py`,
> hooks in presort / runner / defer / Streama register). Operator docs:
> `agents/sortify-agent/docs/README.md`. Token: `~/.config/catalog.ssh_alias/portal.env`.

Goal: sortify reports pipeline progress back to the portal and, after
registering media in Streama, adds it to the **Dashboard Highlights** with a
description that credits the requesting user. This closes the loop so a portal
request reaches "Available" with no manual Streama work.

## Config

`agents/sortify-agent/config/agent.yaml`:

```yaml
portal:
  enabled: true
  base_url: "http://catalog.gateway.lan_server_name:3000"   # override with PORTAL_BASE_URL
  token: ""                            # matches portal SORTIFY_API_TOKEN
  events: [uploaded, sorting, deferred, registering, pending_approval, highlighted, failed]
```

Load `PORTAL_BASE_URL` / `PORTAL_TOKEN` from `~/.config/catalog.ssh_alias/portal.env` (see
`config/portal.env.example`). If `portal.enabled` is false or the token is
missing, all portal calls are skipped.

## Module: `lib/portal_bridge.py`

Stdlib HTTP (same style as `streama_bridge.StreamaClient`):

- `post_event(payload)` → `POST {base}/agent/v1/events`
- `get_request_by_tmdb(tmdb_id)` → `GET {base}/agent/v1/requests/by-tmdb/{id}`

Always `Authorization: Bearer {token}`. Portal failures never break sort /
apply / Streama registration.

### Resolving the request id

Parse `tmdb(\d+)` from the pipeline folder name, sidecar, or path.

- **Movie:** that id is the portal request id (matcher `apiId` is a backup).
- **TV:** use the **show** id (`tmdb_tv_id` sidecar / `match.tmdb_show_ids` /
  folder `tmdb{id}`). **Never** use episode matcher `apiId`.

If an id cannot be resolved, still `post_event` with `folderName` (+ `title` /
`year` when known). Never invent a portal request.

## Hook points

| Where | Portal `stage` |
|---|---|
| `promote_presort_ready` after a successful promote | `uploaded` |
| `run_agent` after successful apply, before Streama | `sorting` |
| `mark_deferred` | `deferred` + `detail.reason` |
| start of `run_streama_stage` | `registering` |
| after `register_sorted_media` per playable title | `pending_approval`, then highlight + `highlighted` |

`already_in_library` is treated as success (playable). `stage: "failed"` is
posted only after the pending-streama retry path has failed
`FAIL_ATTEMPT_LIMIT` (10) consecutive times.

## Dashboard Highlights

`POST /notificationQueue/highlightOnDashboard.json`:

```json
{
  "mediaId": <streama movie or tvShow id>,
  "mediaType": "movie" | "tvShow" | "genericVideo",
  "videoToPlay": { "id": <streama video id> },
  "description": "Requested by {requestUser}"
}
```

`requestUser` comes from `get_request_by_tmdb`. No portal match → still
register in Streama; skip highlight (do not invent a user). HTTP **409**
(“already have a highlight”) is success, then `stage: "highlighted"`.

Portal admin overrides (`Rolling Episodes`, etc.) stay on the portal; sortify
still posts per-title events.

## Tests

`agents/sortify-agent/tests/test_portal_bridge.py` — TMDB extraction, hooks,
portal 5xx does not fail sort/register, highlight 409, `already_in_library` →
`pending_approval`.
