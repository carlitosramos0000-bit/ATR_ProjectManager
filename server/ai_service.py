# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime
from typing import Any

from .project_parser import repair_text
from .storage import CONFIG_DIR, read_json, write_json


AI_CONFIG_PATH = CONFIG_DIR / "ai.json"
OPENAI_ENV_VAR = "OPENAI_API_KEY"
DEFAULT_AI_CONFIG = {
    "api_key": "",
    "model": "gpt-5.4",
    "reasoning_effort": "xhigh",
    "steering_template_path": "C:/Users/ramoscv/OneDrive - CGI/BKP 20260304/Work/REN ATR/Gestão de projeto/20260323 - NOVO ATR STEERING_REN  -  v1 (CGI-REN).pptx",
    "export_prefix": "steering-executivo",
    "language": "pt-PT",
}
DONE_STATUSES = {"closed", "done", "resolved", "completed"}
BUG_PATTERN = re.compile(r"\bbug(?:\s|-)?fix(?:ing)?\b", re.IGNORECASE)
RETEST_PATTERN = re.compile(r"\bre[\s-]?(?:test(?:ing)?|teste)\b", re.IGNORECASE)
TEST_PATTERN = re.compile(r"\b(?:test(?:e|es|ing)?|qa|uat|pat)\b", re.IGNORECASE)


def _env_api_key() -> str:
    return str(os.getenv(OPENAI_ENV_VAR) or "").strip()


def _sanitize_persisted_ai_config(config: Any) -> tuple[dict[str, Any], bool]:
    if not isinstance(config, dict):
        return {}, False
    sanitized: dict[str, Any] = {}
    changed = False
    for key, value in config.items():
        if key == "api_key":
            changed = True
            continue
        sanitized[key] = value
    return sanitized, changed


def _client_safe_ai_config(config: dict[str, Any]) -> dict[str, Any]:
    return {
        **config,
        "api_key": "",
        "api_key_configured": bool(_env_api_key()),
        "api_key_source": "environment" if _env_api_key() else "missing",
    }


def load_ai_config(include_secret: bool = True) -> dict[str, Any]:
    config = read_json(AI_CONFIG_PATH, dict(DEFAULT_AI_CONFIG))
    persisted_config, changed = _sanitize_persisted_ai_config(config)
    merged = dict(DEFAULT_AI_CONFIG)
    merged.update({key: value for key, value in persisted_config.items() if value is not None})
    for key, value in list(merged.items()):
        if isinstance(value, str):
            merged[key] = repair_text(value)
    merged["model"] = DEFAULT_AI_CONFIG["model"]
    merged["reasoning_effort"] = DEFAULT_AI_CONFIG["reasoning_effort"]
    merged["api_key"] = _env_api_key() if include_secret else ""
    if changed:
        write_json(AI_CONFIG_PATH, {key: value for key, value in merged.items() if key != "api_key"})
    return merged if include_secret else _client_safe_ai_config(merged)


def save_ai_config(payload: dict[str, Any]) -> dict[str, Any]:
    persisted = read_json(AI_CONFIG_PATH, dict(DEFAULT_AI_CONFIG))
    existing, _ = _sanitize_persisted_ai_config(persisted)
    existing.update({key: value for key, value in payload.items() if key != "api_key"})
    for key, value in list(existing.items()):
        if isinstance(value, str):
            existing[key] = repair_text(value)
    existing["model"] = DEFAULT_AI_CONFIG["model"]
    existing["reasoning_effort"] = DEFAULT_AI_CONFIG["reasoning_effort"]
    existing.pop("api_key", None)
    write_json(AI_CONFIG_PATH, existing)
    return load_ai_config(include_secret=False)


def _task_sort_value(task: dict[str, Any], primary: str, secondary: str) -> tuple[str, str, str]:
    return (task.get(primary) or "9999-12-31", task.get(secondary) or "9999-12-31", task.get("key") or "")


def _sorted_active(tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted([task for task in tasks if task.get("bucket") == "active"], key=lambda task: _task_sort_value(task, "end", "start"))


def _sorted_risk(tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    priority = {"overdue": 0, "due_soon": 1}
    return sorted(
        [task for task in tasks if task.get("bucket") in {"overdue", "due_soon"}],
        key=lambda task: (priority.get(task.get("bucket"), 9), task.get("end") or "9999-12-31", task.get("key") or ""),
    )


def _sorted_upcoming(tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted([task for task in tasks if task.get("bucket") == "upcoming"], key=lambda task: _task_sort_value(task, "start", "end"))


def _clean_value(value: Any) -> Any:
    if isinstance(value, str):
        return repair_text(value)
    return value


def _task_digest(task: dict[str, Any]) -> dict[str, Any]:
    return {
        "key": repair_text(task.get("key")),
        "title": repair_text(task.get("title")),
        "parent": repair_text(task.get("parent")),
        "assignee": repair_text(task.get("assignee")),
        "status": repair_text(task.get("status")),
        "start": task.get("start"),
        "end": task.get("end"),
        "notes": repair_text(task.get("notes")),
        "release": repair_text(task.get("release")),
        "type": repair_text(task.get("type")),
        "bucket": task.get("bucket"),
    }


def build_project_context(project: dict[str, Any] | None) -> dict[str, Any]:
    if not project:
        return {"project": None, "generated_at": datetime.now().isoformat()}

    tasks = project.get("tasks", []) or []
    metrics = project.get("metrics", {}) or {}
    settings = project.get("settings", {}) or {}
    active = _sorted_active(tasks)[:8]
    risk = _sorted_risk(tasks)[:8]
    upcoming = _sorted_upcoming(tasks)[:8]
    release_breakdown = (metrics.get("release_breakdown", []) or [])[:8]
    support_tasks = [task for task in tasks if task.get("release_component") == "support"]
    support_done = [task for task in support_tasks if str(task.get("status") or "").strip().lower() in DONE_STATUSES]
    support_pending = [task for task in support_tasks if task not in support_done]
    bug_open = [
        task for task in support_pending
        if BUG_PATTERN.search(" ".join([str(task.get("title") or ""), str(task.get("parent") or ""), str(task.get("type") or "")]))
    ]
    retest_open = [
        task for task in support_pending
        if RETEST_PATTERN.search(" ".join([str(task.get("title") or ""), str(task.get("parent") or ""), str(task.get("type") or "")]))
    ]
    test_open = [
        task for task in support_pending
        if TEST_PATTERN.search(" ".join([str(task.get("title") or ""), str(task.get("parent") or ""), str(task.get("type") or "")]))
    ]

    cleaned_release_weights = {
        repair_text(name): value
        for name, value in (settings.get("release_weights", {}) or {}).items()
        if repair_text(name)
    }

    return {
        "generated_at": datetime.now().isoformat(),
        "project": {
            "name": repair_text(project.get("project")),
            "slug": repair_text(project.get("slug")),
            "source_type": repair_text(project.get("source_type")),
            "source_name": repair_text(project.get("source_name")),
            "updated_at": project.get("updated_at") or project.get("imported_at"),
        },
        "settings": {
            "release_weight": settings.get("release_weight", 90),
            "release_weights": cleaned_release_weights,
        },
        "metrics": {
            "total": metrics.get("total", len(tasks)),
            "active": metrics.get("active", 0),
            "completed": metrics.get("completed", 0),
            "overdue": metrics.get("overdue", 0),
            "due_soon": metrics.get("due_soon", 0),
            "upcoming": metrics.get("upcoming", 0),
            "weighted_completion_ratio": metrics.get("weighted_completion_ratio", 0),
            "weighted_release_completion_ratio": metrics.get("weighted_release_completion_ratio", metrics.get("release_completion_ratio", 0)),
            "non_release_completion_ratio": metrics.get("non_release_completion_ratio", 0),
            "top_assignees": [[repair_text(name), count] for name, count in (metrics.get("top_assignees", []) or [])[:6]],
            "release_breakdown": [
                {
                    **item,
                    "name": repair_text(item.get("name")),
                }
                for item in release_breakdown
            ],
        },
        "support_metrics": {
            "total": len(support_tasks),
            "completed": len(support_done),
            "pending": len(support_pending),
            "bug_open": len(bug_open),
            "retest_open": len(retest_open),
            "test_open": len(test_open),
        },
        "active_items": [_task_digest(task) for task in active],
        "risk_items": [_task_digest(task) for task in risk],
        "upcoming_items": [_task_digest(task) for task in upcoming],
    }


def _json_mode_prompt(prompt: str) -> str:
    return f"{prompt}\n\nDevolve apenas JSON valido. Nao uses markdown, comentarios nem texto fora do JSON."


def _extract_output_text(payload: dict[str, Any]) -> str:
    output_text = payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return repair_text(output_text)

    parts: list[str] = []
    for item in payload.get("output", []) or []:
        if item.get("type") != "message":
            continue
        for content in item.get("content", []) or []:
            text_value = content.get("text")
            if isinstance(text_value, str) and text_value.strip():
                parts.append(repair_text(text_value))
    return "\n".join(parts).strip()


def _post_openai_response(body: dict[str, Any], api_key: str, timeout: int = 240) -> dict[str, Any]:
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Falha na chamada OpenAI ({exc.code}): {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Nao foi possivel contactar a OpenAI: {exc.reason}") from exc


def _call_openai(
    config: dict[str, Any],
    input_items: list[dict[str, Any]],
    *,
    json_mode: bool = False,
    max_output_tokens: int = 2200,
) -> str:
    api_key = str(config.get("api_key") or "").strip()
    if not api_key:
        raise ValueError("Nao existe chave OpenAI configurada.")

    model = str(config.get("model") or DEFAULT_AI_CONFIG["model"]).strip() or DEFAULT_AI_CONFIG["model"]
    reasoning_effort = str(config.get("reasoning_effort") or DEFAULT_AI_CONFIG["reasoning_effort"]).strip() or DEFAULT_AI_CONFIG["reasoning_effort"]

    base_body: dict[str, Any] = {
        "model": model,
        "input": input_items,
        "reasoning": {"effort": reasoning_effort},
        "store": False,
        "max_output_tokens": max_output_tokens,
    }
    if json_mode:
        base_body["text"] = {"format": {"type": "json_object"}}

    attempt_specs: list[tuple[str, int]]
    if json_mode:
        attempt_specs = [
            (reasoning_effort, max_output_tokens),
            ("medium", max(max_output_tokens, 5200)),
            ("low", max(max_output_tokens, 5200)),
            ("minimal", max(max_output_tokens, 6200)),
        ]
    else:
        attempt_specs = [
            (reasoning_effort, max(max_output_tokens, 3200)),
            ("medium", max(max_output_tokens, 5200)),
            ("low", max(max_output_tokens, 6200)),
            ("minimal", max(max_output_tokens, 7200)),
        ]

    attempts: list[dict[str, Any]] = []
    seen_specs: set[tuple[str, int]] = set()
    for effort, token_budget in attempt_specs:
        spec = (effort, token_budget)
        if spec in seen_specs:
            continue
        seen_specs.add(spec)
        attempt_body = {
            **base_body,
            "reasoning": {"effort": effort},
            "max_output_tokens": token_budget,
        }
        attempts.append(attempt_body)

    last_payload: dict[str, Any] | None = None
    partial_text = ""
    for attempt_body in attempts:
        payload = _post_openai_response(attempt_body, api_key, timeout=240)
        last_payload = payload
        incomplete_reason = ((payload.get("incomplete_details") or {}).get("reason") or "").strip()
        output_text = _extract_output_text(payload)
        if output_text and not json_mode:
            partial_text = output_text
        if incomplete_reason == "max_output_tokens":
            continue
        if output_text:
            return output_text
        break

    if partial_text and not json_mode:
        return partial_text

    detail = ""
    if last_payload is not None:
        detail = f" Estado da resposta: {last_payload.get('status')}; incomplete_details={last_payload.get('incomplete_details')}."
    raise RuntimeError(f"A OpenAI nao devolveu texto utilizavel para este pedido.{detail}")


def _parse_json_text(raw_text: str) -> dict[str, Any]:
    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise


def _task_bullet(task: dict[str, Any], *, include_date_key: str) -> str:
    date_value = task.get(include_date_key) or "n/d"
    parent = repair_text(task.get("parent")) or "Sem parent"
    assignee = repair_text(task.get("assignee")) or "n/d"
    release = repair_text(task.get("release")) or "Sem release"
    return (
        f"{repair_text(task.get('key') or 'Issue')} - {repair_text(task.get('title') or 'Sem titulo')} | Parent: {parent} | "
        f"Owner: {assignee} | Release: {release} | {include_date_key}: {date_value}"
    )


def fallback_chat_reply(project: dict[str, Any] | None, prompt: str, error: Exception) -> str:
    context = build_project_context(project)
    project_name = ((context.get("project") or {}).get("name")) or "Projeto"
    metrics = context.get("metrics", {}) or {}
    active_items = context.get("active_items", []) or []
    risk_items = context.get("risk_items", []) or []
    upcoming_items = context.get("upcoming_items", []) or []
    releases = metrics.get("release_breakdown", []) or []
    requested = str(prompt or "").strip().lower()

    risk_lines = [f"- {_task_bullet(task, include_date_key='end')}" for task in risk_items[:5]] or ["- Sem riscos criticos identificados no momento."]
    next_lines = [f"- {_task_bullet(task, include_date_key='start')}" for task in upcoming_items[:5]] or ["- Sem proximas acoes calendarizadas no plano."]
    release_lines = [
        f"- {repair_text(release.get('name') or 'Release')}: {release.get('effective_completion_ratio', 0)}% efetivo | Dev {release.get('development_completion_ratio', 0)}% | Suporte {release.get('support_completion_ratio', 0)}%"
        for release in releases[:5]
    ] or ["- Sem releases suficientes para destacar."]
    active_lines = [f"- {_task_bullet(task, include_date_key='end')}" for task in active_items[:4]] or ["- Sem acoes em curso identificadas."]

    lines = [
        f"OpenAI indisponivel de momento, por isso deixo ja uma leitura local do projeto {project_name}.",
        "",
        f"Progresso global: {metrics.get('weighted_completion_ratio', 0)}%",
        f"Releases de desenvolvimento: {metrics.get('weighted_release_completion_ratio', 0)}%",
        f"Em curso agora: {metrics.get('active', 0)}",
        f"Em risco: {(metrics.get('overdue', 0) + metrics.get('due_soon', 0))}",
        f"Proximas acoes: {metrics.get('upcoming', 0)}",
    ]

    if "risco" in requested:
        lines.extend(["", "Itens em risco a destacar:", *risk_lines])
    elif "seguir" in requested or "proxima" in requested:
        lines.extend(["", "Proxima vaga de trabalho:", *next_lines])
    elif "release" in requested:
        lines.extend(["", "Saude das releases de desenvolvimento:", *release_lines])
    else:
        lines.extend([
            "",
            "O que esta a acontecer agora:",
            *active_lines,
            "",
            "O que esta em risco:",
            *risk_lines[:4],
            "",
            "O que vai acontecer a seguir:",
            *next_lines[:4],
        ])

    lines.extend([
        "",
        "Nota: resposta executiva gerada localmente a partir do plano atual porque o servico remoto nao concluiu a resposta a tempo.",
    ])
    return "\n".join(lines)


def chat_about_project(project: dict[str, Any] | None, prompt: str, history: list[dict[str, Any]], config: dict[str, Any]) -> dict[str, Any]:
    context = build_project_context(project)
    developer_message = (
        "Es um copilot de gestao de projeto para project managers. "
        "Responde sempre em portugues europeu, com linguagem executiva, concreta e orientada a acao. "
        "Usa apenas o contexto do projeto fornecido. Quando fizeres uma inferencia, identifica-a como inferencia."
    )

    trimmed_history = [
        {"role": item.get("role"), "content": repair_text(item.get("content"))}
        for item in (history or [])[-10:]
        if item.get("role") in {"user", "assistant"} and repair_text(item.get("content"))
    ]

    input_items: list[dict[str, Any]] = [
        {"role": "developer", "content": developer_message},
        {"role": "developer", "content": f"Contexto estruturado do projeto:\n{json.dumps(context, ensure_ascii=False, indent=2)}"},
        *trimmed_history,
        {"role": "user", "content": repair_text(prompt)},
    ]
    try:
        answer = _call_openai(config, input_items, max_output_tokens=5200)
        return {
            "reply": answer,
            "model": config.get("model", DEFAULT_AI_CONFIG["model"]),
            "project_context": context,
        }
    except Exception as exc:
        return {
            "reply": fallback_chat_reply(project, prompt, exc),
            "model": "local-fallback",
            "warning": "A resposta foi gerada localmente porque o servico remoto nao concluiu o pedido dentro do orcamento de resposta.",
            "project_context": context,
        }


def fallback_steering_payload(project: dict[str, Any] | None, prompt: str) -> dict[str, Any]:
    context = build_project_context(project)
    project_name = ((context.get("project") or {}).get("name")) or "Projeto"
    metrics = context.get("metrics", {}) or {}
    support_metrics = context.get("support_metrics", {}) or {}
    active_items = context.get("active_items", []) or []
    risk_items = context.get("risk_items", []) or []
    upcoming_items = context.get("upcoming_items", []) or []
    releases = metrics.get("release_breakdown", []) or []

    objective_bullets = [
        "Alinhar o steering no estado real do plano e nas entregas executadas.",
        "Dar visibilidade ao progresso das releases de desenvolvimento e respetiva prontidao para testes.",
        "Evidenciar o que esta a acontecer agora, o que esta em risco e a proxima vaga de trabalho.",
        "Sinalizar checkpoints de decisao e necessidades de acompanhamento de gestao.",
    ]
    if repair_text(prompt):
        objective_bullets.append(f"Enfoque adicional pedido: {repair_text(prompt)}")

    summary_paragraph = (
        f"{project_name} apresenta um progresso global ponderado de {metrics.get('weighted_completion_ratio', 0)}%, "
        f"com as releases de desenvolvimento em {metrics.get('weighted_release_completion_ratio', 0)}%. "
        f"Existem {metrics.get('active', 0)} itens em curso, {metrics.get('overdue', 0) + metrics.get('due_soon', 0)} itens em risco "
        f"e {metrics.get('upcoming', 0)} iniciativas na proxima vaga."
    )

    release_lines = [
        f"{repair_text(release.get('name') or 'Release')}: {release.get('effective_completion_ratio', 0)}% efetivo "
        f"| Dev {release.get('development_completion_ratio', 0)}% | Suporte {release.get('support_completion_ratio', 0)}%"
        for release in releases[:6]
    ] or ["Sem releases de desenvolvimento suficientes para destacar nesta exportacao."]

    current_lines = [_task_bullet(task, include_date_key="end") for task in active_items[:6]] or ["Sem acoes em curso identificadas no plano."]
    risk_lines = [
        f"{_task_bullet(task, include_date_key='end')} | Mitigacao: reforcar follow-up diario, clarificar owner e proteger data alvo."
        for task in risk_items[:6]
    ] or ["Sem riscos criticos identificados no momento."]
    next_lines = [_task_bullet(task, include_date_key="start") for task in upcoming_items[:6]] or ["Sem proximas acoes calendarizadas no plano."]

    steering_messages = [
        f"Manter foco nas releases de desenvolvimento, que pesam {context.get('settings', {}).get('release_weight', 90)}% do progresso global.",
        "Garantir visibilidade diaria dos itens em risco e respetivos owners.",
        "Preparar handoff entre desenvolvimento, testes, bugfixing e re-teste sem criar vazios de capacidade.",
        "Usar esta leitura executiva em conjunto com a exportacao Gantt para detalhe operacional.",
    ]

    return {
        "deck_subtitle": f"{project_name} | Steering executivo | atualizado {((context.get('project') or {}).get('updated_at') or datetime.now().date().isoformat())}",
        "executive_tagline": "Leitura executiva gerada automaticamente a partir do plano atual da aplicacao.",
        "objective_bullets": objective_bullets,
        "summary_paragraph": summary_paragraph,
        "metric_cards": [
            {"label": "Progresso global", "value": f"{metrics.get('weighted_completion_ratio', 0)}%", "detail": "Leitura ponderada do plano"},
            {"label": "Releases dev", "value": f"{metrics.get('weighted_release_completion_ratio', 0)}%", "detail": "Componente de desenvolvimento"},
            {"label": "Suporte", "value": f"{support_metrics.get('completed', 0)}/{support_metrics.get('total', 0)}", "detail": "Testes, bugfixing e re-teste"},
            {"label": "Em risco", "value": str(metrics.get('overdue', 0) + metrics.get('due_soon', 0)), "detail": "Itens com seguimento imediato"},
        ],
        "release_bullets": release_lines,
        "current_actions": current_lines,
        "upcoming_actions": next_lines,
        "risk_items": risk_lines,
        "checkpoints": next_lines,
        "steering_messages": steering_messages,
        "footer_note": "Gerado localmente com fallback deterministico por indisponibilidade da OpenAI.",
    }


def build_steering_payload(project: dict[str, Any] | None, prompt: str, config: dict[str, Any]) -> tuple[dict[str, Any], str | None]:
    context = build_project_context(project)
    user_request = repair_text(prompt) or "Gerar steering executivo atualizado com base no plano atual."
    developer_message = (
        "Es um PMO executivo especializado em comites de steering. "
        "Responde sempre em portugues europeu, com texto curto, orientado para gestao, sem jargao desnecessario. "
        "Usa apenas a informacao do contexto do projeto. Nao inventes metricas, datas ou releases."
    )
    schema_instruction = _json_mode_prompt(
        """
Cria um objeto JSON com esta estrutura:
{
  "deck_subtitle": "string",
  "executive_tagline": "string",
  "objective_bullets": ["string", "..."],
  "summary_paragraph": "string",
  "metric_cards": [{"label":"string","value":"string","detail":"string"}],
  "release_bullets": ["string", "..."],
  "current_actions": ["string", "..."],
  "upcoming_actions": ["string", "..."],
  "risk_items": ["string", "..."],
  "checkpoints": ["string", "..."],
  "steering_messages": ["string", "..."],
  "footer_note": "string"
}

Regras:
- devolve entre 4 e 6 metric_cards.
- devolve no maximo 6 itens por lista.
- cada item deve ser curto e pronto a colocar em slide executivo.
- em current_actions, upcoming_actions, risk_items e checkpoints inclui sempre key, titulo, parent e data relevante quando existir.
- em release_bullets resume progresso efetivo, desenvolvimento e suporte por release.
"""
    )
    input_items = [
        {"role": "developer", "content": developer_message},
        {"role": "developer", "content": f"Contexto estruturado do projeto:\n{json.dumps(context, ensure_ascii=False, indent=2)}"},
        {"role": "user", "content": user_request},
        {"role": "user", "content": schema_instruction},
    ]

    try:
        raw = _call_openai(config, input_items, json_mode=True, max_output_tokens=4200)
        parsed = _parse_json_text(raw)
        parsed.setdefault("footer_note", "Gerado com apoio da OpenAI a partir do plano atual da aplicacao.")
        return parsed, None
    except Exception as exc:
        return (
            fallback_steering_payload(project, prompt),
            "A OpenAI nao respondeu num formato utilizavel para o steering. Foi gerada uma versao completa com fallback local a partir do plano atual.",
        )
