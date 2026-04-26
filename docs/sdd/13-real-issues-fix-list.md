# Реальные Проблемы К Фиксу (2026-04-27)

Документ собран по фактическому коду frontend/backend + текущим SDD.

Шкала критичности:
- P0: критично (безопасность/прод-эксплуатация/потеря данных)
- P1: высоко (сильно мешает стабильной работе real RAG)
- P2: средне (заметно ухудшает UX/качество, но не полностью блокирует)
- P3: низко (UX/техдолг)

## 1) датасет не загружается на сервер

## 2) Нет рабочего refresh-token flow
- Priority: P1
- Влияние на real RAG: неблокирующее для ядра RAG, но блокирующее для долгих пользовательских сессий
- Статус: подтверждено
- Что не так:
  - access token живет 15 минут;
  - backend auth routes имеют только `signup/login`;
  - frontend хранит поле `refreshToken`, но механизма рефреша токена нет.
- Доказательства:
  - `backend/src/services/core/jwt.service.ts`
  - `backend/src/routes/resources/auth/auth.routes.ts`
  - `frontend/src/providers/AuthProvider.tsx`
  - `frontend/src/lib/api.ts`
- Что фиксить:
  - реализовать refresh-token lifecycle (issue, rotate, revoke, refresh route);
  - добавить silent refresh в API-клиент фронта.

## 3) Embedder по умолчанию идет в deterministic contract-mode, а не в реальный embedding provider
- Priority: P1
- Влияние на real RAG: высокое для качества retrieval; для reference-baseline не блокирует
- Статус: подтверждено
- Что не так:
  - в seed для `Embedder` дефолтный executor — `http-json`;
  - реальный `openrouter-embeddings` есть, но только как optional/recommended;
  - в UI нет явной конфигурации executor kind для ToolNode.
- Доказательства:
  - `backend/prisma/seeds/seed-tool-contracts.mjs`
  - `backend/src/services/application/tool/contracts/embedder.tool.ts`
  - `frontend/src/lib/node-config.ts`
- Что фиксить:
  - сделать явный продуктовый режим provider-backed embeddings;
  - добавить в UI настройку executor kind/model для Embedder;
  - добавить smoke-тест, который проверяет реальный вызов `/embeddings` провайдера.

## 4) лимит по запросам на тулзы увеличить до 100

## 5) ToolNode не показывает описание выбранного инструмента в UI
- Priority: P3
- Влияние на real RAG: неблокирующее
- Статус: подтверждено
- Что не так:
  - карточка ToolNode показывает выбранный label, но не рендерит description выбранного tool;
  - описания инструментов есть в seed/config (`description_ru`) и в capability advertising (`desc`).
- Доказательства:
  - `frontend/src/components/custom-nodes.tsx`
  - `frontend/src/components/canvas-board.tsx`
  - `backend/prisma/seeds/seed-tool-contracts.mjs`
  - `backend/src/services/application/node/handlers/tool-node.node-handler.ts`
- Что фиксить:
  - пробрасывать и отображать description выбранного инструмента в карточке ToolNode/инспекторе.

## 6) Длительное время выполнения до 40 секунд даже при простом запросе

## 7) Лишний placeholder "Инспектор узла появится здесь позже"
- Priority: P3
- Влияние на real RAG: неблокирующее
- Статус: подтверждено
- Доказательство:
  - `frontend/src/components/sidebar-projects.tsx`
- Что фиксить:
  - удалить placeholder-блок или заменить на полезную информацию.

## 8) Ноды Branch/Merge/RetryGate/LoopGate/Notify/Export остаются без runtime handlers
- Priority: P2
- Влияние на real RAG: неблокирующее для текущего v1 конструктора (скрыты), но блокирует расширение сценариев
- Статус: подтверждено
- Что не так:
  - runtime fallback возвращает `kind: not_implemented` для нод вне реестра handlers.
- Доказательства:
  - `backend/src/services/application/node/handlers/node-handler.registry.ts`
  - `docs/sdd/07-mvp-node-catalog.md`
- Что фиксить:
  - либо удалить эти ноды из каталога продукта до реализации;
  - либо реализовать handlers + тесты + включение в UI.


## 10) Legacy-компонент режимов test/hybrid/real остался в коде как техдолг
- Priority: P3
- Влияние на real RAG: неблокирующее
- Статус: подтверждено
- Что не так:
  - компонент с legacy-режимами существует, но в актуальном продукте не должен использоваться.
- Доказательства:
  - `frontend/src/components/environment-mode-switch.tsx`
  - `docs/sdd/12-frontend-rag-alignment.md`
- Что фиксить:
  - удалить legacy-компонент или явно пометить как deprecated + покрыть тестом отсутствие использования.
