import React from "react";
import { Bot, Braces, Cable, CirclePlay, Database, Save, Wrench } from "lucide-react";
import { Handle, Position, type NodeProps } from "reactflow";

import { cn } from "../lib/utils";

type CanvasNodeStatus = "idle" | "completed" | "failed" | "skipped" | "running";

export type CanvasNodeData = {
  label: string;
  nodeTypeName: string;
  role: string;
  status: CanvasNodeStatus;
  isIncomplete?: boolean;
  description?: string;
};

const statusTokens: Record<CanvasNodeStatus, { label: string; tone: string }> = {
  idle: { label: "Черновик", tone: "text-muted-foreground" },
  running: { label: "Выполняется", tone: "text-sky-300" },
  completed: { label: "Выполнен", tone: "text-emerald-300" },
  failed: { label: "Ошибка", tone: "text-red-300" },
  skipped: { label: "Пропущен", tone: "text-amber-300" }
};

const roleTokens: Record<string, { badge: string; frame: string; handle: string }> = {
  source: {
    badge: "bg-sky-500/15 text-sky-200",
    frame: "border-sky-500/35 bg-sky-500/5",
    handle: "bg-sky-400"
  },
  transform: {
    badge: "bg-primary/15 text-primary-foreground",
    frame: "border-primary/35 bg-primary/5",
    handle: "bg-primary"
  },
  control: {
    badge: "bg-amber-500/15 text-amber-200",
    frame: "border-amber-500/35 bg-amber-500/5",
    handle: "bg-amber-400"
  },
  sink: {
    badge: "bg-emerald-500/15 text-emerald-200",
    frame: "border-emerald-500/35 bg-emerald-500/5",
    handle: "bg-emerald-400"
  }
};

const iconByType: Record<string, React.ComponentType<{ className?: string }>> = {
  Trigger: CirclePlay,
  ManualInput: Database,
  PromptBuilder: Braces,
  Filter: Cable,
  Ranker: Cable,
  LLMCall: Bot,
  AgentCall: Bot,
  ToolNode: Wrench,
  Parser: Braces,
  SaveResult: Save
};

export const RuntimeNodeCard: React.FC<NodeProps<CanvasNodeData>> = ({ data, selected }) => {
  const tokens = roleTokens[data.role] ?? roleTokens.transform;
  const status = statusTokens[data.status] ?? statusTokens.idle;
  const Icon = iconByType[data.nodeTypeName] ?? Wrench;

  return (
    <div
      className={cn(
        "group relative flex min-w-[220px] max-w-[260px] flex-col gap-3 rounded-2xl border px-4 py-3 shadow-soft transition",
        tokens.frame,
        selected && "ring-2 ring-ring",
        data.isIncomplete && "border-dashed border-amber-400/60"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", tokens.badge)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{data.label}</div>
          <div className="truncate text-xs uppercase tracking-wide text-muted-foreground">
            {data.nodeTypeName}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs">
        <span className={cn("font-medium", status.tone)}>{status.label}</span>
        <span className="rounded-full border border-border/60 px-2 py-0.5 text-muted-foreground">
          {data.role}
        </span>
      </div>

      {data.isIncomplete && (
        <div className="text-xs text-amber-200">
          Требуется настройка узла
        </div>
      )}

      {data.description && (
        <div className="line-clamp-2 text-xs text-muted-foreground">{data.description}</div>
      )}

      <Handle
        type="target"
        position={Position.Top}
        className={cn(
          "!h-3 !w-3 !border-2 !border-background shadow-glow transition group-hover:scale-110",
          tokens.handle
        )}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          "!h-3 !w-3 !border-2 !border-background shadow-glow transition group-hover:scale-110",
          tokens.handle
        )}
      />
    </div>
  );
};

export const nodeTypes = {
  runtimeNode: RuntimeNodeCard
};
