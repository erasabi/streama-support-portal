# Support Portal application

Media request service for [Streama](https://github.com/streamaserver/streama). Users
search TMDB, request movies and TV, and track status from **Requested** through
pipeline stages to **Available** — without manual magnet copying or Streama uploads.

For how the portal fits with Prelanflix and Sortify, see [README.md](README.md).

## Tech stack

| Layer | Stack |
|---|---|
| Client | React 17, Redux, React Query, MUI, Styled Components, Webpack (port **8081**) |
| Server | Node/Express, Sequelize, PostgreSQL, Jest (port **3000**) |
| Deploy | Docker Compose, optional systemd (`scripts/deploy-with-systemd.sh`) |

## Project layout

```
streama-support-portal/
├── client/          # React SPA
├── server/          # API, migrations, pipeline services
├── scripts/         # deploy.sh, deploy-with-systemd.sh
├── docs/            # This documentation tree
├── docker-compose.yml
└── sample.env.*     # Copy to .env at repo root
```

## Getting started

Copy a sample env file and edit as needed:

```sh
cp sample.env.local .env
```

### Docker (simplest)

```sh
docker-compose up
# or when rebuilding
docker-compose up --build
```

API: `http://localhost:3000` · Client: `http://localhost:8081`

### Faster development

Run only Postgres in Docker, then start server and client locally:

```sh
docker-compose -f docker-compose-db-only.yml up

cd server && npm install && npm run migrate && npm start   # :3000
cd client && npm install && npm start                      # :8081
```

Set `DB_HOST=localhost` in `.env` when the database container publishes `5432`.

## Features

1. **Search** — TMDB movie and TV lookup in the client.
2. **Request** — create requests. Titles already in Streama hide **Request** and
   show **Request Update** / **Report Issue**. For TV, Request Update defaults to
   **Fetch New Seasons** and Submit returns immediately as **Requested** so the
   poster appears on Coming Soon (Available is hidden). **Add Subtitles** /
   **Fix Subtitles** on Request Update or Report Issue (movies and TV) queues
   missing English and Russian sidecars on ElanFlix only — it does not plan
   seasons, look up a magnet, or move the library title off **Available**. The
   ticket stays labeled **Add Subtitles** (or **Fix Subtitles**) on the queue
   until sortify finishes (`ffsubsync` + confidence gate), then it is archived
   and leaves the queue. Season planning runs in
   the background: every aired season that is incomplete or entirely missing is
   auto-queued. Streama/TVMaze lookups time out instead of hanging Submit.
   Fully complete seasons are skipped. Incomplete seasons enqueue only the
   absent episode codes (`missing[]` like `S01E04`, `S03E02` on the job and on
   GET/claim). `seasons` is still sent for legacy workers; new workers should
   fetch `missing` and not subtract `presentSeasons`. Leftover magnets
   from an earlier season do not skip planning. If every season is already
   complete, the row returns to Available. New TV requests (not in Streama)
   still queue **first + latest** only (all aired episodes in those seasons).
   Empty `missing[]` does not create a job and does not default to season 1.
   If Streama cannot be queried, **new** released titles go to **Check Manually**;
   titles that have not premiered yet stay **Not Yet Available**. **Fetch New
   Seasons** on a show already in the library does not demote it to Check
   Manually when Streama is down. Movies already in Streama skip YTS. Issue
   tickets stay namespaced and do not enter the download pipeline.
3. **Movie magnets** — server-side TMDB → YTS lookup, hourly retry, auto
   **Not Yet Available** only for titles that have not premiered yet (TV) or
   are still in the theatrical window with no digital/physical release (movies,
   via TMDB release types). Released titles with no torrent/YTS hit get
   **Check Manually** so an admin can attach a source. English subtitle lookups are
   always written to history (`subtitle_lookup`), including misses.
4. **Sources** — movies auto-attach a magnet; admins can attach **multiple**
   magnet/URL sources (one pipeline job per unique source). Saved on Update
   or when the details modal is dismissed (Cancel discards).
5. **Pipeline tracking** — Coming Soon badge, details stepper, and history
   share the same derived `pipelineStage` / `displayStatus`. The request
   details modal is grouped into **Overview**, **Queue**, **Sources**,
   seasons, planned fetch, **Diagnostics** (trace, dry run with copy-for-agent
   and saved-run history), and **History**.
   After sort, sortify fetches missing English and Russian sidecars, aligns
   them with `ffsubsync`, and keeps them only when the sync gate passes
   (`acquiring_subtitles`). Streama register then `addLocalFile`s those
   sidecars, including season `subs/` next to a nested release folder.
   The same path can be queued later with Request Update / Report Issue →
   **Add Subtitles** without rewinding **Available** or starting a download;
   that remedia attaches on-disk sidecars that never made it into Streama.
   A worker may post
   `paused` when Prelanflix disk is below its watermark; the job stays `ready`
   (no lease) and the badge shows **Paused**. Owner and admin
   can click **Download**, **Encode**, and **Upload** on the stepper to see
   file inventories (`pipelineArtifacts`: originals, encoded MP4s, `subs/`
   names, and what was scp'd). The SPA refetches
   `GET /requests/all` about every minute while the tab is visible (and when
   you return to the tab), and again right after portal actions that change
   status (new request, update, delete, approve seasons, save sources) with
   short follow-up fetches so async enqueue/lookup shows up without a full
   page refresh. Polling only replaces Coming Soon data — it does not clear
   the search bar. Repeated heartbeat stages are not duplicated in history.
   Archived rows display as **Archived**. `pending_approval` is optional
   (shown as Adding to library, hidden from history). Sortify registering a
   single TV episode (incremental PRE-SORT) does **not** mark the request
   Available while a rentify job is still downloading or encoding.
6. **Admin history** — **Past** (default: left Coming Soon) vs **On Portal**
   tabs, per-row Edit/Delete, append-only event log. Unlinked activity inbox
   for events that could not be matched to a request.

Auth uses the Streama session: the client calls Streama `user/current.json` and
forwards identity headers to the portal API. Admin and magnet actions require
`ADMIN_SECRETS` / `SUPERUSER_SECRETS` to match Streama roles in production.

## Environment variables

Root `.env` is loaded by Docker Compose and the server. Client build args mirror
the same values (`STREAMA_ENDPOINT` → `REACT_APP_STREAMA_ENDPOINT`, etc.).

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | yes | `development` or `production` |
| `STREAMA_ENDPOINT` | yes | Streama app URL (client + server fallback) |
| `STREAMA_URL` | server | Streama origin the **server container** uses for library lookup. On elanflix this must be the host nginx on **port 80** (`http://host.docker.internal`), not Streama's `:8080` and not the public HTTPS hostname. Docker cannot reach host `:8080` (TCP times out); nginx on `:80` answers in ~0.2s. `STREAMA_ENDPOINT` stays the public HTTPS origin for the browser. Falls back to `STREAMA_ENDPOINT` if unset. Missing URL or login → **Check Manually** for released titles (unreleased stay **Not Yet Available**); never auto-download. |
| `STREAMA_USERNAME` / `STREAMA_PASSWORD` | server | Streama login for `/tvShow/index.json` and `/movie/index.json` TMDB `apiId` lookup |
| `LEASE_STUCK_DOWNLOAD_MS` | server | After the worker stops heartbeating, fail a `downloading` job (default 6h) |
| `LEASE_STUCK_ENCODE_MS` | server | Same for encoding/sync/sortify stages (default 2h) |
| `API_ENDPOINT` | yes | This portal's API URL (client → server) |
| `DB_HOST`, `DB_SCHEMA`, `DB_USER`, `DB_PASSWORD` | yes | PostgreSQL |
| `ADMIN_SECRETS` | prod | Streama authority name gating admin routes |
| `SUPERUSER_SECRETS` | prod | Streama username for superuser checks |
| `PIPELINE_API_TOKEN` | agents | Bearer token for Prelanflix `portal-worker` (`/agent/*`) |
| `SORTIFY_API_TOKEN` | agents | Bearer token for sortify agent (`/agent/*`) |
| `TMDB_API_KEY` | optional | Server-side movie magnet lookup (has bundled fallback) |

Agent routes return **401** until `PIPELINE_API_TOKEN` and/or `SORTIFY_API_TOKEN`
are set. Each agent uses its own token.

### Agent credentials (on worker hosts)

| Host | Env file | Token must match |
|---|---|---|
| Prelanflix | `/etc/portal-worker.env` | `PIPELINE_API_TOKEN` |
| ElanFlix sortify | `~/.config/catalog.ssh_alias/portal.env` | `SORTIFY_API_TOKEN` as `PORTAL_TOKEN` |

Sortify also reads `PORTAL_BASE_URL` (default in agent config: `http://catalog.gateway.lan_server_name:3000`).

## Deploy

The catalog SSH user is **not** in `docker` and does not have unrestricted sudo. Production is systemd **`portal.service`** (`docker-compose --env-file .env up --build` as root from catalog `remote_root`). Streama is **`elanflix.service`**.

**One-time** (root-capable login): `sudo ./scripts/install-portal-sudo.sh <catalog.ssh_user>` — group `portal-deploy`, wrappers in `/usr/local/sbin`, drop-in `/etc/sudoers.d/portal-deploy`. No docker group, no `ALL`.

**Routine** (catalog SSH user, no password):

```sh
./scripts/deploy-with-systemd.sh
```

That runs `sudo -n /usr/local/sbin/portal-deploy` (unit restart + migrations). After a Streama JAR copy: `sudo -n systemctl restart elanflix.service`. Re-login once after the install so group `portal-deploy` is in the session.

Confirm `/agent/v1/jobs` returns **401** (route exists, auth enforced). Do not `su` to another user or pipe a sudo password.

## Server API (summary)

| Prefix | Purpose |
|---|---|
| `/requests` | CRUD, magnet-gated detail, admin events, multi-source attach (`PUT /:id/sources`), admin dry-run (`POST /dry-run`, `GET /dry-run/:id`, `GET /dry-runs`) |
| `/proxy` | YIFY subtitle URL helper |
| `/agent` | Bearer-token pipeline API — see [overview.md](agent-integration-changes/00_docs/stream-support-portal-app/overview.md) |
| `/admin` | History, unlinked pipeline events |

Background: hourly magnet retry poller, `PipelineJob` claim/lease/progress
(including JSONB `ledger` merged on progress; leftover episode codes land in
`ledger.missing` via `detail.leftoverMissing`; GET `/agent/v1/jobs` returns
`ledger`), append-only `RequestEvent` history. The worker still tracks leftovers
in `portal-jobs.json`; it does not resume from ledger. A disk janitor that
scans leftovers vs ledger is **not** implemented.

## Pipeline integration

The portal implementation is complete. Agent-side work:

- **Sortify** — implemented in `catalog.ssh_alias/agents/sortify-agent` (`lib/portal_bridge.py`).
- **Prelanflix `portal-worker`** — **Done**. TV jobs with `missing[]` run
  `piratify add -f folder --episodes csv --year year title` on Prelanflix
  (piratify is not on this host). Admin TV dry-run creates a ticket the worker
  runs as `piratify add --dry-run --json` (no torrent). Ops: Prelanflix
  `00_docs/portal-worker.md`.
  Contract notes:
  [rentify-pipeline-changes.md](agent-integration-changes/00_docs/stream-support-portal-app/rentify-pipeline-changes.md).

Contract and API reference: [overview.md](agent-integration-changes/00_docs/stream-support-portal-app/overview.md).
