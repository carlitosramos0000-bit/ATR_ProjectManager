# -*- coding: utf-8 -*-
from __future__ import annotations

import cgi
import json
import mimetypes
import os
import re
import threading
from datetime import datetime
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .ai_service import chat_about_project, load_ai_config, save_ai_config
from .alerts import alert_worker, load_alert_config, save_alert_config, send_deadline_alerts
from .auth import (
    SESSION_COOKIE_NAME,
    authenticate_user,
    create_session,
    create_user,
    ensure_user_store,
    get_session_user,
    list_users,
    revoke_session,
)
from .exporter import export_project
from .project_parser import parse_jira_csv, parse_reference_workbook, refresh_project
from .steering_deck import export_steering_deck
from .storage import BASE_DIR, CONFIG_DIR, EXPORTS_DIR, PROJECTS_DIR, WORKBOOKS_DIR, ensure_dirs, read_json, slugify, write_json


STATIC_DIR = BASE_DIR / "static"
WORKSPACE_HISTORY_PATH = CONFIG_DIR / "workspace-history.json"
OPENAI_SECRET_PATTERN = re.compile(r"sk-[A-Za-z0-9_-]{20,}")


def redact_secrets(text: str) -> str:
    return OPENAI_SECRET_PATTERN.sub("[OPENAI_API_KEY_REMOVED]", str(text or ""))


def sync_workbook_snapshot(project: dict, preferred_path: Path, slug: str) -> tuple[Path, str | None]:
    try:
        export_project(project, preferred_path)
        return preferred_path, None
    except PermissionError:
        fallback_path = WORKBOOKS_DIR / f"{slug}-autosave.xlsx"
        export_project(project, fallback_path)
        return fallback_path, (
            "As alteracoes ficaram guardadas, mas o workbook principal estava bloqueado. "
            f"A copia atualizada foi gravada em {fallback_path.name}."
        )
    except Exception as exc:
        return preferred_path, (
            "As alteracoes ficaram guardadas no projeto, mas a sincronizacao automatica do Excel falhou: "
            f"{exc}"
        )


def sanitize_workspace_history(history: list[dict]) -> list[dict]:
    sanitized: list[dict] = []
    for item in history or []:
        role = str(item.get("role") or "").strip().lower()
        content = redact_secrets(str(item.get("content") or "").strip())
        if role not in {"user", "assistant"} or not content:
            continue
        sanitized.append({"role": role, "content": content})
    return sanitized[-80:]


def load_global_workspace_history() -> list[dict]:
    payload = read_json(WORKSPACE_HISTORY_PATH, {"messages": []})
    return sanitize_workspace_history(payload.get("messages", []))


def save_global_workspace_history(history: list[dict]) -> list[dict]:
    sanitized = sanitize_workspace_history(history)
    write_json(WORKSPACE_HISTORY_PATH, {"messages": sanitized})
    return sanitized


def sanitize_project_workspace_history(project: dict, path: Path | None = None) -> dict:
    history = sanitize_workspace_history(project.get("workspace_history", []))
    if history != (project.get("workspace_history", []) or []):
        project["workspace_history"] = history
        if path is not None:
            write_json(path, project)
    return project


class ProjectManagerHandler(BaseHTTPRequestHandler):
    server_version = "EvolucaoDeProjeto/1.0"

    def end_headers(self) -> None:
        origin = self.headers.get("Origin", "")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Vary", "Origin")
        else:
            self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def session_cookie_value(self, token: str = "", clear: bool = False) -> str:
        if clear:
            return f"{SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
        return f"{SESSION_COOKIE_NAME}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200"

    def current_session_token(self) -> str:
        cookie_header = self.headers.get("Cookie", "")
        if not cookie_header:
            return ""
        cookie = SimpleCookie()
        cookie.load(cookie_header)
        morsel = cookie.get(SESSION_COOKIE_NAME)
        return morsel.value if morsel else ""

    def current_user(self) -> dict | None:
        return get_session_user(self.current_session_token())

    def require_user(self) -> dict | None:
        user = self.current_user()
        if user:
            return user
        self.send_json({"error": "Sessao expirada ou inexistente. Inicia sessao para continuar."}, status=401)
        return None

    def require_admin(self) -> dict | None:
        user = self.require_user()
        if not user:
            return None
        if user.get("is_admin"):
            return user
        self.send_json({"error": "Apenas administradores podem aceder a esta configuracao."}, status=403)
        return None

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/auth/session":
            return self.handle_auth_session()
        if parsed.path == "/api/users":
            user = self.require_admin()
            if not user:
                return None
            return self.send_json({"users": list_users()})
        if parsed.path.startswith("/api/"):
            user = self.require_user()
            if not user:
                return None
        if parsed.path == "/api/projects":
            projects = []
            for path in sorted(PROJECTS_DIR.glob("*.json"), reverse=True):
                payload = read_json(path, {})
                projects.append(
                    {
                        "slug": path.stem,
                        "project": payload.get("project"),
                        "imported_at": payload.get("imported_at"),
                        "source_type": payload.get("source_type"),
                        "source_name": payload.get("source_name"),
                    }
                )
            return self.send_json({"projects": projects})
        if parsed.path == "/api/project":
            slug = parse_qs(parsed.query).get("slug", [""])[0]
            path = PROJECTS_DIR / f"{slug}.json"
            if not path.exists():
                return self.send_json({"error": "Projeto nao encontrado."}, status=404)
            project = sanitize_project_workspace_history(read_json(path, {}), path)
            return self.send_json(project)
        if parsed.path == "/api/alerts/config":
            if not user.get("is_admin"):
                return self.send_json({"error": "Apenas administradores podem aceder a esta configuracao."}, status=403)
            return self.send_json(load_alert_config())
        if parsed.path == "/api/ai/config":
            if not user.get("is_admin"):
                return self.send_json({"error": "Apenas administradores podem aceder a esta configuracao."}, status=403)
            return self.send_json(load_ai_config(include_secret=False))
        if parsed.path == "/api/ai/history":
            return self.handle_ai_history_get(parsed.query)
        if parsed.path.startswith("/exports/"):
            user = self.require_user()
            if not user:
                return None
            return self.serve_file(EXPORTS_DIR / Path(parsed.path).name)
        return self.serve_static(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/auth/login":
            return self.handle_auth_login()
        if parsed.path == "/api/auth/logout":
            return self.handle_auth_logout()
        if parsed.path == "/api/users":
            user = self.require_admin()
            if not user:
                return None
            return self.handle_user_create()
        if parsed.path in ("", "/", "/index.html"):
            return self.serve_static("/")
        if parsed.path.startswith("/api/"):
            user = self.require_user()
            if not user:
                return None
        if parsed.path == "/api/import":
            if not user.get("is_admin"):
                return self.send_json({"error": "Apenas administradores podem importar projetos."}, status=403)
            return self.handle_import()
        if parsed.path == "/api/export":
            return self.handle_export()
        if parsed.path == "/api/project/update":
            return self.handle_project_update(user)
        if parsed.path == "/api/alerts/config":
            if not user.get("is_admin"):
                return self.send_json({"error": "Apenas administradores podem alterar os alertas."}, status=403)
            payload = self.read_json()
            config = save_alert_config(payload)
            return self.send_json(config)
        if parsed.path == "/api/ai/config":
            if not user.get("is_admin"):
                return self.send_json({"error": "Apenas administradores podem alterar a configuracao GPT."}, status=403)
            payload = self.read_json()
            return self.send_json(save_ai_config(payload))
        if parsed.path == "/api/ai/history":
            return self.handle_ai_history_save()
        if parsed.path == "/api/ai/chat":
            return self.handle_ai_chat()
        if parsed.path == "/api/ai/export":
            return self.handle_ai_export()
        if parsed.path == "/api/alerts/test":
            if not user.get("is_admin"):
                return self.send_json({"error": "Apenas administradores podem testar os alertas."}, status=403)
            payload = self.read_json()
            slug = payload.get("project_slug", "")
            project = read_json(PROJECTS_DIR / f"{slug}.json", {})
            result = send_deadline_alerts(load_alert_config(), project) if project else {"sent": 0, "message": "Projeto nao encontrado."}
            return self.send_json(result)
        return self.send_json({"error": "Endpoint nao suportado."}, status=404)

    def handle_auth_session(self) -> None:
        user = self.current_user()
        if not user:
            return self.send_json({"authenticated": False}, status=401)
        return self.send_json({"authenticated": True, "user": user})

    def handle_auth_login(self) -> None:
        payload = self.read_json()
        username = str(payload.get("username") or "").strip()
        password = str(payload.get("password") or "")
        user = authenticate_user(username, password)
        if not user:
            return self.send_json({"error": "User ou password invalido."}, status=401)
        token = create_session(user)
        return self.send_json(
            {"authenticated": True, "user": user},
            headers={"Set-Cookie": self.session_cookie_value(token)},
        )

    def handle_auth_logout(self) -> None:
        revoke_session(self.current_session_token())
        return self.send_json(
            {"authenticated": False},
            headers={"Set-Cookie": self.session_cookie_value(clear=True)},
        )

    def handle_user_create(self) -> None:
        payload = self.read_json()
        try:
            user = create_user(
                username=payload.get("username", ""),
                password=payload.get("password", ""),
                display_name=payload.get("display_name", ""),
                is_admin=False,
            )
        except ValueError as exc:
            return self.send_json({"error": str(exc)}, status=400)
        return self.send_json({"user": user, "users": list_users()})

    def handle_import(self) -> None:
        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": self.headers.get("Content-Type", ""),
                "CONTENT_LENGTH": self.headers.get("Content-Length", "0"),
            },
        )
        uploaded = form["file"] if "file" in form else None
        source_type = form.getvalue("sourceType", "excel")
        project_name = form.getvalue("projectName", "")
        if uploaded is None or getattr(uploaded, "file", None) is None:
            return self.send_json({"error": "Ficheiro nao fornecido."}, status=400)

        file_bytes = uploaded.file.read()
        filename = uploaded.filename or "project"
        try:
            if source_type == "csv":
                project = parse_jira_csv(file_bytes, filename, project_name or None)
            else:
                project = parse_reference_workbook(file_bytes, filename, project_name or None)
        except Exception as exc:
            return self.send_json({"error": f"Falha na importacao: {exc}"}, status=400)

        slug = slugify(project["project"])
        project["slug"] = slug
        workbook_path = WORKBOOKS_DIR / f"{slug}.xlsx"
        project["workbook_path"] = str(workbook_path)
        if source_type == "excel":
            workbook_path.write_bytes(file_bytes)
        else:
            export_project(project, workbook_path)
        write_json(PROJECTS_DIR / f"{slug}.json", project)
        return self.send_json(project)

    def handle_project_update(self, user: dict) -> None:
        payload = self.read_json()
        slug = payload.get("project_slug", "")
        path = PROJECTS_DIR / f"{slug}.json"
        if not path.exists():
            return self.send_json({"error": "Projeto nao encontrado."}, status=404)
        existing = read_json(path, {})
        next_settings = payload.get("settings", existing.get("settings", {})) if user.get("is_admin") else existing.get("settings", {})
        updated = {
            **existing,
            "project": payload.get("project", existing.get("project")),
            "tasks": payload.get("tasks", existing.get("tasks", [])),
            "settings": next_settings,
        }
        project = refresh_project(updated)
        project["workspace_history"] = sanitize_workspace_history(existing.get("workspace_history", []))
        workbook_path = Path(project.get("workbook_path") or (WORKBOOKS_DIR / f"{slug}.xlsx"))
        synced_workbook_path, warning = sync_workbook_snapshot(project, workbook_path, slug)
        project["workbook_path"] = str(synced_workbook_path)
        if warning:
            project["sync_warning"] = warning
        else:
            project.pop("sync_warning", None)
        write_json(path, project)
        response_payload = dict(project)
        if warning:
            response_payload["warning"] = warning
        return self.send_json(response_payload)

    def handle_export(self) -> None:
        payload = self.read_json()
        slug = payload.get("project_slug", "")
        path = PROJECTS_DIR / f"{slug}.json"
        if not path.exists():
            return self.send_json({"error": "Projeto nao encontrado."}, status=404)
        project = read_json(path, {})
        workbook_path = Path(project.get("workbook_path") or (WORKBOOKS_DIR / f"{slug}.xlsx"))
        synced_workbook_path, warning = sync_workbook_snapshot(project, workbook_path, slug)
        project["workbook_path"] = str(synced_workbook_path)
        if warning:
            project["sync_warning"] = warning
        else:
            project.pop("sync_warning", None)
        try:
            export_path = export_project(project, EXPORTS_DIR / f"{slug}-gantt.xlsx")
        except Exception as exc:
            write_json(path, project)
            return self.send_json({"error": f"Falha na exportacao do Excel: {exc}"}, status=400)
        write_json(path, project)
        payload = {"file": f"/exports/{export_path.name}", "name": export_path.name}
        if warning:
            payload["warning"] = warning
        return self.send_json(payload)

    def handle_ai_chat(self) -> None:
        payload = self.read_json()
        slug = payload.get("project_slug", "")
        prompt = str(payload.get("prompt") or "").strip()
        if not prompt:
            return self.send_json({"error": "Escreve um pedido para enviar ao GPT."}, status=400)
        project = read_json(PROJECTS_DIR / f"{slug}.json", {}) if slug else None
        try:
            response = chat_about_project(project, prompt, payload.get("history", []), load_ai_config())
        except Exception as exc:
            return self.send_json({"error": f"Falha na resposta do GPT: {exc}"}, status=400)
        return self.send_json(response)

    def handle_ai_history_get(self, query: str) -> None:
        slug = parse_qs(query).get("slug", [""])[0]
        if slug:
            project_path = PROJECTS_DIR / f"{slug}.json"
            if not project_path.exists():
                return self.send_json({"error": "Projeto nao encontrado."}, status=404)
            project = read_json(project_path, {})
            return self.send_json({"messages": sanitize_workspace_history(project.get("workspace_history", []))})
        return self.send_json({"messages": load_global_workspace_history()})

    def handle_ai_history_save(self) -> None:
        payload = self.read_json()
        slug = str(payload.get("project_slug") or "").strip()
        history = sanitize_workspace_history(payload.get("messages", []))
        if slug:
            project_path = PROJECTS_DIR / f"{slug}.json"
            if not project_path.exists():
                return self.send_json({"error": "Projeto nao encontrado."}, status=404)
            project = read_json(project_path, {})
            project["workspace_history"] = history
            write_json(project_path, project)
            return self.send_json({"messages": history})
        return self.send_json({"messages": save_global_workspace_history(history)})

    def handle_ai_export(self) -> None:
        payload = self.read_json()
        slug = payload.get("project_slug", "")
        if not slug:
            return self.send_json({"error": "Projeto nao indicado para a exportacao AI."}, status=400)
        project_path = PROJECTS_DIR / f"{slug}.json"
        if not project_path.exists():
            return self.send_json({"error": "Projeto nao encontrado."}, status=404)

        project = read_json(project_path, {})
        export_kind = str(payload.get("kind") or "steering_pptx").strip()
        prompt = str(payload.get("prompt") or "").strip()
        config = load_ai_config()

        if export_kind != "steering_pptx":
            return self.send_json({"error": "Tipo de exportacao AI nao suportado."}, status=400)

        try:
            output_path, warning = export_steering_deck(project, prompt, config)
        except Exception as exc:
            return self.send_json({"error": f"Falha na geracao do ficheiro AI: {exc}"}, status=400)

        response_payload = {
            "file": f"/exports/{output_path.name}",
            "name": output_path.name,
            "kind": export_kind,
            "generated_at": datetime.now().isoformat(),
        }
        if warning:
            response_payload["warning"] = warning
        return self.send_json(response_payload)

    def serve_static(self, request_path: str) -> None:
        relative = "index.html" if request_path in ("/", "") else request_path.lstrip("/")
        target = STATIC_DIR / relative
        if not target.exists() or not target.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return
        self.serve_file(target)

    def serve_file(self, target: Path) -> None:
        if not target.exists():
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return
        content_type, _ = mimetypes.guess_type(str(target))
        if content_type and (content_type.startswith("text/") or "javascript" in content_type):
            content_type = f"{content_type}; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.end_headers()
        self.wfile.write(target.read_bytes())

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

    def send_json(self, payload: dict, status: int = 200, headers: dict[str, str] | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)


def run_server(host: str | None = None, port: int | None = None) -> None:
    ensure_dirs()
    ensure_user_store()
    stop_event = threading.Event()
    worker = threading.Thread(target=alert_worker, args=(stop_event,), daemon=True)
    worker.start()

    resolved_port = port or int(os.getenv("PORT", "8000"))
    default_host = "0.0.0.0" if os.getenv("PORT") else "127.0.0.1"
    resolved_host = host or os.getenv("HOST", default_host)

    httpd = ThreadingHTTPServer((resolved_host, resolved_port), ProjectManagerHandler)
    print(f"Evolucao de Projeto disponivel em http://{resolved_host}:{resolved_port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop_event.set()
        httpd.server_close()
