import React from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";

import type { JsonRecord, NodeRecord, NodeTypeRecord } from "../lib/api";
import { buildNodeConfigPatch, NODE_CONFIG_DEFINITIONS } from "../lib/node-config";
import { getNodeTypeUiLabel, normalizeNodeTypeName } from "../lib/node-catalog";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

type NodeConfigDialogProps = {
  node: NodeRecord | null;
  nodeType: NodeTypeRecord | null;
  onClose: () => void;
  onSave: (nodeId: number, patch: { ui_json: JsonRecord }) => void;
};

function readSection(node: NodeRecord, section: string): Record<string, unknown> {
  const raw = node.ui_json?.[section];
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function valueToDraft(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return String(value);
}

export function NodeConfigDialog({ node, nodeType, onClose, onSave }: NodeConfigDialogProps): React.ReactElement | null {
  const portalRef = React.useRef<HTMLDivElement | null>(null);
  const nodeTypeName = nodeType ? normalizeNodeTypeName(nodeType.name) : "";
  const config = NODE_CONFIG_DEFINITIONS[nodeTypeName];
  const [draft, setDraft] = React.useState<Record<string, string>>({});

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
    if (!node || !config) {
      setDraft({});
      return;
    }
    const section = readSection(node, config.section);
    setDraft(
      Object.fromEntries(config.fields.map((field) => [field.key, valueToDraft(section[field.key])]))
    );
  }, [config, node]);

  if (!node || !nodeType || !config || !portalRef.current) return null;

  const title = getNodeTypeUiLabel(nodeType);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const patch = buildNodeConfigPatch(node, nodeTypeName, draft);
    if (patch) {
      onSave(node.node_id, patch);
    }
    onClose();
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" className="absolute inset-0 bg-background/75 backdrop-blur-sm" onClick={onClose} aria-label="Закрыть настройки" />
      <Card className="relative z-10 max-h-[88vh] w-[min(50vw,760px)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border-border/70 bg-card shadow-soft">
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{config.title}</div>
            <div className="mt-0.5 truncate text-base font-semibold text-foreground">{title}</div>
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
          <div className="grid gap-3 md:grid-cols-2">
            {config.fields.map((field) => (
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
                    step={field.key === "temperature" ? "0.1" : "1"}
                    value={draft[field.key] ?? ""}
                    onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                    placeholder={field.placeholder}
                    className="mt-1 h-9 w-full rounded-md border border-border/60 bg-background/85 px-2.5 text-sm text-foreground outline-none ring-offset-background focus:ring-2 focus:ring-ring"
                  />
                )}
              </label>
            ))}
          </div>

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
