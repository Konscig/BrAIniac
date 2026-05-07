# Contract: Judge Assessments API

**Feature**: `001-ai-judge`
**Surface**: новый публичный контракт. НЕ затрагивает frozen-surface из
[docs/sdd/11-backend-contract-freeze.md](../../../docs/sdd/11-backend-contract-freeze.md).
**Auth**: все маршруты требуют `Authorization: Bearer <JWT>` через существующий
`auth.middleware.ts`. Ownership по цепочке `User → Project → Pipeline → Dataset`.

---

## `POST /judge/assessments`

Запуск асинхронной оценки пайплайна на датасете.

### Headers

- `Authorization: Bearer <JWT>` — required.
- `x-idempotency-key: <string>` — optional, 1..128 ASCII символов; повтор с
  тем же ключом возвращает тот же `assessment_id` (FR-EXEC-001).

### Request body

```json
{
  "pipeline_id": 359,
  "dataset_id": 173,
  "preset": "default",
  "weight_profile_code": "rag_default_v1",
  "normalization_profile_code": "mvp_default_v1",
  "alpha_thresholds": {
    "improvement": 0.6,
    "pass": 0.8
  }
}
```

| Поле | Тип | Обязательность | Комментарий |
|------|-----|----------------|-------------|
| `pipeline_id` | int | required | существующий пайплайн владельца JWT |
| `dataset_id` | int | required | существующий датасет владельца JWT |
| `preset` | string | optional, default `default` | `default` / `dev` / `production` |
| `weight_profile_code` | string | optional | если не указан — выбирается rule-based по архитектурному классу (R8) |
| `normalization_profile_code` | string | optional, default `mvp_default_v1` | |
| `alpha_thresholds` | object | optional | если не указан — дефолты FR-015 |

Поля, явно не перечисленные, отклоняются (preset-only-style, см. принцип III).

### Response — 202 Accepted

```json
{
  "assessment_id": 42,
  "pipeline_id": 359,
  "dataset_id": 173,
  "status": "queued",
  "idempotency_key": "abc-...",
  "total_items": 10,
  "completed_items": 0,
  "created_at": "2026-04-23T12:34:56.000Z",
  "updated_at": "2026-04-23T12:34:56.000Z",
  "request": { /* reflection тела запроса */ }
}
```

### Response — 409 Conflict

Возвращается, если на пару `(pipeline_id, dataset_id)` уже есть активная
оценка и `x-idempotency-key` не совпадает с её ключом (FR-EXEC-005).

```json
{
  "code": "JUDGE_ASSESSMENT_INFLIGHT",
  "message": "Active assessment exists for this pipeline/dataset",
  "active_assessment_id": 41
}
```

### Response — 422 Unprocessable Entity

Preflight вернул hard-ошибки (R9):

```json
{
  "code": "JUDGE_ASSESSMENT_PREFLIGHT_FAILED",
  "preflight_errors": [
    {
      "code": "GRAPH_UNGUARDED_CYCLE",
      "message": "Cycle is allowed only with loop-policy",
      "details": { "fromNode": 10, "toNode": 4 }
    }
  ]
}
```

### Response — 404 Not Found

Pipeline или dataset не принадлежат владельцу JWT (маскировка существования,
R13).

### Other errors

- `400 Bad Request` — валидация тела запроса.
- `401 Unauthorized` — нет/неверный JWT.
- `500 Internal Server Error` — непредвиденная ошибка.

---

## `GET /judge/assessments/:assessment_id`

Чтение текущего состояния и финального отчёта.

### Headers

- `Authorization: Bearer <JWT>` — required.

### Response — 200 OK

```json
{
  "assessment_id": 42,
  "pipeline_id": 359,
  "dataset_id": 173,
  "status": "running",
  "idempotency_key": "abc-...",
  "preset": "default",
  "weight_profile": {
    "code": "rag_default_v1",
    "architectural_class": "rag",
    "method": "ahp_template"
  },
  "normalization_profile": {
    "code": "mvp_default_v1",
    "version": 1
  },
  "alpha_thresholds": { "improvement": 0.6, "pass": 0.8 },
  "progress": {
    "completed_items": 4,
    "skipped_items": 1,
    "total_items": 10
  },
  "created_at": "2026-04-23T12:34:56.000Z",
  "updated_at": "2026-04-23T12:37:12.000Z",
  "started_at": "2026-04-23T12:34:58.000Z",
  "finished_at": null,
  "preflight_warnings": [],
  "summary": null,
  "error": null,
  "request": { /* reflection */ }
}
```

### Response — 200 OK при `status = succeeded`

Дополнительно заполнено поле `summary`:

```json
{
  "summary": {
    "final_score": 0.71,
    "verdict": "satisfactory",
    "hard_gate_status": "pass",
    "axis_coverage": [
      { "axis": "A", "mandatory": true, "covered": true, "metric_count": 4 },
      { "axis": "B", "mandatory": true, "covered": true, "metric_count": 3 }
    ],
    "metric_scores": [
      {
        "metric_code": "f_faith",
        "value": 0.68,
        "axis": "B",
        "node_id": 142,
        "origin_reason": "AgentCall → Grounding axis",
        "executor_used": "sidecar",
        "sample_size": 10,
        "aggregation_method": "mean_over_iterations"
      }
    ],
    "operational": {
      "p95_latency_ms": 3400,
      "total_cost_usd": 0.123,
      "fail_rate": 0.1,
      "failure_taxonomy": { "timeout": 1 }
    },
    "frozen_gold_annotation_ids": [17, 18, 19]
  }
}
```

### Response — 200 OK при `status = failed`

```json
{
  "status": "failed",
  "error": {
    "code": "JUDGE_ASSESSMENT_FAILED",
    "reason": "fail_rate_exceeded",
    "detail": "skipped_items / total_items = 0.7 > R_fail_max = 0.5"
  }
}
```

### Response — 404 Not Found

`assessment_id` не найден или принадлежит чужому владельцу (маскировка).

---

## `GET /judge/assessments/:assessment_id/comparison?against=<other_assessment_id>`

Сравнение двух завершённых оценок (US 3, SC-007).

### Response — 200 OK

```json
{
  "base": {
    "assessment_id": 42,
    "final_score": 0.71,
    "verdict": "satisfactory"
  },
  "against": {
    "assessment_id": 51,
    "final_score": 0.78,
    "verdict": "satisfactory"
  },
  "delta_score": 0.07,
  "delta_per_metric": [
    { "metric_code": "f_faith", "base": 0.68, "against": 0.74, "delta": 0.06 },
    { "metric_code": "f_EM", "base": 0.4, "against": 0.5, "delta": 0.1 }
  ],
  "axis_coverage_diff": [
    { "axis": "C", "base_covered": false, "against_covered": true }
  ]
}
```

### Response — 422

Если хоть одна оценка не `succeeded` — возвращается ошибка
`JUDGE_ASSESSMENT_COMPARISON_NOT_READY`.

---

## Стабильные поля ответа

Замороженные для этого контракта поля (изменение MAJOR-амендмент):

- На 202/200 ответе: `assessment_id`, `pipeline_id`, `dataset_id`, `status`,
  `created_at`, `updated_at`, `request`, `progress.*`, `summary.final_score`,
  `summary.verdict`, `summary.hard_gate_status`, `summary.metric_scores[].{metric_code, value, axis, node_id, aggregation_method?}`,
  `error.code`, `error.reason`.
- `summary.metric_scores[].aggregation_method` присутствует для метрик,
  агрегированных по итерациям цикла (FR-010); допустимые значения:
  `mean_over_iterations` / `last_iteration`. Для ациклических метрик поле
  отсутствует.
- Значения `status` ограничены множеством `{queued, running, succeeded, failed}`.
- Значения `verdict` ограничены множеством `{improvement, satisfactory, pass}`.
- Таксономия `failure_taxonomy` — множество из каталога метрик
  (см. R6 research.md).

Нестабильные поля (могут расширяться без bump): `summary.metric_scores[].details_json`,
`summary.operational.*` (кроме `fail_rate`), `request` (расширения полей).
