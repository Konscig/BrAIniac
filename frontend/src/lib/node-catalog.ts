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

export function normalizeNodeTypeName(name: string): string {
  return name.trim();
}

export function isVisibleNodeType(nodeType: NodeTypeRecord): boolean {
  return VISIBLE_NODE_TYPE_NAMES.includes(normalizeNodeTypeName(nodeType.name) as VisibleNodeTypeName);
}

export function sortNodeTypes(nodeTypes: NodeTypeRecord[]): NodeTypeRecord[] {
  return [...nodeTypes].sort((left, right) => {
    const leftName = normalizeNodeTypeName(left.name);
    const rightName = normalizeNodeTypeName(right.name);
    const leftOrder = ORDER.get(leftName) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = ORDER.get(rightName) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return leftName.localeCompare(rightName);
  });
}

export function getVisibleNodeTypeCatalog(nodeTypes: NodeTypeRecord[]): NodeTypeRecord[] {
  const uniqueByName = new Map<string, NodeTypeRecord>();

  for (const nodeType of nodeTypes) {
    const normalizedName = normalizeNodeTypeName(nodeType.name);
    if (!VISIBLE_NODE_TYPE_NAMES.includes(normalizedName as VisibleNodeTypeName)) {
      continue;
    }

    const normalizedRecord: NodeTypeRecord = {
      ...nodeType,
      name: normalizedName
    };
    const existing = uniqueByName.get(normalizedName);
    if (!existing || normalizedRecord.type_id > existing.type_id) {
      uniqueByName.set(normalizedName, normalizedRecord);
    }
  }

  return sortNodeTypes(Array.from(uniqueByName.values()));
}

export function getNodeTypeRole(nodeType: NodeTypeRecord): string {
  const role = nodeType.config_json && typeof nodeType.config_json === "object" ? nodeType.config_json.role : undefined;
  return typeof role === "string" && role.trim().length > 0 ? role.trim() : "transform";
}

export function getNodeTypeGroupLabel(nodeType: NodeTypeRecord): string {
  switch (normalizeNodeTypeName(nodeType.name)) {
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
  switch (normalizeNodeTypeName(nodeType.name)) {
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
      return normalizeNodeTypeName(nodeType.name);
  }
}

export function getNodeTypeTechnicalLabel(name: string): string {
  switch (normalizeNodeTypeName(name)) {
    case "Trigger":
      return "триггер";
    case "ManualInput":
      return "ввод";
    case "PromptBuilder":
      return "промпт";
    case "Filter":
      return "фильтр";
    case "Ranker":
      return "ранжирование";
    case "LLMCall":
      return "модель";
    case "AgentCall":
      return "агент";
    case "ToolNode":
      return "инструмент";
    case "Parser":
      return "парсер";
    case "SaveResult":
      return "финал";
    default:
      return normalizeNodeTypeName(name);
  }
}

export function getToolUiLabel(name: string): string {
  switch (name.trim()) {
    case "DocumentLoader":
      return "Загрузчик документов";
    case "Chunker":
      return "Разбиение на фрагменты";
    case "ContextAssembler":
      return "Сборщик контекста";
    case "LLMAnswer":
      return "Ответ модели";
    case "CitationFormatter":
      return "Оформление цитат";
    case "Embedder":
      return "Векторизация";
    case "VectorUpsert":
      return "Запись в векторный индекс";
    case "HybridRetriever":
      return "Гибридный поиск";
    case "QueryBuilder":
      return "Сборка поискового запроса";
    case "Reranker":
      return "Переранжирование";
    case "OutputValidator":
      return "Проверка ответа";
    case "TraceLogger":
      return "Логирование трассы";
    case "GroundingChecker":
      return "Проверка обоснованности";
    case "TextNormalizer":
      return "Нормализация текста";
    default:
      return name.trim();
  }
}

export function getNodeTypeUiTagline(nodeType: NodeTypeRecord): string {
  switch (normalizeNodeTypeName(nodeType.name)) {
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
      return "Финальная точка сохранения результата";
    case "DatasetInput":
      return "Скрытый источник для расширенного сценария";
    default:
      return nodeType.desc;
  }
}
