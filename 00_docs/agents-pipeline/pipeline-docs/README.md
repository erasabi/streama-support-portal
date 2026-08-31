# ElanFlix Documentation

Documentation for the ElanFlix media server and CLI tools.

## CLI tools

| Tool | Description | Docs |
|------|-------------|------|
| **sortify** | Interactive sorting from `00_TO-SORT` to storage | [sortify/README.md](sortify/README.md) |
| **sortify-agent** | Automated sortify (1-min checker + planner) | [agents/sortify-agent/docs/README.md](../agents/sortify-agent/docs/README.md) |
| **showify** | Report TV shows missing available seasons | [showify/README.md](showify/README.md) |
| **streama-probe** | Test Streama local-file match/add API (standalone, not in pipeline) | below |
| **Support Portal** | Request tracking from PRE-SORT through Streama to Available | [stream-support-portal-app/overview.md](stream-support-portal-app/overview.md) |
| **cursor-worker** | Cursor My Machines worker for private-network automations | [cursor-worker.md](cursor-worker.md) |

### FileZilla / SFTP

Cross-drive moves in FileZilla fail until mergerfs is installed — see [media-sftp.md](media-sftp.md).

### Quick start

```bash
# See pipeline: syncing vs ready to sort
sortify --status

# Sort ready media into storage
sortify

# See which shows are missing seasons
showify
```

### Streama probe

Standalone script to test whether sorted files can be registered in Streama via its REST API.
The sortify-agent uses the same library (`agents/sortify-agent/lib/streama_bridge.py`) after
each successful apply. Read-only unless you pass `--apply`.

```bash
# Copy credentials (gitignored): config/streama-probe.env.example → ~/.config/catalog.ssh_alias/streama-probe.env
# Portal token (gitignored): config/portal.env.example → ~/.config/catalog.ssh_alias/portal.env
bin/streama-probe                                    # ping Streama
bin/streama-probe --file /path/to/episode.mkv        # match only (safe)
bin/streama-probe --file /path/to/episode.mkv --apply  # register in library
```

Use paths under `media/` as Streama sees them (e.g. `/home/ubuntu/catalog.ssh_alias/media/03_STORAGE/...`). Do not pass symlink-resolved paths (`/mnt/...`) — Streama rejects them and may create an episode shell with no playable file. `--apply` will attach to an existing empty episode when match returns `already_in_library`.

Requires Streama running, TMDB key configured, and local directory including `media/`.

## Directory structure

```
/home/ubuntu/catalog.ssh_alias/
├── media/
│   ├── 00_PRE-SORT/      # Remote sync landing (presort-ready watches this)
│   ├── 00_MOVIE-SUBS/    # Subtitle files
│   ├── 00_TO-SORT/       # Ready to sort (sortify source)
│   ├── 001_SUBS-SORT/    # Subtitles by show
│   ├── 01_STORAGE/       # Storage drive 1 (symlink)
│   ├── 02_STORAGE/       # Storage drive 2 (symlink)
│   └── 03_STORAGE/       # Storage drive 3 (symlink)
├── agents/
│   └── sortify-agent/    # Automated sorting agent (see docs/README.md)
├── bin/
│   ├── sortify           # Media sorting CLI
│   ├── sortify_staging.py # PRE-SORT → TO-SORT promotion logic
│   ├── presort-ready     # Timer target: promote stable copies
│   ├── streama-probe     # Streama API probe (match/add test)
│   └── cursor-worker     # Cursor My Machines worker control
├── config/
│   ├── cursor-worker.env.example  # Template for ~/.config/cursor/worker.env
│   ├── streama-probe.env.example  # Template for ~/.config/catalog.ssh_alias/streama-probe.env
│   └── portal.env.example         # Template for ~/.config/catalog.ssh_alias/portal.env
├── systemd/
│   ├── presort-ready.service
│   ├── presort-ready.timer
│   └── cursor-worker.service      # My Machines worker (start on demand)
├── 00_docs/              # This documentation
│   ├── sortify/          # sortify docs
│   ├── showify/          # showify docs
│   └── stream-support-portal-app/  # portal ↔ sortify/rentify contract
├── application.yaml      # Streama configuration
├── streama-latest.jar    # Streama server
└── streama.mv.db         # Streama database
```

## Install locations

| Tool | Path | Scope |
|------|------|-------|
| sortify | `/home/ubuntu/catalog.ssh_alias/bin/sortify` | Repo; `~/.local/bin/sortify` symlink for catalog.ssh_user |
| presort-ready | `/home/ubuntu/catalog.ssh_alias/bin/presort-ready` | `install-presort-timer`; user timer every 2 min; also promoted by `sortify-check` |
| sortify-agent | `/home/ubuntu/catalog.ssh_alias/agents/sortify-agent/bin/` | `sortify-check` timer every 1 min |
| cursor-worker | `/home/ubuntu/catalog.ssh_alias/bin/cursor-worker` | Repo; `~/.local/bin/cursor-worker`; My Machines worker |
| agent (Cursor CLI) | `~/.local/bin/agent` | Installed via `curl https://cursor.com/install \| bash` |
| showify | `/usr/local/bin/showify` | System-wide; `man showify` |
