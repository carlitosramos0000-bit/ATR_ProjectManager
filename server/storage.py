# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import os
import re
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
