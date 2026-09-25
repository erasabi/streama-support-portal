# streama-support-portal

Imported from `catalog.ssh_alias:catalog.remote_root` (env prod).

Production unit: **`portal.service`** (`/etc/systemd/system/portal.service`), root, `docker-compose --env-file .env up --build` from the remote root. There is no `current/` release symlink; `fleetctl status` may still print `…/current` as a phantom path.

Health: `GET http://127.0.0.1:3000/agent/v1/jobs` must return **401**.

Production UI is baked into the **server** image (`server/client-ui` from `client` webpack build) and served on port **3000** (same path as the catalog gateway `expose.web` upstream). Port **8081** is the optional `client` webpack-dev-server container for LAN debugging; after deploy, prefer the gateway URL so API + UI stay in sync.

`scripts/deploy-with-systemd.sh` is `sudo -n /usr/local/sbin/portal-deploy` for the catalog SSH user (group `portal-deploy`). One-time on the host (as root): `sudo ./scripts/install-portal-sudo.sh <ssh_user>` from `current/` so `/usr/local/sbin/portal-{deploy,migrate,install-sbin}` match the release. Fleetctl smoke runs `portal-install-sbin` then `portal-deploy` when those helpers are installed.

Secret values are not stored here. Names only: repo `.env`, `PIPELINE_API_TOKEN`, `SORTIFY_API_TOKEN`.
