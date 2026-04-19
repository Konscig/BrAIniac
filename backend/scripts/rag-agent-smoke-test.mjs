// Fast wrapper for daily RAG checks.
// It reuses the full e2e script but constrains it to a lightweight profile.
process.env.RAG_E2E_MAX_QUESTIONS ??= '1';
process.env.RAG_E2E_QUESTION_TIMEOUT_MS ??= '90000';
process.env.RAG_E2E_HTTP_TIMEOUT_MS ??= '12000';
process.env.RAG_E2E_STRICT_OPENROUTER ??= '1';
process.env.RAG_E2E_FORCE_HEALTH_EXECUTOR ??= '0';
process.env.RAG_E2E_PROFILE ??= 'realistic';

await import('./rag-agent-e2e-test.mjs');
