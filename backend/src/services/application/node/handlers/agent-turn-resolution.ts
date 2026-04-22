import type { AgentDirective } from './agent-directive-parser.js';

export type AgentFallbackTool = {
  key: string;
  name: string;
};

export type AgentResolvedTurnDecision =
  | {
      kind: 'tool_call';
      requestedToolName: string;
      inputPatch: Record<string, any>;
      source: 'model' | 'fallback';
      plannerFallbackUsed: boolean;
    }
  | {
      kind: 'final';
      text: string;
      finalTextSource: string;
      finalTextOrigin: string;
      plannerFallbackUsed: boolean;
    }
  | {
      kind: 'none';
      plannerFallbackUsed: boolean;
    };

type ResolveAgentTurnDecisionOptions = {
  directive: AgentDirective;
  hasToolBudget: boolean;
  fallbackTool?: AgentFallbackTool;
  artifactAnswer: string | null;
  completionText: string;
};

export function resolveAgentTurnDecision(options: ResolveAgentTurnDecisionOptions): AgentResolvedTurnDecision {
  const { directive, hasToolBudget, fallbackTool, artifactAnswer, completionText } = options;

  if (directive.kind === 'tool_call' && hasToolBudget) {
    return {
      kind: 'tool_call',
      requestedToolName: directive.toolName,
      inputPatch: directive.input,
      source: 'model',
      plannerFallbackUsed: false,
    };
  }

  if (directive.kind === 'final' && fallbackTool?.key === 'llmanswer' && !artifactAnswer) {
    return {
      kind: 'tool_call',
      requestedToolName: fallbackTool.name,
      inputPatch: {},
      source: 'fallback',
      plannerFallbackUsed: true,
    };
  }

  if (directive.kind === 'final' && directive.text.trim().length > 0) {
    return {
      kind: 'final',
      text: directive.text.trim(),
      finalTextSource: 'directive.final',
      finalTextOrigin: 'model',
      plannerFallbackUsed: false,
    };
  }

  if (fallbackTool) {
    return {
      kind: 'tool_call',
      requestedToolName: fallbackTool.name,
      inputPatch: {},
      source: 'fallback',
      plannerFallbackUsed: true,
    };
  }

  if (artifactAnswer) {
    return {
      kind: 'final',
      text: artifactAnswer,
      finalTextSource: 'artifact.answer',
      finalTextOrigin: 'tool-artifact',
      plannerFallbackUsed: false,
    };
  }

  if (completionText.length > 0) {
    return {
      kind: 'final',
      text: completionText,
      finalTextSource: 'raw.completion',
      finalTextOrigin: directive.kind === 'tool_call' ? 'model-tool-call-markup' : 'model',
      plannerFallbackUsed: false,
    };
  }

  return {
    kind: 'none',
    plannerFallbackUsed: false,
  };
}
