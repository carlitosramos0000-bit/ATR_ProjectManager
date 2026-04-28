# -*- coding: utf-8 -*-
from __future__ import annotations

import smtplib
import threading
import time
from datetime import date, datetime, timedelta
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

from .project_parser import parse_date
from .storage import CONFIG_DIR, PROJECTS_DIR, read_json, write_json


ALERTS_PATH = CONFIG_DIR / "alerts.json"
ALERT_LOG_PATH = CONFIG_DIR / "sent_alerts.json"


def load_alert_config() -> dict[str, Any]:
    return read_json(
        ALERTS_PATH,
        {
            "enabled": False,
            "smtp_host": "",
            "smtp_port": 587,
            "smtp_username": "",
            "smtp_password": "",
            "sender": "",
            "recipients": [],
            "days_before_deadline": 7,
            "project_slug": "",
        },
    )


def save_alert_config(payload: dict[str, Any]) -> dict[str, Any]:
    existing = load_alert_config()
    existing.update(payload)
    write_json(ALERTS_PATH, existing)
    return existing


def load_sent_log() -> dict[str, str]:
    return read_json(ALERT_LOG_PATH, {})


def due_tasks(project: dict, days_before_deadline: int) -> list[dict[str, Any]]:
    today = date.today()
    upcoming_limit = today + timedelta(days=days_before_deadline)
    items = []
    for task in project.get("tasks", []):
        status = (task.get("status") or "").lower()
        if status in {"closed", "done", "resolved", "completed"}:
            continue
        end = parse_date(task.get("end"))
        if not end:
            continue
        if today <= end <= upcoming_limit:
            items.append(task)
    return items


def send_deadline_alerts(config: dict[str, Any], project: dict) -> dict[str, Any]:
    items = due_tasks(project, int(config.get("days_before_deadline", 7)))
    if not items:
        return {"sent": 0, "message": "Nenhuma acao perto do deadline."}

    recipients = [email.strip() for email in config.get("recipients", []) if email.strip()]
    if not recipients:
        return {"sent": 0, "message": "Sem destinatarios configurados."}

    sent_log = load_sent_log()
    today_key = datetime.now().strftime("%Y-%m-%d")

    lines = [
        f"<li><strong>{task['key']}</strong> - {task['title']}<br>Status: {task['status']}<br>Deadline: {task.get('end') or 'n/d'}</li>"
        for task in items
        if sent_log.get(f"{today_key}:{task['key']}") != today_key
    ]
    if not lines:
        return {"sent": 0, "message": "Alertas de hoje ja enviados para estas acoes."}

    html = (
        f"<h2>Alertas de deadline - {project.get('project')}</h2>"
        "<p>As seguintes acoes estao perto do prazo de conclusao:</p>"
        f"<ul>{''.join(lines)}</ul>"
    )
    message = MIMEText(html, "html", "utf-8")
    message["Subject"] = f"[ATR PM] Deadlines proximos - {project.get('project')}"
    message["From"] = config.get("sender", "")
    message["To"] = ", ".join(recipients)

    with smtplib.SMTP(config["smtp_host"], int(config.get("smtp_port", 587)), timeout=30) as smtp:
        smtp.starttls()
        if config.get("smtp_username"):
            smtp.login(config["smtp_username"], config.get("smtp_password", ""))
        smtp.sendmail(config.get("sender", ""), recipients, message.as_string())

    for task in items:
        sent_log[f"{today_key}:{task['key']}"] = today_key
    write_json(ALERT_LOG_PATH, sent_log)
    return {"sent": len(lines), "message": f"Foram enviados {len(lines)} alertas."}


def load_project(project_slug: str) -> dict[str, Any] | None:
    path = PROJECTS_DIR / f"{project_slug}.json"
    if not path.exists():
        return None
    return read_json(path, {})


def alert_worker(stop_event: threading.Event) -> None:
    while not stop_event.is_set():
        try:
            config = load_alert_config()
            if config.get("enabled") and config.get("project_slug"):
                project = load_project(config["project_slug"])
                if project:
                    send_deadline_alerts(config, project)
        except Exception:
            pass
        stop_event.wait(3600)

