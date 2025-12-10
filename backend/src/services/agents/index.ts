export * from "./types.js";
export { findAlternatives } from "./supply.js";
export { assessLogistics } from "./logistics.js";
export { assessFinance } from "./finance.js";
export { customerServiceDecision } from "./customer_service.js";

export function consensusScore(votes: number[], threshold = 0.75) {
  if (!votes.length) return { score: 0, accepted: false } as const;
  const score = votes.reduce((a, b) => a + b, 0) / votes.length;
  return { score, accepted: score >= threshold } as const;
}

// Системный промпт BDI-кризисного менеджера.
// Модели передаётся сжатый JSON-конспект с оценками подчинённых агентов.
const CRISIS_MANAGER_SYSTEM_PROMPT = `Ты — BDI-агент «Кризисный менеджер» интернет-магазина электроники.

Ты получаешь один JSON с уже посчитанными оценками подчинённых агентов:
- order — краткое описание заказа и контекста (VIP, SLA, штрафы, объём);
- desires — что для нас важно (срок, деньги, клиент, риск);
- priority / priorityQueue — насколько кейс срочный и какие задачи в приоритете;
- supply — варианты поставки с оценками агента поставок;
- logistics — оценка логистики по ключевому варианту;
- finance — оценка финансового агента (маржа, штрафы, бюджет кризиса);
- customerService — оценка агента клиентского сервиса (ожидания клиента, коммуникация, компенсация);
- consensus — агрегированный консенсус по рискам и целесообразности.

Твоя задача — явно учесть ЭТИ оценки, показать, кто за что «голосует»,
и на этой основе предложить финальное решение по заказу.

Формат ответа (строго по разделам):
1) Краткое резюме (1–2 предложения):
  - что за ситуация и какой главный конфликт между агентами (например, финансы против клиентского сервиса).
2) Оценки агентов (списком, максимально сжато):
  - Поставки: <краткая суть их оценки/рекомендации>;
  - Логистика: <краткая суть оценки по срокам/рискам>;
  - Финансы: <кратко про деньги: маржа, штрафы, лимиты>;
  - Клиентский сервис: <кратко про ожидания клиента и уровень сервиса>;
  - Консенсус: <что показывает consensus, если он есть>.
3) Финальный план действий (3–5 пунктов чек-листа):
  - что конкретно делаем с заказом (выполнить/частично/перенести/отменить),
  - на каком варианте поставки/логистики/компенсации останавливаемся,
  - какие шаги делаем прямо сейчас операционно.
4) Обоснование (1–3 коротких предложения):
  - чью позицию агентов ты считаешь ключевой в этом кейсе и почему,
  - как выбранный план балансирует деньги, срок и удовлетворённость клиента.

Требования к стилю:
- пиши на русском, деловым, но простым языком;
- не пересказывай весь входной JSON и не цитируй его полностью — только выжимку;
- обязательно покажи, как именно ты использовал оценки агентов и консенсус;
- не описывай внутреннюю механику агентов и моделей — только решение и логику выбора.`;

export async function crisisManagerLLM(summary: string): Promise<string | null> {
  const apiKey = process.env.MISTRAL_API_KEY;
  const apiUrl =
    process.env.MISTRAL_API_URL?.trim() ||
    "https://api.mistral.ai/v1/chat/completions";

  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.MISTRAL_MODEL || "mistral-small-latest",
        messages: [
          { role: "system", content: CRISIS_MANAGER_SYSTEM_PROMPT },
          { role: "user", content: summary }
        ]
      })
    });

    if (!response.ok) {
      console.error("Mistral API error", await response.text());
      return null;
    }

    const data = (await response.json()) as any;
    const text = data.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim().length > 0 ? text : null;
  } catch (err) {
    console.error("Failed to call Mistral API", err);
    return null;
  }
}

// Планировщик инструментов для BDI-агента: описывает подключённые к нему ноды-инструменты
// и просит LLM вернуть, какие из них и в каком порядке использовать.

export interface BdiToolDescription {
  id: string;
  key: string;
  type: string;
  label?: string;
  category?: string;
  description?: string;
  toolId?: string;
  configJson: any;
  toolMetadata?: {
    id: string;
    kind: string;
    name: string;
    version: string;
    config: any;
  };
}

export interface BdiToolPlanStep {
  id: string;
  key: string;
  type: string;
}

export interface BdiToolPlanFinal {
  outputNodeId?: string;
}

export interface BdiToolPlan {
  tools?: BdiToolPlanStep[];
  final?: BdiToolPlanFinal;
}

function extractJsonPayload(raw: string): string | null {
  if (!raw) return null;
  let trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    const firstLineBreak = trimmed.indexOf("\n");
    if (firstLineBreak !== -1) {
      const closingFence = trimmed.lastIndexOf("```");
      if (closingFence > firstLineBreak) {
        trimmed = trimmed.slice(firstLineBreak + 1, closingFence).trim();
      }
    }
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : trimmed;
}

const BDI_PLANNER_SYSTEM_PROMPT = `Ты — планировщик инструментов для BDI-кризисного менеджера.

Тебе дают один JSON с:
- полем "orderCtx" — описание кризисного заказа и контекста;
- массивом "tools" — ноды-инструменты, реально подключённые к BDI (id, key, type, label, category, configJson);
- массивом "outputs" — выходные ноды (куда в итоге надо прийти, например финальный ответ пользователю).

Каждый инструмент в списке tools уже содержит своё текстовое описание и конфигурацию в полях
label, category и configJson — используй их, чтобы понять роль и смысл инструмента.

Твоя задача:
- выбрать, какие инструменты из списка tools нужно вызвать и в каком порядке;
- опираться на их описания и типы, НЕ придумывая новых инструментов;
- при необходимости можешь пропустить любые инструменты из списка, если они не нужны для решения кейса;
- указать, к какому выходному узлу из списка outputs ты в итоге ведёшь план (если это имеет смысл).

Формат ответа — строго JSON без комментариев:
{
  "tools": [
    { "id": "<id ноды>", "key": "<key ноды>", "type": "<type ноды>" },
    ...
  ],
  "final": {
    "outputNodeId": "<id выходной ноды, если хочешь явно указать>"
  }
}

Не добавляй ничего, кроме этого объекта JSON.`;

export async function planBdiToolsLLM(orderCtx: any, tools: BdiToolDescription[], outputs: { id: string; key: string; type: string; label?: string; }[] = []): Promise<BdiToolPlan> {
  const apiKey = process.env.MISTRAL_API_KEY;
  const apiUrl =
    process.env.MISTRAL_API_URL?.trim() ||
    "https://api.mistral.ai/v1/chat/completions";

  if (!apiKey || tools.length === 0) {
    return { tools: [] };
  }

  const payload = {
    orderCtx,
    tools: tools.map((t) => ({
      id: t.id,
      key: t.key,
      type: t.type,
      label: t.label,
      category: t.category,
      description: t.description,
      toolId: t.toolId,
      configJson: t.configJson,
      toolMetadata: t.toolMetadata
    })),
    outputs
  };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.MISTRAL_MODEL || "mistral-small-latest",
        messages: [
          { role: "system", content: BDI_PLANNER_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload) }
        ]
      })
    });

    if (!response.ok) {
      console.error("Mistral API error (BDI planner)", await response.text());
      return { tools: [] };
    }

    const data = (await response.json()) as any;
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) return { tools: [] };

    const cleaned = extractJsonPayload(text);
    if (!cleaned) {
      return { tools: [] };
    }

    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && Array.isArray(parsed.tools)) {
        const result: BdiToolPlan = { tools: parsed.tools as BdiToolPlanStep[] };
        if (parsed.final) {
          result.final = parsed.final as BdiToolPlanFinal;
        }
        return result;
      }
    } catch (e) {
      console.error("Failed to parse BDI planner JSON", e, text);
    }

    return { tools: [] };
  } catch (err) {
    console.error("Failed to call Mistral API (BDI planner)", err);
    return { tools: [] };
  }
}

