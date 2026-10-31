#!/usr/bin/env python3
"""Apply or restore Streama dashboard highlights and logo for holiday seasons."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date, datetime
from http.cookiejar import CookieJar
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlencode, urljoin
from urllib.request import HTTPCookieProcessor, Request, build_opener

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore[misc, assignment]

PAGE_SIZE = 200
VIDEO_EXTS = {".m4v", ".mp4", ".mkv", ".avi", ".mov", ".m4a", ".mpg", ".mpeg", ".wmv"}
SUBTITLE_EXTS = {".srt", ".vtt"}
SEED_SEASON = "halloween"
SEED_BACKUP_NAME = "highlights-backup-2026-10-30.json"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def data_dir() -> Path:
    raw = os.environ.get("HOLIDAY_HIGHLIGHTS_DATA")
    path = Path(raw) if raw else repo_root() / "data" / "holiday-highlights"
    path.mkdir(parents=True, exist_ok=True)
    return path


def logos_dir() -> Path:
    return repo_root() / "config" / "holiday-highlights" / "logos"


def config_path() -> Path:
    return repo_root() / "config" / "holiday-highlights.yml"


def seed_backup_path() -> Path:
    return repo_root() / "config" / "holiday-highlights" / "seed" / SEED_BACKUP_NAME


def load_env_file(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.is_file():
        return env
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip("'\"")
    return env


def _parse_flow_map(raw: str) -> dict[str, Any]:
    inner = raw.strip()[1:-1].strip()
    out: dict[str, Any] = {}
    if not inner:
        return out
    for part in inner.split(","):
        if ":" not in part:
            continue
        key, rest = part.split(":", 1)
        out[key.strip()] = _parse_scalar(rest)
    return out


def _parse_scalar(raw: str) -> Any:
    value = raw.strip()
    if value in {"null", "~"}:
        return None
    if value in {"[]"}:
        return []
    if value in {"true", "false"}:
        return value == "true"
    if value.startswith("{") and value.endswith("}"):
        return _parse_flow_map(value)
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    if (value.startswith('"') and value.endswith('"')) or (
        value.startswith("'") and value.endswith("'")
    ):
        return _unquote(value)
    return value


def _unquote(value: str) -> str:
    if value.startswith('"') and value.endswith('"'):
        return json.loads(value)
    if value.startswith("'") and value.endswith("'"):
        inner = value[1:-1].replace("''", "'")
        return inner
    return value


def load_yaml_subset(text: str) -> dict[str, Any]:
    try:
        import yaml  # type: ignore

        data = yaml.safe_load(text)
        if isinstance(data, dict):
            return data
    except Exception:
        pass

    root: dict[str, Any] = {}
    stack: list[tuple[int, Any]] = [(-1, root)]
    pending_key: tuple[int, Any, str] | None = None

    def current(indent: int) -> Any:
        while stack and stack[-1][0] >= indent:
            stack.pop()
        return stack[-1][1]

    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        stripped = raw.strip()
        container = current(indent)

        if stripped.startswith("- "):
            item = stripped[2:]
            if isinstance(container, list):
                if ":" in item and not item.startswith(("'", '"')):
                    key, rest = item.split(":", 1)
                    obj: dict[str, Any] = {}
                    if rest.strip():
                        obj[key.strip()] = _parse_scalar(rest)
                    else:
                        pending_key = (indent, obj, key.strip())
                    container.append(obj)
                    stack.append((indent, obj))
                else:
                    container.append(_parse_scalar(item))
            continue

        if ":" in stripped:
            key, rest = stripped.split(":", 1)
            key = key.strip()
            if not isinstance(container, dict):
                continue
            if not rest.strip():
                placeholder: Any = {}
                container[key] = placeholder
                pending_key = (indent, container, key)
                stack.append((indent, placeholder))
            else:
                container[key] = _parse_scalar(rest)
                pending_key = None

    # Promote empty dict placeholders that were immediately followed by list items
    def fix(node: Any, source_lines: list[str] | None = None) -> Any:
        return node

    # Second pass: empty dicts that should have been lists
    rebuilt = _promote_lists(text, root)
    return rebuilt


def _promote_lists(text: str, parsed: dict[str, Any]) -> dict[str, Any]:
    """Re-walk so keys whose next lines are list items become lists."""
    try:
        import yaml  # type: ignore

        data = yaml.safe_load(text)
        if isinstance(data, dict):
            return data
    except Exception:
        pass

    lines = [ln for ln in text.splitlines() if ln.strip() and not ln.lstrip().startswith("#")]
    root: Any = {}
    stack: list[tuple[int, Any, str | None]] = [(-1, root, None)]

    for raw in lines:
        indent = len(raw) - len(raw.lstrip(" "))
        stripped = raw.strip()
        while stack and indent <= stack[-1][0] and not (
            stripped.startswith("- ") and indent == stack[-1][0]
        ):
            if stripped.startswith("- ") and indent == stack[-1][0]:
                break
            if indent < stack[-1][0] or (
                indent == stack[-1][0] and not stripped.startswith("- ")
            ):
                stack.pop()
            else:
                break
        parent = stack[-1][1]

        if stripped.startswith("- "):
            item = stripped[2:]
            if not isinstance(parent, list):
                key = stack[-1][2]
                grand = stack[-2][1] if len(stack) > 1 else root
                new_list: list[Any] = []
                if isinstance(grand, dict) and key:
                    grand[key] = new_list
                parent = new_list
                stack[-1] = (stack[-1][0], parent, stack[-1][2])
            if (
                ":" in item
                and not item.startswith(("'", '"', "{"))
            ):
                k, rest = item.split(":", 1)
                obj: dict[str, Any] = {}
                if rest.strip():
                    obj[k.strip()] = _parse_scalar(rest)
                parent.append(obj)
                stack.append((indent + 2, obj, None))
            else:
                parent.append(_parse_scalar(item))
            continue

        key, rest = stripped.split(":", 1)
        key = key.strip()
        if not isinstance(parent, dict):
            continue
        if rest.strip():
            parent[key] = _parse_scalar(rest)
        else:
            child: dict[str, Any] = {}
            parent[key] = child
            stack.append((indent, child, key))
    return root


def load_config() -> dict[str, Any]:
    path = config_path()
    if not path.is_file():
        raise SystemExit(f"missing config: {path}")
    cfg = _promote_lists(path.read_text(), {})
    if not cfg.get("seasons"):
        raise SystemExit(f"failed to parse {path}")
    return cfg


def today_in_zone(tz_name: str) -> date:
    if ZoneInfo is not None:
        return datetime.now(ZoneInfo(tz_name)).date()
    return date.today()


def window_matches(window: dict[str, Any], today: date) -> bool:
    month = int(window.get("month") or 0)
    if today.month != month:
        return False
    start = window.get("day_start")
    end = window.get("day_end")
    if start is None and end is None:
        return True
    first = int(start or 1)
    last = int(end or 31)
    return first <= today.day <= last


def season_for_day(cfg: dict[str, Any], today: date) -> str | None:
    seasons = cfg.get("seasons") or {}
    for name, season in seasons.items():
        for window in season.get("windows") or []:
            if window_matches(window, today):
                return name
    return None


def norm_title(title: str) -> str:
    t = title.lower()
    t = re.sub(r"[\[\]():]", " ", t)
    t = re.sub(r"[._-]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def compile_pats(patterns: list[str] | None) -> list[re.Pattern[str]]:
    out: list[re.Pattern[str]] = []
    for pat in patterns or []:
        if not pat:
            continue
        out.append(re.compile(pat, re.I))
    return out


class Streama:
    def __init__(self, base_url: str, username: str, password: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.opener = build_opener(HTTPCookieProcessor(CookieJar()))

    def request(
        self,
        method: str,
        path: str,
        *,
        data: bytes | None = None,
        content_type: str | None = None,
        params: dict[str, Any] | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> tuple[int, Any]:
        url = urljoin(self.base_url + "/", path.lstrip("/"))
        if params:
            url = f"{url}?{urlencode(params)}"
        headers = {
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
        }
        if content_type:
            headers["Content-Type"] = content_type
        if extra_headers:
            headers.update(extra_headers)
        req = Request(url, data=data, headers=headers, method=method)
        try:
            with self.opener.open(req, timeout=120) as resp:
                body = resp.read()
                status = resp.status
        except HTTPError as exc:
            body = exc.read()
            status = exc.code
        if not body:
            return status, None
        text = body.decode("utf-8", errors="replace")
        try:
            return status, json.loads(text)
        except json.JSONDecodeError:
            return status, text

    def login(self) -> dict[str, Any]:
        self.request("GET", "/login/auth")
        form = urlencode(
            {
                "username": self.username,
                "password": self.password,
                "remember-me": "on",
            }
        ).encode()
        status, payload = self.request(
            "POST",
            "/login/authenticate",
            data=form,
            content_type="application/x-www-form-urlencoded",
        )
        if status >= 400:
            raise SystemExit(f"login failed ({status}): {payload}")
        status, user = self.request("GET", "/user/current.json")
        if status != 200 or not isinstance(user, dict):
            raise SystemExit(f"not logged in ({status}): {user}")
        return user.get("user") or user

    def paged(self, path: str, extra: dict[str, Any] | None = None) -> list[Any]:
        rows: list[Any] = []
        offset = 0
        while True:
            params = {"max": PAGE_SIZE, "offset": offset}
            if extra:
                params.update(extra)
            status, payload = self.request("GET", path, params=params)
            if status != 200:
                raise SystemExit(f"{path} failed ({status}): {payload}")
            if isinstance(payload, list):
                batch = payload
                total = len(payload) if offset == 0 else offset + len(payload)
            elif isinstance(payload, dict):
                batch = payload.get("list") or payload.get("items") or []
                total = int(payload.get("total") or len(batch))
            else:
                raise SystemExit(f"unexpected {path} payload: {type(payload)}")
            rows.extend(batch)
            offset += len(batch)
            if offset >= total or not batch:
                break
        return rows


def connect() -> Streama:
    env: dict[str, str] = {}
    env_file = os.environ.get("HOLIDAY_HIGHLIGHTS_ENV")
    if env_file:
        env.update(load_env_file(Path(env_file)))
    else:
        local_env = repo_root() / ".env"
        if local_env.is_file():
            env.update(load_env_file(local_env))
    env.update({key: value for key, value in os.environ.items() if value})
    raw_base = (env.get("STREAMA_URL") or "").strip()
    if raw_base and "docker.internal" not in raw_base:
        base = raw_base
    else:
        base = "http://127.0.0.1:8080"
    username = env.get("STREAMA_USERNAME")
    password = env.get("STREAMA_PASSWORD")
    if not username or not password:
        raise SystemExit("missing STREAMA_USERNAME / STREAMA_PASSWORD")
    print(f"streama base={base} user={username}")
    client = Streama(base, username, password)
    client.login()
    return client


def iter_files(media: dict[str, Any]) -> list[dict[str, Any]]:
    files = media.get("files") or media.get("videoFiles") or []
    if isinstance(files, list):
        return [f for f in files if isinstance(f, dict)]
    return []


def is_video_file(name: str) -> bool:
    suffix = Path(name).suffix.lower()
    if suffix in SUBTITLE_EXTS:
        return False
    return suffix in VIDEO_EXTS or not suffix


def file_name(file_row: dict[str, Any]) -> str:
    return (
        file_row.get("originalFilename")
        or Path(file_row.get("localFile") or "").name
        or ""
    )


def has_video(media: dict[str, Any]) -> bool:
    return any(is_video_file(file_name(f)) for f in iter_files(media))


def highlight_restore_row(item: dict[str, Any]) -> dict[str, Any]:
    media = item.get("media") or item.get("movie") or item.get("tvShow") or {}
    media_type = "movie"
    if item.get("tvShow"):
        media_type = "tvShow"
    elif item.get("movie"):
        media_type = "movie"
    elif item.get("genericVideo"):
        media_type = "genericVideo"
    return {
        "notificationId": item.get("id"),
        "description": item.get("description"),
        "mediaType": media_type,
        "mediaId": media.get("id"),
        "videoToPlayId": item.get("videoToPlayId"),
        "title": media.get("title") or media.get("name"),
    }


def list_highlights(client: Streama) -> list[dict[str, Any]]:
    status, raw = client.request("GET", "/notificationQueue/listNewReleases.json")
    if status != 200 or not isinstance(raw, list):
        raise SystemExit(f"listNewReleases failed ({status}): {raw}")
    return [item for item in raw if isinstance(item, dict)]


def backup_highlights(client: Streama, dest: Path) -> dict[str, Any]:
    raw = list_highlights(client)
    payload = {
        "backedUpAt": date.today().isoformat(),
        "count": len(raw),
        "raw": raw,
        "restore": [highlight_restore_row(item) for item in raw],
    }
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    return payload


def delete_highlights(client: Streama, items: list[dict[str, Any]]) -> int:
    deleted = 0
    for item in items:
        hid = item.get("id") or item.get("notificationId")
        if hid is None:
            continue
        status, payload = client.request(
            "DELETE", "/notificationQueue/delete.json", params={"id": hid}
        )
        if status in (200, 204):
            deleted += 1
        else:
            print(f"delete {hid} failed ({status}): {payload}", file=sys.stderr)
    return deleted


def create_highlights(
    client: Streama, rows: list[dict[str, Any]], description: str | None = None
) -> dict[str, int]:
    counts = {"created": 0, "already": 0, "failed": 0}
    for item in rows:
        body: dict[str, Any] = {
            "mediaId": item["mediaId"],
            "mediaType": item["mediaType"],
            "description": description if description is not None else item.get("description"),
        }
        play_id = item.get("videoToPlayId")
        if item["mediaType"] == "tvShow" and play_id:
            body["videoToPlay"] = {"id": play_id}
        status, payload = client.request(
            "POST",
            "/notificationQueue/highlightOnDashboard.json",
            data=json.dumps(body).encode(),
            content_type="application/json",
        )
        if status in (200, 201):
            counts["created"] += 1
        elif status == 409:
            counts["already"] += 1
        else:
            counts["failed"] += 1
            print(
                f"highlight failed ({status}) {item.get('title')}: {payload}",
                file=sys.stderr,
            )
    return counts


def match_blob(title: str, filenames: list[str], season: dict[str, Any]) -> int | None:
    blob = norm_title(" ".join([title] + filenames))
    for pat in compile_pats(season.get("exclude")):
        if pat.search(blob):
            return None
    for pat in compile_pats(season.get("priority_patterns")):
        if pat.search(blob):
            return 0
    for pat in compile_pats(season.get("patterns")):
        if pat.search(blob):
            return 1
    return None


def select_season_media(
    movies: list[dict[str, Any]],
    generics: list[dict[str, Any]],
    season: dict[str, Any],
    limit: int,
) -> list[dict[str, Any]]:
    candidates: list[tuple[int, dict[str, Any]]] = []
    seen: set[tuple[str, Any]] = set()
    seen_title: set[str] = set()
    for media_type, rows in (("movie", movies), ("genericVideo", generics)):
        for media in rows:
            if media.get("deleted") or not has_video(media):
                continue
            title = media.get("title") or media.get("name") or ""
            names = [file_name(f) for f in iter_files(media)]
            rank = match_blob(title, names, season)
            if rank is None:
                continue
            media_id = media.get("id")
            key = (media_type, media_id)
            if key in seen:
                continue
            year = ""
            release = str(media.get("release_date") or "")
            year_m = re.search(r"(19|20)\d{2}", release) or re.search(
                r"(19|20)\d{2}", title
            )
            if year_m:
                year = year_m.group(0)
            title_key = f"{norm_title(title)} {year}".strip()
            if title_key in seen_title:
                continue
            seen.add(key)
            seen_title.add(title_key)
            candidates.append(
                (
                    rank,
                    {
                        "title": title,
                        "mediaType": media_type,
                        "mediaId": media_id,
                        "videoToPlayId": media_id,
                    },
                )
            )
    candidates.sort(key=lambda item: item[0])
    return [row for _, row in candidates[:limit]]


def read_state() -> dict[str, Any]:
    path = data_dir() / "state.json"
    if not path.is_file():
        return {"active": None, "backup": None, "logoFileIds": {}}
    return json.loads(path.read_text())


def write_state(state: dict[str, Any]) -> None:
    path = data_dir() / "state.json"
    path.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n")


def current_logo_value(client: Streama) -> tuple[dict[str, Any] | None, str | None]:
    status, settings = client.request("GET", "/settings/index.json")
    if status != 200:
        raise SystemExit(f"settings failed ({status}): {settings}")
    rows = settings if isinstance(settings, list) else []
    for row in rows:
        if isinstance(row, dict) and row.get("name") == "logo":
            return row, row.get("value")
    return None, None


def parse_upload_id(value: str | None) -> int | None:
    if not value or not str(value).startswith("upload:"):
        return None
    try:
        return int(str(value).split(":", 1)[1])
    except ValueError:
        return None


def upload_logo(client: Streama, png: Path) -> int:
    boundary = "----HolidayHighlights" + os.urandom(8).hex()
    filename = png.name
    payload = png.read_bytes()
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        "Content-Type: image/png\r\n\r\n"
    ).encode() + payload + f"\r\n--{boundary}--\r\n".encode()
    status, result = client.request(
        "POST",
        "/file/upload.json",
        data=body,
        content_type=f"multipart/form-data; boundary={boundary}",
        params={"isPublic": "true"},
    )
    if status not in (200, 201) or not isinstance(result, dict) or not result.get("id"):
        raise SystemExit(f"logo upload failed ({status}): {result}")
    return int(result["id"])


def set_logo(client: Streama, file_id: int) -> None:
    setting, _ = current_logo_value(client)
    if not setting or not setting.get("id"):
        raise SystemExit("logo setting not found")
    updated = dict(setting)
    updated["value"] = f"upload:{file_id}"
    status, payload = client.request(
        "POST",
        "/settings/updateMultiple.json",
        data=json.dumps([updated]).encode(),
        content_type="application/json",
    )
    if status not in (200, 201):
        raise SystemExit(f"logo update failed ({status}): {payload}")


def ensure_logo(
    client: Streama,
    state: dict[str, Any],
    key: str,
    png: Path | None,
    *,
    dry_run: bool,
) -> int | None:
    ids = state.setdefault("logoFileIds", {})
    cached = ids.get(key)
    if cached:
        file_id = int(cached)
    elif png and png.is_file():
        if dry_run:
            print(f"dry-run: would upload {png.name} as {key}")
            return None
        file_id = upload_logo(client, png)
        ids[key] = file_id
    else:
        return parse_upload_id(current_logo_value(client)[1])
    _, current = current_logo_value(client)
    if parse_upload_id(current) == file_id:
        return file_id
    if dry_run:
        print(f"dry-run: would set logo upload:{file_id} ({key})")
        return file_id
    set_logo(client, file_id)
    print(f"logo set to upload:{file_id} ({key})")
    return file_id


def season_logo_key(cfg: dict[str, Any], season_name: str | None) -> str:
    if not season_name:
        return "default"
    logo = (cfg["seasons"].get(season_name) or {}).get("logo")
    return season_name if logo else "default"


def logo_png(cfg: dict[str, Any], key: str) -> Path | None:
    if key == "default":
        name = cfg.get("default_logo")
    else:
        name = (cfg["seasons"].get(key) or {}).get("logo")
    if not name:
        return None
    path = logos_dir() / name
    return path if path.is_file() else None


def apply_season(
    client: Streama,
    cfg: dict[str, Any],
    season_name: str,
    state: dict[str, Any],
    *,
    dry_run: bool,
    already_backed_up: bool,
) -> None:
    season = cfg["seasons"][season_name]
    limit = int(cfg.get("max_highlights") or 85)
    print(f"loading library for {season_name}…")
    movies = client.paged("/movie/index.json")
    generics = client.paged("/genericVideo/index.json")
    matched = select_season_media(movies, generics, season, limit)
    print(f"matched {len(matched)} titles (cap {limit})")
    if dry_run:
        for row in matched[:15]:
            print(f"  - {row['title']}")
        if len(matched) > 15:
            print(f"  … {len(matched) - 15} more")
        return
    if not already_backed_up:
        backup_path = data_dir() / f"highlights-backup-{season_name}-{date.today().isoformat()}.json"
        backup_highlights(client, backup_path)
        state["backup"] = str(backup_path)
        print(f"backed up highlights to {backup_path}")
    current = list_highlights(client)
    deleted = delete_highlights(client, current)
    counts = create_highlights(client, matched, season["description"])
    print(f"deleted {deleted}; create {counts}")
    ensure_logo(
        client,
        state,
        season_logo_key(cfg, season_name),
        logo_png(cfg, season_logo_key(cfg, season_name)),
        dry_run=False,
    )
    state["active"] = season_name
    write_state(state)


def restore_backup(
    client: Streama,
    cfg: dict[str, Any],
    state: dict[str, Any],
    *,
    dry_run: bool,
) -> None:
    backup = state.get("backup")
    if not backup:
        raise SystemExit("no backup path in state.json")
    path = Path(backup)
    if not path.is_file():
        raise SystemExit(f"backup missing: {path}")
    payload = json.loads(path.read_text())
    restore = payload.get("restore") or []
    print(f"restore {len(restore)} highlights from {path}")
    if dry_run:
        return
    current = list_highlights(client)
    deleted = delete_highlights(client, current)
    counts = create_highlights(client, restore)
    print(f"deleted {deleted}; restore {counts}")
    ensure_logo(client, state, "default", logo_png(cfg, "default"), dry_run=False)
    state["active"] = None
    write_state(state)


def seed_october(client: Streama, cfg: dict[str, Any], state: dict[str, Any], *, dry_run: bool) -> None:
    src = seed_backup_path()
    if not src.is_file():
        raise SystemExit(f"missing seed backup: {src}")
    dest = data_dir() / src.name
    if dry_run:
        print(f"dry-run: would seed {dest} and mark {SEED_SEASON} active")
        return
    dest.write_bytes(src.read_bytes())
    _, value = current_logo_value(client)
    logo_id = parse_upload_id(value)
    ids = state.setdefault("logoFileIds", {})
    if logo_id:
        ids[SEED_SEASON] = logo_id
    state["active"] = SEED_SEASON
    state["backup"] = str(dest)
    write_state(state)
    print(f"seeded {SEED_SEASON} from {dest} (logo {value}); live highlights left untouched")


def cmd_reconcile(args: argparse.Namespace) -> int:
    cfg = load_config()
    today = today_in_zone(cfg.get("timezone") or "America/New_York")
    wanted = season_for_day(cfg, today)
    state = read_state()
    client = connect()
    print(f"today={today} wanted={wanted} active={state.get('active')}")

    if args.force_restore:
        restore_backup(client, cfg, state, dry_run=args.dry_run)
        return 0
    if args.force_apply:
        apply_season(
            client,
            cfg,
            args.force_apply,
            state,
            dry_run=args.dry_run,
            already_backed_up=False,
        )
        return 0

    if wanted == SEED_SEASON and state.get("active") != SEED_SEASON and seed_backup_path().is_file():
        seed_october(client, cfg, state, dry_run=args.dry_run)
        return 0

    if wanted and state.get("active") == wanted:
        print("season already active")
        return 0
    if wanted and state.get("active") != wanted:
        apply_season(
            client, cfg, wanted, state, dry_run=args.dry_run, already_backed_up=False
        )
        return 0
    if not wanted and state.get("active"):
        restore_backup(client, cfg, state, dry_run=args.dry_run)
        return 0
    print("idle")
    return 0


def cmd_status(_: argparse.Namespace) -> int:
    cfg = load_config()
    today = today_in_zone(cfg.get("timezone") or "America/New_York")
    state = read_state()
    print(
        json.dumps(
            {
                "today": today.isoformat(),
                "wanted": season_for_day(cfg, today),
                "state": state,
            },
            indent=2,
        )
    )
    return 0


def cmd_seed(args: argparse.Namespace) -> int:
    cfg = load_config()
    state = read_state()
    client = connect()
    seed_october(client, cfg, state, dry_run=args.dry_run)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    rec = sub.add_parser("reconcile", help="apply or restore based on today's date")
    rec.add_argument("--dry-run", action="store_true")
    rec.add_argument("--force-apply", choices=["halloween", "christmas", "valentines", "july4"])
    rec.add_argument("--force-restore", action="store_true")
    rec.set_defaults(func=cmd_reconcile)

    st = sub.add_parser("status", help="print active season and backup path")
    st.set_defaults(func=cmd_status)

    sd = sub.add_parser("seed", help="record an already-applied season without swapping")
    sd.add_argument("--dry-run", action="store_true")
    sd.set_defaults(func=cmd_seed)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
