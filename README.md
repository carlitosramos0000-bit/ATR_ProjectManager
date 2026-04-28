# ATR Project Manager

Aplicacao web profissional para gestao de projetos com identidade visual inspirada na CGI.

## Funcionalidades

- Importacao de ficheiros `.xlsx` no formato Gantt de referencia.
- Importacao de CSV exportado do Jira Planner.
- Dashboard executivo com KPIs, acoes em curso, proximas acoes e riscos de prazo.
- Timeline Gantt interativa no browser.
- Exportacao para `.xlsx` com layout proximo do ficheiro de referencia.
- Configuracao de alertas por e-mail para deadlines proximos.
- Estrutura reutilizavel para outros projetos.

## Como executar

```powershell
& "C:\Users\ramoscv\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" app.py
```

Depois abrir:

[http://127.0.0.1:8000](http://127.0.0.1:8000)

## Notas

- Os dados importados ficam guardados em `data/projects/`.
- Os excels exportados ficam em `exports/`.
- O motor de alertas corre de hora a hora enquanto a aplicacao estiver ligada.

