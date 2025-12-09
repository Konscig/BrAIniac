import React from "react";
import { Brain, Cable, Database, Settings2 } from "lucide-react";
import { Handle, Position, type NodeProps } from "reactflow";

import { cn } from "../lib/utils";
import type { PipelineNodeCategory } from "../lib/api";

type CanvasNodeStatus = "idle" | "running" | "error" | "completed";

type CanvasNodeData = {
  label: string;
  category: PipelineNodeCategory;
  status?: CanvasNodeStatus | string;
  nodeType?: string;
  configJson?: string;
  outputPreview?: string;
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
  const isBdiChild = [
    "priority_scheduler",
    "supply_agent",
    "logistics_agent",
    "finance_agent",
    "customer_service_agent",
    "consensus"
  ].includes(data.nodeType ?? "");

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

      {/* Базовые вход/выход слева/справа для всех, кроме подчинённых BDI */}
      {!isBdiChild && (
        <>
          <Handle
            type="target"
            position={Position.Left}
            className={cn(
              "!h-3 !w-3 !bg-background border-2 border-background shadow-glow transition group-hover:scale-110",
              tokens.handleClass
            )}
          />
          <Handle
            type="source"
            position={Position.Right}
            className={cn(
              "!h-3 !w-3 !bg-background border-2 border-background shadow-glow transition group-hover:scale-110",
              tokens.handleClass
            )}
          />
        </>
      )}

      {/* Подчинённые BDI: только вход сверху и выход снизу (визуально двунаправленные связи с оркестратором) */}
      {isBdiChild && (
        <>
          <Handle
            type="target"
            position={Position.Top}
            className={cn(
              "!h-3 !w-3 !bg-background border-2 border-background shadow-glow transition group-hover:scale-110",
              tokens.handleClass
            )}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            className={cn(
              "!h-3 !w-3 !bg-background border-2 border-background shadow-glow transition group-hover:scale-110",
              tokens.handleClass
            )}
          />
        </>
      )}

      {/* Сам BDI-менеджер: классический вход слева, выход справа, плюс доп. верх/низ по желанию */}
      {isBdiManager && (
        <>
          <Handle
            type="target"
            position={Position.Left}
            className={cn(
              "!h-3 !w-3 !bg-background border-2 border-background shadow-glow transition group-hover:scale-110",
              tokens.handleClass
            )}
          />
          <Handle
            type="source"
            position={Position.Right}
            className={cn(
              "!h-3 !w-3 !bg-background border-2 border-background shadow-glow transition group-hover:scale-110",
              tokens.handleClass
            )}
          />
          <Handle
            type="target"
            position={Position.Top}
            className={cn(
              "!h-2.5 !w-2.5 !bg-background border-2 border-background shadow-glow transition group-hover:scale-110",
              tokens.handleClass
            )}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            className={cn(
              "!h-2.5 !w-2.5 !bg-background border-2 border-background shadow-glow transition group-hover:scale-110",
              tokens.handleClass
            )}
          />
        </>
      )}
    </div>
  );
};

export const nodeTypes = {
  vkNode: VkNode
};
