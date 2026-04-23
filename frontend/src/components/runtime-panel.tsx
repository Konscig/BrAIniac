import React from "react";
import { Loader2, Play, RefreshCcw, ShieldCheck, Upload } from "lucide-react";

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
  type PipelineRecord
} from "../lib/api";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Separator } from "./ui/separator";

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.split(",")[1] ?? "" : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Не удалось прочитать файл."));
    reader.readAsDataURL(file);
  });
}

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `brainiac-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readNodeExecutionWrapper(node: NodeRecord): Record<string, unknown> | null {
  if (!node.output_json || typeof node.output_json !== "object" || Array.isArray(node.output_json)) {
    return null;
  }
  return node.output_json as Record<string, unknown>;
}

function summarizeNodeOutput(node: NodeRecord): string {
  const wrapper = readNodeExecutionWrapper(node);
  if (!wrapper) return "Узел ещё не выполнялся.";

  const data = wrapper.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    try {
      const serialized = JSON.stringify(data);
      return serialized.length > 220 ? `${serialized.slice(0, 220)}...` : serialized;
    } catch {
      return "Есть output, но его не удалось сериализовать.";
    }
  }

  if (wrapper.error && typeof wrapper.error === "object") {
    const error = wrapper.error as Record<string, unknown>;
    if (typeof error.message === "string") {
      return error.message;
    }
  }

  return "Нет детального output.";
}

function findAgentNode(nodes: NodeRecord[]): NodeRecord | null {
  return nodes.find((node) => {
    const wrapper = readNodeExecutionWrapper(node);
    const data = wrapper?.data;
    return Boolean(data && typeof data === "object" && !Array.isArray(data) && (data as Record<string, unknown>).kind === "agent_call");
  }) ?? null;
}

type RuntimePanelProps = {
  pipeline: PipelineRecord | null;
  nodes: NodeRecord[];
  onDataChanged: () => void;
};

export function RuntimePanel({ pipeline, nodes, onDataChanged }: RuntimePanelProps): React.ReactElement {
  const [datasets, setDatasets] = React.useState<DatasetRecord[]>([]);
  const [question, setQuestion] = React.useState("");
  const [validation, setValidation] = React.useState<GraphValidationResult | null>(null);
  const [execution, setExecution] = React.useState<ExecutionSnapshot | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isValidating, setIsValidating] = React.useState(false);
  const [isRunning, setIsRunning] = React.useState(false);
  const [lastIdempotencyKey, setLastIdempotencyKey] = React.useState<string | null>(null);

  const activeDataset = datasets[0] ?? null;
  const agentNode = React.useMemo(() => findAgentNode(nodes), [nodes]);

  const loadDatasets = React.useCallback(async () => {
    if (!pipeline) {
      setDatasets([]);
      return;
    }

    try {
      const nextDatasets = await listDatasets(pipeline.pipeline_id);
      setDatasets(nextDatasets);
    } catch (datasetError) {
      console.error("Failed to load datasets", datasetError);
      setError(datasetError instanceof Error ? datasetError.message : "Не удалось загрузить датасет.");
    }
  }, [pipeline]);

  React.useEffect(() => {
    void loadDatasets();
  }, [loadDatasets]);

  React.useEffect(() => {
    setValidation(null);
    setExecution(null);
    setError(null);
    setQuestion("");
    setLastIdempotencyKey(null);
  }, [pipeline?.pipeline_id]);

  const handleUploadDataset = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || !pipeline) return;

      setIsUploading(true);
      setError(null);

      try {
        if (activeDataset) {
          const confirmed = window.confirm("У текущего пайплайна уже есть датасет. Заменить его?");
          if (!confirmed) {
            setIsUploading(false);
            return;
          }
          await deleteDataset(activeDataset.dataset_id);
        }

        const content_base64 = await toBase64(file);
        await uploadDataset({
          fk_pipeline_id: pipeline.pipeline_id,
          filename: file.name,
          mime_type: file.type || undefined,
          content_base64,
          desc: `Файл ${file.name}`
        });

        await loadDatasets();
        onDataChanged();
      } catch (uploadError) {
        console.error("Failed to upload dataset", uploadError);
        setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить датасет.");
      } finally {
        setIsUploading(false);
      }
    },
    [activeDataset, loadDatasets, onDataChanged, pipeline]
  );

  const handleValidate = React.useCallback(async () => {
    if (!pipeline) return;

    setIsValidating(true);
    setError(null);
    try {
      const result = await validatePipelineGraph(pipeline.pipeline_id, "default");
      setValidation(result);
      return result;
    } catch (validationError) {
      console.error("Failed to validate graph", validationError);
      const message = validationError instanceof Error ? validationError.message : "Не удалось проверить граф.";
      setError(message);
      throw validationError;
    } finally {
      setIsValidating(false);
    }
  }, [pipeline]);

  const handleRun = React.useCallback(async () => {
    if (!pipeline) return;

    setIsRunning(true);
    setError(null);

    try {
      const validationResult = await handleValidate();
      if (!validationResult || !validationResult.valid) {
        setIsRunning(false);
        return;
      }

      const normalizedQuestion = question.trim();
      const idempotencyKey = createIdempotencyKey();
      setLastIdempotencyKey(idempotencyKey);

      const initialSnapshot = await startPipelineExecution(
        pipeline.pipeline_id,
        {
          preset: "default",
          ...(activeDataset ? { dataset_id: activeDataset.dataset_id } : {}),
          ...(normalizedQuestion ? { input_json: buildQuestionInput(normalizedQuestion) } : {})
        },
        idempotencyKey
      );
      setExecution(initialSnapshot);

      let nextSnapshot = initialSnapshot;
      while (!isExecutionTerminal(nextSnapshot.status)) {
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        nextSnapshot = await getPipelineExecution(pipeline.pipeline_id, nextSnapshot.execution_id);
        setExecution(nextSnapshot);
      }

      onDataChanged();
    } catch (runError) {
      console.error("Failed to run pipeline", runError);
      setError(runError instanceof Error ? runError.message : "Не удалось запустить пайплайн.");
    } finally {
      setIsRunning(false);
    }
  }, [activeDataset, handleValidate, onDataChanged, pipeline, question]);

  return (
    <Card className="border-border/60 bg-background/85">
      <CardHeader className="pb-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">RAG Runtime</div>
        <div className="text-lg font-semibold">Датасет, проверка и запуск</div>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-5 pt-4">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-foreground">Датасет пайплайна</div>
              <div className="text-xs text-muted-foreground">
                Загрузка идёт отдельно от графа. `DatasetInput` в UI v1 скрыт.
              </div>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border/60 px-3 py-2 text-sm text-foreground hover:bg-muted/30">
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Загрузить
              <input
                type="file"
                accept=".txt,.text,.md,.json"
                className="hidden"
                disabled={!pipeline || isUploading}
                onChange={handleUploadDataset}
              />
            </label>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
            {activeDataset ? (
              <div className="space-y-1">
                <div className="font-medium text-foreground">dataset_id: {activeDataset.dataset_id}</div>
                <div className="break-all text-muted-foreground">{activeDataset.uri}</div>
                {activeDataset.desc && <div className="text-muted-foreground">{activeDataset.desc}</div>}
              </div>
            ) : (
              <div className="text-muted-foreground">У пайплайна пока нет загруженного датасета.</div>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <div className="text-sm font-medium text-foreground">Вопрос пользователя</div>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Например: какие шаги выполняет наш RAG-агент?"
            className="h-24 w-full rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
          />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1 rounded-full" disabled={!pipeline || isValidating} onClick={() => void handleValidate()}>
              {isValidating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Проверить граф
            </Button>
            <Button type="button" className="flex-1 rounded-full" disabled={!pipeline || isRunning} onClick={() => void handleRun()}>
              {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Запустить
            </Button>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {validation && (
          <section className="space-y-2">
            <div className="text-sm font-medium text-foreground">Проверка графа</div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
              <div className="text-foreground">
                Статус: {validation.valid ? "граф валиден" : "есть ошибки"}
              </div>
              <div className="text-muted-foreground">
                Узлов: {validation.metrics.nodeCount}, связей: {validation.metrics.edgeCount}, estimatedMaxSteps: {validation.metrics.estimatedMaxSteps}
              </div>
              {validation.errors.length > 0 && (
                <div className="mt-2 space-y-1 text-red-200">
                  {validation.errors.map((issue) => (
                    <div key={`${issue.code}-${issue.message}`}>{issue.code}: {issue.message}</div>
                  ))}
                </div>
              )}
              {validation.warnings.length > 0 && (
                <div className="mt-2 space-y-1 text-amber-200">
                  {validation.warnings.map((issue) => (
                    <div key={`${issue.code}-${issue.message}`}>{issue.code}: {issue.message}</div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {execution && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-foreground">Последний запуск</div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={() => {
                  onDataChanged();
                  void loadDatasets();
                }}
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                Обновить
              </Button>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
              <div className="text-foreground">Статус: {execution.status}</div>
              <div className="text-muted-foreground">execution_id: {execution.execution_id}</div>
              {lastIdempotencyKey && <div className="text-muted-foreground">idempotency: {lastIdempotencyKey}</div>}
              {execution.final_result?.text && (
                <div className="mt-3 rounded-lg border border-primary/30 bg-primary/10 p-3 text-foreground">
                  {execution.final_result.text}
                </div>
              )}
              {execution.error && (
                <div className="mt-3 text-red-200">
                  {execution.error.code}: {execution.error.message}
                </div>
              )}
              {execution.warnings && execution.warnings.length > 0 && (
                <div className="mt-3 space-y-1 text-amber-200">
                  {execution.warnings.map((warning) => (
                    <div key={warning}>{warning}</div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {agentNode && (
          <section className="space-y-2">
            <div className="text-sm font-medium text-foreground">Отладка AgentCall</div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
              {(() => {
                const wrapper = readNodeExecutionWrapper(agentNode);
                const data = wrapper?.data as Record<string, unknown> | undefined;
                const trace = Array.isArray(data?.tool_call_trace) ? (data?.tool_call_trace as Array<Record<string, unknown>>) : [];
                const availableTools = Array.isArray(data?.available_tools) ? (data?.available_tools as Array<Record<string, unknown>>) : [];

                return (
                  <div className="space-y-2">
                    <div className="text-foreground">{typeof data?.text === "string" ? data.text : "Ответ пока не сформирован."}</div>
                    <div className="text-muted-foreground">
                      source: {typeof data?.final_text_source === "string" ? data.final_text_source : "n/a"}
                    </div>
                    <div className="text-muted-foreground">
                      origin: {typeof data?.final_text_origin === "string" ? data.final_text_origin : "n/a"}
                    </div>
                    <div className="text-muted-foreground">
                      tool_calls_executed: {typeof data?.tool_calls_executed === "number" ? data.tool_calls_executed : 0}
                    </div>
                    <div className="text-muted-foreground">
                      available_tools: {availableTools.map((tool) => String(tool.name ?? "")).filter(Boolean).join(", ") || "нет"}
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">tool_call_trace</div>
                      {trace.length === 0 ? (
                        <div className="text-muted-foreground">Трасса пока пуста.</div>
                      ) : (
                        trace.map((entry) => (
                          <div key={String(entry.index ?? Math.random())} className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                            #{String(entry.index ?? "?")} {String(entry.requested_tool ?? "unknown")} → {String(entry.status ?? "unknown")}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </section>
        )}

        <section className="space-y-2">
          <div className="text-sm font-medium text-foreground">Output по узлам</div>
          <div className="space-y-2">
            {nodes.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                Добавьте узлы на канву, чтобы видеть их output.
              </div>
            ) : (
              nodes.map((node) => {
                const wrapper = readNodeExecutionWrapper(node);
                const status = typeof wrapper?.status === "string" ? wrapper.status : "idle";
                return (
                  <div key={node.node_id} className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-foreground">{String(node.ui_json?.label ?? `Узел ${node.node_id}`)}</div>
                      <div className="text-xs text-muted-foreground">{status}</div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">{summarizeNodeOutput(node)}</div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
