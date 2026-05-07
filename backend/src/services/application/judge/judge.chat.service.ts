import prisma from '../../../db.js';
import { getOpenRouterConfig } from '../../core/openrouter/openrouter.config.js';
import { buildSystemPrompt } from './judge.prompt.service.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface JudgeChatRequest {
  pipeline_id: number;
  message: string;
  history?: ChatMessage[];
  focused_node_id?: number;
}

export interface JudgeChatResponse {
  reply: string;
  tool_calls_used: string[];
}

// --- Определения инструментов для LLM ---

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_pipeline_overview',
      description: 'Возвращает полный граф пайплайна: список узлов с их типами и конфигурацией, список рёбер. Используй для общего понимания архитектуры агентного графа.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_node_details',
      description: 'Возвращает детальную информацию об узле: конфигурацию, последний результат выполнения, метрики судьи (если есть оценка). Используй когда пользователь спрашивает про конкретный узел.',
      parameters: {
        type: 'object',
        properties: {
          node_id: { type: 'number', description: 'ID узла из графа пайплайна' },
        },
        required: ['node_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_assessment_report',
      description: 'Возвращает последний отчёт оценки судьи по пайплайну: итоговый скор, вердикт, метрики по каждому узлу, пропущенные метрики. Используй для анализа качества агента.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

// --- Обработчики инструментов ---

async function toolGetPipelineOverview(pipelineId: number): Promise<object> {
  const pipeline = await prisma.pipeline.findUnique({
    where: { pipeline_id: pipelineId },
    include: {
      nodes: {
        include: {
          node_type: { select: { name: true } },
          outgoing_edges: { select: { fk_to_node: true } },
        },
      },
    },
  });
  if (!pipeline) return { error: 'Pipeline not found' };

  return {
    pipeline_id: pipeline.pipeline_id,
    name: pipeline.name?.trim(),
    score: pipeline.score ?? null,
    nodes: pipeline.nodes.map((n) => {
      const ui = n.ui_json && typeof n.ui_json === 'object' ? n.ui_json as Record<string, any> : {};
      return {
        node_id: n.node_id,
        label: ui.label ?? ui.name ?? `Node #${n.node_id}`,
        type: n.node_type?.name ?? 'Unknown',
        has_judge_metrics: !!(n.output_json && typeof n.output_json === 'object' && (n.output_json as any).judge),
        connects_to: n.outgoing_edges.map(e => e.fk_to_node),
      };
    }),
  };
}

async function toolGetNodeDetails(pipelineId: number, nodeId: number): Promise<object> {
  const node = await prisma.node.findFirst({
    where: { node_id: nodeId, fk_pipeline_id: pipelineId },
    include: { node_type: { select: { name: true } } },
  });
  if (!node) return { error: `Node ${nodeId} not found in pipeline ${pipelineId}` };

  const ui = node.ui_json && typeof node.ui_json === 'object' ? node.ui_json as Record<string, any> : {};
  const outputJson = node.output_json && typeof node.output_json === 'object' ? node.output_json as Record<string, any> : null;
  const judgeReport = outputJson?.judge ?? null;
  const execData = outputJson?.data ?? null;
  const execStatus = outputJson?.status ?? null;

  return {
    node_id: node.node_id,
    label: ui.label ?? ui.name ?? `Node #${node.node_id}`,
    type: node.node_type?.name ?? 'Unknown',
    config: ui,
    execution: execStatus ? { status: execStatus, output_preview: execData } : null,
    judge_metrics: judgeReport ? {
      node_type: judgeReport.node_type,
      metrics: (judgeReport.metrics ?? []).map((m: any) => ({
        code: m.metric_code,
        axis: m.axis,
        value: m.value,
        executor: m.executor,
        sample_size: m.sample_size,
      })),
    } : null,
  };
}

async function toolGetAssessmentReport(pipelineId: number): Promise<object> {
  const pipeline = await prisma.pipeline.findUnique({
    where: { pipeline_id: pipelineId },
    select: { score: true, report_json: true },
  });
  if (!pipeline) return { error: 'Pipeline not found' };
  if (!pipeline.report_json) return { message: 'No assessment has been run yet. Run POST /judge/assessments first.' };
  return pipeline.report_json as object;
}

// --- Главная функция ---

function resolveChatProvider(): { baseUrl: string; apiKey: string; model: string } | null {
  const orConfig = getOpenRouterConfig();
  if (orConfig.enabled && orConfig.apiKey) {
    return {
      baseUrl: orConfig.baseUrl,
      apiKey: orConfig.apiKey,
      model: orConfig.defaultChatModel || 'openai/gpt-4o-mini',
    };
  }

  const mistralKey = process.env.JUDGE_MISTRAL_API_KEY?.trim();
  if (mistralKey) {
    return {
      baseUrl: 'https://api.mistral.ai/v1',
      apiKey: mistralKey,
      // mistral-small has reliable tool calling; ministral-3b may struggle
      model: process.env.JUDGE_CHAT_MODEL?.trim() || 'mistral-small-latest',
    };
  }

  return null;
}

export async function judgeChat(req: JudgeChatRequest): Promise<JudgeChatResponse> {
  const provider = resolveChatProvider();
  if (!provider) {
    return { reply: 'Чат с судьёй недоступен: задайте OPENROUTER_API_KEY или JUDGE_MISTRAL_API_KEY в .env.', tool_calls_used: [] };
  }

  const { baseUrl, apiKey, model } = provider;

  const systemMsg = { role: 'system', content: buildSystemPrompt(req.pipeline_id, req.focused_node_id) };
  const historyMsgs = (req.history ?? []).map(m => ({ role: m.role, content: m.content }));
  const userMsg = { role: 'user', content: req.message };

  const messages: any[] = [systemMsg, ...historyMsgs, userMsg];
  const toolCallsUsed: string[] = [];

  // Agentic loop — до 4 итераций tool use
  for (let iter = 0; iter < 4; iter++) {
    const body = { model, messages, tools: TOOLS, tool_choice: 'auto', max_tokens: 1024 };
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`LLM provider ${res.status}: ${err.slice(0, 200)}`);
    }

    const data: any = await res.json();
    const choice = data.choices?.[0];
    const assistantMsg = choice?.message;

    if (!assistantMsg) break;
    messages.push(assistantMsg);

    // Если нет tool_calls — финальный ответ
    if (!assistantMsg.tool_calls?.length) {
      const text = typeof assistantMsg.content === 'string'
        ? assistantMsg.content
        : Array.isArray(assistantMsg.content)
          ? assistantMsg.content.map((b: any) => b.text ?? '').join('')
          : '';
      return { reply: text || '(пустой ответ)', tool_calls_used: toolCallsUsed };
    }

    // Выполняем все tool calls параллельно
    await Promise.all(assistantMsg.tool_calls.map(async (tc: any) => {
      const name: string = tc.function?.name ?? '';
      let args: any = {};
      try { args = JSON.parse(tc.function?.arguments ?? '{}'); } catch { /* ignore */ }

      toolCallsUsed.push(name);

      let result: object;
      if (name === 'get_pipeline_overview') result = await toolGetPipelineOverview(req.pipeline_id);
      else if (name === 'get_node_details') result = await toolGetNodeDetails(req.pipeline_id, Number(args.node_id));
      else if (name === 'get_assessment_report') result = await toolGetAssessmentReport(req.pipeline_id);
      else result = { error: `Unknown tool: ${name}` };

      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }));
  }

  return { reply: 'Не удалось получить ответ от модели.', tool_calls_used: toolCallsUsed };
}
