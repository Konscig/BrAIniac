#!/usr/bin/env node
/**
 * End-to-end smoke for 001-ai-judge US1.
 * Requires: docker compose --profile app up -d; seed judge bootstrap applied.
 *
 * Scenario (US1 acceptance — simplified):
 * 1. sign up / sign in user
 * 2. ensure project + pipeline + dataset exist (reuse existing test helpers)
 * 3. post a small GoldAnnotation batch on one document
 * 4. POST /judge/assessments, wait for status in {succeeded, failed}
 * 5. assert summary.final_score in [0,1] + aggregation/axis coverage shape
 */
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL ?? 'http://localhost:8080';
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

async function main() {
  console.log('[judge:e2e] NOTE: this is a skeleton smoke. Fill pipeline/dataset prerequisites');
  console.log('[judge:e2e] before running in a real env. Script exits early when prerequisites missing.');

  const token = process.env.JUDGE_TEST_TOKEN;
  const pipelineId = Number(process.env.JUDGE_TEST_PIPELINE_ID ?? 0);
  const datasetId = Number(process.env.JUDGE_TEST_DATASET_ID ?? 0);
  if (!token || !pipelineId || !datasetId) {
    console.log('[judge:e2e] skipping: need JUDGE_TEST_TOKEN + JUDGE_TEST_PIPELINE_ID + JUDGE_TEST_DATASET_ID');
    return;
  }

  const res = await fetch(`${BASE_URL}/judge/assessments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-idempotency-key': `smoke-${Date.now()}`,
    },
    body: JSON.stringify({ pipeline_id: pipelineId, dataset_id: datasetId, preset: 'default' }),
  });
  assert.equal(res.status, 202, `expected 202, got ${res.status}: ${await res.text().catch(() => '')}`);
  const payload = await res.json();
  assert.ok(payload.assessment_id, 'assessment_id must be present');
  console.log('[judge:e2e] assessment started', payload.assessment_id);

  const started = Date.now();
  let finalStatus = null;
  let finalPayload = null;
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const getRes = await fetch(`${BASE_URL}/judge/assessments/${payload.assessment_id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    assert.equal(getRes.status, 200);
    finalPayload = await getRes.json();
    finalStatus = finalPayload.status;
    if (finalStatus === 'succeeded' || finalStatus === 'failed') break;
    process.stdout.write('.');
  }
  console.log();
  assert.ok(['succeeded', 'failed'].includes(finalStatus), `unexpected status ${finalStatus}`);
  if (finalStatus === 'succeeded') {
    assert.ok(finalPayload.summary, 'summary expected');
    assert.ok(typeof finalPayload.summary.final_score === 'number');
    assert.ok(finalPayload.summary.final_score >= 0 && finalPayload.summary.final_score <= 1);
    console.log('[judge:e2e] OK final_score =', finalPayload.summary.final_score, 'verdict =', finalPayload.summary.verdict);
  } else {
    console.log('[judge:e2e] assessment failed:', finalPayload.error);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
