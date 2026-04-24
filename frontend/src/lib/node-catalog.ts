import type { NodeTypeRecord, ToolRecord } from "./api";

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

export const VISIBLE_TOOL_NAMES = [
  "DocumentLoader",
  "QueryBuilder",
  "Chunker",
  "Embedder",
  "VectorUpsert",
  "HybridRetriever",
  "ContextAssembler",
  "LLMAnswer",
  "CitationFormatter"
] as const;

const TOOL_ORDER = new Map<string, number>(VISIBLE_TOOL_NAMES.map((name, index) => [name, index]));

export function normalizeToolName(name: string): string {
  return name.trim();
}

export function isVisibleTool(tool: ToolRecord): boolean {
  const name = normalizeToolName(tool.name);
  const config = tool.config_json && typeof tool.config_json === "object" ? tool.config_json : {};
  const family = typeof config.family === "string" ? config.family.trim() : "";
  const catalog = typeof config.catalog === "string" ? config.catalog.trim() : "";

  return TOOL_ORDER.has(name) && family === "builtin-contract" && catalog === "mvp-tool-contracts";
}

export function getVisibleToolCatalog(tools: ToolRecord[]): ToolRecord[] {
  return tools
    .filter(isVisibleTool)
    .sort((a, b) => (TOOL_ORDER.get(normalizeToolName(a.name)) ?? 999) - (TOOL_ORDER.get(normalizeToolName(b.name)) ?? 999));
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
      return "Вход";
    case "AgentCall":
    case "LLMCall":
      return "Агент и модели";
    case "ToolNode":
      return "Инструменты";
    case "SaveResult":
      return "Выход";
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
      return "Входной dataset";
    default:
      return normalizeNodeTypeName(nodeType.name);
  }
}

export function getNodeTypeTechnicalLabel(name: string): string {
  switch (normalizeNodeTypeName(name)) {
    case "Trigger":
      return "вход";
    case "ManualInput":
      return "вход";
    case "PromptBuilder":
      return "обработка";
    case "Filter":
      return "обработка";
    case "Ranker":
      return "обработка";
    case "LLMCall":
      return "обработка";
    case "AgentCall":
      return "агент";
    case "ToolNode":
      return "инструмент";
    case "Parser":
      return "обработка";
    case "SaveResult":
      return "выход";
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
      return "Запускает граф вручную или по событию.";
    case "ManualInput":
      return "Передает вопрос пользователя в граф.";
    case "PromptBuilder":
      return "Собирает текст промпта из входных данных.";
    case "Filter":
      return "Отбирает записи по заданному правилу.";
    case "Ranker":
      return "Сортирует кандидатов и ограничивает выдачу.";
    case "LLMCall":
      return "Отправляет прямой запрос в модель.";
    case "AgentCall":
      return "Оркестрирует модель и подключенные инструменты.";
    case "ToolNode":
      return "Объявляет инструмент для агента или исполняет его как шаг.";
    case "Parser":
      return "Преобразует текстовый ответ в структурированные данные.";
    case "SaveResult":
      return "Показывает и сохраняет финальный результат.";
    case "DatasetInput":
      return "Передает dataset в расширенные сценарии.";
    default:
      return "Узел графа выполнения.";
  }
}
