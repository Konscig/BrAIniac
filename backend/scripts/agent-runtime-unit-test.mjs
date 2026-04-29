import assert from 'node:assert/strict';
import { buildPrompt } from '../src/services/application/pipeline/pipeline.executor.utils.ts';
import { agentCallNodeHandler } from '../src/services/application/node/handlers/agent-call.node-handler.ts';
import {
  getHttpErrorCode,
  getHttpErrorStatus,
  isSoftOpenRouterError,
  parseAgentDirective,
} from '../src/services/application/node/handlers/agent-directive-parser.ts';
import { isToolAdvertisingInput } from '../src/services/application/node/handlers/agent-tool-discovery.ts';
import { resolveAgentTurnDecision } from '../src/services/application/node/handlers/agent-turn-resolution.ts';
import { HttpError } from '../src/common/http-error.ts';

function testAgentCallRuntimeAllowsTwentyToolCalls() {
  const source = agentCallNodeHandler.toString();
  assert.match(source, /readBoundedInteger\(agentConfig\.maxToolCalls,\s*3,\s*1,\s*20\)/);
}

function testParseFinal() {
  const directive = parseAgentDirective('{"type":"final","text":"done"}');
  assert.equal(directive.kind, 'final');
  assert.equal(directive.text, 'done');
}

function testParseToolCall() {
  const directive = parseAgentDirective('{"type":"tool_call","tool_name":"DocumentLoader","input":{"top_k":3}}');
  assert.equal(directive.kind, 'tool_call');
  assert.equal(directive.toolName, 'DocumentLoader');
  assert.deepEqual(directive.input, { top_k: 3 });
}

function testRecoverMalformedToolCall() {
  const directive = parseAgentDirective('{"type":tool_call,"tool_name":"LLMAnswer","input":{}} </tool_call>');
  assert.equal(directive.kind, 'tool_call');
  assert.equal(directive.toolName, 'LLMAnswer');
  assert.deepEqual(directive.input, {});
}

function testRejectUnknownToolIsRepresentedAsFinalMarkup() {
  const directive = parseAgentDirective('{"type":"tool_call","tool_name":"UnknownTool","input":{}}');
  assert.equal(directive.kind, 'tool_call');
  assert.equal(directive.toolName, 'UnknownTool');
}

function testToolAdvertisingInputsAreExcludedFromPrompt() {
  const inputs = [
    { kind: 'tool_node', tool_name: 'DocumentLoader' },
    { kind: 'manual_input', text: 'Explain Artemis II.' },
  ];
  const promptInputs = inputs.filter((entry) => !isToolAdvertisingInput(entry));
  const prompt = buildPrompt(promptInputs, {});
  assert.equal(prompt.includes('DocumentLoader'), false);
  assert.equal(prompt.includes('Explain Artemis II.'), true);
}

function testSoftErrorClassification() {
  const error = new HttpError(502, {
    code: 'OPENROUTER_UPSTREAM_ERROR',
    error: 'rate limited',
    details: { status: 429 },
  });
  assert.equal(getHttpErrorCode(error), 'OPENROUTER_UPSTREAM_ERROR');
  assert.equal(getHttpErrorStatus(error), 429);
  assert.equal(isSoftOpenRouterError(error), true);
}

function testFinalDoesNotAutoCallLlmAnswerWhenNoArtifactAnswerYet() {
  const decision = resolveAgentTurnDecision({
    directive: parseAgentDirective('{"type":"final","text":"premature"}'),
    hasToolBudget: true,
    artifactAnswer: null,
    completionText: '{"type":"final","text":"premature"}',
  });

  assert.equal(decision.kind, 'final');
  assert.equal(decision.text, 'premature');
  assert.equal(decision.finalTextOrigin, 'model');
}

function testArtifactAnswerWinsWhenModelHasNoNextDirective() {
  const decision = resolveAgentTurnDecision({
    directive: { kind: 'none', raw: null },
    hasToolBudget: false,
    artifactAnswer: 'grounded result',
    completionText: '',
  });

  assert.equal(decision.kind, 'final');
  assert.equal(decision.text, 'grounded result');
  assert.equal(decision.finalTextSource, 'artifact.answer');
}

function testToolCallOverBudgetDoesNotBecomeFinalText() {
  const decision = resolveAgentTurnDecision({
    directive: parseAgentDirective('{"type":"tool_call","tool_name":"DocumentLoader","input":{}}'),
    hasToolBudget: false,
    artifactAnswer: null,
    completionText: '{"type":"tool_call","tool_name":"DocumentLoader","input":{}}',
  });

  assert.equal(decision.kind, 'none');
}

testParseFinal();
testAgentCallRuntimeAllowsTwentyToolCalls();
testParseToolCall();
testRecoverMalformedToolCall();
testRejectUnknownToolIsRepresentedAsFinalMarkup();
testToolAdvertisingInputsAreExcludedFromPrompt();
testSoftErrorClassification();
testFinalDoesNotAutoCallLlmAnswerWhenNoArtifactAnswerYet();
testArtifactAnswerWinsWhenModelHasNoNextDirective();
testToolCallOverBudgetDoesNotBecomeFinalText();

console.log('[agent-runtime-unit] SUCCESS');
