# streama-support-portal

Imported from `catalog.ssh_alias:catalog.remote_root` (env prod).

Production unit: **`portal.service`** (`/etc/systemd/system/portal.service`), root, `docker-compose --env-file .env up --build` from the remote root. There is no `current/` release symlink; `fleetctl status` may still print `…/current` as a phantom path.

Health: `GET http://127.0.0.1:3000/agent/v1/jobs` must return **401**.

`scripts/deploy-with-systemd.sh` is `sudo -n /usr/local/sbin/portal-deploy` for the catalog SSH user (group `portal-deploy`). One-time: `sudo ./scripts/install-portal-sudo.sh <ssh_user>`. Fleetctl never executes those helpers.

Secret values are not stored here. Names only: repo `.env`, `PIPELINE_API_TOKEN`, `SORTIFY_API_TOKEN`.
