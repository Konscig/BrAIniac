import type { AgentDirective } from './agent-directive-parser.js';

export type AgentResolvedTurnDecision =
  | {
      kind: 'tool_call';
      requestedToolName: string;
      inputPatch: Record<string, any>;
      source: 'model';
    }
  | {
      kind: 'final';
      text: string;
      finalTextSource: string;
      finalTextOrigin: string;
    }
  | {
      kind: 'none';
    };

type ResolveAgentTurnDecisionOptions = {
  directive: AgentDirective;
  hasToolBudget: boolean;
  artifactAnswer: string | null;
  completionText: string;
};

export function resolveAgentTurnDecision(options: ResolveAgentTurnDecisionOptions): AgentResolvedTurnDecision {
  const { directive, hasToolBudget, artifactAnswer, completionText } = options;

  if (directive.kind === 'tool_call' && hasToolBudget) {
    return {
      kind: 'tool_call',
      requestedToolName: directive.toolName,
      inputPatch: directive.input,
      source: 'model',
    };
  }

  if (directive.kind === 'final' && directive.text.trim().length > 0) {
    return {
      kind: 'final',
      text: directive.text.trim(),
      finalTextSource: 'directive.final',
      finalTextOrigin: 'model',
    };
  }

  if (artifactAnswer) {
    return {
      kind: 'final',
      text: artifactAnswer,
      finalTextSource: 'artifact.answer',
      finalTextOrigin: 'tool-artifact',
    };
  }

  if (completionText.length > 0 && directive.kind !== 'tool_call') {
    return {
      kind: 'final',
      text: completionText,
      finalTextSource: 'raw.completion',
      finalTextOrigin: 'model',
    };
  }

  return {
    kind: 'none',
  };
}
