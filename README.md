<img text-align="center" width="300" height="300" alt="BRAIN" src="https://github.com/user-attachments/assets/bea6f117-a54f-4133-9526-2bdc956aee65" />

## 🇷🇺
# BrAIniac

**BrAIniac** — интерактивная среда проектирования ИИ-агентов, покрывающая полный цикл разработки агентных систем: от визуальной сборки графа до количественной оценки качества и итеративной доработки.

## О проекте

BrAIniac позволяет собирать произвольные агентные пайплайны в визуальном редакторе, запускать их на тестовых датасетах и получать многоосевую количественную оценку качества. Оценка сводится во взвешенную свёртку с автоматическим выбором профиля под топологию графа и сопровождается оперативной обратной связью по ходу прогона.

Система не привязана к конкретному классу агентов: она одинаково применима к RAG-конвейерам, агентам с tool-use, экстракторам структурированных данных и другим конфигурациям. Цель — дать единый инструмент, в котором проектирование, исполнение и валидация агентов происходят в одной интерактивной среде.

## Что внутри

- **Графический редактор пайплайна** в браузере и исполняющий runtime на бэкенде.
- **Модуль оценки** с многоосевой шкалой: лексические и семантические сравнения, проверка обоснованности, retrieval-метрики, метрики траектории инструментов, безопасность и LLM-as-judge. Веса осей калибруются под класс агента.
- **Обратная связь в реальном времени** во время оценки: прогресс по элементам датасета и по отдельным метрикам.
- **MCP-адаптер** для интеграции с AI-клиентами и VS Code.

## Запуск и использование

### Клонирование репозитория
```bash
git clone https://github.com/BrAIniac.git
cd BrAIniac
```

### Запуск в Docker контейнере
`docker-compose up --build`

### Откройте в браузере
`http://localhost:3000`

## Вклад в проект

Мы открыты для идей, предложений и Pull Request’ов!

Также можете связаться с нами по контактам, указанным в профилях.


<a href="https://github.com/Konscig">Konscig</a> - Герасимов Константин Сергеевич

<a href="https://github.com/Bolshevichok">Bolshevichok</a> - Орехов Семен Николаевич

Тюмень, 2025

---

## 🇬🇧 
# BrAIniac

**BrAIniac** is an interactive environment for designing AI agents that covers the full lifecycle of agentic-system development: from visual graph assembly to quantitative quality assessment and feedback-driven iteration.

## About the Project

BrAIniac lets users compose arbitrary agent pipelines in a visual editor, run them against test datasets, and obtain multi-axis numeric quality scores. The result is aggregated into a weighted sum with automatic profile selection based on graph topology, and is accompanied by live feedback during the run.

The system is not tied to a particular agent class — it applies equally to RAG pipelines, tool-using agents, structured extractors, and other configurations. The goal is a single tool where designing, executing and validating agents happens in one interactive environment.

## What's inside

- **Visual pipeline editor** in the browser, with an executing runtime on the backend.
- **Evaluation module** with a multi-axis scale: lexical and semantic comparisons, groundedness checks, retrieval metrics, tool-trajectory metrics, safety, and LLM-as-judge. Axis weights are calibrated per agent class.
- **Real-time feedback** during evaluation: progress over dataset items and over individual metrics.
- **MCP adapter** for integration with AI clients and VS Code.

## Run & Usage

### Clone the repository
```bash
git clone https://github.com/BrAIniac.git
cd BrAIniac
```

### Run in Docker
`docker-compose up --build`

### Then open in your browser:
`http://localhost:3000`

## MCP Backend Adapter

The backend can expose a BrAIniac MCP endpoint for authenticated AI clients and
VS Code MCP surfaces. Enable it with `MCP_ENABLED=true`; the default path is
controlled by `MCP_PATH` and is expected by the current VS Code quickstart as
`/mcp`.

Authentication uses the existing BrAIniac access token:

```json
{
  "Authorization": "Bearer <access-token>"
}
```

Implemented MCP resources include projects, pipelines, pipeline graphs,
pipeline validation, execution snapshots, nodes, agents, tools, node types, and
redacted project/pipeline/node exports.

Implemented MCP tools include `list_projects`, `list_pipelines`,
`get_pipeline_context`, `list_pipeline_nodes`, `get_node_context`,
`list_tool_catalog`, `validate_pipeline`, `start_pipeline_execution`,
`get_pipeline_execution`, `export_project_snapshot`,
`export_pipeline_snapshot`, `export_node_snapshot`, `create_project`,
`create_pipeline`, `create_pipeline_node`, `connect_pipeline_nodes`,
`list_node_types`, `get_node_type`, `get_pipeline_graph`,
`list_pipeline_edges`, `validate_node_config`, `update_pipeline_node`,
`delete_pipeline_node`, `delete_pipeline_edge`, `search_node_types`,
`search_tools`, `get_agent_tool_bindings`, and `auto_layout_pipeline`.
The export tools return the redacted JSON snapshot inline with
`redaction_report`; `brainiac://.../export` URIs are retained only as secondary
links for reopening the same snapshot resource.

Pipeline authoring tools are explicit mutating MCP operations. Agents should use
them as primitive steps: create the project, create the pipeline, create
supported nodes with explicit canvas positions or layout hints, then connect
nodes with edges. Node placement should keep at least normal canvas spacing and
avoid stacked coordinates; duplicate/cross-pipeline edges and hidden
`tool_ref`/`tool_refs` bindings are rejected.

Domain discovery/editing tools help agents refine generated graphs without
guessing database ids. Use `list_node_types`/`get_node_type` before node
creation, `get_pipeline_graph`/`list_pipeline_edges` before repairs,
`validate_node_config` before node config changes, and
`get_agent_tool_bindings` to inspect explicit `ToolNode -> AgentCall`
capabilities. Search tools are read-only and bounded. Update/delete tools and
`auto_layout_pipeline` apply mode are mutating MCP operations and should be
confirmed by the client; `auto_layout_pipeline` dry-run returns proposed
`ui_json` placement changes without changing graph structure.

The VS Code extension uses browser sign-in as the product path. The local
browser bridge exchanges the completed sign-in for an OAuth-compatible session:
access token, refresh token, expiry, scope, and session id are stored only in VS
Code SecretStorage. The extension refreshes expired access tokens through
`POST /auth/oauth/token` and revokes refresh material on sign-out through
`POST /auth/oauth/revoke`. Manual token paste remains an explicit development
fallback only.
The local backend intentionally does not expose standard `.well-known` OAuth
discovery endpoints unless full Dynamic Client Registration support is added,
so VS Code should not show a client-registration prompt during BrAIniac sign-in.

The browser frontend uses a separate web-session refresh contract:
`POST /auth/web/refresh` rotates an HttpOnly SameSite refresh cookie and returns
only a new access token. Local Docker disables the cookie `Secure` flag only for
plain `http://localhost`; HTTPS/hosted environments must keep it enabled.

## Contributing

We welcome contributions and ideas!

You can contact us by links in profiles.


<a href="https://github.com/Konscig">Konscig</a> - Gerasimov Konstantin

<a href="https://github.com/Bolshevichok">Bolshevichok</a> -  Orekhov Semen

Tyumen, 2025
