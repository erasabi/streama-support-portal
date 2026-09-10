# sortify

Interactive CLI for sorting media from `00_TO-SORT` into storage destinations.

Remote sync lands in `00_PRE-SORT`. The **presort-ready** timer waits until every
file has finished copying, then promotes the item into `00_TO-SORT` where sortify
operates.

## Quick reference

| Command | Description |
|---------|-------------|
| `sortify` | Start interactive sorting session (`00_TO-SORT`) |
| `sortify --status` / `-s` | Pipeline view: ready vs syncing + automation stage |
| `sortify --watch` / `-w` | Monitor background moves, subify, and Streama registration |
| `sortify --history` / `-H` | Show history of past moves |
| `sortify --history-storage NAME` | Filter history (works with `--history` and `--undo`) |
| `sortify --undo` / `-u` | Undo a past move: re-sort it or delete it entirely |
| `sortify --foreground` / `-f` | Run moves in foreground (blocking) |
| `presort-ready` | One-shot: promote completed PRE-SORT → TO-SORT (timer runs this) |

### Automated sorting

The **sortify-agent** runs every minute when `00_TO-SORT` has items. It plans moves
deterministically and calls the Cursor API only for low-confidence items. See
[agents/sortify-agent/docs/README.md](../../agents/sortify-agent/docs/README.md).

```bash
sortify-agent-run --dry-run --force --json   # preview plan
sortify-check --verbose --no-trigger         # checker only
```

## Installation

Script location: `/home/ubuntu/catalog.ssh_alias/bin/sortify`

**For catalog.ssh_user user:** symlink at `~/.local/bin/sortify` (already in PATH)

**System-wide (requires sudo):**

```bash
sudo ln -sf /home/ubuntu/catalog.ssh_alias/bin/sortify /usr/local/bin/sortify
```

## Pipeline

```
Remote sync  →  00_PRE-SORT  →  presort-ready  →  00_TO-SORT  →  sortify-agent  →  01/02/03_STORAGE  →  Streama
                 (copying)       (stability check)   (ready)         (sort + subify)    (encoded library)   (library UI)
```

Automated runs (`sortify-agent`) sort in the background, run subify per moved video, then register the results in Streama when `streama.enabled` is true in `agents/sortify-agent/config/agent.yaml`. After each successful sort, the agent fetches missing English and Russian `.srt` files (OpenSubtitles), aligns them with `ffsubsync` (`--max-offset-seconds 12`), and keeps a file only when the sync gate passes (offset, optional score, cue count, duration coverage). Rejected downloads are deleted; the video still registers. The same acquire path can be queued from Request Update / Report Issue → **Add Subtitles** (`GET /agent/v1/jobs?kind=subtitle_acquire`). When portal reporting is configured (`portal.enabled` plus `~/.config/catalog.ssh_alias/portal.env`), the agent also posts `acquiring_subtitles` plus progress to the Support Portal and adds a Streama dashboard highlight (`Requested by {requestUser}`) so the request can reach **Available**.

| Stage | Directory | Meaning |
|-------|-----------|---------|
| Syncing | `00_PRE-SORT` | Remote copy in progress — **do not sort yet** |
| Ready | `00_TO-SORT` | Copy complete — safe to run `sortify` |

### How “copy complete” is detected

`presort-ready` (every 2 minutes via systemd timer) checks each top-level item in
`00_PRE-SORT`:

1. **No partial/temp filenames** — skips `.part`, `.tmp`, `.crdownload`, `.!qB`, hidden dotfiles, etc.
2. **Size + mtime stability** — every file inside the item (recursively) must keep the same size and modification time for **120 seconds** (override with `SORTIFY_STABLE_SECONDS`).

When both pass, the whole folder/file is moved to `00_TO-SORT`.

### Pipeline status

```bash
sortify --status
```

Shows three sections:

- **READY TO SORT** — items in `00_TO-SORT` waiting for `sortify`
- **COPY COMPLETE** — items in `00_PRE-SORT` that passed checks and will promote on the next timer pass
- **STILL SYNCING** — items in `00_PRE-SORT` still copying, with per-item reason
- **AUTOMATION** — current sortify-agent stage (idle, sorting, subify, Streama) and last run summary

### presort-ready timer

Installed for user `catalog.ssh_user` (runs even without sudo):

```bash
# Install / repair timer + enable lingering (timers survive logout)
./bin/install-presort-timer

# Manual one-shot
presort-ready

# Timer status
systemctl --user status presort-ready.timer
systemctl --user status presort-ready.service
journalctl --user -u presort-ready.service -n 10
```

`sortify-check` (every 1 min) **also** promotes stable PRE-SORT items, so promotion
continues even if `presort-ready.timer` stops after a logout.

After editing the unit file, reload: `systemctl --user daemon-reload && systemctl --user restart presort-ready.timer`

**User units must not set `User=`** in the service file — that causes `status=216/GROUP` and promotion never runs.

**Lingering** (`loginctl enable-linger`) is required for user timers to run without an
active login session. Without it, timers stop when the user session ends (common cause
of items stuck in PRE-SORT).

**Timer scheduling:** use wall-clock `OnCalendar` (not `OnUnitActiveSec` alone). After
user-session churn, `OnUnitActiveSec` can leave `next_elapse=0` — the timer looks
active but never fires. `agents/sortify-agent/bin/install-timer` installs
`sortify-automation-watchdog.timer` (every 5 min) to restart a stuck checker and
verifies `NEXT` is set after install.

```bash
systemctl --user list-timers sortify-check.timer   # NEXT must not be n/a
journalctl --user -u sortify-check.service -n 5
```

**Orphaned queue recovery:** if `~/.sortify/queue.json` has pending moves but no
`worker.pid` process, the checker and automation watchdog call `reconcile_stale_queue()`
to run `sortify --worker` and drain the queue. This prevents the gate from blocking
forever with `sortify queue.json has pending moves` after a worker crash.

```bash
ls -la ~/.sortify/queue.json ~/.sortify/worker.pid
sortify-check --verbose --no-trigger   # reconciles then reports readiness
```

Unit files live in `/home/ubuntu/catalog.ssh_alias/systemd/` and are linked from
`~/.config/systemd/user/`. Log: `~/.sortify/presort.log`.

## Usage

### Interactive sorting

Run `sortify` to start an interactive session (source is `00_TO-SORT`):

```
$ sortify

────────────────────────────────────────────────────────
 Media Sort
────────────────────────────────────────────────────────
Source: /home/ubuntu/catalog.ssh_alias/media/00_TO-SORT

────────────────────────────────────────────────────────
 Found 3 item(s) to sort
────────────────────────────────────────────────────────

[1/3] Detroiters.S02E01... (folder)
  View folder contents (recursive)? [y/N]: y

  Detroiters.S02E01.../
      Detroiters.S02E01.iNTERNAL.1080p.WEB.H264.mkv  (1.1GB)
      RARBG.txt  (30B)
  Total: 2 file(s), 1.1GB

  Rename this folder? [y/N]: y
  New name [Detroiters.S02E01...]: detroiters
  → Will rename to: detroiters
  
  Move to:
    1) 01_STORAGE (500.2GB free)
    2) 02_STORAGE (180.5GB free)
    3) 03_STORAGE (800.1GB free)
    4) 00_MOVIE-SUBS (unknown)
  Choice: 3
  
  Move to a subfolder? [y/N]: y
  Subfolder in 03_STORAGE:
    1) (root - no subfolder)
    2) Create / enter new folder name
    3) andor
    4) attack.on.titan
    ...
  Choice: 2
  New folder name: detroiters
  → Will create folder: 03_STORAGE/detroiters/
  ✓ Queued: 03_STORAGE/detroiters/detroiters

[2/3] movie.mkv (file)
  Move to:
    1) 01_STORAGE (500.2GB free)
    ...
  Choice: 1
  ✓ Queued: 01_STORAGE/movie.mkv
```

### Workflow

1. **Sync** — remote content arrives in `00_PRE-SORT`
2. **Promote** — `presort-ready` moves stable items to `00_TO-SORT`
3. **Scan** — `sortify` scans `00_TO-SORT` for files and folders
4. **Prompt** — for each item:
   - **Folders:** optionally view contents recursively, option to rename, choose destination, optionally select/create a subfolder
   - **Files:** choose destination, optionally select/create a subfolder
5. **Queue** — all selections are queued (nothing moved yet); if videos lack subs, you are asked whether to run subify after the move
6. **Confirm** — review final queue (including `[subify after move]` markers) and confirm
7. **Execute** — moves run in background (or foreground with `-f`); opted-in subify runs after each move

### Viewing contents before sorting

For folders, the first prompt is `View folder contents (recursive)?`. Answering yes
prints a nested tree of every file with its size and a total, so you know exactly
what you are moving before deciding where it goes.

### Subfolders (existing or new)

When you choose `Move to a subfolder?`, sortify lists:

- `(root - no subfolder)` — drop directly into the storage root
- `Create / enter new folder name` — type any folder name; if it does not exist it is
  **created automatically** at move time before the item is moved into it
- every existing subfolder in the chosen storage drive

Nested names (e.g. `shows/detroiters`) are supported and created as needed.

### Subify before move (parallel pre-check)

When sorting starts, sortify **scans all TO-SORT items in parallel** for missing `.srt` files while you step through each item. By the time you finish choosing a destination, the check for that item is usually already done — no wait at the end.

After you queue each item (and only if videos lack subs, and the destination is not `00_MOVIE-SUBS`):

```
Run subify after move? (videos missing .srt) [Y/n]:
```

Your choice is stored in the queue (`subify: true/false`) and shown in the confirm summary as `[subify after move]`. Subify runs **after** the move completes, at the final storage path — foreground moves run it immediately; background moves run it from the worker using the saved choice.

Subs count as present when a matching `.srt` is beside the video or under any known subs layout in the source tree: `subs/`, `subs-{showname}/`, other `subs-*` folders, or `sNN/subs/`. Episode matching uses stem overlap or `SxxExx` in the path.

Subify runs **per newly moved video** (not the whole show folder). New downloads land in an existing subs root when one is present; otherwise `subs-{showname}/` is created.

### Monitoring progress

```bash
sortify --watch
```

Example output:

```
[04:15:23] Starting 3 move(s)
[04:15:23] [1/3] Moving: detroiters
[04:15:25]   ✓ Done: detroiters
[04:15:25] Completed 3 move(s)
[04:15:25] ---MOVES-DONE---
[04:15:25] Starting subify for 1 video(s)
[04:15:25] Subify: detroiters.s01e01.mkv
[04:15:26] detroiters/s01e01
[04:15:30]   downloaded via opensubtitlescom: detroiters.s01e01.en.srt (12450 bytes)
[04:15:35]   synced -> subs-detroiters/s01/detroiters.s01e01.en.srt
[04:15:35]   ✓ Subify done: detroiters
[04:15:35] ---END---
[04:15:36] ---STREAMA---
[04:15:36] Registering sorted media in Streama...
[04:15:36] Streama: 1 video(s)
[04:15:37]   ✓ detroiters/s01/detroiters.s01e01.mkv: created
[04:15:37] ---ALL-DONE---
```

`--watch` keeps running through subify (`---END---` from the worker) and, when the sortify-agent is running with Streama enabled, continues through registration until `---ALL-DONE---`. If the agent is interrupted, `sortify-check` retries Streama from `data/pending-streama.json` when the worker is idle. Interactive-only runs (no agent) finish on `---END---`.

### Viewing history

```bash
# Show all history
sortify --history

# Filter by destination
sortify --history --history-storage 03_STORAGE
```

History is printed oldest-first (chronological), one block per move, with a status
marker (`✓` still present / `✗` missing), the date/time, the storage drive, and
the path relative to that drive. Newest entries appear at the bottom. When stdout
is a terminal, entries use ANSI colors (bold name, dim metadata, cyan storage,
blue path, green/red status); piping to a file or pager disables color.

```
────────────────────────────────────────────────────────────
 Move History (showing 2)
────────────────────────────────────────────────────────────

    ✓  Movie.A.mp4
        2026-06-19 10:00   01_STORAGE
        → Movie.A.mp4
  ··························································
    ✓  detroiters
        2026-06-19 11:30   03_STORAGE
        → detroiters
────────────────────────────────────────────────────────────
```

(`--undo` uses the same styling with numbered rows, most recent first.)

### Undoing a move

```bash
sortify --undo
# optionally narrow the list first:
sortify --undo --history-storage 03_STORAGE
```

The history is shown as a **numbered list, most recent first** (`1` = latest move).
Pick a move, then choose what to do:

1. **Re-sort** — run the item back through the normal flow (view contents, rename,
   pick destination/subfolder) and move it to a new place. The old history entry is
   replaced by the new destination.
2. **Delete the file/folder entirely** — permanently removes it from disk (with a
   confirmation prompt) and drops the history entry.
3. **Cancel** — do nothing.

If the recorded item is no longer at its location, sortify offers to clean up the
stale history entry instead.

## Directory layout

| Path | Purpose |
|------|---------|
| `/home/ubuntu/catalog.ssh_alias/media/00_PRE-SORT` | Remote sync landing (copying) |
| `/home/ubuntu/catalog.ssh_alias/media/00_TO-SORT` | Ready to sort (`sortify` source) |
| `/home/ubuntu/catalog.ssh_alias/media/01_STORAGE` | Destination 1 (symlink to mounted drive) |
| `/home/ubuntu/catalog.ssh_alias/media/02_STORAGE` | Destination 2 (symlink to mounted drive) |
| `/home/ubuntu/catalog.ssh_alias/media/03_STORAGE` | Destination 3 (symlink to mounted drive) |
| `/home/ubuntu/catalog.ssh_alias/media/00_MOVIE-SUBS` | Destination for subtitle files |

## Config files

All config stored in `~/.sortify/`:

| File | Purpose |
|------|---------|
| `queue.json` | Pending moves (cleared after execution) |
| `progress.log` | Real-time progress log |
| `history.json` | Permanent record of all moves |
| `presort-state.json` | File stability tracking for PRE-SORT promotion |
| `presort.log` | Promotion log (PRE-SORT → TO-SORT) |
| `worker.pid` | PID of background worker (if running) |

## History format

History is stored in `~/.sortify/history.json`. Each entry can include sort and Streama
outcomes (agent runs populate these automatically):

```json
{
  "timestamp": "2026-06-12T04:15:23",
  "source": "/home/ubuntu/catalog.ssh_alias/media/00_TO-SORT/movie.mkv",
  "destination": "/home/ubuntu/catalog.ssh_alias/media/03_STORAGE/movie.mkv",
  "storage": "03_STORAGE",
  "original_name": "movie.mkv",
  "sort": { "status": "ok", "via": "agent" },
  "streama": { "status": "registered", "detail": "match_found" }
}
```

`sortify --history` shows:

- **✓/✗** — whether the file is still at the recorded destination path
- **Sort** — move outcome (`ok`, `deferred`, `unresolved`, …) and reason on failure
- **Streama** — one line with **video** and **subtitle** parts, e.g.
  `✓ video · ✓ subtitle` or `✓ video · ✗ subtitle: reason` (each can succeed or fail independently).
  Subtitle success requires library verification (`subtitle_verified`), not Streama's matcher alone.

### Streama dual naming (optional)

When `streama.naming.enabled` is true in `agents/sortify-agent/config/agent.yaml`, each
sorted video keeps its storage basename and gains a sibling
`{StreamaBasename}.streama.{ext}` symlink plus `{storage}.streama.json` provenance sidecar.
Set `streama.naming.enabled: false` to disable (default). Cleanup:
`bin/streama-naming-cleanup --apply`.

Failed sorts (never moved) appear as history rows with no destination path.

## Tips

- **Pipeline first:** run `sortify --status` to see what is ready vs still syncing
- **Inspect first:** answer yes to `View folder contents (recursive)?` to see every file and size before choosing a destination
- **New folders:** pick `Create / enter new folder name` in the subfolder prompt — missing folders are created automatically before the move
- **Undo / re-sort:** use `sortify --undo` to move a sorted item somewhere else or delete it entirely
- **Skip an item:** press Ctrl+C during prompts to skip
- **Cancel session:** Ctrl+C to exit cleanly
- **Resume interrupted:** if interrupted mid-session, run `sortify` again to resume pending moves
- **Foreground mode:** use `-f` for small batches to see progress directly

## See also

- [showify](../showify/README.md) — report TV shows missing seasons on storage drives
- [ElanFlix overview](../README.md)
