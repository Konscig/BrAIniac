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
  const handleClassName = cn(
    "!h-2 !w-2 !border-2 !border-background shadow-glow transition group-hover:scale-110",
    tokens.handle
  );

  return (
    <div
      className={cn(
        "group relative flex min-w-[190px] max-w-[224px] flex-col gap-2 rounded-xl border px-3 py-2.5 shadow-sm transition",
        tokens.frame,
        selected && "ring-2 ring-ring",
        data.isIncomplete && "border-dashed border-amber-400/60"
      )}
    >
      <div className="flex items-start gap-2">
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", tokens.badge)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold leading-4 text-foreground">{data.label}</div>
          <div className="truncate text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            {data.nodeTypeName}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className={cn("font-medium", status.tone)}>{status.label}</span>
        <span className="rounded-md border border-border/50 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          {data.role}
        </span>
      </div>

      {data.isIncomplete && (
        <div className="text-[10px] text-amber-200">
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
          className="nodrag min-h-[64px] resize-none rounded-md border border-border/60 bg-background/85 px-2 py-1.5 text-[11px] leading-4 text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
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
          className="nodrag h-8 rounded-md border border-border/60 bg-background/85 px-2 text-[11px] text-foreground outline-none ring-offset-background focus:ring-2 focus:ring-ring"
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
        <div className="max-h-24 overflow-auto rounded-md border border-border/50 bg-background/85 px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">
          {data.finalOutputPreview}
        </div>
      )}

      {data.description && (
        <div className="line-clamp-2 text-[10px] leading-4 text-muted-foreground">{data.description}</div>
      )}

      {!isToolNode && (
        <>
          <Handle type="target" id="flow-in" position={Position.Left} className={handleClassName} />
          <Handle type="source" id="flow-out" position={Position.Right} className={handleClassName} />
        </>
      )}

      {isToolNode && (
        <>
          <Handle type="source" id="capability-target-top" position={Position.Top} className={handleClassName} />
          <Handle type="target" id="capability-target-top" position={Position.Top} className={handleClassName} />
          <Handle type="source" id="capability-target-bottom" position={Position.Bottom} className={handleClassName} />
          <Handle type="target" id="capability-target-bottom" position={Position.Bottom} className={handleClassName} />
        </>
      )}

      {isAgentCall && (
        <>
          <Handle type="source" id="capability-target-top" position={Position.Top} className={handleClassName} />
          <Handle type="target" id="capability-target-top" position={Position.Top} className={handleClassName} />
          <Handle type="source" id="capability-target-bottom" position={Position.Bottom} className={handleClassName} />
          <Handle type="target" id="capability-target-bottom" position={Position.Bottom} className={handleClassName} />
        </>
      )}
    </div>
  );
};

export const nodeTypes = {
  runtimeNode: RuntimeNodeCard
};
