import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { NodeTypeRecord } from "../lib/api";
import { cn } from "../lib/utils";
import {
  getVisibleNodeTypeCatalog,
  getNodeTypeGroupLabel,
  getNodeTypeUiLabel,
  getNodeTypeUiTagline
} from "../lib/node-catalog";
import { Card, CardContent, CardHeader } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";

type DragPayload = {
  typeId: number;
  typeName: string;
  label: string;
};

type LibraryGroup = {
  id: string;
  name: string;
  items: NodeTypeRecord[];
};

function buildGroups(nodeTypes: NodeTypeRecord[]): LibraryGroup[] {
  const groups = new Map<string, NodeTypeRecord[]>();

  for (const nodeType of getVisibleNodeTypeCatalog(nodeTypes)) {
    const groupName = getNodeTypeGroupLabel(nodeType);
    const list = groups.get(groupName) ?? [];
    list.push(nodeType);
    groups.set(groupName, list);
  }

  return Array.from(groups.entries()).map(([name, items]) => ({
    id: name.toLowerCase(),
    name,
    items
  }));
}

export interface NodeLibraryProps {
  nodeTypes: NodeTypeRecord[];
}

export function NodeLibrary({ nodeTypes }: NodeLibraryProps): React.ReactElement {
  const groups = React.useMemo(() => buildGroups(nodeTypes), [nodeTypes]);
  const [activeGroupId, setActiveGroupId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (groups.length === 0) {
      setActiveGroupId(null);
      return;
    }

    if (!activeGroupId || !groups.some((group) => group.id === activeGroupId)) {
      setActiveGroupId(groups[0].id);
    }
  }, [activeGroupId, groups]);

  const handleDragStart = React.useCallback((event: React.DragEvent, payload: DragPayload) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/brainiac-node-type", JSON.stringify(payload));
  }, []);

  return (
    <Card className="flex h-full min-h-0 max-w-full flex-col overflow-hidden rounded-xl border-border/60 bg-card/80">
      <CardHeader className="space-y-1.5 pb-2.5">
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Библиотека</div>
            <div className="mt-0.5 text-sm font-semibold">Узлы</div>
          </div>
          <div className="rounded-md border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {groups.reduce((count, group) => count + group.items.length, 0)}
          </div>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="min-h-0 flex-1 p-0">
        <ScrollArea className="h-full">
          <div className="space-y-1.5 p-2">
            {groups.length === 0 && (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-2 text-xs text-muted-foreground">
                Нет доступных узлов. Проверьте, что backend отдал каталог типов.
              </div>
            )}

            {groups.map((group) => {
              const isOpen = group.id === activeGroupId;

              return (
                <section
                  key={group.id}
                  className={cn(
                    "overflow-hidden rounded-lg border transition",
                    isOpen ? "border-primary/45 bg-primary/8" : "border-border/50 bg-muted/8"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setActiveGroupId((current) => (current === group.id ? null : group.id))}
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-foreground">{group.name}</div>
                      <div className="text-[11px] text-muted-foreground">{group.items.length} узлов</div>
                    </div>
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t border-border/50 px-2 py-2">
                      <div className="space-y-1.5">
                        {group.items.map((item) => (
                          <button
                            key={item.type_id}
                            type="button"
                            draggable
                            onDragStart={(event) =>
                              handleDragStart(event, {
                                typeId: item.type_id,
                                typeName: item.name,
                                label: getNodeTypeUiLabel(item)
                              })
                            }
                            className="w-full rounded-lg border border-border/50 bg-muted/15 px-2.5 py-2 text-left transition hover:border-primary/40 hover:bg-primary/10"
                          >
                            <div className="text-xs font-medium text-foreground">
                              {getNodeTypeUiLabel(item)}
                            </div>
                            <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                              {getNodeTypeUiTagline(item)}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
