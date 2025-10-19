export type PipelineNode = {
  id: string;
  label: string;
  category: "LLM" | "Data" | "Services" | "Utility";
  status?: "idle" | "running" | "error";
};

export type PipelineEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

export type Pipeline = {
  id: string;
  name: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
};

export type Project = {
  id: string;
  name: string;
  pipelines: Pipeline[];
};

export const mockProjects: Project[] = [
  {
    id: "agent-007",
    name: "Агент 007",
    pipelines: [
      {
        id: "pipeline-1",
        name: "основной пайп",
        nodes: [
          { id: "1", label: "LLM Core", category: "LLM", status: "running" },
          { id: "2", label: "Knowledge Base", category: "Data" },
          { id: "3", label: "Evaluator", category: "Services" },
          { id: "4", label: "Monitoring", category: "Utility", status: "idle" }
        ],
        edges: [
          { id: "e1-2", source: "1", target: "2" },
          { id: "e2-3", source: "2", target: "3" },
          { id: "e3-4", source: "3", target: "4" }
        ]
      }
    ]
  },
  {
    id: "agent-008",
    name: "Агент 008",
    pipelines: []
  },
  {
    id: "agent-006",
    name: "Агент 006",
    pipelines: []
  },
  {
    id: "agent-005",
    name: "Агент 005",
    pipelines: []
  }
];

export const mockLibraryGroups: Array<{
  id: string;
  name: string;
  items: Array<{ id: string; label: string; tagline?: string }>;
}> = [
  {
    id: "LLM",
    name: "LLM",
    items: [
      { id: "llm-core", label: "LLM Core", tagline: "Основной генератор" },
      { id: "llm-judge", label: "LLM Judge", tagline: "Оценщик ответов" },
      { id: "llm-router", label: "LLM Router", tagline: "Переключатель моделей" }
    ]
  },
  {
    id: "Data",
    name: "Data",
    items: [
      { id: "data-ingest", label: "Data Ingest" },
      { id: "vector-db", label: "Vector Store" },
      { id: "cache", label: "Cache" }
    ]
  },
  {
    id: "Services",
    name: "Services",
    items: [
      { id: "stt", label: "Speech to Text" },
      { id: "tts", label: "Text to Speech" },
      { id: "http", label: "HTTP GET" }
    ]
  },
  {
    id: "Utility",
    name: "Utility",
    items: [
      { id: "monitoring", label: "Monitoring" },
      { id: "logger", label: "Logger" },
      { id: "webhook", label: "Webhook" }
    ]
  }
];
