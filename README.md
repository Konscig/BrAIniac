<img text-align="center" width="300" height="300" alt="BRAIN" src="https://github.com/user-attachments/assets/bea6f117-a54f-4133-9526-2bdc956aee65" />

## 🇷🇺
# BrAIniac

**BrAIniac** — интерактивная среда для моделирования поведения и взаимодействия интеллектуальных агентов.  
Проект ориентирован на студентов ИТ-направлений и позволяет использовать **практикоориентированный подход** к изучению архитектуры и логики ИИ-агентов.

## О проекте

BrAIniac предоставляет возможность создавать, тестировать и визуализировать работу интеллектуальных агентов с помощью интуитивного интерфейса.  
Система направлена на **обучение и исследование**, а не просто на автоматизацию.  

Основная цель — дать студентам и исследователям инструмент для **практического освоения принципов мультиагентных систем**, где каждая модель оценивается и анализируется в интерактивной среде.

## Небольшой Q/A для ясности

### Как это должно работать?
BrAIniac — это веб-приложение, позволяющее студентам, вне зависимости от учебного заведения, практиковаться в решении кейсов.  
Результатом становятся современные, безопасные и производительные ИИ-агенты и мультиагентные системы.

### Чем вы отличаетесь от AgentWizz, AgentFlow, n8n и других аналогов?
Главное отличие — **ориентированность на обучение**.  
BrAIniac внедряет **live-модерацию** и **модель-судью**, которая оценивает решения и сопровождает студента на всем пути — от постановки задачи до итогового анализа.

### Каков результат взаимодействия с системой?
После завершения кейсов пользователь получает:
- подробный **отчет о результатах**;
- возможность **выгрузить код** для шаблонизации, повторного использования и анализа;
- рекомендации по улучшению архитектуры и поведения агентов.

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

**BrAIniac** is an interactive environment for modeling the behavior and interactions of intelligent agents.  
It is designed for IT students and provides a **practice-oriented approach** to learning about AI agent architectures and logic.

## About the Project

BrAIniac allows users to **create, test, and visualize** intelligent agent behavior through an intuitive interface.  
The system focuses on **learning and experimentation**, not just automation.  

The main goal is to give students and researchers a hands-on tool for exploring **multi-agent systems**, where every model is evaluated and analyzed interactively.

## Quick Q/A

### How does it work?
BrAIniac is a web application that enables students — regardless of their university — to practice solving real-world AI cases.  
The result is efficient, secure, and modern intelligent agents and multi-agent systems.

### What makes it different from AgentWizz, AgentFlow, n8n, etc.?
The key difference is **educational focus**.  
BrAIniac introduces **live moderation** and an **AI-judge model** that evaluates and guides the student through every stage of the problem-solving process.

### What do I get from using it?
Upon completing a case, users receive:
- a detailed **performance report**;
- the ability to **export the generated code** for reuse and deeper research;
- recommendations for improving the architecture and behavior of their agents.

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
