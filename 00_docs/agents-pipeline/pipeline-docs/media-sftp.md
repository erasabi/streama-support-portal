# FileZilla / SFTP access to media

## Problem

`*_STORAGE` entries under `media/` are symlinks to separate disks (`/mnt/...`). Pipeline
folders (`00_TO-SORT`, `00_PRE-SORT`, etc.) live on the root filesystem.

OpenSSH SFTP (used by FileZilla) implements **move** as a single `rename()` call. That fails
**across devices** with “permission denied” or generic failure — even when `mv` in a shell works
(because `mv` falls back to copy+delete).

`catalog.ssh_user` already has group write access; the blocker is cross-filesystem rename, not missing
chmod on the storage drives.

## Fix: mergerfs union mount

`bin/setup-media-sftp-access.sh` (run once as root):

1. Bind-mounts each pipeline folder and each storage drive into branch directories
2. Mounts **mergerfs** on `/home/ubuntu/catalog.ssh_alias/media` so SFTP sees one filesystem
3. Sets `moveonrename=true` so cross-branch moves work via copy+delete inside mergerfs
4. Applies `catalog.ssh_user` group permissions and default ACLs on media + storage mounts
5. Installs `elanflix-media-mergerfs.service` for boot persistence

```bash
# Preview
sudo /home/ubuntu/catalog.ssh_alias/bin/setup-media-sftp-access.sh --dry-run

# Apply
sudo /home/ubuntu/catalog.ssh_alias/bin/setup-media-sftp-access.sh
```

Requires `mergerfs` (`apt install mergerfs`) and `user_allow_other` in `/etc/fuse.conf`
(the script enables this).

## Verify

As `catalog.ssh_user`, in FileZilla:

1. Move a small test file from `00_TO-SORT` → `03_STORAGE`
2. Move a folder between two subfolders under the same `*_STORAGE` drive

Both should succeed without “permission denied”.

## Paths (unchanged)

| Path | Role |
|------|------|
| `media/00_PRE-SORT` | Remote sync landing |
| `media/00_TO-SORT` | sortify source |
| `media/01_STORAGE` … `03_STORAGE` | Storage drives (bind-mounted from `/mnt/...`) |

sortify, presort-ready, and sync scripts keep using `/home/ubuntu/catalog.ssh_alias/media/...`.

## If moves still fail

- Confirm mergerfs is mounted: `mount | grep mergerfs`
- Confirm `catalog.ssh_user` is in group `catalog.ssh_user` and storage dirs are `ubuntu:catalog.ssh_user` with group `rwx`
- Cross-drive moves between `01_STORAGE` ↔ `02_STORAGE` ↔ `03_STORAGE` are handled by
  mergerfs when the union mount is active; without it, use **copy** in FileZilla or `sortify`
