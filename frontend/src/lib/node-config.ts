import type { JsonRecord, NodeRecord } from "./api";
import { normalizeNodeTypeName } from "./node-catalog";

export type NodeConfigField = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "number" | "select";
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
};

export type NodeConfigDefinition = {
  section: string;
  title: string;
  fields: NodeConfigField[];
};

export const NODE_CONFIG_DEFINITIONS: Record<string, NodeConfigDefinition> = {
  AgentCall: {
    section: "agent",
    title: "Настройки агента",
    fields: [
      { key: "modelId", label: "Модель", kind: "text", placeholder: "openai/gpt-4o-mini" },
      { key: "systemPrompt", label: "Системный промпт", kind: "textarea" },
      { key: "maxToolCalls", label: "Максимум вызовов инструментов", kind: "number" },
      { key: "maxAttempts", label: "Попытки провайдера", kind: "number" },
      { key: "softRetryDelayMs", label: "Пауза retry, мс", kind: "number" },
      { key: "temperature", label: "Temperature", kind: "number" },
      { key: "maxTokens", label: "Max tokens", kind: "number" }
    ]
  },
  LLMCall: {
    section: "llm",
    title: "Настройки модели",
    fields: [
      { key: "modelId", label: "Модель", kind: "text", placeholder: "openai/gpt-4o-mini" },
      { key: "temperature", label: "Temperature", kind: "number" },
      { key: "maxTokens", label: "Max tokens", kind: "number" }
    ]
  },
  Filter: {
    section: "filter",
    title: "Настройки фильтра",
    fields: [
      { key: "field", label: "Поле", kind: "text", placeholder: "score" },
      {
        key: "op",
        label: "Оператор",
        kind: "select",
        options: [
          { value: "", label: "Не задан" },
          { value: "eq", label: "равно" },
          { value: "neq", label: "не равно" },
          { value: "gt", label: "больше" },
          { value: "gte", label: "больше или равно" },
          { value: "lt", label: "меньше" },
          { value: "lte", label: "меньше или равно" },
          { value: "contains", label: "содержит" }
        ]
      },
      { key: "value", label: "Значение", kind: "text" },
      { key: "limit", label: "Лимит", kind: "number" }
    ]
  },
  Ranker: {
    section: "ranker",
    title: "Настройки ранжирования",
    fields: [
      { key: "scoreField", label: "Поле score", kind: "text", placeholder: "score" },
      { key: "textField", label: "Текстовое поле", kind: "text", placeholder: "text" },
      {
        key: "order",
        label: "Порядок",
        kind: "select",
        options: [
          { value: "desc", label: "по убыванию" },
          { value: "asc", label: "по возрастанию" }
        ]
      },
      { key: "topK", label: "Top K", kind: "number" },
      { key: "query", label: "Запрос", kind: "textarea" }
    ]
  }
};

export function isConfigurableNodeType(nodeTypeName: string): boolean {
  return Boolean(NODE_CONFIG_DEFINITIONS[normalizeNodeTypeName(nodeTypeName)]);
}

export function parseNodeConfigFieldValue(field: NodeConfigField, rawValue: string): unknown {
  const trimmed = rawValue.trim();
  if (!trimmed) return undefined;
  if (field.kind === "number") {
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : undefined;
  }
  if (field.key === "value") {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return rawValue;
}

export function buildNodeConfigPatch(
  node: NodeRecord,
  nodeTypeName: string,
  draft: Record<string, string>
): { ui_json: JsonRecord } | null {
  const config = NODE_CONFIG_DEFINITIONS[normalizeNodeTypeName(nodeTypeName)];
  if (!config) return null;

  const nextSection: JsonRecord = {};
  for (const field of config.fields) {
    const value = parseNodeConfigFieldValue(field, draft[field.key] ?? "");
    if (value !== undefined) {
      nextSection[field.key] = value;
    }
  }

  return {
    ui_json: {
      ...node.ui_json,
      [config.section]: nextSection
    }
  };
}
