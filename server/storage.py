# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_ROOT = Path(os.getenv("EP_STORAGE_DIR") or "").expanduser() if os.getenv("EP_STORAGE_DIR") else BASE_DIR
DATA_DIR = STORAGE_ROOT / "data"
PROJECTS_DIR = DATA_DIR / "projects"
CONFIG_DIR = DATA_DIR / "config"
WORKBOOKS_DIR = DATA_DIR / "workbooks"
EXPORTS_DIR = STORAGE_ROOT / "exports"


def ensure_dirs() -> None:
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    WORKBOOKS_DIR.mkdir(parents=True, exist_ok=True)
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)


def slugify(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return normalized or "project"


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    for encoding in ("utf-8", "utf-8-sig"):
        try:
            return json.loads(path.read_text(encoding=encoding))
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
    return default


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def storage_status() -> dict[str, Any]:
    ensure_dirs()
    users_path = CONFIG_DIR / "users.json"
    probe_path = CONFIG_DIR / "_storage_probe.json"
    probe_payload = {"checked_at": datetime.now().isoformat(timespec="seconds")}
    writable = False
    probe_error = ""
    try:
        write_json(probe_path, probe_payload)
        writable = read_json(probe_path, {}) == probe_payload
    except Exception as exc:
        probe_error = str(exc)

    on_render = bool(os.getenv("RENDER") or os.getenv("RENDER_SERVICE_ID") or os.getenv("RENDER_EXTERNAL_URL"))
    configured_dir = os.getenv("EP_STORAGE_DIR") or ""
    storage_root_text = str(STORAGE_ROOT)
    looks_like_render_persistent_mount = storage_root_text.replace("\\", "/").startswith("/opt/render/project/src/")

    return {
        "on_render": on_render,
        "storage_root": storage_root_text,
        "ep_storage_dir": configured_dir,
        "persistent_storage_configured": bool(configured_dir),
        "looks_like_render_persistent_mount": looks_like_render_persistent_mount,
        "writable": writable,
        "probe_error": probe_error,
        "probe_path": str(probe_path),
        "users_file": str(users_path),
        "users_file_exists": users_path.exists(),
        "users_file_size": users_path.stat().st_size if users_path.exists() else 0,
        "users_file_updated_at": datetime.fromtimestamp(users_path.stat().st_mtime).isoformat(timespec="seconds") if users_path.exists() else "",
        "projects_dir": str(PROJECTS_DIR),
        "workbooks_dir": str(WORKBOOKS_DIR),
        "exports_dir": str(EXPORTS_DIR),
        "projects_count": len(list(PROJECTS_DIR.glob("*.json"))),
    }
