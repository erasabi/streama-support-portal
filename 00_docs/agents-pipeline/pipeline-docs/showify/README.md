# showify

CLI that reports which TV shows on catalog.ssh_alias are missing available seasons. Scans the three storage drives, matches each show folder against TVMaze metadata, and lists seasons that have started airing but are absent locally. Also manages a number-based ignore list.

## Quick reference

| Command | Description |
|---------|-------------|
| `showify` / `showify list` | List shows missing seasons (default) |
| `showify list -p` / `--partial` | Also flag seasons present but missing episodes |
| `showify --refresh` | Discard cached TVMaze metadata and re-fetch |
| `showify ignore N [N ...]` | Batch-ignore shows by list number |
| `showify ignored` | Show numbered ignore list |
| `showify unignore N [N ...]` | Remove shows from ignore list by number |
| `man showify` | Full manual (installed system-wide) |

## Installation

Installed system-wide:

| Path | Purpose |
|------|---------|
| `/usr/local/bin/showify` | Executable (root-owned, world-readable) |
| `/usr/local/share/man/man1/showify.1` | Man page |

Available to all users on PATH. Per-user state lives under `~/.config/catalog.ssh_alias/` (see below).

## What it scans

Under the media root (default `/home/ubuntu/catalog.ssh_alias/media`, override with `ELANFLIX_MEDIA`):

| Storage | Role |
|---------|------|
| `01_STORAGE` | Storage drive 1 |
| `02_STORAGE` | Storage drive 2 |
| `03_STORAGE` | Storage drive 3 |

Within each storage:

- **Top-level files** — treated as movies, ignored
- **Top-level directories** — treated as TV shows (folder name = show name)

### Season detection

Episodes are found recursively inside each show folder. Season numbers are parsed from:

| Pattern | Example |
|---------|---------|
| `SxxExx` | `S06E05`, `2.Broke.Girls.S01E09...`, multi-ep `Andor S01E12-13.m4v` |
| Worded form | `Season 05 Episode 03` |
| Season subfolders | `andor/s01/`, `1883/s01/` |

Subtitle directories named `subs` or `subs-*` are skipped.

## Metadata

Season lists come from [TVMaze](https://www.tvmaze.com) (`singlesearch` API). No API key required. Folder names are normalized (dots/underscores → spaces) for lookup.

Responses are cached for **7 days** in `~/.config/catalog.ssh_alias/cache.json`. The first full scan can take several minutes; later runs are fast.

### Season status labels

| Label | Meaning |
|-------|---------|
| `complete` | Season has fully aired (`endDate` in the past) |
| `rolling` | Season has premiered but not finished airing |
| *(not shown)* | Season has not premiered yet — never reported as missing |

With `--partial`, present-but-incomplete seasons appear as `partial N/M` where N = episodes on disk and M = TVMaze `episodeOrder`.

## Usage

### List missing seasons

```bash
showify
# or
showify list
```

Example output:

```
Shows missing seasons (scanned 01_STORAGE, 02_STORAGE, 03_STORAGE):

 1. always sunny                    [02_STORAGE]
      S15  (complete)
      S16  (complete)
      S17  (complete)
 2. abbott.elementary               [03_STORAGE]
      S02  (complete)
      S03  (complete)

Legend: complete = season fully aired; rolling = season currently airing.
```

Each entry shows:

- **Number** — used by `showify ignore`
- **Show name** — same as the folder name on disk
- **Storage** — which `*_STORAGE` the show lives in
- **Missing seasons** — with `complete` or `rolling` status

### Include partial seasons

```bash
showify list --partial
```

```
 1. abbott.elementary               [03_STORAGE]
      S02  (partial 8/22, complete)
      S03  (complete)
```

### Ignore workflow

Numbers from the most recent `showify list` output:

```bash
# Batch-ignore
showify ignore 2 5 7

# View ignore list (numbered alphabetically)
showify ignored

# Remove by ignore-list number
showify unignore 1 3
```

Ignored shows are stored as `"STORAGE/folder"` keys, e.g. `02_STORAGE/always sunny`.

### Fix bad TVMaze matches

If a show matches incorrectly or not at all, add an entry to `~/.config/catalog.ssh_alias/overrides.json`:

```json
{
  "archive.81": 44183,
  "03_STORAGE/some.weird.folder": 12345
}
```

Keys can be the folder name alone or `"STORAGE/folder"`. Values are TVMaze show IDs. Then refresh:

```bash
showify --refresh
```

Unmatched shows are listed at the bottom of a `showify list` run with the search string used.

## Config files

All state in `~/.config/catalog.ssh_alias/` (per user):

| File | Purpose |
|------|---------|
| `ignore.json` | Persistent ignore list (`STORAGE/folder` keys) |
| `last_list.json` | Number → show map from the last `list` run (for `ignore`) |
| `cache.json` | TVMaze responses (7-day TTL) |
| `overrides.json` | Manual folder → TVMaze show ID overrides |

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `ELANFLIX_MEDIA` | `/home/ubuntu/catalog.ssh_alias/media` | Media root directory |
| `XDG_CONFIG_HOME` | `~/.config` | Base path for config (`catalog.ssh_alias/` subdir) |

## Limitations

- **Anime with absolute episode numbering** (e.g. `one.piece`, `naruto.shippuden`) often lack `SxxExx` markers and may not map cleanly to TVMaze seasons. Use the ignore list or an override.
- **TVMaze search** can return the wrong show for ambiguous folder names; use `overrides.json` when needed.
- **Multi-episode files** (`S01E12-13`) count both episode numbers when detected.

## See also

- [sortify](../sortify/README.md) — interactive sorting from `00_PRE-SORT` to storage
- [ElanFlix overview](../README.md)
- `man showify` — full manual with additional examples
