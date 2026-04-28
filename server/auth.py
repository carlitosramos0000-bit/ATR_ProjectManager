# -*- coding: utf-8 -*-
from __future__ import annotations

import hashlib
import re
import secrets
from datetime import datetime, timedelta
from typing import Any

from .storage import CONFIG_DIR, read_json, write_json


USERS_PATH = CONFIG_DIR / "users.json"
DEFAULT_ADMIN_USERNAME = "ramoscv"
DEFAULT_ADMIN_PASSWORD = "Logica!1"
DEFAULT_ADMIN_DISPLAY_NAME = "Carlos Ramos"
SESSION_COOKIE_NAME = "ep_session"
SESSION_DURATION = timedelta(hours=12)
USERNAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{2,31}$")
PASSWORD_MIN_LENGTH = 8

_SESSIONS: dict[str, dict[str, Any]] = {}


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _normalize_username(value: str) -> str:
    return re.sub(r"\s+", "", str(value or "").strip().lower())


def _hash_password(password: str, salt: bytes | None = None, iterations: int = 240_000) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"


def _verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, raw_iterations, salt_hex, digest_hex = str(stored_hash or "").split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(raw_iterations)
        expected = bytes.fromhex(digest_hex)
        salt = bytes.fromhex(salt_hex)
    except (TypeError, ValueError):
        return False

    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return secrets.compare_digest(actual, expected)


def _sanitize_user_record(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "username": _normalize_username(record.get("username", "")),
        "display_name": str(record.get("display_name") or record.get("username") or "").strip(),
        "is_admin": bool(record.get("is_admin")),
        "created_at": str(record.get("created_at") or ""),
        "last_login_at": str(record.get("last_login_at") or ""),
    }


def _normalize_store(store: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    now = _now_iso()
    users: list[dict[str, Any]] = []
    changed = False

    for raw_user in store.get("users", []):
        username = _normalize_username(raw_user.get("username", ""))
        password_hash = str(raw_user.get("password_hash") or "").strip()
        if not username or not password_hash:
            changed = True
            continue

        users.append(
            {
                "username": username,
                "display_name": str(raw_user.get("display_name") or username).strip(),
                "is_admin": bool(raw_user.get("is_admin")),
                "password_hash": password_hash,
                "created_at": str(raw_user.get("created_at") or now),
                "last_login_at": str(raw_user.get("last_login_at") or ""),
            }
        )

    if not any(user["username"] == DEFAULT_ADMIN_USERNAME for user in users):
        users.append(
            {
                "username": DEFAULT_ADMIN_USERNAME,
                "display_name": DEFAULT_ADMIN_DISPLAY_NAME,
                "is_admin": True,
                "password_hash": _hash_password(DEFAULT_ADMIN_PASSWORD),
                "created_at": now,
                "last_login_at": "",
            }
        )
        changed = True

    normalized_store = {"users": sorted(users, key=lambda item: (not item["is_admin"], item["username"]))}
    return normalized_store, changed


def ensure_user_store() -> dict[str, Any]:
    raw_store = read_json(USERS_PATH, {"users": []})
    normalized_store, changed = _normalize_store(raw_store if isinstance(raw_store, dict) else {"users": []})
    if changed or not USERS_PATH.exists():
        write_json(USERS_PATH, normalized_store)
    return normalized_store


def list_users() -> list[dict[str, Any]]:
    store = ensure_user_store()
    return [_sanitize_user_record(user) for user in store.get("users", [])]


def authenticate_user(username: str, password: str) -> dict[str, Any] | None:
    normalized_username = _normalize_username(username)
    if not normalized_username or not password:
        return None

    store = ensure_user_store()
    users = store.get("users", [])
    for user in users:
        if user["username"] != normalized_username:
            continue
        if not _verify_password(password, user.get("password_hash", "")):
            return None
        user["last_login_at"] = _now_iso()
        write_json(USERS_PATH, store)
        return _sanitize_user_record(user)
    return None


def create_user(username: str, password: str, display_name: str = "", is_admin: bool = False) -> dict[str, Any]:
    normalized_username = _normalize_username(username)
    if not USERNAME_PATTERN.fullmatch(normalized_username):
        raise ValueError("O user deve ter entre 3 e 32 caracteres e usar apenas letras, numeros, ponto, underscore ou hifen.")
    if len(str(password or "")) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"A password deve ter pelo menos {PASSWORD_MIN_LENGTH} caracteres.")

    store = ensure_user_store()
    if any(user["username"] == normalized_username for user in store.get("users", [])):
        raise ValueError("Ja existe um utilizador com esse user.")

    user = {
        "username": normalized_username,
        "display_name": str(display_name or normalized_username).strip() or normalized_username,
        "is_admin": bool(is_admin),
        "password_hash": _hash_password(password),
        "created_at": _now_iso(),
        "last_login_at": "",
    }
    store["users"].append(user)
    store["users"] = sorted(store["users"], key=lambda item: (not item["is_admin"], item["username"]))
    write_json(USERS_PATH, store)
    return _sanitize_user_record(user)


def create_session(user: dict[str, Any]) -> str:
    token = secrets.token_urlsafe(32)
    _SESSIONS[token] = {
        "user": _sanitize_user_record(user),
        "expires_at": datetime.now() + SESSION_DURATION,
    }
    return token


def get_session_user(token: str) -> dict[str, Any] | None:
    if not token:
        return None
    session = _SESSIONS.get(token)
    if not session:
        return None
    if session["expires_at"] <= datetime.now():
        _SESSIONS.pop(token, None)
        return None
    return dict(session["user"])


def revoke_session(token: str) -> None:
    if token:
        _SESSIONS.pop(token, None)
