import React from "react";
import { Bot, Braces, Cable, CirclePlay, Database, Save, Wrench } from "lucide-react";
import { Handle, Position, type NodeProps } from "reactflow";

import type { ToolRecord } from "../lib/api";
import { cn } from "../lib/utils";

type CanvasNodeStatus = "idle" | "completed" | "failed" | "skipped" | "running";

export type CanvasNodeData = {
  nodeId: number;
  label: string;
  nodeTypeName: string;
  role: string;
  status: CanvasNodeStatus;
  isIncomplete?: boolean;
  description?: string;
  manualQuestion?: string;
  selectedToolId?: number | null;
  finalOutputPreview?: string;
  tools?: ToolRecord[];
  onManualQuestionCommit?: (nodeId: number, question: string) => void;
  onToolSelect?: (nodeId: number, toolId: number | null) => void;
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
  const isManualInput = data.nodeTypeName === "ManualInput";
  const isToolNode = data.nodeTypeName === "ToolNode";
  const isAgentCall = data.nodeTypeName === "AgentCall";
  const isSaveResult = data.nodeTypeName === "SaveResult";
  const [questionDraft, setQuestionDraft] = React.useState(data.manualQuestion ?? "");

  React.useEffect(() => {
    setQuestionDraft(data.manualQuestion ?? "");
  }, [data.manualQuestion]);

  const stopCanvasGesture = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  const commitQuestion = () => {
    data.onManualQuestionCommit?.(data.nodeId, questionDraft);
  };

  return (
    <div
      className={cn(
        "group relative flex min-w-[220px] max-w-[260px] flex-col gap-2.5 rounded-[1.15rem] border px-3.5 py-3 shadow-soft transition",
        tokens.frame,
        selected && "ring-2 ring-ring",
        data.isIncomplete && "border-dashed border-amber-400/60"
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className={cn("flex h-[2.125rem] w-[2.125rem] items-center justify-center rounded-2xl", tokens.badge)}>
          <Icon className="h-[1.125rem] w-[1.125rem]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-5 text-foreground">{data.label}</div>
          <div className="truncate text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {data.nodeTypeName}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className={cn("font-medium", status.tone)}>{status.label}</span>
        <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {data.role}
        </span>
      </div>

      {data.isIncomplete && (
        <div className="text-[11px] text-amber-200">
          Требуется настройка узла
        </div>
      )}

      {isManualInput && (
        <textarea
          value={questionDraft}
          onChange={(event) => setQuestionDraft(event.target.value)}
          onBlur={commitQuestion}
          onMouseDown={stopCanvasGesture}
          onPointerDown={stopCanvasGesture}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              commitQuestion();
              event.currentTarget.blur();
            }
          }}
          placeholder="Вопрос пользователя"
          className="nodrag min-h-[78px] resize-none rounded-lg border border-border/60 bg-background/85 px-2.5 py-2 text-xs leading-5 text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
        />
      )}

      {isToolNode && (
        <select
          value={data.selectedToolId ? String(data.selectedToolId) : ""}
          onChange={(event) => {
            const nextToolId = Number(event.target.value);
            data.onToolSelect?.(data.nodeId, Number.isInteger(nextToolId) && nextToolId > 0 ? nextToolId : null);
          }}
          onMouseDown={stopCanvasGesture}
          onPointerDown={stopCanvasGesture}
          className="nodrag h-9 rounded-lg border border-border/60 bg-background/85 px-2.5 text-xs text-foreground outline-none ring-offset-background focus:ring-2 focus:ring-ring"
        >
          <option value="">Выберите инструмент</option>
          {(data.tools ?? []).map((tool) => (
            <option key={tool.tool_id} value={tool.tool_id}>
              {tool.name}
            </option>
          ))}
        </select>
      )}

      {isSaveResult && data.finalOutputPreview && (
        <div className="max-h-28 overflow-auto rounded-lg border border-border/50 bg-background/85 px-2.5 py-2 text-xs leading-5 text-muted-foreground">
          {data.finalOutputPreview}
        </div>
      )}

      {data.description && (
        <div className="line-clamp-2 text-[11px] leading-[1.125rem] text-muted-foreground">{data.description}</div>
      )}

      <Handle
        type="target"
        id="flow-in"
        position={Position.Left}
        className={cn(
          "!h-2.5 !w-2.5 !border-2 !border-background shadow-glow transition group-hover:scale-110",
          tokens.handle
        )}
      />
      <Handle
        type="source"
        id="flow-out"
        position={Position.Right}
        className={cn(
          "!h-2.5 !w-2.5 !border-2 !border-background shadow-glow transition group-hover:scale-110",
          tokens.handle
        )}
      />

      {isToolNode && (
        <>
          <Handle
            type="source"
            id="capability-top"
            position={Position.Top}
            className={cn(
              "!h-2.5 !w-2.5 !border-2 !border-background shadow-glow transition group-hover:scale-110",
              tokens.handle
            )}
          />
          <Handle
            type="source"
            id="capability-bottom"
            position={Position.Bottom}
            className={cn(
              "!h-2.5 !w-2.5 !border-2 !border-background shadow-glow transition group-hover:scale-110",
              tokens.handle
            )}
          />
        </>
      )}

      {isAgentCall && (
        <>
          <Handle
            type="target"
            id="capability-top"
            position={Position.Top}
            className={cn(
              "!h-2.5 !w-2.5 !border-2 !border-background shadow-glow transition group-hover:scale-110",
              tokens.handle
            )}
          />
          <Handle
            type="target"
            id="capability-bottom"
            position={Position.Bottom}
            className={cn(
              "!h-2.5 !w-2.5 !border-2 !border-background shadow-glow transition group-hover:scale-110",
              tokens.handle
            )}
          />
        </>
      )}
    </div>
  );
};

export const nodeTypes = {
  runtimeNode: RuntimeNodeCard
};
