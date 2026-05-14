export type JudgeMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface JudgeMessage {
  role: JudgeMessageRole;
  content: string;
  tool_name?: string;
  tool_call_id?: string;
}

export interface JudgeToolSchema {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface JudgeToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface JudgeChatResult {
  text: string;
  tool_calls: JudgeToolCall[];
  raw?: any;
}

export interface JudgeProvider {
  chat(messages: JudgeMessage[], tools?: JudgeToolSchema[]): Promise<JudgeChatResult>;
  readonly modelId: string;
  readonly family: string;
  readonly supportsToolCalls: boolean;
}
