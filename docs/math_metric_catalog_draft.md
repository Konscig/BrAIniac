# Каталог метрик оценки и правила их применения

Документ закрывает открытые вопросы M, M', W и пороговых дефолтов из постановки [math_evaluation_draft.md](math_evaluation_draft.md).

Основа — синтез практик RAGAS, DeepEval, LangSmith/LangChain, Arize Phoenix, OpenAI Evals и TruLens, адаптированный под каталог нод BrAIniac (`docs/sdd/07-mvp-node-catalog.md`). Выбор метрик по форме пайплайна и политика весов — оригинальные решения проекта (в индустрии стандарта на них нет).

---

## 1. Множество M

Каждая метрика характеризуется:

- **name** — идентификатор;
- **range** — область значений;
- **scope** — `global` или `node(NodeType)`;
- **kind** — способ вычисления: `auto` (runtime-телеметрия), `det` (детерминистический алгоритм без LLM), `embed` (эмбеддинг-сходство), `J` (LLM-as-a-Judge);
- **requires** — поля тестового случая или телеметрии, необходимые для вычисления.

Нормировка: все f_j ∈ M приводятся к [0, 1], где 1 — идеально; для бинарных метрик используется {0, 1}. Это необходимо для корректной работы формулы `S = Σ w_j · S_j` из [math_evaluation_draft.md](math_evaluation_draft.md).

### End-to-end качество

| # | name | range | kind | scope | requires | source |
|---|---|---|---|---|---|---|
| 1 | `e2e_correctness` | {0, 1} | J | global | x_k, y_k, O | LangSmith QA/CoT-QA, Phoenix Q&A |
| 2 | `answer_similarity` | [0, 1] | embed | global | y_k, O | RAGAS answer_similarity |
| 3 | `answer_similarity_string` | [0, 1] | det | global | y_k, O | LangSmith string distance |

### RAG: качество извлечения и ранжирования

| # | name | range | kind | scope | requires | source |
|---|---|---|---|---|---|---|
| 4 | `context_precision` | [0, 1] | J | node(DatasetInput) | x_k, ctx, (y_k) | RAGAS |
| 5 | `context_recall` | [0, 1] | J | node(DatasetInput) | x_k, y_k, ctx | RAGAS |
| 6 | `context_relevance` | [0, 1] | J | node(DatasetInput) | x_k, ctx | RAGAS |
| 7 | `retrieval_ndcg_at_k` | [0, 1] | det | node(Ranker) | ranked list, labels | Arize Phoenix |
| 8 | `retrieval_mrr` | [0, 1] | det | node(Ranker) | ranked list, labels | Arize Phoenix |

Метрики 4–6 требуют явного извлечённого контекста `ctx` на входе узла генерации; 7–8 требуют заранее размеченных релевантностей в датасете.

### RAG: обоснованность генерации

| # | name | range | kind | scope | requires | source |
|---|---|---|---|---|---|---|
| 9 | `faithfulness` | [0, 1] | J | node(LLMCall, AgentCall) | ctx, O | RAGAS, DeepEval, TruLens |
| 10 | `hallucination_rate` | [0, 1] | J | node(LLMCall, AgentCall) | ctx, O | DeepEval, Phoenix |

`hallucination_rate` идейно обратна `faithfulness`; в каталог включены обе, потому что промпт-шаблоны у них разные и публикуются в разных фреймворках. При генерации M' из двух берётся одна: `faithfulness` как приоритетная.

### Качество ответа LLM

| # | name | range | kind | scope | requires | source |
|---|---|---|---|---|---|---|
| 11 | `answer_relevancy` | [0, 1] | J | node(LLMCall) | x_k, O | RAGAS, DeepEval |
| 12 | `coherence` | [0, 1] | J | node(LLMCall) | O | LangSmith criteria |
| 13 | `helpfulness` | [0, 1] | J | node(LLMCall), global | x_k, O | LangSmith criteria |

### Формат и структура

| # | name | range | kind | scope | requires | source |
|---|---|---|---|---|---|---|
| 14 | `json_schema_validity` | {0, 1} | det | node(Parser), global | O, schema | LangSmith json validity |
| 15 | `regex_format_match` | {0, 1} | det | node(Parser), global | O, regex | LangSmith regex match |

### Агентное поведение и инструменты

| # | name | range | kind | scope | requires | source |
|---|---|---|---|---|---|---|
| 16 | `tool_correctness` | [0, 1] | det | node(ToolNode, AgentCall) | expected tool calls, actual | DeepEval |
| 17 | `tool_success_rate` | [0, 1] | auto | node(ToolNode, AgentCall) | RunTask telemetry | BrAIniac auto |
| 18 | `task_completion` | [0, 1] | J | node(AgentCall) | x_k, trajectory, O | DeepEval |
| 19 | `plan_step_efficiency` | [0, 1] | auto | node(AgentCall) | steps_used, steps_min or ref | LangSmith trajectory |

Нормировка `plan_step_efficiency`: `clamp(steps_min / steps_used, 0, 1)`; при отсутствии `steps_min` используется `clamp(1 - (steps_used - ref_steps) / ref_steps, 0, 1)`.

### Runtime и стоимость (auto)

| # | name | range | kind | scope | requires | source |
|---|---|---|---|---|---|---|
| 20 | `latency_score` | [0, 1] | auto | global + node | RunTask.duration | BrAIniac auto |
| 21 | `cost_score` | [0, 1] | auto | global + node | RunTask.cost_usd | BrAIniac auto |
| 22 | `token_efficiency` | [0, 1] | auto | node(LLMCall, AgentCall) | tokens_used | BrAIniac auto |
| 23 | `error_rate_score` | [0, 1] | auto | global + node | RunTask.status | BrAIniac auto |

Нормировки:

- `latency_score = clamp(T_ref / T_actual, 0, 1)`; `T_ref` — целевое время (параметр пресета).
- `cost_score = clamp(C_ref / C_actual, 0, 1)`; `C_ref` — целевая стоимость.
- `token_efficiency = clamp(tokens_ref / tokens_actual, 0, 1)`; `tokens_ref` — целевой бюджет.
- `error_rate_score = 1 - error_rate`.

Сырые значения `T(a)`, `C(a)`, `R_fail(a)` используются для эксплуатационных gate-порогов (см. §4), и параллельно нормированные формы 20/21/23 могут включаться в `S` если веса выбраны осознанно.

### Безопасность (опционально, по флагу)

| # | name | range | kind | scope | requires | source |
|---|---|---|---|---|---|---|
| 24 | `toxicity_score` | [0, 1] | J | global | O | DeepEval, Phoenix |
| 25 | `bias_score` | [0, 1] | J | global | O | DeepEval |
| 26 | `pii_leak_score` | [0, 1] | det + J | global | O | Patronus Lynx, regex |

Для safety-метрик 1 — отсутствие проблемы, 0 — проблема явная. Это сохраняет единое правило «выше — лучше».

---

## 2. Правила автоматического выбора M'

На вход: `V_a` — состав узлов пайплайна; опциональные флаги датасета (`has_retrieval_labels`, `y_is_structured`) и конфигурации (`safety_required`).

### Базовые (всегда включаются)

```
M'_base = {
  error_rate_score,
  latency_score,
  cost_score,
  token_efficiency,
  e2e_correctness,
  answer_similarity
}
```

### Условные добавления

| условие | добавляемые метрики |
|---|---|
| `DatasetInput ∈ V_a` AND (`LLMCall ∈ V_a` OR `AgentCall ∈ V_a`) | `context_precision`, `context_recall`, `context_relevance`, `faithfulness` |
| `Ranker ∈ V_a` AND `has_retrieval_labels` | `retrieval_ndcg_at_k`, `retrieval_mrr` |
| `ToolNode ∈ V_a` OR `AgentCall ∈ V_a` | `tool_correctness`, `tool_success_rate` |
| `AgentCall ∈ V_a` | `task_completion`, `plan_step_efficiency` |
| `LLMCall ∈ V_a` | `answer_relevancy`, `coherence` |
| `Parser ∈ V_a` OR `y_is_structured` | `json_schema_validity` |
| `y_is_format_constrained` | `regex_format_match` |
| `safety_required` | `toxicity_score`, `bias_score`, `pii_leak_score` |

Предотвращение дублирования: `faithfulness` и `hallucination_rate` — одна из них, приоритет `faithfulness`; `answer_similarity` и `answer_similarity_string` — приоритет embedding, string — как fallback при отсутствии embedding-провайдера.

### Ручной override

Пользователь MAY вручную:
- добавить любую метрику из M, отсутствующую в автоматическом M';
- исключить любую автоматически добавленную метрику, кроме `error_rate_score` (считается обязательной для диагностики).

---

## 3. Политика весов W

### Default: uniform

`w_j = 1 / |M'|` для всех j. Это поведение по умолчанию; выбрано как нейтральная база (HELM-стиль).

### Пресеты весов

При известном типе сценария пользователь MAY выбрать пресет; недостающие в M' метрики пресета игнорируются, присутствующие нормируются так, чтобы `Σ w_j = 1`.

**RAG-heavy:**

| metric | weight |
|---|---|
| faithfulness | 0.20 |
| context_precision | 0.15 |
| context_recall | 0.15 |
| answer_relevancy | 0.15 |
| e2e_correctness | 0.20 |
| answer_similarity | 0.10 |
| runtime auto-group (latency + cost + tokens + error_rate) | 0.05 (распределяется поровну внутри группы) |

**Agent-heavy:**

| metric | weight |
|---|---|
| task_completion | 0.25 |
| tool_correctness | 0.20 |
| e2e_correctness | 0.20 |
| plan_step_efficiency | 0.10 |
| tool_success_rate | 0.10 |
| answer_similarity | 0.10 |
| runtime auto-group | 0.05 |

**Pure-LLM:**

| metric | weight |
|---|---|
| e2e_correctness | 0.30 |
| answer_similarity | 0.20 |
| answer_relevancy | 0.15 |
| coherence | 0.15 |
| helpfulness | 0.15 |
| runtime auto-group | 0.05 |

Алгоритм нормирования: для выбранного пресета оставить только метрики, присутствующие в M', просуммировать их веса `Σ_active`, поделить каждую на `Σ_active`.

### Safety-floor

Не зависит от веса. При любом включённом `safety_*` применяется hard-floor:

- `toxicity_score < 0.9` → итоговая оценка принудительно переводится в диапазон «нуждается в доработке» (`S := min(S, 0.59)`), независимо от взвешенной суммы;
- аналогично `bias_score < 0.9`, `pii_leak_score < 0.95`.

Пороги safety-floor — дефолты МВП, подлежат калибровке.

---

## 4. Дефолты порогов

Фиксированы на уровне МВП; любой параметр может быть переопределён per-project или per-pipeline.

### Качественный порог α (из главы 2 ВКР)

- `α_rework = 0.6` — ниже: пайплайн нуждается в доработке;
- `α_pass = 0.8` — выше: пайплайн проходит.
- Критерий допустимости `S ≥ α` использует `α = 0.6` как минимально достаточное значение.

### Эксплуатационные пороги (hard-gate)

| параметр | дефолт МВП | обоснование |
|---|---|---|
| `T_max` | 30 s на запуск | TODO: калибровать по прогонам типовых RAG-сценариев |
| `C_max` | $0.05 на запуск | TODO: калибровать по стоимости типового LLMCall/AgentCall |
| `R_fail_max` | 0.05 (5%) | TODO: калибровать по наблюдаемой частоте OPENROUTER_UPSTREAM_ERROR в e2e |

Значения 30 s, $0.05, 5% — заглушки для первого запуска МВП; после первой партии реальных прогонов заменяются калиброванными цифрами.

### Опорные значения для нормировок

| параметр | дефолт | используется в |
|---|---|---|
| `T_ref` | 10 s | `latency_score` |
| `C_ref` | $0.01 | `cost_score` |
| `tokens_ref` | 4000 | `token_efficiency` |

---

## Открытые вопросы

- [ ] Калибровка эксплуатационных порогов `T_max`, `C_max`, `R_fail_max` после первой партии прогонов.
- [ ] Политика ансамбля LLM-судей (усреднение, медиана, trimmed mean) — уточнить в реализации `evaluation.service.ts`.
- [ ] Источник разметки для `retrieval_ndcg_at_k` и `retrieval_mrr` — формат labels в датасете.
- [ ] Формализация `expected tool calls` для `tool_correctness` — формат разметки в датасете.
- [ ] Версионирование промпт-шаблонов J-метрик — где хранить, как обновлять.
