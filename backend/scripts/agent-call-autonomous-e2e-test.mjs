import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const env = {
  ...process.env,
  RAG_E2E_SCENARIO: process.env.RAG_E2E_SCENARIO || 'realistic',
  RAG_E2E_STRICT: process.env.RAG_E2E_STRICT || '1',
  RAG_E2E_STRICT_OPENROUTER: process.env.RAG_E2E_STRICT_OPENROUTER || process.env.AGENT_E2E_STRICT_OPENROUTER || '1',
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDir, '..');

const child = spawn(process.execPath, ['./scripts/rag-agent-e2e-test.mjs'], {
  cwd: backendRoot,
  env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
