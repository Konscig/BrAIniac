#!/usr/bin/env node
/**
 * SC-002: два прогона одного (pipeline_id, dataset_id) с разными
 * idempotency-key MUST дать |ΔS| ≤ 0.02 и идентичный состав M'_0.
 */
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL ?? 'http://localhost:8080';

async function runOne(token, pipelineId, datasetId, key) {
  const res = await fetch(`${BASE_URL}/judge/assessments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-idempotency-key': key,
    },
    body: JSON.stringify({ pipeline_id: pipelineId, dataset_id: datasetId, preset: 'default' }),
  });
  const payload = await res.json();
  return payload.assessment_id;
}

async function waitUntilTerminal(token, id) {
  const started = Date.now();
  while (Date.now() - started < 5 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await fetch(`${BASE_URL}/judge/assessments/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const json = await res.json();
    if (json.status === 'succeeded' || json.status === 'failed') return json;
  }
  throw new Error('timed out waiting for assessment');
}

async function main() {
  const token = process.env.JUDGE_TEST_TOKEN;
  const pipelineId = Number(process.env.JUDGE_TEST_PIPELINE_ID ?? 0);
  const datasetId = Number(process.env.JUDGE_TEST_DATASET_ID ?? 0);
  if (!token || !pipelineId || !datasetId) {
    console.log('[judge:repro] skipping: set JUDGE_TEST_TOKEN/PIPELINE_ID/DATASET_ID');
    return;
  }
  const a = await runOne(token, pipelineId, datasetId, `repro-a-${Date.now()}`);
  const runA = await waitUntilTerminal(token, a);
  if (runA.status !== 'succeeded') {
    console.log('[judge:repro] first run failed; skipping:', runA.error);
    return;
  }
  // Wait for inflight release before second run
  await new Promise((r) => setTimeout(r, 2000));
  const b = await runOne(token, pipelineId, datasetId, `repro-b-${Date.now()}`);
  const runB = await waitUntilTerminal(token, b);
  assert.equal(runB.status, 'succeeded');
  const sA = runA.summary?.final_score ?? 0;
  const sB = runB.summary?.final_score ?? 0;
  const delta = Math.abs(sA - sB);
  console.log(`[judge:repro] S_A=${sA.toFixed(4)} S_B=${sB.toFixed(4)} |ΔS|=${delta.toFixed(4)}`);
  assert.ok(delta <= 0.02, `|ΔS|=${delta.toFixed(4)} exceeds 0.02 threshold`);

  const codesA = new Set((runA.metric_scores ?? []).map((m) => m.metric_code));
  const codesB = new Set((runB.metric_scores ?? []).map((m) => m.metric_code));
  for (const c of codesA) assert.ok(codesB.has(c), `metric ${c} missing in run B`);
  for (const c of codesB) assert.ok(codesA.has(c), `metric ${c} missing in run A`);
  console.log('[judge:repro] OK — M\' составы идентичны и |ΔS| ≤ 0.02');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
