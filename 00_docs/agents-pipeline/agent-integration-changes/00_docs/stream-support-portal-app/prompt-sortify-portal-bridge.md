# Cursor prompt: Sortify `portal_bridge` + Highlights
---

Implement portal reporting and Streama Dashboard Highlights in the sortify agent so a Support Portal request tracks from PRE-SORT through Streama to **Available**, with the highlight description crediting the requester. The portal API is **already live**; do not change portal code.

## Read first (required)

These three docs are available to you. Read all of them before writing code:

1. `00_docs/stream-support-portal-app/overview.md` — identity contract (`tmdb{id}` in folder names), stages you may post, `/agent/v1` API, auth, **never use episode `apiId` for TV show lookup**
2. `00_docs/stream-support-portal-app/sortify-agent-changes.md` — **this is your implementation spec**
3. `00_docs/stream-support-portal-app/rentify-pipeline-changes.md` — context only (rentify ends at `uploaded` / PRE-SORT); do not implement a rentify worker here

Then read the existing agent:

- `agents/sortify-agent/00_docs/README.md`
- `agents/sortify-agent/SKILL.md` (sorting conventions)
- `lib/streama_bridge.py`, `lib/runner.py`, `lib/presort_bridge.py`, `lib/defer_queue.py`, `lib/config.py`, `config/agent.yaml`
- How Streama creds are loaded (`~/.config/catalog.ssh_alias/streama-probe.env`)
- Existing tests under `agents/sortify-agent/tests/` (especially `test_streama_bridge.py`, `test_streama_pending.py`)

Keep `00_00_docs/` / sortify docs in sync if you change observable behavior, flags, or config.

## What to build (backup existing version before any changes in case we need to revert back)

### 1. Config

Add `portal:` to `config/agent.yaml` as in `sortify-agent-changes.md`. **Do not commit the token.** Load it from env / `~/.config/catalog.ssh_alias/portal.env` the same way Streama creds are loaded (`PORTAL_BASE_URL`, `PORTAL_TOKEN` matching portal `SORTIFY_API_TOKEN`). If `portal.enabled` is false or token missing, skip all portal calls.

### 2. `lib/portal_bridge.py`

Stdlib HTTP (mirror `StreamaClient` style):

- `post_event(payload)` → `POST {base}/agent/v1/events`
- `get_request_by_tmdb(tmdb_id)` → `GET {base}/agent/v1/requests/by-tmdb/{id}`

Always `Authorization: Bearer {token}`. **Portal failures must never fail sort/apply/Streama registration** — log and continue.

Helper to recover TMDB **request** id from path / sidecar:

- Parse `tmdb(\d+)` from folder/file names (pipeline contract)
- **Movie:** that id is the portal request id (and matcher `apiId` is a backup)
- **TV:** use **show** id (`tmdb_tv_id` sidecar / `match.tmdb_show_ids` / folder `tmdb{id}`). **Never** use episode matcher `apiId`

If id cannot be resolved, still `post_event` with `folderName` (+ `title`/`year` if known). Never invent a portal request.

### 3. Hooks (best-effort portal posts)

| Hook | `stage` |
|---|---|
| `promote_presort_ready` after a successful promote | `uploaded` |
| `run_agent` after successful apply, before/while Streama | `sorting` |
| `mark_deferred` | `deferred` + `detail.reason` |
| start of `run_streama_stage` | `registering` |
| after `register_sorted_media` per title | see below |

Only post stages from `overview.md` that sortify owns: `uploaded`, `sorting`, `deferred`, `registering`, `pending_approval`, `highlighted`/`available`, `failed`.

### 4. After Streama registration

For each title that registered **or** is `already_in_library` (treat as success / playable):

1. `get_request_by_tmdb(show_or_movie_tmdb_id)`
2. `post_event` with `stage: "pending_approval"`, `requestId` if known, `streamaMediaId`, `streamaVideoId`

Only `stage: "failed"` after the existing pending-streama retry path has given up.

### 5. Dashboard Highlights (required for “Available”)

Implement Streama `POST /notificationQueue/highlightOnDashboard.json`:

```json
{
  "mediaId": <streama movie or tvShow id>,
  "mediaType": "movie" | "tvShow" | "genericVideo",
  "videoToPlay": { "id": <streama video id> },
  "description": "Requested by {requestUser}"
}
```

`requestUser` comes from `get_request_by_tmdb`. If there is no portal match, still register in Streama; skip highlight-from-portal or highlight without a requester name — do not invent a user. **409** (“already have a highlight”) = success.

Then `post_event({ "requestId": ..., "stage": "highlighted" })`.

Portal admin override (`Rolling Episodes`, etc.) is handled **on the portal**; still post per-title events.

## Tests

Add/extend unit tests with mocked HTTP:

- TMDB id extraction (movie folder vs TV show vs episode apiId must not be used for TV)
- `post_event` / lookup called from hooks
- portal 5xx does not raise out of `run_agent` / `register_sorted_media`
- highlight 409 treated as success
- `already_in_library` → pending_approval, not failed

## Done when

- Config + env example (no secrets in git)
- Hooks fire the stages above
- Highlights use `Requested by {requestUser}` when a portal request exists
- Docs updated (`agents/sortify-agent/00_docs/README.md` and ElanFlix `00_docs` if the overview mentions sortify)
- Existing sortify tests still pass plus new portal tests

Do not implement the Prelanflix `portal-worker` or change `rentify`.
