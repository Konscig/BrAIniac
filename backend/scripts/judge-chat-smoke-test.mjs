#!/usr/bin/env node
/**
 * Smoke for US2 — чат с судьёй.
 * Проверяет:
 *  - POST /judge/chat открывает диалог и возвращает ответ ассистента
 *  - GET /judge/history возвращает сообщения в хронологическом порядке
 *  - Для несуществующего assessment_id ответ не фабрикует числовые значения
 *    (негативный кейс FR-023)
 */
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL ?? 'http://localhost:8080';

async function main() {
  const token = process.env.JUDGE_TEST_TOKEN;
  const projectId = Number(process.env.JUDGE_TEST_PROJECT_ID ?? 0);
  const assessmentId = Number(process.env.JUDGE_TEST_ASSESSMENT_ID ?? 0);

  if (!token || !projectId) {
    console.log('[judge:chat] skipping: need JUDGE_TEST_TOKEN + JUDGE_TEST_PROJECT_ID');
    return;
  }

  // 1. Happy path — создаём диалог
  const first = await fetch(`${BASE_URL}/judge/chat`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      assessment_id: assessmentId || undefined,
      message: 'Какой узел дал наименьший вклад в S?',
    }),
  });
  assert.equal(first.status, 200);
  const firstJson = await first.json();
  assert.ok(firstJson.conversation_id, 'conversation_id expected');
  assert.ok(firstJson.assistant_message, 'assistant_message expected');
  assert.equal(firstJson.assistant_message.role, 'assistant');

  // 2. История
  const history = await fetch(
    `${BASE_URL}/judge/history?conversation_id=${firstJson.conversation_id}`,
    { headers: { 'Authorization': `Bearer ${token}` } },
  );
  assert.equal(history.status, 200);
  const historyJson = await history.json();
  assert.ok(Array.isArray(historyJson.messages));
  assert.ok(historyJson.messages.some((m) => m.role === 'user'));
  assert.ok(historyJson.messages.some((m) => m.role === 'assistant'));

  // 3. Негативный кейс — FR-023: несуществующий assessment_id
  const bad = await fetch(`${BASE_URL}/judge/chat`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      conversation_id: firstJson.conversation_id,
      message: 'Покажи f_faith для assessment 9999999',
    }),
  });
  assert.equal(bad.status, 200, 'should return 200 with tool-call error, not 500');
  const badJson = await bad.json();
  // Не требуем отсутствия всех цифр (например "9999999"), но проверяем, что
  // ответ помечен как «данные не найдены» в output_preview любого tool-call.
  const someErrored = (badJson.tool_calls_executed ?? []).some((tc) => tc.output_preview?.error);
  assert.ok(someErrored, 'at least one tool call should return error payload');

  console.log('[judge:chat] OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
