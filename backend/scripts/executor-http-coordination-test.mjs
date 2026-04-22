const headers = { 'Content-Type': 'application/json' };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ok(status) {
  return status >= 200 && status < 300;
}

async function req(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

function mustOk(label, response) {
  if (!ok(response.status)) {
    throw new Error(`${label} failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body;
}

async function resolveBaseUrl() {
  const explicit = String(process.env.BASE_URL || '').trim();
  if (explicit) {
    const health = await req(explicit, '/health', { method: 'GET' });
    if (!ok(health.status)) {
      throw new Error(`BASE_URL is unhealthy: ${explicit}`);
    }
    return explicit;
  }

  const candidates = ['http://localhost:3012', 'http://localhost:3000', 'http://localhost:8080'];
  for (const candidate of candidates) {
    try {
      const health = await req(candidate, '/health', { method: 'GET' });
      if (ok(health.status)) return candidate;
    } catch {
      // try next
    }
  }

  throw new Error('could not resolve BASE_URL');
}

function findNodeTypeByName(items, name) {
  return Array.isArray(items) ? items.find((item) => String(item?.name || '').trim() === name) : null;
}

async function createAuth(base) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `executor-coordination-${suffix}@local`;
  const password = 'pwd';

  mustOk(
    'signup',
    await req(base, '/auth/signup', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password }),
    }),
  );

  const login = mustOk(
    'login',
    await req(base, '/auth/login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password }),
    }),
  );

  return {
    authHeaders: {
      ...headers,
      Authorization: `Bearer ${login.accessToken}`,
    },
  };
}

async function run() {
  const base = await resolveBaseUrl();
  console.log(`[executor-http-coordination] base: ${base}`);

  const { authHeaders } = await createAuth(base);

  const project = mustOk(
    'create project',
    await req(base, '/projects', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: `executor-coordination-${Date.now()}`,
        desc: 'executor coordination smoke',
      }),
    }),
  );

  const pipeline = mustOk(
    'create pipeline',
    await req(base, '/pipelines', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        fk_project_id: project.project_id,
        name: 'executor-coordination-pipeline',
        max_time: 30,
        max_cost: 100,
        max_reject: 0.15,
        report_json: {},
      }),
    }),
  );

  const nodeTypes = mustOk(
    'list node types',
    await req(base, '/node-types?fk_tool_id=3', {
      method: 'GET',
      headers: authHeaders,
    }),
  );

  const manualInputType = findNodeTypeByName(nodeTypes, 'ManualInput');
  const saveResultType = findNodeTypeByName(nodeTypes, 'SaveResult');
  if (!manualInputType || !saveResultType) {
    throw new Error('required node types ManualInput / SaveResult are missing');
  }

  const manualNode = mustOk(
    'create ManualInput node',
    await req(base, '/nodes', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        fk_pipeline_id: pipeline.pipeline_id,
        fk_type_id: manualInputType.type_id,
        top_k: 1,
        ui_json: { x: 40, y: 80, label: 'ManualInput' },
      }),
    }),
  );

  const saveNode = mustOk(
    'create SaveResult node',
    await req(base, '/nodes', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        fk_pipeline_id: pipeline.pipeline_id,
        fk_type_id: saveResultType.type_id,
        top_k: 1,
        ui_json: { x: 240, y: 80, label: 'SaveResult' },
      }),
    }),
  );

  mustOk(
    'create edge',
    await req(base, '/edges', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        fk_from_node: manualNode.node_id,
        fk_to_node: saveNode.node_id,
      }),
    }),
  );

  const executionKey = `executor-coordination-${Date.now()}`;
  const executionRequestBody = {
    input_json: {
      prompt: 'coordination smoke',
      user_query: 'coordination smoke',
    },
  };

  const firstExecution = mustOk(
    'start execution',
    await req(base, `/pipelines/${pipeline.pipeline_id}/execute`, {
      method: 'POST',
      headers: { ...authHeaders, 'x-idempotency-key': executionKey },
      body: JSON.stringify(executionRequestBody),
    }),
  );
  if (!firstExecution?.execution_id) {
    throw new Error('first execution response does not contain execution_id');
  }

  const replayExecution = mustOk(
    'replay execution',
    await req(base, `/pipelines/${pipeline.pipeline_id}/execute`, {
      method: 'POST',
      headers: { ...authHeaders, 'x-idempotency-key': executionKey },
      body: JSON.stringify(executionRequestBody),
    }),
  );

  if (replayExecution.execution_id !== firstExecution.execution_id) {
    throw new Error(
      `idempotent replay returned different execution_id: first=${firstExecution.execution_id} replay=${replayExecution.execution_id}`,
    );
  }

  let finalSnapshot = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const snapshot = mustOk(
      'poll execution',
      await req(base, `/pipelines/${pipeline.pipeline_id}/executions/${firstExecution.execution_id}`, {
        method: 'GET',
        headers: authHeaders,
      }),
    );

    if (snapshot.status === 'succeeded' || snapshot.status === 'failed') {
      finalSnapshot = snapshot;
      break;
    }

    await sleep(150);
  }

  if (!finalSnapshot) {
    throw new Error('execution did not finish in time');
  }

  if (finalSnapshot.status !== 'succeeded') {
    throw new Error(`execution should succeed, got ${JSON.stringify(finalSnapshot)}`);
  }

  console.log('[executor-http-coordination] SUCCESS');
}

run().catch((error) => {
  console.error('[executor-http-coordination] FAIL');
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
