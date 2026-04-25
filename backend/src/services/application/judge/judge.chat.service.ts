import prisma from '../../../db.js';
import { getOpenRouterConfig } from '../../core/openrouter/openrouter.config.js';

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

// --- Системный промпт ---

function buildSystemPrompt(pipelineId: number, focusedNodeId?: number): string {
  return `Ты — ИИ-судья (AI Judge) системы BrAIniac. Твоя роль: помогать пользователю анализировать агентный граф (пайплайн), объяснять результаты оценки и давать конкретные рекомендации по улучшению.

Текущий контекст:
- pipeline_id: ${pipelineId}${focusedNodeId ? `\n- Пользователь сейчас смотрит на узел node_id: ${focusedNodeId}` : ''}

Инструменты которые ты можешь использовать:
- get_pipeline_overview — общая архитектура графа (узлы, рёбра, типы)
- get_node_details — детали конкретного узла: конфиг, результаты выполнения, метрики судьи
- get_assessment_report — полный отчёт последней оценки: скор, вердикт, все метрики

Принципы работы:
- Отвечай на русском языке, кратко и по делу
- Когда пользователь спрашивает об улучшениях — сначала получи данные через инструменты, потом давай конкретные советы
- Если метрика низкая (< 0.4) — объясни почему и предложи как исправить
- Если пользователь кликнул на узел — фокусируйся на нём, используй get_node_details
- Можешь говорить о компромиссах: например, увеличение точности vs. скорость ответа
- Не придумывай данные — всегда получай их через инструменты

Шкала оценки: 0..1, вердикты: fail (<0.6), improvement (0.6–0.8), pass (>0.8)
Оси метрик: A=Correctness, B=Grounding, C=Retrieval, D=Tool-Use, E=Structure, F=Control-Flow, G=LLM-Judge, H=Safety`;
}

// --- Главная функция ---

export async function judgeChat(req: JudgeChatRequest): Promise<JudgeChatResponse> {
  const config = getOpenRouterConfig();
  if (!config.enabled || !config.apiKey) {
    return { reply: 'OpenRouter не настроен. Убедитесь что OPENROUTER_API_KEY задан в .env.', tool_calls_used: [] };
  }

  const model = config.defaultChatModel || 'openai/gpt-4o-mini';

  const systemMsg = { role: 'system', content: buildSystemPrompt(req.pipeline_id, req.focused_node_id) };
  const historyMsgs = (req.history ?? []).map(m => ({ role: m.role, content: m.content }));
  const userMsg = { role: 'user', content: req.message };

  const messages: any[] = [systemMsg, ...historyMsgs, userMsg];
  const toolCallsUsed: string[] = [];

  // Agentic loop — до 4 итераций tool use
  for (let iter = 0; iter < 4; iter++) {
    const body = { model, messages, tools: TOOLS, tool_choice: 'auto', max_tokens: 1024 };
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`OpenRouter ${res.status}: ${err.slice(0, 200)}`);
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
