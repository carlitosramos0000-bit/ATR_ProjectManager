# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import subprocess
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from .ai_service import build_steering_payload
from .storage import BASE_DIR, EXPORTS_DIR, slugify


SCRIPT_PATH = BASE_DIR / "server" / "generate_steering.ps1"


def export_steering_deck(project: dict[str, Any], prompt: str, config: dict[str, Any]) -> tuple[Path, str | None]:
    template_path = Path(str(config.get("steering_template_path") or "").strip())
    if not template_path.exists():
        raise FileNotFoundError(f"Template de steering nao encontrado: {template_path}")

    payload, warning = build_steering_payload(project, prompt, config)
    project_slug = slugify(project.get("project", "projeto"))
    prefix = slugify(str(config.get("export_prefix") or "steering-executivo"))
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_path = EXPORTS_DIR / f"{project_slug}-{prefix}-{stamp}.pptx"

    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        payload_path = Path(handle.name)

    command = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(SCRIPT_PATH),
        "-TemplatePath",
        str(template_path),
        "-OutputPath",
        str(output_path),
        "-PayloadPath",
        str(payload_path),
    ]

    last_error = "Sem detalhe adicional."
    try:
        for attempt in range(1, 5):
            result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="ignore", timeout=300)
            if result.returncode == 0:
                break

            stderr = result.stderr.strip() or result.stdout.strip() or "Sem detalhe adicional."
            last_error = stderr
            if "rejected by callee" in stderr.lower() and attempt < 4:
                time.sleep(1.5 * attempt)
                continue
            break
    finally:
        payload_path.unlink(missing_ok=True)

    if result.returncode != 0:
        if "rejected by callee" in last_error.lower():
            raise RuntimeError(
                "Falha na geracao do steering PPTX porque o PowerPoint local estava ocupado. "
                "Fecha janelas do PowerPoint e tenta novamente. "
                f"Detalhe tecnico: {last_error}"
            )
        raise RuntimeError(f"Falha na geracao do steering PPTX: {last_error}")

    return output_path, warning
