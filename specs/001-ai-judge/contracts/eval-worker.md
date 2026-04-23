# Contract: Backend ↔ Python Eval Worker

**Feature**: `001-ai-judge`
**Surface**: внутренний контракт между Node-backend и Python-сайдкаром
`judge-eval-worker`. НЕ публичный, не привязан к frozen-surface
`/docs/sdd/11-backend-contract-freeze.md`. Изменения требуют синхронной
ревизии адаптера `services/core/eval_worker/eval_worker.client.ts`.
**Сеть**: внутренняя `brainiac-network`; сайдкар слушает на порту `8001`,
наружу не пробрасывается.

---

## `GET /health`

Health-check сайдкара. Используется backend'ом перед запуском оценки и
периодически.

### Response — 200 OK

```json
{
  "status": "ok",
  "version": "0.1.0",
  "models_loaded": [
    "ragas:default",
    "detoxify:unbiased-small",
    "nli:mnli-base"
  ]
}
```

Сайдкар MUST возвращать `200` только когда все модели, необходимые для
объявленных метрик, загружены в память. Частичная готовность —
возвращается `503` с подробностями в теле.

### Response — 503

```json
{
  "status": "starting",
  "pending_models": ["detoxify:unbiased-small"]
}
```

---

## `POST /metrics/{metric_code}`

Запрос на вычисление конкретной метрики.

### Path parameters

- `metric_code` — один из `f_faith`, `f_fact`, `f_cite`, `f_corr`, `f_contra`,
  `f_sim`, `f_judge_ref`, `f_safe` (MVP набор sidecar-метрик; расширяется
  по мере подключения).

### Request body (общий shape)

```json
{
  "agent_output": { "text": "42", "context": [ "..." ], "claims": [ "..." ] },
  "reference": { "answer": "42", "relevant_doc_ids": ["d1"] },
  "config": {
    "model_hint": "ragas:default",
    "top_k": 3
  }
}
```

| Поле | Обязательность | Комментарий |
|------|----------------|-------------|
| `agent_output` | required | shape зависит от метрики — описан в schema (см. §Schemas per metric) |
| `reference` | conditional | присутствует только для reference-зависимых метрик |
| `config` | optional | метрика-специфичные параметры |

### Response — 200 OK

```json
{
  "value": 0.68,
  "details": {
    "claims_total": 5,
    "claims_supported": 3
  },
  "warnings": []
}
```

Замороженные поля ответа:

- `value`: float ∈ `[0, 1]`. Нарушение вызывает `500` на клиенте
  (FR-EVAL-005).
- `details`: произвольный объект (нестабильные поля).
- `warnings`: массив строк.

### Response — 400 Bad Request

Невалидный payload для данной метрики:

```json
{
  "code": "EVAL_WORKER_INVALID_INPUT",
  "message": "Missing reference.answer for f_EM-like metric",
  "details": { }
}
```

### Response — 422 Unprocessable Entity

Метрика неприменима к переданным данным (например, `f_cite` на ответе
без цитирований):

```json
{
  "code": "EVAL_WORKER_METRIC_NOT_APPLICABLE",
  "reason": "no_citations"
}
```

Backend интерпретирует `422` как сигнал пометить `MetricScore` как
`skipped` с классом отказа `parsing violation` (R6 таксономия), а не как
сбой сайдкара.

### Response — 503 Service Unavailable

Сайдкар не готов (модели ещё не загружены). Backend интерпретирует это
как transient-ошибку; метрика помечается `unavailable` с классом
`sidecar_unreachable` (FR-EVAL-004).

### Response — 500

Внутренняя ошибка сайдкара. Backend ретраит согласно R6 (2 попытки,
backoff 500 мс). После исчерпания — `unavailable`.

---

## Schemas per metric (MVP)

Ниже — входные shape'ы для MVP метрик. Детальный pydantic-контракт
живёт в `judge-eval-worker/app/contracts/schemas.py` и соответствует
этому документу.

### `f_EM`-like — не в sidecar (native в Node).

### `f_faith`

- `agent_output.text` — string (ответ).
- `agent_output.context` — string[] (собранный RAG-контекст).
- (опц.) `agent_output.claims` — string[] (если уже разбит, иначе сайдкар
  разбивает сам).
- `reference` не обязателен.
- Возвращает `value = claims_supported / claims_total`.

### `f_fact`

- `agent_output.text` — string.
- `reference.relevant_doc_texts` — string[].
- Возвращает `value = atoms_supported / atoms_total`.

### `f_cite`

- `agent_output.text_with_citations` — string с inline-цитированиями.
- `reference.relevant_doc_ids` — string[] или int[].
- Возвращает `value = F1(Citation Precision, Citation Recall)`.

### `f_corr`

- `agent_output.text` — string.
- `reference.answer` — string.
- Возвращает Ragas Answer Correctness `∈ [0, 1]`.

### `f_contra`

- `agent_output.text` — string.
- `agent_output.context` — string[].
- Возвращает `1 − доля_противоречий_NLI`.

### `f_sim`

- `agent_output.text` — string.
- `reference.answer` — string.
- Возвращает `max(0, cos(E(a), E(y)))`.

### `f_judge_ref`

- `agent_output.text` — string.
- `reference.answer` — string.
- `config.rubric` — string (G-Eval / Prometheus rubric id) или inline-rubric.
- `config.scale` — int, default 5.
- Возвращает `(s − 1) / (scale − 1)`.

### `f_safe`

- `agent_output.text` — string.
- Возвращает `1 − max(Detoxify_score, LlamaGuard_score)`.

---

## Клиент (backend) — требования

- Клиент MUST валидировать входной payload перед отправкой (уменьшает
  нагрузку на сайдкар).
- Клиент MUST таймаутить по `JUDGE_EVAL_WORKER_TIMEOUT_MS` (дефолт 30 с,
  R2) и ретраить 2 раза с фиксированным backoff 500 мс только на
  `5xx` и сетевых ошибках.
- Клиент MUST NOT ретраить на `4xx` и `422` — это детерминированные
  входные ошибки.
- Клиент MUST пробрасывать `warnings` из ответа в `MetricScore.details_json`
  для последующего отображения в отчёте.
