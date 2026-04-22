const base = process.env.BASE_URL || 'http://localhost:3000';
const headers = { 'Content-Type': 'application/json' };

async function req(path, opts = {}) {
  const response = await fetch(base + path, opts);
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: response.status, body };
}

function ok(status) {
  return status >= 200 && status < 300;
}

function fail(message, details) {
  console.error('[dataset-upload-smoke] FAIL:', message);
  if (details !== undefined) {
    console.error(typeof details === 'string' ? details : JSON.stringify(details, null, 2));
  }
  process.exit(2);
}

async function createAuth() {
  const suffix = Date.now();
  const email = `dataset-upload-${suffix}@local`;
  const password = 'pwd';

  let response = await req('/auth/signup', {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password }),
  });
  if (response.status !== 201) fail('signup failed', response);

  response = await req('/auth/login', {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password }),
  });
  if (response.status !== 200) fail('login failed', response);

  return {
    authHeaders: {
      ...headers,
      Authorization: `Bearer ${response.body.accessToken}`,
    },
  };
}

async function createProjectAndPipeline(authHeaders) {
  let response = await req('/projects', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: `dataset-upload-project-${Date.now()}` }),
  });
  if (!ok(response.status)) fail('create project failed', response);
  const project = response.body;

  response = await req('/pipelines', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_project_id: project.project_id,
      name: `dataset-upload-pipeline-${Date.now()}`,
      max_time: 30,
      max_cost: 100,
      max_reject: 0.1,
      report_json: {},
    }),
  });
  if (!ok(response.status)) fail('create pipeline failed', response);

  return {
    project,
    pipeline: response.body,
  };
}

async function run() {
  console.log('[dataset-upload-smoke] base:', base);
  const { authHeaders } = await createAuth();
  const { pipeline } = await createProjectAndPipeline(authHeaders);

  const text = 'Artemis II validates crewed deep-space operations before later lunar landing missions.';
  const contentBase64 = Buffer.from(text, 'utf8').toString('base64');

  let response = await req('/datasets/upload', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fk_pipeline_id: pipeline.pipeline_id,
      filename: 'artemis.txt',
      mime_type: 'text/plain',
      content_base64: contentBase64,
      desc: 'Smoke test uploaded dataset',
    }),
  });
  if (response.status !== 201) fail('dataset upload failed', response);

  const dataset = response.body;
  if (typeof dataset?.uri !== 'string' || !dataset.uri.startsWith('workspace://backend/.artifacts/datasets/')) {
    fail('uploaded dataset uri is not managed workspace artifact path', dataset);
  }

  response = await req(`/datasets/${dataset.dataset_id}`, {
    method: 'GET',
    headers: authHeaders,
  });
  if (!ok(response.status)) fail('get dataset failed', response);

  response = await req('/tool-executor/contracts', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tool: { name: 'DocumentLoader' },
      contract: { name: 'DocumentLoader' },
      input: {
        contract_input: {
          dataset_id: dataset.dataset_id,
          uris: [dataset.uri],
        },
      },
    }),
  });
  if (!ok(response.status)) fail('document loader contract call failed', response);

  const manifestSource = response.body?.contract_output?.documents_manifest?.meta?.source;
  const documents = response.body?.contract_output?.documents;
  if (manifestSource !== 'document-loader-local-file') {
    fail('DocumentLoader did not read uploaded managed source as local file', response.body);
  }
  if (!Array.isArray(documents) || documents.length !== 1 || documents[0]?.text !== text) {
    fail('DocumentLoader did not return uploaded text document', response.body);
  }

  console.log('[dataset-upload-smoke] SUCCESS');
}

run().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
