import React from "react";
import { Brain, Cable, Database, Settings2 } from "lucide-react";
import { Handle, Position, type NodeProps } from "reactflow";

import { cn } from "../lib/utils";
import type { PipelineNodeCategory } from "../lib/api";

type CanvasNodeStatus = "idle" | "running" | "error" | "completed";

const BDI_CHILD_TYPES = [
  "priority_scheduler",
  "supply_agent",
  "logistics_agent",
  "finance_agent",
  "customer_service_agent",
  "consensus"
];

const QUESTION_NODE_TYPES = ["input", "input-trigger"];
const ANSWER_NODE_TYPES = ["output-response", "action"];

type CanvasNodeData = {
  label: string;
  category: PipelineNodeCategory;
  status?: CanvasNodeStatus | string;
  nodeType?: string;
  configJson?: string;
  outputPreview?: string;
  nodeId?: string;
  onConfigChange?: (nodeId: string, configJson: string) => void;
};

const statusTokens: Record<CanvasNodeStatus, { label: string; dot: string; text: string }> = {
  idle: {
    label: "Ожидает",
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground"
  },
  running: {
    label: "Выполняется",
    dot: "bg-emerald-400",
    text: "text-emerald-300"
  },
  error: {
    label: "Ошибка",
    dot: "bg-red-400",
    text: "text-red-300"
  },
  completed: {
    label: "Готово",
    dot: "bg-sky-400",
    text: "text-sky-300"
  }
};

const categoryTokens: Record<PipelineNodeCategory, {
  icon: React.ComponentType<{ className?: string }>;
  subtitle: string;
  badgeClass: string;
  wrapperClass: string;
  handleClass: string;
}> = {
  LLM: {
    icon: Brain,
    subtitle: "Модель",
    badgeClass: "bg-primary/15 text-primary",
    wrapperClass: "border-primary/30 bg-primary/5",
    handleClass: "bg-primary"
  },
  Data: {
    icon: Database,
    subtitle: "Данные",
    badgeClass: "bg-sky-500/15 text-sky-300",
    wrapperClass: "border-sky-500/30 bg-sky-500/5",
    handleClass: "bg-sky-400"
  },
  Services: {
    icon: Cable,
    subtitle: "Сервис",
    badgeClass: "bg-violet-500/15 text-violet-300",
    wrapperClass: "border-violet-500/25 bg-violet-500/5",
    handleClass: "bg-violet-400"
  },
  Utility: {
    icon: Settings2,
    subtitle: "Утилиты",
    badgeClass: "bg-amber-400/15 text-amber-300",
    wrapperClass: "border-amber-400/25 bg-amber-400/5",
    handleClass: "bg-amber-300"
  }
};

export type VkNodeData = CanvasNodeData;

export const VkNode: React.FC<NodeProps<VkNodeData>> = ({ data, selected }) => {
  const { label, category, status } = data;
  const tokens = categoryTokens[category] ?? categoryTokens.Utility;
  const Icon = tokens.icon;
  const normalizedStatus = status && status in statusTokens ? (status as CanvasNodeStatus) : undefined;
  const statusToken = normalizedStatus ? statusTokens[normalizedStatus] : undefined;
  const [expanded, setExpanded] = React.useState(false);
  const [questionConfig, setQuestionConfig] = React.useState(data.configJson ?? "{}");
  const [configDirty, setConfigDirty] = React.useState(false);
  const [configError, setConfigError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setQuestionConfig(data.configJson ?? "{}");
    setConfigDirty(false);
    setConfigError(null);
  }, [data.configJson]);

  const roleBadge = React.useMemo(() => {
    if (!data.nodeType) return null;
    switch (data.nodeType) {
      case "bdi_crisis_manager":
        return "Кризисный менеджер";
      case "priority_scheduler":
        return "Приоритизация";
      case "supply_agent":
        return "Агент поставок";
      case "logistics_agent":
        return "Агент логистики";
      case "finance_agent":
        return "Финансовый агент";
      case "customer_service_agent":
        return "Клиентский сервис";
      case "consensus":
        return "Консенсус";
      case "action":
        return "Действие";
      default:
        return null;
    }
  }, [data.nodeType]);

  const isBdiManager = data.nodeType === "bdi_crisis_manager";
  const isBdiChild = BDI_CHILD_TYPES.includes(data.nodeType ?? "");
  const isQuestionNode = QUESTION_NODE_TYPES.includes(data.nodeType ?? "");
  const isAnswerNode = ANSWER_NODE_TYPES.includes(data.nodeType ?? "");
  const showDefaultHandles = !isBdiManager && !isQuestionNode && !isAnswerNode;

  const handleQuestionConfigChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    setQuestionConfig(nextValue);
    setConfigDirty(nextValue !== (data.configJson ?? ""));
    if (configError) {
      setConfigError(null);
    }
  };

  const handleQuestionConfigSave = () => {
    const normalized = questionConfig?.trim() ? questionConfig : "{}";
    try {
      JSON.parse(normalized);
      if (data.nodeId && data.onConfigChange) {
        data.onConfigChange(data.nodeId, normalized);
      }
      setConfigDirty(false);
      setConfigError(null);
    } catch (error) {
      console.warn("Invalid JSON in question node config", error);
      setConfigError("Некорректный JSON");
    }
  };

  return (
    <div
      className={cn(
        "group relative flex min-w-[180px] max-w-[240px] flex-col gap-3 rounded-2xl border px-4 py-3 text-left shadow-soft transition",
        tokens.wrapperClass,
        selected && "ring-2 ring-ring"
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full text-primary",
            tokens.badgeClass
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">{label}</div>
          <div className="flex flex-wrap items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground/80">
            <span>{tokens.subtitle}</span>
            {roleBadge && (
              <span className="rounded-full bg-background/60 px-2 py-0.5 text-[10px] font-medium text-foreground/80">
                {roleBadge}
              </span>
            )}
          </div>
        </div>
      </div>

      {statusToken && (
        <div className={cn("flex items-center gap-2 text-xs font-medium", statusToken.text)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", statusToken.dot)} />
          {statusToken.label}
        </div>
      )}

      {data.outputPreview && (
        <div className="rounded-md bg-background/50 px-2 py-1 text-[11px] text-muted-foreground">
          <div className={cn(
            "whitespace-pre-wrap break-words",
            expanded ? "max-h-48 overflow-auto" : "line-clamp-2"
          )}>
            {data.outputPreview}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }}
            className="mt-1 text-[10px] font-medium text-primary hover:underline"
          >
            {expanded ? "Свернуть" : "Развернуть"}
          </button>
        </div>
      )}

      {/* Базовые вход/выход для универсальных узлов */}
      {showDefaultHandles && (
        <>
          <Handle
            id="default-target"
            type="target"
            position={Position.Left}
            className={cn(
              "!h-3 !w-3 !bg-background border-2 border-background shadow-glow transition group-hover:scale-110",
              tokens.handleClass
            )}
          />
          <Handle
            id="default-source"
            type="source"
            position={Position.Right}
            className={cn(
              "!h-3 !w-3 !bg-background border-2 border-background shadow-glow transition group-hover:scale-110",
              tokens.handleClass
            )}
          />
        </>
      )}

      {/* Узел "вопрос": единственный исходящий поток */}
      {isQuestionNode && (
        <Handle
          id="question-output"
          type="source"
          position={Position.Right}
          className={cn(
            "!h-3 !w-3 !bg-background border-2 border-background shadow-glow transition group-hover:scale-110",
            tokens.handleClass
          )}
        />
      )}

      {/* Узел "ответ": только вход */}
      {isAnswerNode && (
        <Handle
          id="answer-input"
          type="target"
          position={Position.Left}
          className={cn(
            "!h-3 !w-3 !bg-background border-2 border-background shadow-glow transition group-hover:scale-110",
            tokens.handleClass
          )}
        />
      )}

      {/* Декоративные подсказки для BDI-потомков */}
      {isBdiChild && (
        <div className="pointer-events-none absolute -top-1 left-1/2 flex -translate-x-1/2 gap-2">
          <span className="h-2 w-2 rounded-full border border-dashed border-foreground/50 bg-background/80" />
          <span className="h-2 w-2 rounded-full border border-dashed border-foreground/50 bg-background/80" />
        </div>
      )}

      {/* Сам BDI-менеджер: вход вопроса слева, выход ответа справа */}
      {isBdiManager && (
        <>
          <Handle
            id="bdi-question-input"
            type="target"
            position={Position.Left}
            className={cn(
              "!h-3 !w-3 !bg-background border-2 border-background shadow-glow transition group-hover:scale-110",
              tokens.handleClass
            )}
          />
          <Handle
            id="bdi-answer-output"
            type="source"
            position={Position.Right}
            className={cn(
              "!h-3 !w-3 !bg-background border-2 border-background shadow-glow transition group-hover:scale-110",
              tokens.handleClass
            )}
          />
          <div className="pointer-events-none absolute left-1/2 bottom-1 flex -translate-x-1/2 gap-2">
            <span className="h-2.5 w-2.5 rounded-full border border-dashed border-foreground/50 bg-background/80" />
            <span className="h-2.5 w-2.5 rounded-full border border-dashed border-foreground/50 bg-background/80" />
          </div>
        </>
      )}

      {isQuestionNode && (
        <div className="rounded-lg border border-dashed border-border/60 bg-background/50 px-2 py-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            JSON вопроса
          </div>
          <textarea
            value={questionConfig}
            onChange={handleQuestionConfigChange}
            spellCheck={false}
            className="min-h-[96px] w-full resize-none rounded-md border border-border/70 bg-background/80 p-2 font-mono text-[11px] text-foreground"
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            {configError ? (
              <span className="text-[10px] font-medium text-red-400">{configError}</span>
            ) : (
              <span className="text-[10px] text-muted-foreground/80">
                {configDirty ? "Есть несохранённые изменения" : "Синхронизировано"}
              </span>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleQuestionConfigSave();
              }}
              disabled={!configDirty}
              className={cn(
                "rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                configDirty ? "bg-primary/80 text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              Сохранить
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const nodeTypes = {
  vkNode: VkNode
};
