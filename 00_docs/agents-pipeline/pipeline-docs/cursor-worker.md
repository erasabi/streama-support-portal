# Cursor My Machines worker (catalog.ssh_alias VM)

Run Cursor Cloud Agent **tool calls** on this machine when automations need local/private-network access (Streama, mergerfs paths, `sortify`, internal APIs). Planning runs in Cursor's cloud; terminal, file edits, and stdio MCP run here.

No Cursor IDE required. The worker is a background process with an outbound HTTPS connection.

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| Cursor account | [cursor.com](https://cursor.com) |
| API key or login | Dashboard → API Keys, or `agent login` |
| Outbound HTTPS | `api2.cursor.sh`, `api2direct.cursor.sh`, `cloud-agent-artifacts.s3.us-east-1.amazonaws.com` |
| Git remote (for GitHub/Slack routing) | Worker registers the repo from `CURSOR_WORKER_DIR`; see below |

## Install (already on this host)

```bash
# CLI (if missing)
curl https://cursor.com/install -fsS | bash
agent --version

# Control script
chmod +x /home/ubuntu/catalog.ssh_alias/bin/cursor-worker
ln -sf /home/ubuntu/catalog.ssh_alias/bin/cursor-worker ~/.local/bin/cursor-worker
```

## One-time auth

**Option A — browser login (personal machine):**

```bash
agent login
```

**Option B — API key (automation / headless):**

```bash
mkdir -p ~/.config/cursor
cp /home/ubuntu/catalog.ssh_alias/config/cursor-worker.env.example ~/.config/cursor/worker.env
# Edit worker.env and set CURSOR_API_KEY=cursor_...
chmod 600 ~/.config/cursor/worker.env
```

## Configure

Edit `~/.config/cursor/worker.env`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `CURSOR_WORKER_NAME` | `elanflix-vm` | Name in dashboard; use `worker=elanflix-vm` in GitHub/Slack |
| `CURSOR_WORKER_DIR` | `/home/ubuntu/catalog.ssh_alias` | Primary workspace for tool execution |
| `CURSOR_WORKER_EXTRA_DIRS` | (unset) | Space-separated extra repo roots |
| `CURSOR_API_KEY` | (unset) | If not using `agent login` |
| `CURSOR_WORKER_MANAGEMENT_ADDR` | (unset) | e.g. `127.0.0.1:18080` for `/healthz`, `/metrics` |

### Git repo note

`catalog.ssh_alias` is not a git checkout today. That is fine for:

- Starting a worker rooted at this tree (local files, scripts, media paths)
- Dashboard agents with this machine selected manually

For **GitHub** `@cursoragent worker=elanflix-vm` routing, the worker directory must be a clone whose `git remote` matches the trigger repo. Either:

1. `git init` + add your remote in `/home/ubuntu/catalog.ssh_alias`, or  
2. Clone the target repo under `~/cursor-worker-repos/` and set `CURSOR_WORKER_DIR` there

## Verify

```bash
cursor-worker debug
cursor-worker debug --json
```

Fix auth or repo warnings before running in production.

## Run when needed

```bash
# Foreground (testing)
cursor-worker start

# Background via systemd (unattended)
cursor-worker start-bg
cursor-worker status
cursor-worker logs

# Stop when done
cursor-worker stop
```

Enable on boot without starting immediately:

```bash
cursor-worker enable
sudo systemctl start cursor-worker
```

Set `CURSOR_WORKER_SYSTEMD=user` in `worker.env` to use a user unit instead.

## Trigger automations

| Surface | Example |
|---------|---------|
| Dashboard | [cursor.com/agents](https://cursor.com/agents) → environment → `elanflix-vm` |
| GitHub | `@cursoragent worker=elanflix-vm fix the presort timer` |
| Slack | `@Cursor worker=elanflix-vm …` |
| Cloud Agents API | Target this machine via worker labels (see Cursor docs) |

## Private-network MCP

Use **stdio** MCP servers in agent config so processes run on this host and can reach LAN services. HTTP/SSE MCP runs from Cursor's backend and cannot reach private IPs on this network.

## Related

- [Cursor My Machines](https://cursor.com/docs/cloud-agent/my-machines)
- [Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints)
- Install path: `~/.local/bin/agent`, control: `/home/ubuntu/catalog.ssh_alias/bin/cursor-worker`
