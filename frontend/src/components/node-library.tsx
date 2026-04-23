import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import type { NodeTypeRecord } from "../lib/api";
import {
  getNodeTypeGroupLabel,
  getNodeTypeUiLabel,
  getNodeTypeUiTagline,
  isVisibleNodeType,
  sortNodeTypes
} from "../lib/node-catalog";
import { cn } from "../lib/utils";
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

  for (const nodeType of sortNodeTypes(nodeTypes).filter(isVisibleNodeType)) {
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
  const [openGroup, setOpenGroup] = React.useState(groups[0]?.id ?? "");

  React.useEffect(() => {
    if (!groups.some((group) => group.id === openGroup)) {
      setOpenGroup(groups[0]?.id ?? "");
    }
  }, [groups, openGroup]);

  const handleDragStart = React.useCallback((event: React.DragEvent, payload: DragPayload) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/brainiac-node-type", JSON.stringify(payload));
  }, []);

  return (
    <Card className="border-border/60 bg-background/85">
      <CardHeader className="pb-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Библиотека</div>
        <div className="text-lg font-semibold">Узлы</div>
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        <ScrollArea className="h-[320px]">
          <div className="space-y-3 p-3">
            {groups.length === 0 && (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
                Каталог узлов пока не загружен.
              </div>
            )}

            {groups.map((group) => {
              const expanded = openGroup === group.id;
              return (
                <div key={group.id} className="rounded-lg border border-border/50 bg-muted/25">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
                    onClick={() => setOpenGroup((prev) => (prev === group.id ? "" : group.id))}
                  >
                    <span>{group.name}</span>
                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>

                  {expanded && (
                    <div className="space-y-1 border-t border-border/40 bg-background/70 px-3 py-2">
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
                          className={cn(
                            "w-full rounded-lg border border-transparent bg-muted/30 px-3 py-2 text-left transition",
                            "hover:border-primary/40 hover:bg-primary/10"
                          )}
                        >
                          <div className="text-sm font-medium text-foreground">
                            {getNodeTypeUiLabel(item)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {getNodeTypeUiTagline(item)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
