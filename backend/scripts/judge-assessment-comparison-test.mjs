#!/usr/bin/env node
/**
 * Smoke для US3 — сравнение двух завершённых JudgeAssessment.
 * Требует, чтобы два ассессмента одного pipeline_id уже завершились
 * со статусом succeeded.
 */
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL ?? 'http://localhost:8080';

async function main() {
  const token = process.env.JUDGE_TEST_TOKEN;
  const base = Number(process.env.JUDGE_TEST_BASE_ASSESSMENT_ID ?? 0);
  const against = Number(process.env.JUDGE_TEST_AGAINST_ASSESSMENT_ID ?? 0);
  if (!token || !base || !against) {
    console.log('[judge:compare] skipping: need JUDGE_TEST_TOKEN + BASE/AGAINST assessment ids');
    return;
  }
  const res = await fetch(`${BASE_URL}/judge/assessments/${base}/comparison?against=${against}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(typeof json.delta_score === 'number');
  assert.ok(Array.isArray(json.delta_per_metric));
  console.log('[judge:compare] OK, Δscore =', json.delta_score);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
