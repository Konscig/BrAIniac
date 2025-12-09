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
