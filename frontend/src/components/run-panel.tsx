import React from "react";
import { ChevronDown, ChevronUp, Loader2, Play, Trash2, Upload, X } from "lucide-react";

import {
  buildQuestionInput,
  deleteDataset,
  getPipelineExecution,
  isExecutionTerminal,
  listDatasets,
  startPipelineExecution,
  uploadDataset,
  validatePipelineGraph,
  type DatasetRecord,
  type ExecutionSnapshot,
  type GraphValidationResult,
  type NodeRecord,
  type NodeTypeRecord
} from "../lib/api";
import { normalizeNodeTypeName } from "../lib/node-catalog";
import { toReadableError, type ReadableError } from "../lib/readable-errors";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

interface RunPanelProps {
  pipelineId: number | null;
  projectName: string | null;
  pipelineName: string | null;
  nodes: NodeRecord[];
  nodeTypes: NodeTypeRecord[];
  onError?: (message: string | null) => void;
  onRunningChange?: (isRunning: boolean) => void;
  onExecutionComplete?: () => void;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const [, base64 = ""] = result.split(",", 2);
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readManualQuestion(nodes: NodeRecord[], nodeTypes: NodeTypeRecord[]): string {
  const typeById = new Map(nodeTypes.map((nodeType) => [nodeType.type_id, normalizeNodeTypeName(nodeType.name)]));
  for (const node of nodes) {
    if (typeById.get(node.fk_type_id) !== "ManualInput") continue;
    const manualInput = node.ui_json?.manualInput;
    const record =
      manualInput && typeof manualInput === "object" && !Array.isArray(manualInput)
        ? (manualInput as Record<string, unknown>)
        : null;
    const question = record?.question;
    if (typeof question === "string" && question.trim().length > 0) {
      return question.trim();
    }
  }
  return "";
}

function formatDiagnostics(result: GraphValidationResult | null): string[] {
  if (!result) return [];
  return [...result.errors, ...result.warnings].map((item) => `${item.code}: ${item.message}`);
}

function readOutputData(node: NodeRecord): Record<string, unknown> | null {
  const wrapper = node.output_json && typeof node.output_json === "object" ? (node.output_json as Record<string, unknown>) : null;
  const data = wrapper?.data;
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
}

function readAgentDebug(nodes: NodeRecord[], nodeTypes: NodeTypeRecord[]): Array<{ id: number; data: Record<string, unknown> }> {
  const typeById = new Map(nodeTypes.map((nodeType) => [nodeType.type_id, normalizeNodeTypeName(nodeType.name)]));
  return nodes
    .filter((node) => typeById.get(node.fk_type_id) === "AgentCall")
    .map((node) => ({ id: node.node_id, data: readOutputData(node) }))
    .filter((entry): entry is { id: number; data: Record<string, unknown> } => Boolean(entry.data));
}

function summarizeJson(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function RunPanel({
  pipelineId,
  projectName,
  pipelineName,
  nodes,
  nodeTypes,
  onError,
  onRunningChange,
  onExecutionComplete
}: RunPanelProps): React.ReactElement {
  const [datasets, setDatasets] = React.useState<DatasetRecord[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = React.useState<number | "">("");
  const [isDatasetBusy, setIsDatasetBusy] = React.useState(false);
  const [isRunning, setIsRunning] = React.useState(false);
  const [validation, setValidation] = React.useState<GraphValidationResult | null>(null);
  const [execution, setExecution] = React.useState<ExecutionSnapshot | null>(null);
  const [localError, setLocalError] = React.useState<ReadableError | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(Date.now());

  const question = React.useMemo(() => readManualQuestion(nodes, nodeTypes), [nodes, nodeTypes]);
  const agentDebug = React.useMemo(() => readAgentDebug(nodes, nodeTypes), [nodes, nodeTypes]);

  React.useEffect(() => {
    onRunningChange?.(isRunning);
  }, [isRunning, onRunningChange]);

  React.useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  const refreshDatasets = React.useCallback(async () => {
    if (!pipelineId) {
      setDatasets([]);
      setSelectedDatasetId("");
      return;
    }

    const nextDatasets = await listDatasets(pipelineId);
    setDatasets(nextDatasets);
    setSelectedDatasetId((current) => {
      if (current && nextDatasets.some((dataset) => dataset.dataset_id === current)) return current;
      return nextDatasets[0]?.dataset_id ?? "";
    });
  }, [pipelineId]);

  React.useEffect(() => {
    setValidation(null);
    setExecution(null);
    setLocalError(null);
    setIsDrawerOpen(false);
    void refreshDatasets().catch((error) => {
      console.error("Failed to load datasets", error);
      setLocalError(toReadableError(error, "Не удалось загрузить dataset."));
      setIsDrawerOpen(true);
    });
  }, [refreshDatasets]);

  const handleUpload = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || !pipelineId) return;

      setIsDatasetBusy(true);
      setLocalError(null);
      onError?.(null);
      try {
        const contentBase64 = await fileToBase64(file);
        const uploaded = await uploadDataset({
          fk_pipeline_id: pipelineId,
          filename: file.name,
          mime_type: file.type || undefined,
          content_base64: contentBase64
        });
        await refreshDatasets();
        setSelectedDatasetId(uploaded.dataset_id);
      } catch (error) {
        console.error("Failed to upload dataset", error);
        setLocalError(toReadableError(error, "Не удалось загрузить dataset."));
        setIsDrawerOpen(true);
      } finally {
        setIsDatasetBusy(false);
      }
    },
    [onError, pipelineId, refreshDatasets]
  );

  const handleDeleteDataset = React.useCallback(async () => {
    if (!selectedDatasetId) return;
    setIsDatasetBusy(true);
    setLocalError(null);
    try {
      await deleteDataset(selectedDatasetId);
      await refreshDatasets();
    } catch (error) {
      console.error("Failed to delete dataset", error);
      setLocalError(toReadableError(error, "Не удалось удалить dataset."));
      setIsDrawerOpen(true);
    } finally {
      setIsDatasetBusy(false);
    }
  }, [refreshDatasets, selectedDatasetId]);

  const handleRun = React.useCallback(async () => {
    if (!pipelineId) return;
    const currentQuestion = question.trim();
    if (!currentQuestion) {
      setLocalError(toReadableError("ManualInput question is empty", "Введите вопрос в узле ManualInput."));
      setIsDrawerOpen(true);
      return;
    }

    setIsRunning(true);
    setStartedAt(Date.now());
    setNow(Date.now());
    setIsDrawerOpen(true);
    setLocalError(null);
    setExecution(null);
    onError?.(null);

    try {
      const validationResult = await validatePipelineGraph(pipelineId, "default");
      setValidation(validationResult);
      if (!validationResult.valid) {
        setLocalError(toReadableError({ message: "Graph validation failed", details: validationResult }));
        return;
      }

      const started = await startPipelineExecution(
        pipelineId,
        {
          preset: "default",
          ...(selectedDatasetId ? { dataset_id: selectedDatasetId } : {}),
          input_json: buildQuestionInput(currentQuestion)
        },
        createIdempotencyKey()
      );
      setExecution(started);

      let snapshot = started;
      while (!isExecutionTerminal(snapshot.status)) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        snapshot = await getPipelineExecution(pipelineId, snapshot.execution_id);
        setExecution(snapshot);
      }
      onExecutionComplete?.();
    } catch (error) {
      console.error("Failed to run pipeline", error);
      setLocalError(toReadableError(error, "Не удалось запустить pipeline."));
      setIsDrawerOpen(true);
    } finally {
      setIsRunning(false);
    }
  }, [onError, onExecutionComplete, pipelineId, question, selectedDatasetId]);

  const diagnostics = formatDiagnostics(validation);
  const hasDetails = Boolean(execution || agentDebug.length > 0 || diagnostics.length > 0 || localError);
  const elapsedSeconds = isRunning && startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const runStatus = isRunning ? `Выполняется ${elapsedSeconds}с` : execution ? `Статус: ${execution.status}` : "Готов к запуску";

  return (
    <Card className="shrink-0 rounded-xl border-border/60 bg-card/80 px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[180px] flex-1">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
            <span className="truncate">{projectName ?? "Проект не выбран"}</span>
            <span className="shrink-0 text-muted-foreground/70">&gt;</span>
            <span className="truncate text-primary">{pipelineName ?? "Агент не выбран"}</span>
          </div>
          <div className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-muted-foreground">
            {question || "Вопрос не задан"}
          </div>
        </div>

        <div className="flex min-w-[410px] flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="icon"
            className="h-9 w-9 shrink-0"
            disabled={!pipelineId || isRunning}
            onClick={handleRun}
            aria-label="Запустить граф"
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          </Button>

          <div className="min-w-[96px] text-[11px] leading-4 text-muted-foreground">{runStatus}</div>

          <select
            value={selectedDatasetId ? String(selectedDatasetId) : ""}
            onChange={(event) => {
              const value = Number(event.target.value);
              setSelectedDatasetId(Number.isInteger(value) && value > 0 ? value : "");
            }}
            disabled={!pipelineId || isDatasetBusy}
            className="h-8 min-w-[190px] rounded-md border border-border/60 bg-background/85 px-2 text-[11px] text-foreground outline-none ring-offset-background focus:ring-2 focus:ring-ring"
          >
            <option value="">Без dataset</option>
            {datasets.map((dataset) => (
              <option key={dataset.dataset_id} value={dataset.dataset_id}>
                {dataset.desc || dataset.uri}
              </option>
            ))}
          </select>

          <label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border/60 bg-background/85 text-muted-foreground transition hover:text-foreground">
            <Upload className="h-4 w-4" />
            <input
              type="file"
              accept=".txt,.text,.md,.json"
              className="hidden"
              disabled={!pipelineId || isDatasetBusy}
              onChange={handleUpload}
            />
          </label>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={!selectedDatasetId || isDatasetBusy}
            onClick={handleDeleteDataset}
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="h-8 gap-1.5 px-2 text-[11px]"
            onClick={() => setIsDrawerOpen((current) => !current)}
          >
            Детали
            {isDrawerOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {isDrawerOpen && (
        <div className="mt-2 border-t border-border/50 pt-2">
          <div className="grid max-h-44 grid-cols-1 gap-2 overflow-auto rounded-lg border border-border/50 bg-muted/10 p-2 text-[11px] leading-4 text-muted-foreground lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className="min-w-0">
              <div className="font-medium text-foreground">Запуск</div>
              {!hasDetails && <div className="mt-1">Данных запуска пока нет.</div>}
              {execution && (
                <div className="mt-1 space-y-1">
                  <div>Execution: {execution.status}</div>
                  {execution.final_result?.text && <div className="line-clamp-4">{execution.final_result.text}</div>}
                  {!execution.final_result?.text && execution.final_result?.output_preview && (
                    <div className="line-clamp-4">{execution.final_result.output_preview}</div>
                  )}
                </div>
              )}
              {diagnostics.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="font-medium text-foreground">Diagnostics</div>
                  {diagnostics.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              )}
              {localError && (
                <div className="mt-2 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-red-200">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-red-100">{localError.title}</div>
                    <div>{localError.message}</div>
                    {localError.raw !== undefined && (
                      <details className="mt-1 text-red-100/80">
                        <summary className="cursor-pointer">Технические детали</summary>
                        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words text-[10px]">
                          {summarizeJson(localError.raw)}
                        </pre>
                      </details>
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded text-red-100/80 transition hover:text-red-100"
                    onClick={() => setLocalError(null)}
                    aria-label="Скрыть ошибку"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </section>

            <section className="min-w-0">
              <div className="font-medium text-foreground">Agent debug</div>
              {agentDebug.length === 0 && <div className="mt-1">Отладочные данные агента появятся после запуска.</div>}
              {agentDebug.map((entry) => (
                <div key={entry.id} className="mt-1 space-y-1 border-b border-border/40 pb-2 last:border-0">
                  <div className="font-medium text-foreground">AgentCall #{entry.id}</div>
                  {[
                    "text",
                    "final_text_source",
                    "final_text_origin",
                    "provider_last_error",
                    "provider_calls_attempted",
                    "provider_soft_failures",
                    "provider_response_id",
                    "raw_completion_text",
                    "available_tools",
                    "tool_calls_executed",
                    "tool_call_trace"
                  ].map((key) => {
                    const value = summarizeJson(entry.data[key]);
                    if (!value) return null;
                    return (
                      <div key={key} className="break-words">
                        <span className="text-foreground">{key}:</span> {value}
                      </div>
                    );
                  })}
                </div>
              ))}
            </section>
          </div>
        </div>
      )}
    </Card>
  );
}
