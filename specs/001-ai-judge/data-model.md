# Phase 1 Data Model: ИИ-Судья Оценки Агентного Графа

**Feature**: `001-ai-judge`
**Date**: 2026-04-23

## Назначение

Описать новые модели Prisma и их связи с существующей схемой. Документ —
источник для миграции `prisma/migrations/2026xxxx_add_judge_models`.
Ключевой принцип: все новые записи подчиняются ownership-цепочке
`User → Project → Pipeline → …` и никогда не читаются маршрутом в обход
data-слоя (FR-ARCH-001).

Ссылки на существующие модели: `User`, `Project`, `Pipeline`, `Dataset`,
`Node` — из [backend/prisma/schema.prisma](../../backend/prisma/schema.prisma).

---

## Сводная диаграмма отношений

```text
User ──< Project ──< Pipeline ──┬── PipelineVersion? (опционально, см. §0)
                                ├── Dataset ──< Document ──< GoldAnnotation
                                │                               │
                                │                               └── JudgeAssessmentFrozenGold
                                │                                           │
                                └── JudgeAssessment ─────────────────────────┘
                                         │
                                         ├── JudgeAssessmentItem ──< MetricScore ─── MetricDefinition
                                         ├── OperationalMetrics
                                         ├── AxisCoverage
                                         ├── JudgeAssessmentInflight (lock / idempotency)
                                         └── WeightProfile ← (через fk)
                                                NormalizationProfile ← (через fk)

User ──< JudgeConversation ──< JudgeMessage
                                  │
                                  └── (optional) JudgeAssessment
```

---

## §0. Замечание о `PipelineVersion`

Текущая `schema.prisma` на ветке `eval-judge` не содержит
`PipelineVersion`. На `judge-agent` она была, но через другую доменную
модель (UUID), несовместимую с текущей (Int). Для MVP модуля судьи
используется `Pipeline.pipeline_id` как единица версии (одна версия на
пайплайн). Введение `PipelineVersion` отложено как отдельная
пред-фича. Все ссылки в спеке на `pipeline_version_id` реализуются через
`pipeline_id` с оставленной возможностью расширения (поле
`pipeline_version_id: Int?` на будущее).

---

## §1. `JudgeAssessment` — корневая запись оценки

Один ряд = одна асинхронная джоба оценки пайплайна на конкретном датасете.

| Поле | Тип | Обязательное | Комментарий |
|------|-----|--------------|-------------|
| `assessment_id` | Int `@id @default(autoincrement())` | да | PK |
| `fk_pipeline_id` | Int | да | ссылка на `Pipeline` |
| `fk_dataset_id` | Int | да | ссылка на `Dataset` |
| `fk_weight_profile_id` | Int | да | `WeightProfile` |
| `fk_normalization_profile_id` | Int | да | `NormalizationProfile` |
| `fk_initiator_user_id` | Int | да | пользователь, запустивший оценку |
| `status` | String (char 16) | да | `queued` / `running` / `succeeded` / `failed` |
| `verdict` | String (char 16)? | нет | `improvement` / `satisfactory` / `pass` — после завершения |
| `final_score` | Decimal(4, 3)? | нет | `S` после завершения |
| `alpha_thresholds_json` | Json | да | `{ α_improvement: 0.6, α_pass: 0.8 }` актуальные на момент запуска |
| `hard_gate_status` | String (char 16)? | нет | `pass` / `fail` / `unknown` |
| `preflight_warnings_json` | Json? | нет | копия warnings из preflight |
| `preset` | String (char 16) | да | `default` / `dev` / `production` |
| `request_json` | Json | да | тело входящего `POST /judge/assessments` |
| `summary_json` | Json? | нет | финальный отчёт в формате public-контракта (см. `contracts/judge-assessments.md`) |
| `error_json` | Json? | нет | причина отказа при `status = failed` |
| `idempotency_key` | String (char 128)? | нет | уникально в рамках пайплайна+датасета |
| `total_items` | Int | да | размер датасета на момент запуска |
| `completed_items` | Int | да default(0) | счётчик для прогресса |
| `skipped_items` | Int | да default(0) | счётчик для `R_fail(a)` |
| `failed_items` | Int | да default(0) | зарезервировано на терминальные отказы элементов |
| `created_at` | DateTime `@default(now())` | да | |
| `updated_at` | DateTime `@updatedAt` | да | |
| `started_at` | DateTime? | нет | выставляется переходом `queued → running` |
| `finished_at` | DateTime? | нет | выставляется терминальным переходом |

**Индексы**:
- `@@index([fk_pipeline_id, fk_dataset_id])` — для поиска последних оценок пары.
- `@@unique([fk_pipeline_id, fk_dataset_id, idempotency_key])` — replay (FR-EXEC-001).
- `@@index([status])` — быстрый отбор активных.

**State machine**:
```
queued ──► running ──► succeeded
   │            │
   │            └──► failed
   └──► failed (preflight errors или валидация)
```
Переходы вне этого графа MUST NOT происходить (FR-EXEC-003).

**Validation rules**:
- `final_score ∈ [0, 1]` если присутствует.
- `verdict` и `final_score` MUST NOT присутствовать при `status ∈ {queued, running}`.
- `error_json` MUST присутствовать только при `status = failed`.

---

## §2. `JudgeAssessmentItem` — per-item прогресс (checkpoint store)

| Поле | Тип | Обязательное | Комментарий |
|------|-----|--------------|-------------|
| `item_id` | Int `@id @default(autoincrement())` | да | PK |
| `fk_assessment_id` | Int | да | ссылка на `JudgeAssessment` |
| `fk_document_id` | Int | да | элемент датасета |
| `item_index` | Int | да | порядковый номер внутри assessment (0..m-1) |
| `status` | String (char 16) | да | `pending` / `running` / `completed` / `skipped` / `failed` |
| `attempt_count` | Int | да default(0) | |
| `agent_run_id` | Int? | нет | ссылка на запись прогона (если введён `Run`) |
| `agent_output_json` | Json? | нет | снапшот ответа агента на этом элементе |
| `tool_call_trace_json` | Json? | нет | копия trace для метрик оси D (FR-009) |
| `failure_class` | String (char 32)? | нет | из таксономии (timeout / tool error / …) |
| `failure_detail_json` | Json? | нет | подробности последней ошибки |
| `created_at` | DateTime `@default(now())` | да | |
| `updated_at` | DateTime `@updatedAt` | да | |

**Индексы**:
- `@@unique([fk_assessment_id, item_index])` — фиксированный порядок.
- `@@index([fk_assessment_id, status])` — для поиска первого non-terminal элемента (FR-EXEC-008).

**Terminal statuses**: `completed`, `skipped`. `failed` используется только в
исключительных сценариях уровня item (будет расширено при необходимости).

---

## §3. `JudgeAssessmentInflight` — lock / idempotency claim

| Поле | Тип | Обязательное | Комментарий |
|------|-----|--------------|-------------|
| `inflight_id` | Int `@id @default(autoincrement())` | да | PK |
| `fk_pipeline_id` | Int | да | |
| `fk_dataset_id` | Int | да | |
| `fk_assessment_id` | Int | да | активная джоба |
| `updated_at` | DateTime `@updatedAt` | да | для stale-policy |
| `created_at` | DateTime `@default(now())` | да | |

**Индексы**:
- `@@unique([fk_pipeline_id, fk_dataset_id])` — не больше одного активного
  claim на пару (FR-EXEC-005). При завершении джобы строка MUST удаляться.

**Stale policy**:
- Если `now() − updated_at > EVAL_INFLIGHT_STALE_MS` (по умолчанию 10 мин),
  claim считается устаревшим и MAY быть сметён следующим запросом.

---

## §4. `MetricDefinition` — запись о метрике

| Поле | Тип | Обязательное | Комментарий |
|------|-----|--------------|-------------|
| `metric_id` | Int `@id @default(autoincrement())` | да | PK |
| `code` | String (char 32) `@unique` | да | `f_EM`, `f_faith`, … |
| `axis` | String (char 2) | да | `A`..`H` |
| `title` | String (char 128) | да | человекочитаемое название |
| `requires_reference` | Boolean | да | |
| `executor` | String (char 16) | да | `native` / `sidecar` |
| `description` | String (char 512)? | нет | |
| `source` | String (char 32)? | нет | `native` / `ragas` / `deepeval` / `detoxify` / … |

**Seed data**: 25 минимальных метрик из FR-031 (можно расширять до полного
каталога без миграции).

---

## §5. `MetricScore` — значение `S_j` на узле/элементе

| Поле | Тип | Обязательное | Комментарий |
|------|-----|--------------|-------------|
| `score_id` | Int `@id @default(autoincrement())` | да | PK |
| `fk_assessment_id` | Int | да | |
| `fk_metric_id` | Int | да | ссылка на `MetricDefinition` |
| `fk_node_id` | Int | да | узел, к которому метрика привязана |
| `value` | Decimal(5, 4) | да | `S_j ∈ [0, 1]` |
| `sample_size` | Int | да | число элементов датасета, на которых был агрегат |
| `contributing_axis` | String (char 2) | да | ось, к которой относится score |
| `origin_reason` | String (char 256) | да | обоснование включения (узел + ось) |
| `executor_used` | String (char 16) | да | `native` / `sidecar` — что реально посчитало |
| `normalization_applied_json` | Json? | нет | фактические параметры нормализации |
| `details_json` | Json? | нет | raw-ответ метрики (опционально) |
| `created_at` | DateTime `@default(now())` | да | |

**Индексы**:
- `@@unique([fk_assessment_id, fk_metric_id, fk_node_id])` — не больше одной
  записи на тройку.
- `@@index([fk_assessment_id])` — отчёт одной оценки.

**Validation rules**:
- `value ∈ [0, 1]`.
- `sample_size ≥ 1` или запись помечает константную редукцию (циклические
  метрики в ациклическом пайплайне, FR-011).

---

## §6. `WeightProfile` — набор весов `W`

| Поле | Тип | Обязательное | Комментарий |
|------|-----|--------------|-------------|
| `weight_profile_id` | Int `@id @default(autoincrement())` | да | PK |
| `code` | String (char 32) `@unique` | да | `rag_default_v1`, `tool_use_default_v1`, … |
| `architectural_class` | String (char 16) | да | `rag` / `tool_use` / `extractor` / `judge` |
| `method` | String (char 16) | да | `ahp_template` / `critic` / `hybrid` |
| `lambda` | Decimal(3, 2)? | нет | λ из AHP+CRITIC |
| `consistency_ratio` | Decimal(4, 3)? | нет | CR для AHP |
| `weights_json` | Json | да | `{ "f_faith": 0.25, "f_corr": 0.15, ... }` c `Σ = 1` |
| `active` | Boolean | да default(true) | для soft-деактивации |
| `created_at` | DateTime `@default(now())` | да | |

**Validation rules**:
- `Σ weights_json[code] = 1.0 ± 0.001` (FR-008).
- Keys `weights_json` MUST ссылаться на существующие `MetricDefinition.code`.

---

## §7. `NormalizationProfile` — параметры нормализации

| Поле | Тип | Обязательное | Комментарий |
|------|-----|--------------|-------------|
| `normalization_profile_id` | Int `@id @default(autoincrement())` | да | PK |
| `code` | String (char 32) | да | human-readable (`mvp_default_v1`, ...) |
| `version` | Int | да | монотонно возрастающий |
| `params_json` | Json | да | см. R7 исследования |
| `calibrated_on_json` | Json? | нет | метаданные калибровочного датасета |
| `active` | Boolean | да default(true) | |
| `created_at` | DateTime `@default(now())` | да | |

**Индексы**:
- `@@unique([code, version])`.

---

## §8. `AxisCoverage` — покрытие обязательных осей

| Поле | Тип | Обязательное | Комментарий |
|------|-----|--------------|-------------|
| `coverage_id` | Int `@id @default(autoincrement())` | да | PK |
| `fk_assessment_id` | Int | да | |
| `axis` | String (char 2) | да | `A`..`H` |
| `mandatory` | Boolean | да | была ли ось обязательной для этого пайплайна |
| `covered` | Boolean | да | |
| `metric_count` | Int | да | число метрик на оси |

**Индексы**:
- `@@unique([fk_assessment_id, axis])`.

---

## §9. `OperationalMetrics` — операционный слой

| Поле | Тип | Обязательное | Комментарий |
|------|-----|--------------|-------------|
| `ops_id` | Int `@id @default(autoincrement())` | да | PK |
| `fk_assessment_id` | Int `@unique` | да | 1:1 к assessment |
| `p95_latency_ms` | Int? | нет | |
| `total_cost_usd` | Decimal(10, 6)? | нет | |
| `total_tokens_in` | Int? | нет | |
| `total_tokens_out` | Int? | нет | |
| `fail_rate` | Decimal(5, 4)? | нет | `R_fail(a)` |
| `failure_taxonomy_json` | Json? | нет | `{ "timeout": 3, "tool error": 1, ... }` |
| `hard_gate_status` | String (char 16)? | нет | копия на `JudgeAssessment.hard_gate_status` для быстрого чтения |

---

## §10. `GoldAnnotation` и `JudgeAssessmentFrozenGold`

### `Document` (новая вспомогательная модель)

Текущая `schema.prisma` не содержит модели `Document`. Для корректной
связки эталонов с элементом датасета вводится минимальная сущность
`Document` (N:1 на `Dataset`). Миграция создаёт её вместе с индексом
`@@index([fk_dataset_id, dataset_item_key])`.

| Поле | Тип | Обязательное | Комментарий |
|------|-----|--------------|-------------|
| `document_id` | Int `@id @default(autoincrement())` | да | PK |
| `fk_dataset_id` | Int | да | ссылка на `Dataset` |
| `dataset_item_key` | String (char 128) | да | стабильный ключ внутри датасета |
| `input_json` | Json | да | `x_k` — вход для прогона агента |
| `metadata_json` | Json? | нет | |
| `created_at` | DateTime `@default(now())` | да | |

### `GoldAnnotation`

| Поле | Тип | Обязательное | Комментарий |
|------|-----|--------------|-------------|
| `gold_annotation_id` | Int `@id @default(autoincrement())` | да | PK |
| `fk_document_id` | Int | да | |
| `annotation_type` | String (char 32) | да | `answer` / `claims` / `relevant_docs` / `tool_trajectory` / … |
| `payload_json` | Json | да | содержимое разметки по типу |
| `version` | Int | да default(1) | монотонно возрастает |
| `current` | Boolean | да default(true) | помечает последнюю ревизию |
| `fk_author_user_id` | Int? | нет | автор разметки |
| `created_at` | DateTime `@default(now())` | да | |
| `deleted_at` | DateTime? | нет | soft-delete |

**Индексы**:
- `@@unique([fk_document_id, annotation_type, version])`.
- `@@index([fk_document_id, annotation_type, current])`.

**Инвариант**: для одного `(fk_document_id, annotation_type)` может быть не
более одной строки с `current = true`.

### `JudgeAssessmentFrozenGold`

Снапшот того, какие именно версии `GoldAnnotation` участвовали в оценке.

| Поле | Тип | Обязательное | Комментарий |
|------|-----|--------------|-------------|
| `frozen_id` | Int `@id @default(autoincrement())` | да | PK |
| `fk_assessment_id` | Int | да | |
| `fk_gold_annotation_id` | Int | да | конкретная версия разметки |
| `fk_document_id` | Int | да | денорма для быстрого поиска |
| `annotation_type` | String (char 32) | да | |

**Индексы**:
- `@@unique([fk_assessment_id, fk_document_id, annotation_type])`.

---

## §11. `JudgeConversation` и `JudgeMessage`

### `JudgeConversation`

| Поле | Тип | Обязательное | Комментарий |
|------|-----|--------------|-------------|
| `conversation_id` | Int `@id @default(autoincrement())` | да | PK |
| `fk_user_id` | Int | да | владелец диалога |
| `fk_project_id` | Int | да | для ownership-скоупа |
| `fk_assessment_id` | Int? | нет | опционально — контекст оценки |
| `title` | String (char 256)? | нет | |
| `created_at` | DateTime `@default(now())` | да | |
| `updated_at` | DateTime `@updatedAt` | да | |

### `JudgeMessage`

| Поле | Тип | Обязательное | Комментарий |
|------|-----|--------------|-------------|
| `message_id` | Int `@id @default(autoincrement())` | да | PK |
| `fk_conversation_id` | Int | да | |
| `role` | String (char 16) | да | `user` / `assistant` / `tool` |
| `content` | String `@db.Text` | да | для `role = tool` — сериализованный JSON |
| `tool_name` | String (char 64)? | нет | для `role = tool` — имя tool-call |
| `tool_call_id` | String (char 64)? | нет | для связки assistant↔tool |
| `created_at` | DateTime `@default(now())` | да | |

**Индексы**:
- `@@index([fk_conversation_id, created_at])` — упорядоченный стрим.

---

## §12. Связи с существующими моделями

| Существующая модель | Новая ссылка | Поле |
|---------------------|--------------|------|
| `User` | `JudgeAssessment.fk_initiator_user_id` | FK |
| `User` | `JudgeConversation.fk_user_id` | FK |
| `Project` | `JudgeConversation.fk_project_id` | FK (для ownership) |
| `Pipeline` | `JudgeAssessment.fk_pipeline_id` | FK |
| `Pipeline` | `JudgeAssessmentInflight.fk_pipeline_id` | FK |
| `Dataset` | `JudgeAssessment.fk_dataset_id` | FK |
| `Dataset` | `Document.fk_dataset_id` | FK |
| `Dataset` | `JudgeAssessmentInflight.fk_dataset_id` | FK |
| `Node` | `MetricScore.fk_node_id` | FK |

Все FK MUST использовать `onDelete: Cascade` либо `onDelete: Restrict` в
зависимости от аудит-требований — конкретная политика фиксируется при
`/speckit.tasks` (deferred до описания сценариев удаления пайплайна).

---

## §13. Lifecycle-правила и инварианты (сводка)

1. `JudgeAssessment.status` подчиняется state-machine §1 и FR-EXEC-003.
2. Существует не более одного `JudgeAssessmentInflight` с `active` статусом
   на пару `(fk_pipeline_id, fk_dataset_id)` (§3, FR-EXEC-005).
3. `JudgeAssessmentItem.status` терминальный только если `completed` или
   `skipped` (§2, FR-EXEC-008).
4. `Σ WeightProfile.weights_json[code] = 1.0 ± 0.001` (§6, FR-008).
5. Для каждого `(fk_document_id, annotation_type)` не более одной строки
   `GoldAnnotation.current = true` (§10, FR-032).
6. `JudgeAssessment.summary_json` MUST заполняться только при переходе в
   `succeeded`; до этого — null (§1, FR-EXEC-002).
7. `MetricScore.value ∈ [0, 1]` (§5, FR-006).

---

## §14. Миграционный план

1. Создать `prisma/migrations/2026xxxx_add_judge_models/migration.sql` с
   таблицами §1..§11. Миграция должна быть идемпотентной на уровне
   `CREATE TABLE IF NOT EXISTS` там, где Prisma позволяет.
2. Seed `MetricDefinition` (25 записей согласно FR-031) и 4 стартовых
   `WeightProfile` (R8) — в `prisma/seeds/seed-judge-bootstrap.mjs`.
3. Seed базового `NormalizationProfile` `mvp_default_v1` с пустыми
   параметрами (native-метрики MVP не требуют rescaling).
4. Обратная совместимость: ни одна существующая таблица не меняет схему;
   добавляются только новые.

Развёртывание в production: `npm --prefix backend run prisma:deploy` +
выполнение seed-скрипта через одноразовый shell-шаг (как существующие
seeds).
