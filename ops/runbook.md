# streama-support-portal

Imported from `catalog.ssh_alias:catalog.remote_root` (env prod).

Production unit: **`portal.service`** (`/etc/systemd/system/portal.service`), root, `docker-compose --env-file .env up --build` from the remote root. There is no `current/` release symlink; `fleetctl status` may still print `…/current` as a phantom path.

Health: `GET http://127.0.0.1:3000/agent/v1/jobs` must return **401**.

`scripts/deploy-with-systemd.sh` is an operator helper (password/`su`). Fleetctl must never run it. Audit finding `EXPECT-deploy-with-systemd.sh` is waived keep-as-is.

Secret values are not stored here. Names only: repo `.env`, `PIPELINE_API_TOKEN`, `SORTIFY_API_TOKEN`, `DEPLOY_SUDO_PASSWORD`.
