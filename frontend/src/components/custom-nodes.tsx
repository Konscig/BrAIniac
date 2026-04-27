import React from "react";
import { AlertCircle, Bot, Braces, Cable, CirclePlay, Database, Save, Settings, Wrench, X } from "lucide-react";
import { Handle, Position, type NodeProps } from "reactflow";

import type { ToolRecord } from "../lib/api";
import { getToolUiLabel } from "../lib/node-catalog";
import { getNodeRoleVisual } from "../lib/node-roles";
import { cn } from "../lib/utils";

type CanvasNodeStatus = "idle" | "completed" | "failed" | "skipped" | "running";

function JudgeScoreDot({ score }: { score: number }): React.ReactElement {
  const pct = Math.round(score * 100);
  const cls =
    score >= 0.8 ? "bg-emerald-400 ring-emerald-400/30" :
    score >= 0.6 ? "bg-yellow-400 ring-yellow-400/30" :
    "bg-red-400 ring-red-400/30";
  return (
    <span
      title={`Судья: ${pct}%`}
      className={cn("inline-flex h-2 w-2 shrink-0 rounded-full ring-2", cls)}
    />
  );
}

export type CanvasNodeData = {
  nodeId: number;
  label: string;
  nodeTypeName: string;
  technicalLabel: string;
  role: string;
  status: CanvasNodeStatus;
  isIncomplete?: boolean;
  description?: string;
  manualQuestion?: string;
  selectedToolId?: number | null;
  selectedToolLabel?: string;
  isConfigurable?: boolean;
  finalOutputPreview?: string;
  tracePreview?: string;
  /** Средний judge-score по метрикам узла (0..1), null если оценки ещё не было */
  judgeScore?: number | null;
  tools?: ToolRecord[];
  onManualQuestionCommit?: (nodeId: number, question: string) => void;
  onToolSelect?: (nodeId: number, toolId: number | null) => void;
  onConfigureNode?: (nodeId: number) => void;
};

const statusTokens: Record<CanvasNodeStatus, { label: string; tone: string }> = {
  idle: { label: "Черновик", tone: "text-muted-foreground" },
  running: { label: "Выполняется", tone: "text-sky-200" },
  completed: { label: "Выполнен", tone: "text-emerald-200" },
  failed: { label: "Ошибка", tone: "text-red-200" },
  skipped: { label: "Пропущен", tone: "text-amber-200" }
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
  const tokens = getNodeRoleVisual(data.role);
  const status = statusTokens[data.status] ?? statusTokens.idle;
  const Icon = iconByType[data.nodeTypeName] ?? Wrench;
  const isManualInput = data.nodeTypeName === "ManualInput";
  const isToolNode = data.nodeTypeName === "ToolNode";
  const isAgentCall = data.nodeTypeName === "AgentCall";
  const isSaveResult = data.nodeTypeName === "SaveResult";
  const [questionDraft, setQuestionDraft] = React.useState(data.manualQuestion ?? "");
  const [isToolPickerOpen, setIsToolPickerOpen] = React.useState(!data.selectedToolId);
  const [isTraceHidden, setIsTraceHidden] = React.useState(false);

  React.useEffect(() => {
    setQuestionDraft(data.manualQuestion ?? "");
  }, [data.manualQuestion]);

  React.useEffect(() => {
    setIsToolPickerOpen(!data.selectedToolId);
  }, [data.selectedToolId]);

  React.useEffect(() => {
    setIsTraceHidden(false);
  }, [data.tracePreview]);

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
        "group relative flex min-w-[210px] max-w-[292px] flex-col gap-2 rounded-xl border px-3 py-2.5 shadow-sm transition",
        tokens.frame,
        selected && cn("ring-2", tokens.selectedRing),
        data.status === "running" && tokens.runningFrame,
        data.status === "failed" && "border-red-400/70 bg-red-500/8",
        data.isIncomplete && "border-dashed border-amber-400/70"
      )}
    >
      <div className="flex items-start gap-2">
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", tokens.badge)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="whitespace-normal break-words text-xs font-semibold leading-4 text-foreground">{data.label}</span>
            {data.judgeScore != null && (
              <JudgeScoreDot score={data.judgeScore} />
            )}
          </div>
          <div className="truncate text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            {data.technicalLabel}
          </div>
        </div>
        {((isToolNode && data.selectedToolId) || data.isConfigurable) && (
          <button
            type="button"
            className="nodrag flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted/20 hover:text-foreground"
            onClick={(event) => {
              stopCanvasGesture(event);
              if (isToolNode) {
                setIsToolPickerOpen((current) => !current);
                return;
              }
              data.onConfigureNode?.(data.nodeId);
            }}
            onMouseDown={stopCanvasGesture}
            onPointerDown={stopCanvasGesture}
            aria-label={isToolNode ? "Сменить инструмент" : "Настроить узел"}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className={cn("font-medium", status.tone)}>{status.label}</span>
        <span className="rounded-md border border-border/50 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          {tokens.label}
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

      {isToolNode && (isToolPickerOpen || !data.selectedToolId) && (
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
              {getToolUiLabel(tool.name)}
            </option>
          ))}
        </select>
      )}

      {isToolNode && data.selectedToolId && !isToolPickerOpen && (
        <div className="rounded-md border border-border/50 bg-background/70 px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">
          {data.selectedToolLabel}
        </div>
      )}

      {isSaveResult && data.finalOutputPreview && (
        <div className="max-h-24 overflow-auto rounded-md border border-border/50 bg-background/85 px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">
          {data.finalOutputPreview}
        </div>
      )}

      {data.description && (
        <div className="line-clamp-2 text-[10px] leading-4 text-muted-foreground">{data.description}</div>
      )}

      {data.tracePreview && !isTraceHidden && (
        <details className="nodrag rounded-md border border-border/50 bg-background/70 px-2 py-1.5 text-[10px] leading-4 text-muted-foreground">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[10px] font-medium text-foreground">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span className="min-w-0 flex-1">Трейс узла</span>
            <button
              type="button"
              className="rounded text-muted-foreground transition hover:text-foreground"
              onClick={(event) => {
                stopCanvasGesture(event);
                event.preventDefault();
                setIsTraceHidden(true);
              }}
              onMouseDown={stopCanvasGesture}
              onPointerDown={stopCanvasGesture}
              aria-label="Скрыть трейс узла"
            >
              <X className="h-3 w-3" />
            </button>
          </summary>
          <div className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words">{data.tracePreview}</div>
        </details>
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
