import React from "react";

import type { NodeTypeRecord } from "../lib/api";
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

  const handleDragStart = React.useCallback((event: React.DragEvent, payload: DragPayload) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/brainiac-node-type", JSON.stringify(payload));
  }, []);

  return (
    <Card className="flex h-full min-h-0 flex-col border-border/60 bg-background/85">
      <CardHeader className="pb-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Библиотека</div>
        <div className="text-lg font-semibold">Узлы</div>
      </CardHeader>
      <Separator />
      <CardContent className="min-h-0 flex-1 p-0">
        <ScrollArea className="h-full">
          <div className="space-y-5 p-4">
            {groups.length === 0 && (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
                Нет доступных узлов. Проверьте, что backend отдал каталог типов.
              </div>
            )}

            {groups.map((group) => (
              <section key={group.id} className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{group.name}</div>
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
                      className="w-full rounded-xl border border-border/50 bg-muted/20 px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/10"
                    >
                      <div className="text-sm font-medium text-foreground">
                        {getNodeTypeUiLabel(item)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {getNodeTypeUiTagline(item)}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
