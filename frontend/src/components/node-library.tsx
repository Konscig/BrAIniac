import React from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";

import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { cn } from "../lib/utils";
import type { PipelineNodeCategory } from "../lib/api";

type LibraryGroup = {
  id: PipelineNodeCategory;
  name: string;
  items: Array<{ id: string; label: string; type: string; tagline?: string }>;
};

const NODE_LIBRARY: LibraryGroup[] = [
  {
    id: "LLM",
    name: "LLM узлы",
    items: [
      {
        id: "mistral-7b",
        label: "Mistral 7B",
        type: "llm-mistral",
        tagline: "Фокус на русско-английских задачах"
      }
    ]
  },
  {
    id: "Data",
    name: "Данные",
    items: [
      { id: "kb-search", label: "Поиск по базе", type: "data-retrieval", tagline: "BM25 + вектор" },
      { id: "dataset-loader", label: "Загрузка датасета", type: "dataset-loader", tagline: "CSV, Parquet" }
    ]
  },
  {
    id: "Services",
    name: "Сервисы",
    items: [
      { id: "quality-judge", label: "Оценщик качества", type: "judge", tagline: "Метрики качества" },
      { id: "tool-router", label: "Роутер инструментов", type: "tool-router", tagline: "Маршрутизация задач" }
    ]
  },
  {
    id: "Utility",
    name: "Утилиты",
    items: [
      { id: "monitor", label: "Мониторинг", type: "monitor", tagline: "Графики и алерты" },
      { id: "notifier", label: "Уведомления", type: "notifier", tagline: "Slack, Email" }
    ]
  }
];

type DragPayload = {
  label: string;
  category: PipelineNodeCategory;
  type: string;
};

export function NodeLibrary(): React.ReactElement {
  const [openGroup, setOpenGroup] = React.useState("LLM");

  const handleDragStart = React.useCallback((event: React.DragEvent, payload: DragPayload) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/reactflow", JSON.stringify(payload));
  }, []);

  return (
    <Card className="flex h-full min-w-[240px] max-w-xs flex-col border-border/60 bg-background/85">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Библиотека
          </div>
          <div className="text-lg font-semibold">Ноды</div>
        </div>
        <Button size="icon" variant="secondary" className="rounded-full">
          <Plus className="h-4 w-4" />
        </Button>
      </CardHeader>
      <Separator />
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <div className="space-y-3 p-3">
            {NODE_LIBRARY.map((group) => {
              const expanded = openGroup === group.id;
              return (
                <div key={group.id} className="rounded-lg border border-border/50 bg-muted/30">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenGroup((prev) => (prev === group.id ? "" : group.id))
                    }
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-foreground"
                  >
                    {group.name}
                    {expanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                  {expanded && (
                    <div className="space-y-1 border-t border-border/30 bg-background/60 px-3 py-2">
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          draggable
                          onDragStart={(event) =>
                            handleDragStart(event, {
                              label: item.label,
                              category: group.id,
                              type: item.type
                            })
                          }
                          className={cn(
                            "w-full rounded-md border border-transparent bg-muted/40 px-3 py-2 text-left text-sm text-muted-foreground transition hover:border-accent/40 hover:bg-accent/10 hover:text-foreground"
                          )}
                        >
                          <div className="font-medium text-foreground">{item.label}</div>
                          {item.tagline && (
                            <div className="text-xs text-muted-foreground">
                              {item.tagline}
                            </div>
                          )}
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
