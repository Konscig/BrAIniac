import type { AgentMessage } from './agent-provider-call.js';

function buildToolAvailabilityText(
  availableTools: Array<Record<string, any>>,
  unresolvedTools: string[],
): string {
  const toolText =
    availableTools.length > 0
      ? `Available tools:\n${availableTools
          .map((tool, index) => `${index + 1}. ${tool.name}${tool.desc ? ` - ${tool.desc}` : ''}`)
          .join('\n')}`
      : 'Available tools: none';

  const unresolvedToolText =
    unresolvedTools.length > 0 ? `\nUnresolved tools (not callable): ${unresolvedTools.join(', ')}` : '';

  return `${toolText}${unresolvedToolText}`;
}

export function buildAgentSystemPrompt(baseSystemPrompt: string): string {
  const toolProtocol = [
    'Tool protocol:',
    '1) To call a tool, respond with ONLY JSON:',
    '{"type":"tool_call","tool_name":"<name>","input":{...}}',
    '2) To finish, respond with ONLY JSON:',
    '{"type":"final","text":"<answer>"}',
    '3) One JSON object per response. No markdown wrappers.',
  ].join('\n');

  return `${baseSystemPrompt}\n\n${toolProtocol}`;
}

export function buildAgentMessages(
  systemPrompt: string,
  availableTools: Array<Record<string, any>>,
  unresolvedTools: string[],
  prompt: string,
): AgentMessage[] {
  return [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: `${buildToolAvailabilityText(availableTools, unresolvedTools)}\n\nTask:\n${prompt}`,
    },
  ];
}
