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
    <Card className="flex h-full min-h-0 max-w-full flex-col overflow-hidden rounded-[1.35rem] border-border/60 bg-card/80">
      <CardHeader className="space-y-2 pb-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Библиотека</div>
            <div className="mt-1 text-base font-semibold">Узлы</div>
          </div>
          <div className="rounded-full border border-border/50 px-2 py-1 text-[11px] text-muted-foreground">
            {groups.reduce((count, group) => count + group.items.length, 0)}
          </div>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="min-h-0 flex-1 p-0">
        <ScrollArea className="h-full">
          <div className="space-y-2 p-3">
            {groups.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
                Нет доступных узлов. Проверьте, что backend отдал каталог типов.
              </div>
            )}

            {groups.map((group) => {
              const isOpen = group.id === activeGroupId;

              return (
                <section
                  key={group.id}
                  className={cn(
                    "overflow-hidden rounded-2xl border transition",
                    isOpen ? "border-primary/45 bg-primary/8" : "border-border/50 bg-muted/8"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setActiveGroupId((current) => (current === group.id ? null : group.id))}
                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{group.name}</div>
                      <div className="text-xs text-muted-foreground">{group.items.length} узлов</div>
                    </div>
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t border-border/50 px-3 py-3">
                      <div className="space-y-2">
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
                            className="w-full rounded-xl border border-border/50 bg-muted/15 px-3 py-2.5 text-left transition hover:border-primary/40 hover:bg-primary/10"
                          >
                            <div className="text-sm font-medium text-foreground">
                              {getNodeTypeUiLabel(item)}
                            </div>
                            <div className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
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
