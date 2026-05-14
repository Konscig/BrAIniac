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

## MCP-адаптер

BrAIniac предоставляет MCP-эндпоинт для AI-клиентов и интеграции с VS Code. Через адаптер внешний агент может читать и изменять проекты, пайплайны и графы, запускать прогоны и получать снапшоты — те же операции, что доступны в веб-интерфейсе, но через MCP-tools и ресурсы.

Включается флагом `MCP_ENABLED=true`; путь эндпоинта задаётся через `MCP_PATH` (quickstart VS Code ожидает `/mcp`). Аутентификация — стандартный access-токен BrAIniac. Расширение VS Code использует браузерный sign-in; токены хранятся в SecretStorage VS Code и обновляются через OAuth-совместимые эндпоинты. Подробный справочник по tools и ресурсам будет вынесен в отдельный гайд.

## Вклад в проект

Мы открыты для идей, предложений и Pull Request’ов!

Также можете связаться с нами по контактам, указанным в профилях.


<a href="https://github.com/Konscig">Konscig</a> - Герасимов Константин Сергеевич

<a href="https://github.com/Bolshevichok">Bolshevichok</a> - Орехов Семен Николаевич

Тюмень, 2026

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

## MCP adapter

BrAIniac exposes an MCP endpoint for AI clients and the VS Code MCP integration. The adapter lets an external agent inspect and modify projects, pipelines and graphs, run executions and read snapshots — the same operations available in the web UI, but through MCP tools and resources.

Enable it with `MCP_ENABLED=true`; the endpoint path is configured via `MCP_PATH` (the VS Code quickstart expects `/mcp`). Authentication uses the standard BrAIniac access token. The VS Code extension follows a browser-based sign-in flow; tokens are stored in VS Code SecretStorage and refreshed via OAuth-compatible endpoints. A detailed tool reference will live in a separate guide.

## Contributing

We welcome contributions and ideas!

You can contact us by links in profiles.


<a href="https://github.com/Konscig">Konscig</a> - Gerasimov Konstantin

<a href="https://github.com/Bolshevichok">Bolshevichok</a> -  Orekhov Semen

Tyumen, 2026
