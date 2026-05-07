# Judge v2 — Эволюция Системы Оценки

Ветка: `judge-v2`. Базовая спека: [`../001-ai-judge/`](../001-ai-judge/).
Каталог метрик (источник истины): [`../../docs/sdd/12-evaluation-metrics-catalog.md`](../../docs/sdd/12-evaluation-metrics-catalog.md).

## Мотивация

Прогон оценки на двух графах в ветке `eval-judge` выявил систематические проблемы:
1. У AgentCall-графа в финальный отчёт попадало 3 из 10 ожидаемых метрик.
2. Метрика `f_judge_ref` вычислялась, но имела вес 0 в профиле `rag` (не упоминалась в `WEIGHT_PROFILES.rag`).
3. `sample_size` метрики у графа из 2 узлов был в 2× больше реального числа items — двойной счёт.
4. Профиль `rag` хардкод; авто-выбор по топологии графа из SDD-12 §«Rule-Based Baseline» не реализован.
5. `f_judge_ref` в sidecar — token-overlap placeholder, не реальный LLM-judge.
6. Operational gate из SDD-12 §«Жёсткий Гейт» (T, C, R_fail, f_safe) не считается.

## Дельта

### P0 — корректность

- **Дедупликация значений метрик.** [`backend/src/services/application/judge/judge.service.ts`](../../backend/src/services/application/judge/judge.service.ts):
  каждое значение `f_j(item)` теперь вычисляется один раз и накапливается в `accumulator[code]`.
  Per-node отчёт собирается ссылками на уже посчитанные значения через `codeToNodes: Map<code, Set<node_id>>`.
  Результат: `sample_size` равен реальному числу items, а не `items × число_узлов_с_метрикой`.
- **`tool_call_trace`/`retrieved_ids` доезжают до evaluator'а.**
  [`backend/src/services/application/judge/pipeline-runner.ts`](../../backend/src/services/application/judge/pipeline-runner.ts):
  новая функция `extractAssessOutput(snapshot, pipelineId)` читает `Node.output_json` всех узлов пайплайна
  (после `persistNodeOutputs`) и собирает `tool_call_trace`, `structured_output`, `retrieved_ids`,
  `loop_iterations/terminated/converged` в `AssessItem.agent_output`. Метрики оси D (f_toolsel,
  f_argF1, f_trajIoU, f_planEff, f_node_cov, f_tool_ok) теперь могут считаться у AgentCall-графов.

### P1 — выбор профиля и покрытие

- **Авто-выбор профиля по топологии.** [`metric_registry.ts`](../../backend/src/services/application/judge/metric_registry.ts):
  `inferProfileFromGraph(nodeTypes)` детерминированно выбирает профиль:
  - AgentCall + retrieval → `agentic_rag`;
  - AgentCall без retrieval → `tool_use`;
  - retrieval без AgentCall → `rag`;
  - Parser/OutputValidator → `extractor`;
  - иначе → `default`.

  Клиент может передать `weight_profile: "auto"` (или вообще не передавать) — backend применит inferred профиль и вернёт `profile_selection: { applied, origin, reason, requested? }`.
- **Новый профиль `agentic_rag`.** Смесь B/D/A для AgentCall, ходящего к RAG-инструменту:
  D=0.27, B=0.18, G=0.15, A=0.15, H=0.10, C=0.10, F=0.05.
- **Профиль `rag` исправлен:** `f_judge_ref` теперь имеет ненулевой вес (0.06 в G), вес D снижен с 0.15 до 0.10 (он у RAG не ключевой). `f_check` оставлен (0.04). Σ всё ещё = 1.
- **`axis_coverage` в отчёте.** Группировка активных метрик по 8 осям с суммарным весом по каждой оси. UI показывает таблицу A..H. Если активны < 3 осей — `axis_warning` для пользователя.
- **`skipped_metrics_detail`.** Ранее `skipped_metrics: string[]`; теперь сохраняем `{metric_code, axis, reason, occurrences}` — последняя причина из `MetricNotApplicable.message` и количество items, на которых метрика была пропущена.

### P2 — реальный judge и operational gate

- **`f_judge_ref` через локальный `judge_provider`.**
  Новый файл [`llm_judge.metric.ts`](../../backend/src/services/application/judge/llm_judge.metric.ts).
  В `MetricDef` появился третий executor `'llm_judge'`. Промпт в стиле Prometheus-2/G-Eval:
  системная инструкция (включая «игнорируй длину» — митигация verbosity bias из SDD-12
  §«Политика Судьи»), рубрика (по умолчанию шкала 1..5), JSON-ответ `{score, rationale}`,
  нормировка `(score − 1) / (scale − 1)`. Provider семейства Mistral/OpenRouter берётся
  через `resolveJudgeProvider()` — отличается от оцениваемой модели → митигация self-preference.
  Старая sidecar-реализация (`judge-eval-worker/app/metrics/rubric_adapter.py`) перестала вызываться backend'ом, оставлена в worker'е как dead-code до удаления.
- **Operational gate.** В отчёт добавлено поле `gate: { T_p95_ms, T_max_ms, C_total, C_max, R_fail, R_fail_max, f_safe, f_safe_min, passes, reasons[] }`.
  - T измеряется через `snapshot.summary.duration_ms`, агрегируется как p95 по всем item_runs.
  - C — `snapshot.summary.cost_units_used`, суммарно по items.
  - R_fail — доля `item_runs.status === 'failed'`.
  - f_safe — берётся из metric_scores, если посчитан.
  - Пороги: `T_max/C_max` из `Pipeline.max_time/max_cost` (если > 0), иначе defaults; `R_fail_max=0.2`, `f_safe_min=0.95` (как в SDD-12).
  - Verdict теперь = `S ≥ α ∧ gate.passes` (раньше — только `S ≥ α`).

### Frontend

- [`frontend/src/lib/api.ts`](../../frontend/src/lib/api.ts) — `AssessmentReport` расширен полями `profile_selection`, `axis_coverage`, `axis_warning`, `gate`, `skipped_metrics_detail`.
- [`frontend/src/components/run-panel.tsx`](../../frontend/src/components/run-panel.tsx) — добавлены опции `auto`, `agentic_rag` в селекторе профиля; в отчёте показываются inferred-профиль с пояснением, axis_warning, таблица покрытия осей, блок operational gate с порогами и причинами FAIL, таблица пропущенных метрик с reason.

## Дата-аугментация (commits 6d7ddc4, 1502961)

### Проблема
Прогон оценки на исходном `voproshalych-golden.jsonl` (формат: `{item_key, input, reference: "<строка>", meta}`) пропускал 13 из 16 ожидаемых для AgentCall-графа метрик: датасет физически не содержал полей, которые требуют метрики осей C/D/E/G/H — `relevant_docs`, `tool_trajectory`, `claims`, `checklist`, `paraphrases`, `structured_reference`, `rubric`. Это не баг кода, а разрыв между требованиями каталога SDD-12 и форматом записи.

### Решение
LLM-аугментация датасета через [`backend/scripts/augment-golden.ts`](../../backend/scripts/augment-golden.ts). Один проход через `resolveJudgeProvider()` (Mistral по умолчанию), один большой JSON-ответ на запись со всеми полями. Стоимость на mistral-small-latest: ~3 минуты на 200 записей при concurrency=5.

Запуск:
```bash
cd backend && npm run augment:golden -- \
  --in ../docs/research/voproshalych-golden.jsonl \
  --out ../docs/research/voproshalych-golden-augmented.jsonl
```

### Поле trajectory в universal-capabilities
`tool_trajectory` генерируется в форме `[{tool: "rag_search", params: {query}}, {tool: "answer"}]` — портируется на любой граф через `TOOL_ALIASES` в [`native_metrics.ts`](../../backend/src/services/application/judge/native_metrics.ts) (`rag_search` → `rag | hybridretriever | retriever | search | …`). Финальные шаги (`answer`, `final_answer`, `respond`) фильтруются из reference при сравнении с trace, потому что они не делают tool call.

### AgentCall trace shape
В [`agent-tool-call-runner.ts`](../../backend/src/services/application/node/handlers/agent-tool-call-runner.ts) traceEntry дополнен явными полями `tool` (=resolved_tool), `params` (=inputPatch от LLM-директивы), `success: bool` — без этого native-метрики оси D не находили нужных полей в записях trace.

### Покрытие после аугментации
Все 8 осей каталога имеют необходимые поля в reference (F работает на runtime-данных AgentCall):

| Ось | Ключевые метрики | Источник в augmented record |
|---|---|---|
| A | f_EM, f_F1, f_sim, f_corr | `reference.answer` |
| B | f_faith, f_fact, f_cite, f_contra | `claims`, `context_texts`, `relevant_urls` |
| C | f_recall@k, f_ndcg@k, f_ctx_prec/rec | `relevant_docs` (требует совпадения id-схемы с RAG-tool, см. ниже) |
| D | f_toolsel, f_argF1, f_trajIoU, f_planEff, f_node_cov | `tool_trajectory` (universal) |
| E | f_schema, f_field, f_TED | `structured_reference` (94% записей) |
| F | f_loop_budget, f_loop_term | `agent_output.tool_calls_executed/max_tool_calls` (runtime) |
| G | f_judge_ref, f_check | `rubric`, `checklist` |
| H | f_paraph, f_consist | `paraphrases[]` (3 на запись) + replay для consist |

### Известные ограничения
- **Совпадение id retrieval'а** (ось C): augmented кладёт `relevant_docs = [String(meta.chunk_id)]` (например `"92459"`), а сейчас `Chunker` переименовывает чанки в `doc_1_chunk_1`. Пока схемы не совпадут (либо ingestion сохранит исходный `chunk_id`, либо мы поменяем reference на `confluence_url`-based id), метрики оси C будут возвращать ~0. Это отдельная мини-задача в RAG-tool.
- **f_paraph** требует replay: по `paraphrases[]` агент должен прогнаться N+1 раз (оригинал + перефразы), и результаты сравниваются на `f_sim`. Replay-логика — в следующем шаге.
- **f_consist** требует replay одного запроса k раз — отложено.
- **CheckEval native** — простая токен-overlap проверка; реальная метрика делается через LLM-судью, не реализовано.

## Оставшаяся работа (не в этой ветке)

- `f_judge_ref` PoLL-ансамбль (несколько дешёвых судей) — SDD-12 §«Политика Судьи».
- CRITIC-коррекция весов при N≥50 прогонов — SDD-12 §«Объективный Вес w_j^CRITIC».
- Автоматическое выведение порогов α по перцентилям human-labelled корпуса — SDD-12 §«Обоснование Порогов α».
- Sidecar-метрики `f_sim`, `f_faith`, `f_corr` сейчас идут через placeholder-implementations в worker'е; нужно подключить реальные Ragas/SBERT.
