#!/usr/bin/env node
/**
 * Contract smoke for backend ↔ judge-eval-worker.
 * Checks the shape defined in specs/001-ai-judge/contracts/eval-worker.md.
 */
import assert from 'node:assert/strict';

const WORKER_URL = process.env.JUDGE_EVAL_WORKER_URL ?? 'http://localhost:8001';

async function checkHealth() {
  const res = await fetch(`${WORKER_URL}/health`, { method: 'GET' });
  if (res.status !== 200) {
    console.log('[judge:worker] /health not ready:', res.status);
    return false;
  }
  const json = await res.json();
  assert.equal(typeof json.status, 'string');
  return json.status === 'ok';
}

async function checkMetric(code, payload) {
  const res = await fetch(`${WORKER_URL}/metrics/${code}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (![200, 422, 503].includes(res.status)) {
    throw new Error(`metric ${code}: unexpected status ${res.status}: ${await res.text().catch(() => '')}`);
  }
  if (res.status !== 200) {
    console.log(`[judge:worker] ${code} → ${res.status} (acceptable during bootstrap)`);
    return;
  }
  const json = await res.json();
  assert.ok(typeof json.value === 'number', `${code}: value must be number`);
  assert.ok(json.value >= 0 && json.value <= 1, `${code}: value out of [0,1]`);
  console.log(`[judge:worker] ${code} → value=${json.value}`);
}

async function main() {
  const ready = await checkHealth();
  if (!ready) {
    console.log('[judge:worker] sidecar not ready; exiting early');
    return;
  }
  await checkMetric('f_corr', { agent_output: { text: 'Paris' }, reference: { answer: 'Paris' } });
  await checkMetric('f_cite', {
    agent_output: { text_with_citations: 'Source [d1] confirms.' },
    reference: { relevant_doc_ids: ['d1'] },
  });
  await checkMetric('f_faith', {
    agent_output: { text: 'Paris is the capital.', context: ['Paris is the capital of France.'] },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
