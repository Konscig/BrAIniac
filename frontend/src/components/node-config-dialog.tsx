import React from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";

import type { JsonRecord, NodeRecord, NodeTypeRecord } from "../lib/api";
import { buildNodeConfigPatch, NODE_CONFIG_DEFINITIONS } from "../lib/node-config";
import { getNodeTypeUiLabel, getToolUiLabel, normalizeNodeTypeName } from "../lib/node-catalog";
import {
  getToolConfigDefinition,
  type ToolConfigDefinition,
  type ToolConfigField
} from "../lib/tool-config";
import { RagDatasetConfig, type RagDatasetConfigValue } from "./rag-dataset-config";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

const RAG_DATASET_NODE_TYPE = "RAGDataset";
const TOOL_NODE_TYPE = "ToolNode";

type NodeConfigDialogProps = {
  node: NodeRecord | null;
  nodeType: NodeTypeRecord | null;
  onClose: () => void;
  onSave: (nodeId: number, patch: { ui_json: JsonRecord }) => void;
};

function readRagDatasetValueFromNode(node: NodeRecord): RagDatasetConfigValue {
  const raw = node.ui_json?.uris;
  if (!Array.isArray(raw)) return { uris: [] };
  return { uris: raw.filter((entry): entry is string => typeof entry === "string") };
}

function readSection(node: NodeRecord, section: string): Record<string, unknown> {
  const raw = node.ui_json?.[section];
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function readToolBindingFromNode(node: NodeRecord): { tool_id: number; name: string } | null {
  const raw = node.ui_json?.tool;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const toolId = Number(record.tool_id);
  const name = typeof record.name === "string" ? record.name : "";
  if (!Number.isInteger(toolId) || toolId <= 0 || !name) return null;
  return { tool_id: toolId, name };
}

function readToolConfigSection(node: NodeRecord): Record<string, unknown> {
  const raw = node.ui_json?.toolConfig;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function valueToDraft(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function applyDefaults(definition: ToolConfigDefinition, current: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = { ...current };
  for (const field of definition.fields) {
    if (next[field.key] !== undefined && next[field.key] !== "") continue;
    if (field.kind === "select" && field.defaultValue) next[field.key] = field.defaultValue;
    else if (field.kind === "text" && field.defaultValue !== undefined) next[field.key] = field.defaultValue;
    else if (field.kind === "textarea" && field.defaultValue !== undefined) next[field.key] = field.defaultValue;
    else if (field.kind === "number" && field.defaultValue !== undefined) next[field.key] = String(field.defaultValue);
  }
  return next;
}

function parseToolConfigValue(field: ToolConfigField, raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  if (field.kind === "number") {
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : undefined;
  }
  return trimmed;
}

function buildToolConfigJson(definition: ToolConfigDefinition, draft: Record<string, string>): JsonRecord {
  const out: JsonRecord = {};
  for (const field of definition.fields) {
    const value = parseToolConfigValue(field, draft[field.key] ?? "");
    if (value !== undefined) {
      out[field.key] = value as never;
    }
  }
  return out;
}

export function NodeConfigDialog({ node, nodeType, onClose, onSave }: NodeConfigDialogProps): React.ReactElement | null {
  const portalRef = React.useRef<HTMLDivElement | null>(null);
  const nodeTypeName = nodeType ? normalizeNodeTypeName(nodeType.name) : "";
  const isRagDataset = nodeTypeName === RAG_DATASET_NODE_TYPE;
  const isToolNodeWithBinding = nodeTypeName === TOOL_NODE_TYPE && node ? readToolBindingFromNode(node) !== null : false;
  const toolBinding = node && isToolNodeWithBinding ? readToolBindingFromNode(node) : null;
  const toolDefinition = toolBinding ? getToolConfigDefinition(toolBinding.name) : null;
  const baseConfig = NODE_CONFIG_DEFINITIONS[nodeTypeName];
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [ragDraft, setRagDraft] = React.useState<RagDatasetConfigValue>({ uris: [] });

  React.useEffect(() => {
    if (!portalRef.current) {
      portalRef.current = document.createElement("div");
    }
    const element = portalRef.current;
    document.body.appendChild(element);
    return () => {
      element.remove();
    };
  }, []);

  React.useEffect(() => {
    if (!node) {
      setDraft({});
      setRagDraft({ uris: [] });
      return;
    }
    if (isRagDataset) {
      setRagDraft(readRagDatasetValueFromNode(node));
      return;
    }
    if (toolDefinition) {
      const persisted = readToolConfigSection(node);
      const initial: Record<string, string> = {};
      for (const field of toolDefinition.fields) {
        initial[field.key] = valueToDraft(persisted[field.key]);
      }
      setDraft(applyDefaults(toolDefinition, initial));
      return;
    }
    if (!baseConfig) {
      setDraft({});
      return;
    }
    const section = readSection(node, baseConfig.section);
    setDraft(
      Object.fromEntries(baseConfig.fields.map((field) => [field.key, valueToDraft(section[field.key])]))
    );
  }, [baseConfig, isRagDataset, node, toolDefinition]);

  if (!node || !nodeType || !portalRef.current) return null;
  if (!isRagDataset && !toolDefinition && !baseConfig) return null;

  const title = isToolNodeWithBinding && toolBinding
    ? getToolUiLabel(toolBinding.name)
    : getNodeTypeUiLabel(nodeType);
  const dialogSubtitle = isRagDataset
    ? "RAG Dataset"
    : toolDefinition
      ? toolDefinition.title
      : baseConfig?.title ?? "";

  const description = toolDefinition?.description;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const baseUiJson = node.ui_json && typeof node.ui_json === "object" && !Array.isArray(node.ui_json)
      ? (node.ui_json as JsonRecord)
      : {};

    if (isRagDataset) {
      const nextUiJson: JsonRecord = { ...baseUiJson, uris: ragDraft.uris };
      onSave(node.node_id, { ui_json: nextUiJson });
      onClose();
      return;
    }

    if (toolDefinition) {
      const toolConfig = buildToolConfigJson(toolDefinition, draft);
      const nextUiJson: JsonRecord = { ...baseUiJson, toolConfig };
      onSave(node.node_id, { ui_json: nextUiJson });
      onClose();
      return;
    }

    const patch = buildNodeConfigPatch(node, nodeTypeName, draft);
    if (patch) {
      onSave(node.node_id, patch);
    }
    onClose();
  };

  const formFields = toolDefinition?.fields ?? baseConfig?.fields ?? [];
  const showFieldGrid = !isRagDataset && formFields.length > 0;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
      <button type="button" className="absolute inset-0 bg-background/75 backdrop-blur-sm" onClick={onClose} aria-label="Закрыть настройки" />
      <Card className="relative z-10 max-h-[88vh] w-[min(50vw,760px)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border-border/70 bg-card shadow-soft">
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{dialogSubtitle}</div>
            <div className="mt-0.5 truncate text-base font-semibold text-foreground">{title}</div>
            {description && <div className="mt-0.5 text-[11px] text-muted-foreground">{description}</div>}
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted/20 hover:text-foreground"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form className="space-y-3 overflow-auto px-4 py-4" onSubmit={handleSubmit}>
          {isRagDataset && <RagDatasetConfig value={ragDraft} onChange={setRagDraft} />}

          {showFieldGrid && (
            <div className="grid gap-3 md:grid-cols-2">
              {formFields.map((field) => (
                <label key={field.key} className={field.kind === "textarea" ? "md:col-span-2" : ""}>
                  <span className="text-[11px] font-medium text-muted-foreground">{field.label}</span>
                  {field.kind === "textarea" ? (
                    <textarea
                      value={draft[field.key] ?? ""}
                      onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                      placeholder={field.placeholder}
                      className="mt-1 min-h-[96px] w-full resize-y rounded-md border border-border/60 bg-background/85 px-2.5 py-2 text-sm text-foreground outline-none ring-offset-background focus:ring-2 focus:ring-ring"
                    />
                  ) : field.kind === "select" ? (
                    <select
                      value={draft[field.key] ?? ""}
                      onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                      className="mt-1 h-9 w-full rounded-md border border-border/60 bg-background/85 px-2.5 text-sm text-foreground outline-none ring-offset-background focus:ring-2 focus:ring-ring"
                    >
                      {(field.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.kind === "number" ? "number" : "text"}
                      step={field.kind === "number" && "step" in field && field.step !== undefined ? String(field.step) : (field.key === "temperature" ? "0.1" : "1")}
                      value={draft[field.key] ?? ""}
                      onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                      placeholder={field.placeholder}
                      className="mt-1 h-9 w-full rounded-md border border-border/60 bg-background/85 px-2.5 text-sm text-foreground outline-none ring-offset-background focus:ring-2 focus:ring-ring"
                    />
                  )}
                </label>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-border/60 pt-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit">Сохранить</Button>
          </div>
        </form>
      </Card>
    </div>,
    portalRef.current
  );
}
