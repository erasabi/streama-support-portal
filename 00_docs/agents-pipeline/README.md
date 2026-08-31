# Streama Support Portal — documentation

This folder is the documentation home for the Support Portal and how it connects
to the Prelanflix download pipeline and the ElanFlix Sortify agent.

| Document | Audience | Contents |
|---|---|---|
| [app.md](app.md) | Portal developers / operators | Stack, run, deploy, env vars, features |
| [agent-integration-changes/00_docs/stream-support-portal-app/overview.md](agent-integration-changes/00_docs/stream-support-portal-app/overview.md) | Agent authors | End-to-end contract, identity rules, `/agent/v1` API |
| [agent-integration-changes/00_docs/stream-support-portal-app/rentify-pipeline-changes.md](agent-integration-changes/00_docs/stream-support-portal-app/rentify-pipeline-changes.md) | Prelanflix box | `portal-worker` spec (not yet implemented) |
| [agent-integration-changes/00_docs/stream-support-portal-app/sortify-agent-changes.md](agent-integration-changes/00_docs/stream-support-portal-app/sortify-agent-changes.md) | ElanFlix box | Sortify portal bridge (implemented) |

Ready-to-paste Cursor prompts for agent work:

- [prompt-rentify-portal-worker.md](agent-integration-changes/00_docs/stream-support-portal-app/prompt-rentify-portal-worker.md) — build on Prelanflix
- [prompt-sortify-portal-bridge.md](agent-integration-changes/00_docs/stream-support-portal-app/prompt-sortify-portal-bridge.md) — reference for ElanFlix (already done)

## The three systems

Three hosts cooperate. The **portal** is the source of truth for user requests and
pipeline status. **Prelanflix** (`rentify`) downloads, encodes, and ships files to
the ElanFlix box. **Sortify** on ElanFlix sorts, registers in Streama, and credits
the requester on the dashboard.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Streama Support Portal  (this repo — e.g. catalog.gateway.lan_server_name:3000)                  │
│  • User requests, magnet lookup, admin history                              │
│  • PipelineJob queue + /agent/v1 API                                        │
│  • Derives display status → "Available"                                     │
└───────────────┬─────────────────────────────────────┬───────────────────────┘
                │ PIPELINE_API_TOKEN                  │ SORTIFY_API_TOKEN
                │ claim jobs, report DL/encode/sync   │ events + request lookup
                ▼                                     ▼
┌───────────────────────────────┐     scp      ┌──────────────────────────────┐
│  Prelanflix box               │  ────────►   │  ElanFlix box                │
│  ~/.cursor/00_docs (rentify)  │  00_PRE-SORT │  agents/sortify-agent        │
│  download → encode → sync     │              │  PRE-SORT → TO-SORT → STORAGE│
│  portal-worker (planned)      │              │  → Streama register + highlight│
└───────────────────────────────┘              └──────────────────────────────┘
```

### Symbiotic roles

| System | Repo / docs | Role in the loop |
|---|---|---|
| **Support Portal** | `streama-support-portal` · [app.md](app.md) | Stores requests and magnets; exposes `/agent/v1` for workers; never runs torrents or sorting itself |
| **Prelanflix pipeline** | `~/.cursor/00_docs` on the download box — `torrent-download.md`, `encoding.md`, `remote-sync.md` | `rentify add -f <folderName>` preserves the TMDB id through download/encode; `sync-encoded.sh` delivers to `00_PRE-SORT` on ElanFlix |
| **Sortify agent** | `catalog.ssh_alias/agents/sortify-agent/docs/README.md` | Promotes PRE-SORT → TO-SORT, sorts into library paths, registers in Streama, posts portal stages, highlights dashboard with `Requested by {requestUser}` |

The **folder name contract** (`{title-slug}-{year}-tmdb{id}`) is what ties the
three systems together. Rentify names the download folder; sync keeps the name;
sortify parses `tmdb(\d+)` to link events back to the portal request.

### Integration status

| Component | Location | Status |
|---|---|---|
| Portal server + client (`/agent/*`, jobs, poller, UI) | this repo | **Implemented** |
| Sortify `portal_bridge` + dashboard highlights | `catalog.ssh_alias/agents/sortify-agent` (`lib/portal_bridge.py`) | **Implemented** — `PORTAL_TOKEN` in `~/.config/catalog.ssh_alias/portal.env` |
| Prelanflix `portal-worker` (poll, claim, progress) | Prelanflix box | **Not implemented** — spec in [rentify-pipeline-changes.md](agent-integration-changes/00_docs/stream-support-portal-app/rentify-pipeline-changes.md) |

Until `portal-worker` exists, requests queue as `ready` jobs in the portal but
nothing on Prelanflix will claim them. Sortify reporting works independently once
files land in `00_PRE-SORT` with a valid `tmdb{id}` folder name.

### External doc locations

These live outside this repo but are part of the same integration story:

| Path | What |
|---|---|
| `/home/ubuntu/.cursor/00_docs/` | Prelanflix pipeline: `rentify`, encode timers, remote sync to `00_PRE-SORT` |
| `/home/ubuntu/catalog.ssh_alias/agents/sortify-agent/docs/README.md` | Sortify install, config, portal reporting, Streama registration |
| `/home/ubuntu/catalog.ssh_alias/00_docs/stream-support-portal-app/` | Mirror of agent-integration docs (keep in sync with this repo's `docs/agent-integration-changes/`) |

When you change the integration contract, update **overview.md** here first, then
mirror to `catalog.ssh_alias/00_docs/stream-support-portal-app/` if that copy is used on the
ElanFlix box.
