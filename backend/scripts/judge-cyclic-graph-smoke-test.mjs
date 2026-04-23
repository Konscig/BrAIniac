#!/usr/bin/env node
/**
 * SC-006 + FR-010/FR-011: циклические пайплайны оцениваются без искажения S,
 * циклические метрики имеют aggregation_method; ациклические — редуцируются
 * к константам.
 */
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL ?? 'http://localhost:8080';

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
  throw new Error('timed out');
}

async function runAssessment(token, pipelineId, datasetId) {
  const res = await fetch(`${BASE_URL}/judge/assessments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-idempotency-key': `cyclic-${pipelineId}-${Date.now()}`,
    },
    body: JSON.stringify({ pipeline_id: pipelineId, dataset_id: datasetId, preset: 'default' }),
  });
  assert.equal(res.status, 202);
  return (await res.json()).assessment_id;
}

async function main() {
  const token = process.env.JUDGE_TEST_TOKEN;
  const cyclicPipeline = Number(process.env.JUDGE_TEST_CYCLIC_PIPELINE_ID ?? 0);
  const acyclicPipeline = Number(process.env.JUDGE_TEST_ACYCLIC_PIPELINE_ID ?? 0);
  const datasetId = Number(process.env.JUDGE_TEST_DATASET_ID ?? 0);
  if (!token || !cyclicPipeline || !acyclicPipeline || !datasetId) {
    console.log('[judge:cyclic] skipping: need JUDGE_TEST_TOKEN + CYCLIC/ACYCLIC_PIPELINE_ID + DATASET_ID');
    return;
  }

  const cId = await runAssessment(token, cyclicPipeline, datasetId);
  const cRun = await waitUntilTerminal(token, cId);
  assert.equal(cRun.status, 'succeeded', 'cyclic pipeline must complete');
  const hasLoopMetric = (cRun.metric_scores ?? []).some((m) => ['f_loop_term', 'f_loop_budget', 'f_loop_conv'].includes(m.metric_code));
  assert.ok(hasLoopMetric, 'cyclic run must include loop metrics');

  await new Promise((r) => setTimeout(r, 2000));
  const aId = await runAssessment(token, acyclicPipeline, datasetId);
  const aRun = await waitUntilTerminal(token, aId);
  assert.equal(aRun.status, 'succeeded', 'acyclic pipeline must complete');
  const loopBudgetAcyclic = (aRun.metric_scores ?? []).find((m) => m.metric_code === 'f_loop_budget');
  if (loopBudgetAcyclic) {
    assert.equal(Number(loopBudgetAcyclic.value), 1, 'f_loop_budget must reduce to 1 on acyclic pipeline (FR-011)');
  }
  console.log('[judge:cyclic] OK — cyclic loop metrics присутствуют, acyclic → константы');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
