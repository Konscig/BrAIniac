import React from "react";
import { Play, Trash2, Upload } from "lucide-react";

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
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Separator } from "./ui/separator";

interface RunPanelProps {
  pipelineId: number | null;
  nodes: NodeRecord[];
  nodeTypes: NodeTypeRecord[];
  onError?: (message: string | null) => void;
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

export function RunPanel({ pipelineId, nodes, nodeTypes, onError, onExecutionComplete }: RunPanelProps): React.ReactElement {
  const [datasets, setDatasets] = React.useState<DatasetRecord[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = React.useState<number | "">("");
  const [isDatasetBusy, setIsDatasetBusy] = React.useState(false);
  const [isRunning, setIsRunning] = React.useState(false);
  const [validation, setValidation] = React.useState<GraphValidationResult | null>(null);
  const [execution, setExecution] = React.useState<ExecutionSnapshot | null>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const question = React.useMemo(() => readManualQuestion(nodes, nodeTypes), [nodes, nodeTypes]);
  const agentDebug = React.useMemo(() => readAgentDebug(nodes, nodeTypes), [nodes, nodeTypes]);

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
    void refreshDatasets().catch((error) => {
      console.error("Failed to load datasets", error);
      setLocalError("Не удалось загрузить датасеты.");
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
        const message = error instanceof Error ? error.message : "Не удалось загрузить dataset.";
        setLocalError(message);
        onError?.(message);
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
      setLocalError(error instanceof Error ? error.message : "Не удалось удалить dataset.");
    } finally {
      setIsDatasetBusy(false);
    }
  }, [refreshDatasets, selectedDatasetId]);

  const handleRun = React.useCallback(async () => {
    if (!pipelineId) return;
    const currentQuestion = question.trim();
    if (!currentQuestion) {
      setLocalError("Введите вопрос в узле ManualInput.");
      return;
    }

    setIsRunning(true);
    setLocalError(null);
    setExecution(null);
    onError?.(null);

    try {
      const validationResult = await validatePipelineGraph(pipelineId, "default");
      setValidation(validationResult);
      if (!validationResult.valid) {
        setLocalError("Граф не прошёл backend validation.");
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
      const message = error instanceof Error ? error.message : "Не удалось запустить pipeline.";
      setLocalError(message);
      onError?.(message);
    } finally {
      setIsRunning(false);
    }
  }, [onError, onExecutionComplete, pipelineId, question, selectedDatasetId]);

  const diagnostics = formatDiagnostics(validation);

  return (
    <Card className="shrink-0 border-border/60 bg-card/80">
      <CardHeader className="space-y-2 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Запуск</div>
            <div className="mt-1 text-base font-semibold">Dataset и вопрос</div>
          </div>
          <Button type="button" size="icon" disabled={!pipelineId || isRunning} onClick={handleRun}>
            <Play className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-3 p-3">
        <div className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">ManualInput</div>
          <div className="mt-1 line-clamp-3 text-xs leading-5 text-foreground">
            {question || "Вопрос не задан"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedDatasetId ? String(selectedDatasetId) : ""}
            onChange={(event) => {
              const value = Number(event.target.value);
              setSelectedDatasetId(Number.isInteger(value) && value > 0 ? value : "");
            }}
            disabled={!pipelineId || isDatasetBusy}
            className="h-9 min-w-0 flex-1 rounded-lg border border-border/60 bg-background/85 px-2.5 text-xs text-foreground outline-none ring-offset-background focus:ring-2 focus:ring-ring"
          >
            <option value="">Без dataset</option>
            {datasets.map((dataset) => (
              <option key={dataset.dataset_id} value={dataset.dataset_id}>
                {dataset.desc || dataset.uri}
              </option>
            ))}
          </select>
          <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border/60 bg-background/85 text-muted-foreground transition hover:text-foreground">
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
            disabled={!selectedDatasetId || isDatasetBusy}
            onClick={handleDeleteDataset}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {execution && (
          <div className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2 text-xs leading-5">
            <div className="font-medium text-foreground">Execution: {execution.status}</div>
            {execution.final_result?.text && (
              <div className="mt-1 line-clamp-4 text-muted-foreground">{execution.final_result.text}</div>
            )}
            {!execution.final_result?.text && execution.final_result?.output_preview && (
              <div className="mt-1 line-clamp-4 text-muted-foreground">{execution.final_result.output_preview}</div>
            )}
          </div>
        )}

        {agentDebug.length > 0 && (
          <div className="max-h-40 overflow-auto rounded-lg border border-border/50 bg-muted/10 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
            {agentDebug.map((entry) => (
              <div key={entry.id} className="space-y-1 border-b border-border/40 py-2 last:border-0">
                <div className="font-medium text-foreground">AgentCall #{entry.id}</div>
                {["text", "final_text_source", "final_text_origin", "available_tools", "tool_calls_executed", "tool_call_trace"].map((key) => {
                  const value = summarizeJson(entry.data[key]);
                  if (!value) return null;
                  return (
                    <div key={key}>
                      <span className="text-foreground">{key}:</span> {value}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {diagnostics.length > 0 && (
          <div className="max-h-28 overflow-auto rounded-lg border border-border/50 bg-muted/10 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
            {diagnostics.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        )}

        {localError && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {localError}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
