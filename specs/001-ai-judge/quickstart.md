# Quickstart: ИИ-Судья

**Feature**: `001-ai-judge`
**Target audience**: разработчик, подключающийся к задаче после
`/speckit.tasks`. Этот документ — рабочая схема локального запуска и
smoke-проверок. Не содержит шагов реализации (они уйдут в `tasks.md`).

---

## Предварительные условия

- Установлены Docker и docker-compose (BrAIniac использует `docker-compose.yaml`
  в корне).
- Клонирован репозиторий, на ветке `001-ai-judge`.
- В корне есть `.env.docker` со значениями `PG_USER`, `PG_PASSWORD`, `PG_DB`,
  `DATABASE_URL` (уже существует).
- Для локального запуска только backend'а без Docker — установлен Node.js 20
  и Python 3.11 (по желанию, для разработки сайдкара вне контейнера).

---

## Переменные окружения (дополнение к существующим)

Добавить в `.env.docker` и `.env` при необходимости:

```ini
# Судейский LLM — выбор провайдера: mistral | openrouter
JUDGE_PROVIDER=mistral

# Для Mistral-адаптера (когда JUDGE_PROVIDER=mistral)
JUDGE_MISTRAL_API_KEY=<секрет>
JUDGE_MISTRAL_MODEL=ministral-3b-2410

# Для OpenRouter-адаптера (когда JUDGE_PROVIDER=openrouter)
JUDGE_OPENROUTER_MODEL=<например, openai/gpt-4o-mini>
# OPENROUTER_API_KEY уже должен быть задан для runtime — переиспользуется

# Клиент сайдкара
JUDGE_EVAL_WORKER_URL=http://judge-eval-worker:8001
JUDGE_EVAL_WORKER_TIMEOUT_MS=30000

# Параметры per-item retry
JUDGE_MAX_ATTEMPTS_PER_ITEM=3
JUDGE_SOFT_RETRY_DELAY_MS=800

# Inflight stale
EVAL_INFLIGHT_STALE_MS=600000

# Порог R_fail_max для assessment.failed
JUDGE_FAIL_RATE_MAX=0.5
```

---

## Поднятие стека

```bash
# БД + backend + frontend + сайдкар (профиль app)
docker compose --profile app up --build
```

После старта должны быть доступны:

- `http://localhost:8080/health` — backend (существующий маршрут).
- Внутри сети: `http://judge-eval-worker:8001/health`.
- `http://localhost:3000` — frontend.

Если сайдкар не стартует, убедись что в `docker-compose.yaml` добавлен
сервис `judge-eval-worker` (Phase 1 плана описывает расширение).

---

## Миграция и seed данных судьи

```bash
# Применить миграцию с новыми моделями
docker compose exec backend npx prisma migrate deploy

# Seed — метрики и стартовые weight-профили
docker compose exec backend npm run seed:judge-bootstrap
```

После успешного seed в БД должно быть:

- 25+ `MetricDefinition`.
- 4 `WeightProfile`: `rag_default_v1`, `tool_use_default_v1`,
  `extractor_default_v1`, `judge_default_v1`.
- 1 `NormalizationProfile`: `mvp_default_v1`.

---

## Smoke-сценарий: первая оценка

Шаги ниже проходят US1 (Story 1 — Автоматическая Оценка Пайплайна).

1. **Предусловие**: есть пайплайн `pipeline_id=359` (RAG-агент) и
   датасет `dataset_id=173` с несколькими `Document` + `GoldAnnotation`
   типа `answer` и `relevant_docs`.

2. **Создание эталонов** (если ещё нет):

   ```bash
   curl -X POST http://localhost:8080/datasets/173/gold-annotations \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "items": [
         { "document_id": 401, "annotation_type": "answer",         "payload": { "text": "Artemis II is the second crewed Artemis mission" } },
         { "document_id": 401, "annotation_type": "relevant_docs",  "payload": { "doc_ids": ["d42"] } }
       ]
     }'
   ```

   Ожидается `201 Created` с массивом `created[...]`.

3. **Запуск оценки**:

   ```bash
   curl -X POST http://localhost:8080/judge/assessments \
     -H "Authorization: Bearer $TOKEN" \
     -H "x-idempotency-key: smoke-1" \
     -H "Content-Type: application/json" \
     -d '{
       "pipeline_id": 359,
       "dataset_id": 173,
       "preset": "default"
     }'
   ```

   Ожидается `202 Accepted` с `assessment_id`.

4. **Polling**:

   ```bash
   curl http://localhost:8080/judge/assessments/$ASSESSMENT_ID \
     -H "Authorization: Bearer $TOKEN"
   ```

   До `status ∈ { succeeded, failed }`. При `succeeded` — в ответе
   `summary.final_score`, `summary.verdict`, `summary.metric_scores[]`.

5. **Идентичный replay**:

   Повторить шаг 3 с тем же `x-idempotency-key: smoke-1` — ответ должен
   вернуть тот же `assessment_id` без создания второй джобы (FR-EXEC-001).

6. **Проверка in-flight lock**:

   Во время `status = running` отправить `POST /judge/assessments` на ту
   же пару с **другим** ключом — ожидается `409 Conflict` с
   `active_assessment_id` = текущий (FR-EXEC-005).

---

## Smoke-сценарий: чат судьи

Шаги ниже проходят US2 (Story 2 — Интерактивный Разбор Оценки).

1. **Отправка вопроса в новый диалог**:

   ```bash
   curl -X POST http://localhost:8080/judge/chat \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "project_id": 21,
       "assessment_id": '$ASSESSMENT_ID',
       "message": "Какой узел дал самый большой вклад в провал?"
     }'
   ```

   Ожидается `200 OK` с `conversation_id`, `assistant_message`,
   опционально `tool_calls_executed[]` с вызовами `getMetrics`/`getNode`.

2. **Продолжение диалога**:

   ```bash
   curl -X POST http://localhost:8080/judge/chat \
     -H "Authorization: Bearer $TOKEN" \
     -d '{
       "project_id": 21,
       "conversation_id": '$CONVERSATION_ID',
       "message": "Покажи trace tool-calls этого узла"
     }'
   ```

3. **Просмотр истории**:

   ```bash
   curl "http://localhost:8080/judge/history?conversation_id=$CONVERSATION_ID" \
     -H "Authorization: Bearer $TOKEN"
   ```

4. **Проверка персистентности**:

   Перезапустить backend (`docker compose restart backend`), снова
   вызвать `GET /judge/history?conversation_id=...` — история должна
   возвращаться (FR-ARCH-002).

---

## Smoke-сценарий: сравнение версий

Шаги ниже проходят US3 (Story 3 — Сравнение версий пайплайна).

1. Запустить две оценки пайплайна до и после правки конфигурации агента.
2. При `status = succeeded` обеих:

   ```bash
   curl "http://localhost:8080/judge/assessments/$A1/comparison?against=$A2" \
     -H "Authorization: Bearer $TOKEN"
   ```

   Ожидается `delta_score`, `delta_per_metric[]`.

---

## Автоматизированные smoke-проверки (рекомендуемые)

Добавляются в `backend/scripts/` по паттерну существующих `*.mjs`:

- `judge-assessment-e2e-test.mjs` — US1 end-to-end.
- `judge-chat-smoke-test.mjs` — US2.
- `judge-eval-worker-contract-test.mjs` — контракт backend ↔ сайдкар
  (идентичные входы → одинаковые outputs, проверка схемы ответа).

Добавляются в `package.json → scripts`:

```json
"test:judge:e2e": "node ./scripts/judge-assessment-e2e-test.mjs",
"test:judge:chat": "node ./scripts/judge-chat-smoke-test.mjs",
"test:judge:worker": "node ./scripts/judge-eval-worker-contract-test.mjs"
```

Эти скрипты MUST проходить перед merge в `main` (в дополнение к
существующим `test:contracts:freeze`, `test:executor:http`,
`test:executor:coordination` из конституции).

---

## Частые ошибки и быстрые проверки

| Симптом | Проверка |
|---------|----------|
| `POST /judge/assessments` → `422 PREFLIGHT_FAILED` | Запусти `POST /pipelines/:id/validate-graph`, почини `GRAPH_UNGUARDED_CYCLE` |
| Все sidecar-метрики `unavailable` в отчёте | Проверь `docker compose logs judge-eval-worker`; убедись что `GET http://judge-eval-worker:8001/health` отдаёт `200` |
| Assessment стоит в `running` > ожидаемого | Проверь `JUDGE_MAX_ATTEMPTS_PER_ITEM` и таймаут провайдера; проверь inflight stale через SQL |
| Новая метрика не участвует в `M'_0` | Убедись что реализация зарегистрирована в `metric_registry.ts` и `MetricDefinition` seed'ится |
| `POST /judge/assessments` повторный — дал новую джобу | Проверь, что посылаешь `x-idempotency-key` с тем же значением |
| Чат помнит меня между запусками | Это ожидаемо; персистент (FR-ARCH-002) |

---

## Что дальше

- Запустить `/speckit.tasks` для генерации пошагового списка задач из
  [spec.md](spec.md), [plan.md](plan.md), [data-model.md](data-model.md),
  [contracts/](contracts/).
- Перед merge в `main`: прогнать существующие freeze-тесты
  (`test:contracts:freeze`, `test:executor:http`, `test:executor:coordination`)
  и новые `test:judge:*`.
