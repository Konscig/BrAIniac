import assert from 'node:assert/strict';
import { mapNodeCreateDTO } from '../src/routes/shared/create-dto.mappers.ts';
import { mapNodePatchDTO } from '../src/routes/shared/patch-dto.mappers.ts';
import { buildAgentCallOutput } from '../src/services/application/node/handlers/agent-call-output.ts';
import { toolNodeHandler } from '../src/services/application/node/handlers/tool-node.node-handler.ts';

function testNodeCreateDtoPreservesAgentCallUiJson() {
  const dto = mapNodeCreateDTO({
    fk_pipeline_id: 11,
    fk_type_id: 22,
    top_k: 1,
    ui_json: {
      label: 'AgentCall',
      agent: {
        modelId: 'openrouter/auto',
        systemPrompt: 'You are AgentCall runtime.',
        maxToolCalls: 8,
        maxAttempts: 3,
        softRetryDelayMs: 1200,
      },
    },
  });

  assert.equal(dto.fk_pipeline_id, 11);
  assert.equal(dto.fk_type_id, 22);
  assert.equal(dto.top_k, 1);
  assert.equal(dto.ui_json?.agent?.modelId, 'openrouter/auto');
  assert.equal(dto.ui_json?.agent?.maxToolCalls, 8);
}

function testNodePatchDtoPreservesToolNodeUiJson() {
  const patch = mapNodePatchDTO({
    ui_json: {
      label: 'ToolNode(DocumentLoader)',
      tool: {
        tool_id: 7,
        name: 'DocumentLoader',
        config_json: {
          executor: {
            kind: 'http-json',
            method: 'POST',
            url: 'http://localhost:3012/tool-executor/contracts',
          },
        },
      },
      toolConfig: {
        top_k: 6,
      },
    },
  });

  assert.equal(patch.ui_json?.tool?.tool_id, 7);
  assert.equal(patch.ui_json?.tool?.name, 'DocumentLoader');
  assert.equal(patch.ui_json?.toolConfig?.top_k, 6);
}

async function testToolNodeAdvertisingOutputShape() {
  const runtime = {
    node: {
      node_id: 99,
      fk_pipeline_id: 1,
      fk_type_id: 1,
      fk_sub_pipeline: null,
      top_k: 1,
      ui_json: {
        label: 'ToolNode(DocumentLoader)',
        tool: {
          tool_id: 7,
          name: 'DocumentLoader',
          config_json: {
            executor: {
              kind: 'http-json',
              method: 'POST',
              url: 'http://localhost:3012/tool-executor/contracts',
            },
          },
        },
      },
      output_json: null,
    },
    nodeType: {
      type_id: 1,
      fk_tool_id: 1,
      name: 'ToolNode',
      config_json: {},
    },
    tool: null,
    config: {},
  };

  const result = await toolNodeHandler(runtime, [], {
    dataset: null,
    input_json: null,
  });

  assert.equal(result.output?.kind, 'tool_node');
  assert.equal(result.output?.tool_name, 'DocumentLoader');
  assert.equal(result.output?.tool_id, 7);
  assert.equal(typeof result.output?.tool_source, 'string');
  assert.equal(result.output?.config_json?.executor?.kind, 'http-json');
}

function testAgentCallOutputShape() {
  const output = buildAgentCallOutput({
    provider: 'openrouter',
    model: 'openrouter/auto',
    providerResponseId: 'resp-1',
    text: 'done',
    finalTextSource: 'directive.final',
    finalTextOrigin: 'model',
    rawCompletionText: '{"type":"final","text":"done"}',
    lastDirectiveSummary: { kind: 'final' },
    usage: { total_tokens: 10 },
    providerCallsAttempted: 1,
    providerSoftFailures: 0,
    providerLastErrorCode: '',
    providerLastErrorStatus: null,
    attemptsUsed: 1,
    llmTurns: 1,
    maxAttempts: 3,
    maxToolCalls: 8,
    toolCallsExecuted: 0,
    toolCallTrace: [],
    plannerFallbackUsed: false,
    availableTools: [{ name: 'DocumentLoader' }],
    unresolvedTools: [],
    providerSuccessfulResponses: 1,
  });

  const requiredKeys = [
    'kind',
    'provider',
    'model',
    'provider_response_id',
    'text',
    'final_text_source',
    'final_text_origin',
    'raw_completion_text',
    'last_directive',
    'last_directive_kind',
    'usage',
    'provider_usage_complete',
    'provider_calls_attempted',
    'attempts_used',
    'llm_turns',
    'max_attempts',
    'max_tool_calls',
    'tool_calls_executed',
    'tool_call_trace',
    'planner_fallback_used',
  ];

  for (const key of requiredKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(output, key), true, `missing key ${key}`);
  }

  assert.equal(output.kind, 'agent_call');
  assert.equal(Array.isArray(output.tool_call_trace), true);
  assert.equal(Array.isArray(output.available_tools), true);
}

async function main() {
  testNodeCreateDtoPreservesAgentCallUiJson();
  testNodePatchDtoPreservesToolNodeUiJson();
  await testToolNodeAdvertisingOutputShape();
  testAgentCallOutputShape();
  console.log('[backend-contract-freeze] SUCCESS');
}

main().catch((error) => {
  console.error('[backend-contract-freeze] FAIL');
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
