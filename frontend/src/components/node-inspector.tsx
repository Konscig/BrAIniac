import React from "react";

import { updateNode, type NodeRecord, type NodeTypeRecord, type ToolRecord } from "../lib/api";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Separator } from "./ui/separator";

type AgentFormState = {
  modelId: string;
  systemPrompt: string;
  maxToolCalls: string;
  maxAttempts: string;
  softRetryDelayMs: string;
  temperature: string;
  maxTokens: string;
};

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function stringifyPretty(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function readNumberInput(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildAgentForm(node: NodeRecord | null): AgentFormState {
  const agent = readObject(readObject(node?.ui_json).agent);
  return {
    modelId: typeof agent.modelId === "string" ? agent.modelId : "",
    systemPrompt: typeof agent.systemPrompt === "string" ? agent.systemPrompt : "",
    maxToolCalls: agent.maxToolCalls !== undefined ? String(agent.maxToolCalls) : "",
    maxAttempts: agent.maxAttempts !== undefined ? String(agent.maxAttempts) : "",
    softRetryDelayMs: agent.softRetryDelayMs !== undefined ? String(agent.softRetryDelayMs) : "",
    temperature: agent.temperature !== undefined ? String(agent.temperature) : "",
    maxTokens: agent.maxTokens !== undefined ? String(agent.maxTokens) : ""
  };
}

function readRange(config: NodeTypeRecord["config_json"], key: "input" | "output"): string {
  const section = readObject(config)[key];
  if (!section || typeof section !== "object" || Array.isArray(section)) {
    return "не зафиксирован";
  }
  const record = section as Record<string, unknown>;
  if (typeof record.min === "number" && typeof record.max === "number") {
    return `${record.min}..${record.max}`;
  }
  return "не зафиксирован";
}

function readLoopInfo(config: NodeTypeRecord["config_json"]): string | null {
  const loop = readObject(config).loop;
  if (!loop || typeof loop !== "object" || Array.isArray(loop)) {
    return null;
  }
  const maxIterations = (loop as Record<string, unknown>).maxIterations;
  if (typeof maxIterations === "number") {
    return `maxIterations=${maxIterations}`;
  }
  return "loop policy задана";
}

function buildAgentConfig(form: AgentFormState): Record<string, unknown> {
  return {
    ...(form.modelId.trim() ? { modelId: form.modelId.trim() } : {}),
    ...(form.systemPrompt.trim() ? { systemPrompt: form.systemPrompt.trim() } : {}),
    ...(readNumberInput(form.maxToolCalls) !== undefined ? { maxToolCalls: readNumberInput(form.maxToolCalls) } : {}),
    ...(readNumberInput(form.maxAttempts) !== undefined ? { maxAttempts: readNumberInput(form.maxAttempts) } : {}),
    ...(readNumberInput(form.softRetryDelayMs) !== undefined
      ? { softRetryDelayMs: readNumberInput(form.softRetryDelayMs) }
      : {}),
    ...(readNumberInput(form.temperature) !== undefined ? { temperature: readNumberInput(form.temperature) } : {}),
    ...(readNumberInput(form.maxTokens) !== undefined ? { maxTokens: readNumberInput(form.maxTokens) } : {})
  };
}

export interface NodeInspectorProps {
  node: NodeRecord | null;
  nodeType: NodeTypeRecord | null;
  tools: ToolRecord[];
  onSaved: (node: NodeRecord) => void;
}

export function NodeInspector({
  node,
  nodeType,
  tools,
  onSaved
}: NodeInspectorProps): React.ReactElement {
  const [label, setLabel] = React.useState("");
  const [topK, setTopK] = React.useState("1");
  const [rawUiJson, setRawUiJson] = React.useState("{}");
  const [agentForm, setAgentForm] = React.useState<AgentFormState>(buildAgentForm(null));
  const [toolId, setToolId] = React.useState("");
  const [toolConfigJson, setToolConfigJson] = React.useState("{}");
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLabel(node ? String(node.ui_json?.label ?? "") : "");
    setTopK(node ? String(node.top_k) : "1");
    setRawUiJson(node ? stringifyPretty(node.ui_json) : "{}");
    setAgentForm(buildAgentForm(node));

    const tool = readObject(node?.ui_json).tool;
    setToolId(
      tool && typeof tool === "object" && !Array.isArray(tool) && (tool as Record<string, unknown>).tool_id !== undefined
        ? String((tool as Record<string, unknown>).tool_id)
        : ""
    );
    setToolConfigJson(stringifyPretty(readObject(node?.ui_json).toolConfig ?? {}));
    setError(null);
    setSuccess(null);
  }, [node]);

  const selectedTool = React.useMemo(
    () => tools.find((tool) => String(tool.tool_id) === toolId) ?? null,
    [toolId, tools]
  );

  const handleSave = React.useCallback(async () => {
    if (!node) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const parsedUiJson = JSON.parse(rawUiJson) as Record<string, unknown>;
      if (!parsedUiJson || typeof parsedUiJson !== "object" || Array.isArray(parsedUiJson)) {
        throw new Error("ui_json должен быть JSON-объектом.");
      }

      const nextUiJson: Record<string, unknown> = {
        ...parsedUiJson,
        ...(label.trim() ? { label: label.trim() } : {})
      };

      if (nodeType?.name === "AgentCall") {
        const agentConfig = buildAgentConfig(agentForm);
        if (Object.keys(agentConfig).length > 0) {
          nextUiJson.agent = agentConfig;
        } else {
          delete nextUiJson.agent;
        }
      }

      if (nodeType?.name === "ToolNode") {
        if (selectedTool) {
          nextUiJson.tool = {
            tool_id: selectedTool.tool_id,
            name: selectedTool.name,
            config_json: selectedTool.config_json
          };
        } else {
          delete nextUiJson.tool;
        }

        const parsedToolConfig = JSON.parse(toolConfigJson);
        if (parsedToolConfig && typeof parsedToolConfig === "object" && !Array.isArray(parsedToolConfig)) {
          nextUiJson.toolConfig = parsedToolConfig;
        } else {
          delete nextUiJson.toolConfig;
        }
      }

      const nextTopK = Number(topK);
      if (!Number.isInteger(nextTopK) || nextTopK <= 0) {
        throw new Error("top_k должен быть положительным целым числом.");
      }

      const updated = await updateNode(node.node_id, {
        top_k: nextTopK,
        ui_json: nextUiJson
      });

      onSaved(updated);
      setRawUiJson(stringifyPretty(updated.ui_json));
      setSuccess("Настройки узла сохранены.");
    } catch (saveError) {
      console.error("Failed to save node", saveError);
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить узел.");
    } finally {
      setIsSaving(false);
    }
  }, [agentForm, label, node, nodeType?.name, onSaved, rawUiJson, selectedTool, toolConfigJson, topK]);

  if (!node || !nodeType) {
    return (
      <Card className="border-border/60 bg-background/85">
        <CardHeader className="pb-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Инспектор</div>
          <div className="text-lg font-semibold">Узел не выбран</div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-4 text-sm text-muted-foreground">
          Выберите узел на канве, чтобы увидеть его конфигурацию и ограничения.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 bg-background/85">
      <CardHeader className="pb-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Инспектор</div>
        <div className="text-lg font-semibold">{nodeType.name}</div>
        <div className="text-sm text-muted-foreground">{nodeType.desc}</div>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-4 pt-4">
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
            <div>Роль</div>
            <div className="mt-1 text-sm text-foreground">{String(readObject(nodeType.config_json).role ?? "transform")}</div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
            <div>Входы</div>
            <div className="mt-1 text-sm text-foreground">{readRange(nodeType.config_json, "input")}</div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
            <div>Выходы</div>
            <div className="mt-1 text-sm text-foreground">{readRange(nodeType.config_json, "output")}</div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
            <div>Цикл</div>
            <div className="mt-1 text-sm text-foreground">{readLoopInfo(nodeType.config_json) ?? "нет"}</div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-muted-foreground">Подпись узла</label>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className="w-full rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-muted-foreground">top_k</label>
          <input
            value={topK}
            onChange={(event) => setTopK(event.target.value)}
            className="w-full rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
          />
        </div>

        {nodeType.name === "AgentCall" && (
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">AgentCall.ui_json.agent</div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={agentForm.modelId}
                onChange={(event) => setAgentForm((prev) => ({ ...prev, modelId: event.target.value }))}
                placeholder="modelId"
                className="rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
              />
              <input
                value={agentForm.maxToolCalls}
                onChange={(event) => setAgentForm((prev) => ({ ...prev, maxToolCalls: event.target.value }))}
                placeholder="maxToolCalls"
                className="rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
              />
              <input
                value={agentForm.maxAttempts}
                onChange={(event) => setAgentForm((prev) => ({ ...prev, maxAttempts: event.target.value }))}
                placeholder="maxAttempts"
                className="rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
              />
              <input
                value={agentForm.softRetryDelayMs}
                onChange={(event) => setAgentForm((prev) => ({ ...prev, softRetryDelayMs: event.target.value }))}
                placeholder="softRetryDelayMs"
                className="rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
              />
              <input
                value={agentForm.temperature}
                onChange={(event) => setAgentForm((prev) => ({ ...prev, temperature: event.target.value }))}
                placeholder="temperature"
                className="rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
              />
              <input
                value={agentForm.maxTokens}
                onChange={(event) => setAgentForm((prev) => ({ ...prev, maxTokens: event.target.value }))}
                placeholder="maxTokens"
                className="rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
              />
            </div>
            <textarea
              value={agentForm.systemPrompt}
              onChange={(event) => setAgentForm((prev) => ({ ...prev, systemPrompt: event.target.value }))}
              placeholder="systemPrompt"
              className="h-24 w-full rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
            />
          </div>
        )}

        {nodeType.name === "ToolNode" && (
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">ToolNode binding</div>
            <select
              value={toolId}
              onChange={(event) => setToolId(event.target.value)}
              className="w-full rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
            >
              <option value="">Выберите инструмент</option>
              {tools.map((tool) => (
                <option key={tool.tool_id} value={tool.tool_id}>
                  {tool.name}
                </option>
              ))}
            </select>
            {selectedTool && (
              <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                Инструмент будет сохранён через канонический путь `ui_json.tool`.
              </div>
            )}
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">toolConfig</label>
              <textarea
                value={toolConfigJson}
                onChange={(event) => setToolConfigJson(event.target.value)}
                className="h-28 w-full rounded-md border border-border/60 bg-background/80 px-3 py-2 font-mono text-xs outline-none ring-offset-background focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-muted-foreground">ui_json</label>
          <textarea
            value={rawUiJson}
            onChange={(event) => setRawUiJson(event.target.value)}
            className="h-48 w-full rounded-md border border-border/60 bg-background/80 px-3 py-2 font-mono text-xs outline-none ring-offset-background focus:ring-2 focus:ring-ring"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {success}
          </div>
        )}

        <Button type="button" className="w-full rounded-full" disabled={isSaving} onClick={handleSave}>
          {isSaving ? "Сохраняем..." : "Сохранить настройки"}
        </Button>
      </CardContent>
    </Card>
  );
}
