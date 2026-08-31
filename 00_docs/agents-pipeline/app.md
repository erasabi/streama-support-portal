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
   poster appears on Coming Soon (Available is hidden). Season planning runs in
   the background: every aired season that is incomplete or entirely missing is
   auto-queued. Streama/TVMaze lookups time out instead of hanging Submit.
   Fully complete seasons are skipped (`presentSeasons` = complete seasons only,
   so missing episodes in a partial season still download). Leftover magnets
   from an earlier season do not skip planning. If every season is already
   complete, the row returns to Available. New TV requests (not in Streama)
   still queue **first + latest** only.
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
   share the same derived `pipelineStage` / `displayStatus`. Owner and admin
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
| `STREAMA_URL` | server | Streama origin the **server container** uses for library lookup. Must be reachable from Docker (port 80/443 on the host gateway, or the same HTTPS origin as `STREAMA_ENDPOINT`). `host.docker.internal:8080` often times out even when Streama answers `:8080` on the host. Falls back to `STREAMA_ENDPOINT`. Missing URL or login → **Check Manually** for released titles (unreleased stay **Not Yet Available**); never auto-download. |
| `STREAMA_USERNAME` / `STREAMA_PASSWORD` | server | Streama login for `/tvShow/index.json` and `/movie/index.json` TMDB `apiId` lookup |
| `API_ENDPOINT` | yes | This portal's API URL (client → server) |
| `DB_HOST`, `DB_SCHEMA`, `DB_USER`, `DB_PASSWORD` | yes | PostgreSQL |
| `ADMIN_SECRETS` | prod | Streama authority name gating admin routes |
| `SUPERUSER_SECRETS` | prod | Streama username for superuser checks |
| `PIPELINE_API_TOKEN` | agents | Bearer token for Prelanflix `portal-worker` (`/agent/*`) |
| `SORTIFY_API_TOKEN` | agents | Bearer token for sortify agent (`/agent/*`) |
| `TMDB_API_KEY` | optional | Server-side movie magnet lookup (has bundled fallback) |
| `DEPLOY_USER` | this VM | Unix user that can Docker + sudo (`ubuntu`) |
| `DEPLOY_SUDO_PASSWORD` | this VM | That user's login/sudo password. Gitignored `.env`. Cursor sessions run as `catalog.ssh_user` and cannot talk to Docker otherwise. Alternative: first line of `.cursor/deploy.secret`. |

Agent routes return **401** until `PIPELINE_API_TOKEN` and/or `SORTIFY_API_TOKEN`
are set. Each agent uses its own token.

### Agent credentials (on worker hosts)

| Host | Env file | Token must match |
|---|---|---|
| Prelanflix (planned) | e.g. `/etc/portal-worker.env` | `PIPELINE_API_TOKEN` |
| ElanFlix sortify | `~/.config/catalog.ssh_alias/portal.env` | `SORTIFY_API_TOKEN` as `PORTAL_TOKEN` |

Sortify also reads `PORTAL_BASE_URL` (default in agent config: `http://catalog.gateway.lan_server_name:3000`).

## Deploy

This VM's Cursor agent user is **`catalog.ssh_user`** (no `docker` group, no `sudo`). Production is systemd unit **`portal.service`**, which runs `docker-compose --env-file .env up --build` as root from `catalog.remote_root`.

After app changes, agents must redeploy (do not stop at “needs sudo”):

```sh
./scripts/deploy-with-systemd.sh
```

That script reads `DEPLOY_SUDO_PASSWORD` from `.env` (or `.cursor/deploy.secret`), `su`s to `ubuntu`, and runs `scripts/restart-portal-inner.sh`: `sudo systemctl restart portal.service`, wait until `/agent/v1/jobs` responds (401 is healthy — `/requests/all` can 500 until migrations), then `docker-compose exec … npm run migrate`. Migrations only: `python3 scripts/restart-portal-service.py --migrate-only`.

If `catalog.ssh_user` is already able to use Docker (or you are logged in as `ubuntu`):

```sh
./scripts/deploy.sh
```

Confirm `/agent/v1/jobs` returns **401** (route exists, auth enforced).

## Server API (summary)

| Prefix | Purpose |
|---|---|
| `/requests` | CRUD, magnet-gated detail, admin events, multi-source attach (`PUT /:id/sources`) |
| `/proxy` | YIFY subtitle URL helper |
| `/agent` | Bearer-token pipeline API — see [overview.md](agent-integration-changes/00_docs/stream-support-portal-app/overview.md) |
| `/admin` | History, unlinked pipeline events |

Background: hourly magnet retry poller, `PipelineJob` claim/lease/progress,
append-only `RequestEvent` history.

## Pipeline integration

The portal implementation is complete. Agent-side work:

- **Sortify** — implemented in `catalog.ssh_alias/agents/sortify-agent` (`lib/portal_bridge.py`).
- **Rentify worker** — not yet built; spec in
  [rentify-pipeline-changes.md](agent-integration-changes/00_docs/stream-support-portal-app/rentify-pipeline-changes.md).

Contract and API reference: [overview.md](agent-integration-changes/00_docs/stream-support-portal-app/overview.md).
