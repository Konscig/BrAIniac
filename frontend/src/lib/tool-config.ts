/**
 * Реестр per-tool конфигов для UI ToolNode.
 *
 * Каждая запись описывает форму, которую пользователь заполняет в
 * шестерёнке узла. Конфиг сохраняется в `Node.ui_json.toolConfig` —
 * существующий путь, который уже читается в node-handler-ах при
 * исполнении.
 *
 * Дефолты и описания базируются на каталоге docs/sdd/08-rag-toolkit.md.
 */

export type ToolConfigField =
  | {
      kind: "text";
      key: string;
      label: string;
      placeholder?: string;
      defaultValue?: string;
    }
  | {
      kind: "textarea";
      key: string;
      label: string;
      placeholder?: string;
      defaultValue?: string;
    }
  | {
      kind: "number";
      key: string;
      label: string;
      placeholder?: string;
      step?: number;
      min?: number;
      max?: number;
      defaultValue?: number;
    }
  | {
      kind: "select";
      key: string;
      label: string;
      options: { value: string; label: string }[];
      defaultValue?: string;
    };

export interface ToolConfigDefinition {
  /** Заголовок секции в шестерёнке. */
  title: string;
  /** Описание под заголовком. */
  description?: string;
  /** Поля формы. */
  fields: ToolConfigField[];
}

export const TOOL_CONFIG_DEFINITIONS: Record<string, ToolConfigDefinition> = {
  DocumentLoader: {
    title: "Загрузчик документов",
    description: "Читает документы из dataset_id или списка URI и формирует documents[].",
    fields: [
      {
        kind: "number",
        key: "max_documents",
        label: "Лимит документов",
        placeholder: "128",
        step: 1,
        min: 1,
        max: 1024
      },
      {
        kind: "number",
        key: "max_uris",
        label: "Лимит URI на запрос",
        placeholder: "64",
        step: 1,
        min: 1,
        max: 256
      }
    ]
  },
  QueryBuilder: {
    title: "Сборка поискового запроса",
    description: "Нормализует пользовательский запрос и извлекает ключевые термины.",
    fields: [
      {
        kind: "select",
        key: "strategy",
        label: "Стратегия",
        defaultValue: "default",
        options: [
          { value: "default", label: "default" },
          { value: "keyword", label: "keyword" },
          { value: "embedding", label: "embedding" }
        ]
      },
      {
        kind: "number",
        key: "max_terms",
        label: "Максимум терминов",
        placeholder: "8",
        step: 1,
        min: 1,
        max: 64
      }
    ]
  },
  Chunker: {
    title: "Разбиение на фрагменты",
    description: "Разбивает документы на чанки фиксированного размера с overlap.",
    fields: [
      {
        kind: "select",
        key: "strategy",
        label: "Стратегия",
        defaultValue: "word",
        options: [
          { value: "word", label: "word (слова)" },
          { value: "sentence", label: "sentence" },
          { value: "char", label: "char (символы)" }
        ]
      },
      {
        kind: "number",
        key: "chunk_size",
        label: "Размер чанка",
        placeholder: "256",
        step: 1,
        min: 16,
        max: 8192
      },
      {
        kind: "number",
        key: "overlap",
        label: "Overlap",
        placeholder: "32",
        step: 1,
        min: 0,
        max: 1024
      }
    ]
  },
  Embedder: {
    title: "Векторизация",
    description: "Строит векторные представления чанков.",
    fields: [
      {
        kind: "text",
        key: "model",
        label: "Модель эмбеддинга",
        placeholder: "openai/text-embedding-3-small"
      },
      {
        kind: "number",
        key: "batch_size",
        label: "Размер батча",
        placeholder: "32",
        step: 1,
        min: 1,
        max: 256
      },
      {
        kind: "select",
        key: "executor",
        label: "Executor",
        defaultValue: "http-json",
        options: [
          { value: "http-json", label: "http-json (детерминированный)" },
          { value: "openrouter-embeddings", label: "openrouter-embeddings" }
        ]
      }
    ]
  },
  VectorUpsert: {
    title: "Запись в векторный индекс",
    description: "Подтверждает upsert векторов в индекс с дедупликацией.",
    fields: [
      {
        kind: "text",
        key: "index_name",
        label: "Имя индекса",
        placeholder: "default"
      },
      {
        kind: "text",
        key: "namespace",
        label: "Namespace",
        placeholder: "(пусто = default)"
      }
    ]
  },
  HybridRetriever: {
    title: "Гибридный поиск",
    description: "Ищет top-k кандидатов в artifact-backed индексе (dense/sparse/hybrid).",
    fields: [
      {
        kind: "number",
        key: "topK",
        label: "Top K",
        placeholder: "5",
        step: 1,
        min: 1,
        max: 100
      },
      {
        kind: "select",
        key: "mode",
        label: "Режим поиска",
        defaultValue: "hybrid",
        options: [
          { value: "dense", label: "dense" },
          { value: "sparse", label: "sparse" },
          { value: "hybrid", label: "hybrid" }
        ]
      },
      {
        kind: "number",
        key: "alpha",
        label: "Alpha (вес dense, 0..1)",
        placeholder: "0.5",
        step: 0.05,
        min: 0,
        max: 1
      }
    ]
  },
  ContextAssembler: {
    title: "Сборщик контекста",
    description: "Собирает context_bundle из кандидатов в пределах токен-бюджета.",
    fields: [
      {
        kind: "number",
        key: "max_tokens",
        label: "Бюджет токенов",
        placeholder: "2048",
        step: 64,
        min: 128,
        max: 32768
      },
      {
        kind: "select",
        key: "join_strategy",
        label: "Стратегия объединения",
        defaultValue: "concat",
        options: [
          { value: "concat", label: "concat" },
          { value: "annotated", label: "annotated (с метаданными)" }
        ]
      }
    ]
  },
  LLMAnswer: {
    title: "Ответ модели",
    description: "Вызывает LLM через OpenRouter; формирует ответ с опорой на контекст.",
    fields: [
      {
        kind: "text",
        key: "model",
        label: "Модель",
        placeholder: "google/gemini-2.5-flash-preview"
      },
      {
        kind: "number",
        key: "temperature",
        label: "Temperature",
        placeholder: "0.2",
        step: 0.1,
        min: 0,
        max: 2
      },
      {
        kind: "number",
        key: "max_tokens",
        label: "Max tokens",
        placeholder: "1024",
        step: 64,
        min: 64,
        max: 32768
      },
      {
        kind: "textarea",
        key: "system_prompt",
        label: "System prompt (опционально)",
        placeholder: "Ты — помощник, отвечающий по контексту…"
      }
    ]
  },
  CitationFormatter: {
    title: "Оформление цитат",
    description: "Добавляет к ответу структурированные ссылки на источники.",
    fields: [
      {
        kind: "select",
        key: "citation_style",
        label: "Стиль цитирования",
        defaultValue: "inline-numbers",
        options: [
          { value: "inline-numbers", label: "[1], [2] (inline)" },
          { value: "footnotes", label: "footnotes" },
          { value: "bracketed-uri", label: "[uri]" }
        ]
      }
    ]
  }
};

export function getToolConfigDefinition(toolName: string): ToolConfigDefinition | null {
  const trimmed = toolName.trim();
  return TOOL_CONFIG_DEFINITIONS[trimmed] ?? null;
}

const TOOL_TAGLINES: Record<string, string> = {
  DocumentLoader: "Читает документы из dataset_id или списка URI.",
  QueryBuilder: "Готовит поисковый запрос из вопроса пользователя.",
  Chunker: "Делит документы на чанки фиксированного размера.",
  Embedder: "Строит векторы из чанков (deterministic или провайдер).",
  VectorUpsert: "Записывает векторы в индекс с дедупликацией.",
  HybridRetriever: "Ищет top-k кандидатов (dense/sparse/hybrid).",
  ContextAssembler: "Собирает context_bundle в пределах токен-бюджета.",
  LLMAnswer: "Отвечает на вопрос через LLM, опираясь на контекст.",
  CitationFormatter: "Добавляет к ответу ссылки на источники."
};

export function getToolUiTagline(toolName: string): string {
  return TOOL_TAGLINES[toolName.trim()] ?? "Инструмент каталога.";
}
