import type { NodeTypeRecord } from "./api";

export const VISIBLE_NODE_TYPE_NAMES = [
  "Trigger",
  "ManualInput",
  "PromptBuilder",
  "Filter",
  "Ranker",
  "LLMCall",
  "AgentCall",
  "ToolNode",
  "Parser",
  "SaveResult"
] as const;

export const HIDDEN_NODE_TYPE_NAMES = [
  "DatasetInput",
  "Branch",
  "Merge",
  "RetryGate",
  "LoopGate",
  "Notify",
  "Export"
] as const;

export type VisibleNodeTypeName = (typeof VISIBLE_NODE_TYPE_NAMES)[number];

const ORDER = new Map<string, number>(
  [...VISIBLE_NODE_TYPE_NAMES, ...HIDDEN_NODE_TYPE_NAMES].map((name, index) => [name, index])
);

export function isVisibleNodeType(nodeType: NodeTypeRecord): boolean {
  return VISIBLE_NODE_TYPE_NAMES.includes(nodeType.name as VisibleNodeTypeName);
}

export function sortNodeTypes(nodeTypes: NodeTypeRecord[]): NodeTypeRecord[] {
  return [...nodeTypes].sort((left, right) => {
    const leftOrder = ORDER.get(left.name) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = ORDER.get(right.name) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.name.localeCompare(right.name);
  });
}

export function getNodeTypeRole(nodeType: NodeTypeRecord): string {
  const role = nodeType.config_json && typeof nodeType.config_json === "object" ? nodeType.config_json.role : undefined;
  return typeof role === "string" && role.trim().length > 0 ? role.trim() : "transform";
}

export function getNodeTypeGroupLabel(nodeType: NodeTypeRecord): string {
  switch (nodeType.name) {
    case "Trigger":
    case "ManualInput":
      return "Источники";
    case "AgentCall":
    case "LLMCall":
      return "Агент и модели";
    case "ToolNode":
      return "Инструменты";
    case "SaveResult":
      return "Завершение";
    default:
      return "Обработка";
  }
}

export function getNodeTypeUiLabel(nodeType: NodeTypeRecord): string {
  switch (nodeType.name) {
    case "Trigger":
      return "Триггер";
    case "ManualInput":
      return "Вопрос пользователя";
    case "PromptBuilder":
      return "Сборка промпта";
    case "Filter":
      return "Фильтр";
    case "Ranker":
      return "Ранжирование";
    case "LLMCall":
      return "Вызов модели";
    case "AgentCall":
      return "Агент";
    case "ToolNode":
      return "Узел инструмента";
    case "Parser":
      return "Парсер";
    case "SaveResult":
      return "Сохранение результата";
    case "DatasetInput":
      return "Входной датасет";
    default:
      return nodeType.name;
  }
}

export function getNodeTypeUiTagline(nodeType: NodeTypeRecord): string {
  switch (nodeType.name) {
    case "Trigger":
      return "Старт по событию или вручную";
    case "ManualInput":
      return "Передаёт вопрос в граф";
    case "PromptBuilder":
      return "Готовит контекст для модели";
    case "Filter":
      return "Оставляет только нужные записи";
    case "Ranker":
      return "Упорядочивает кандидатов";
    case "LLMCall":
      return "Прямой вызов модели";
    case "AgentCall":
      return "Оркестрирует инструменты через агентный runtime";
    case "ToolNode":
      return "Представляет конкретный инструмент";
    case "Parser":
      return "Нормализует и структурирует output";
    case "SaveResult":
      return "Финальный sink результата";
    case "DatasetInput":
      return "Advanced-only source узел";
    default:
      return nodeType.desc;
  }
}
