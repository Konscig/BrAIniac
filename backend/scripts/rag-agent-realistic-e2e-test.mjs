// Realistic profile: do not inject synthetic intermediate artifacts into input_json.
// Keeps the same graph build/execution flow but lets ToolNode chain derive intermediate data.
process.env.RAG_E2E_PROFILE ??= 'realistic';
process.env.RAG_E2E_FORCE_HEALTH_EXECUTOR ??= '0';

await import('./rag-agent-e2e-test.mjs');
