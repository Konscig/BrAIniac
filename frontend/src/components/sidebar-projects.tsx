import React from "react";
import { ChevronLeft, ChevronRight, Dot } from "lucide-react";

import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { cn } from "../lib/utils";
import { mockProjects } from "../data/mock-data";

interface SidebarProjectsProps {
  activeProjectId: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectProject: (projectId: string) => void;
}

export function SidebarProjects({
  activeProjectId,
  collapsed,
  onToggleCollapse,
  onSelectProject
}: SidebarProjectsProps): React.ReactElement {
  const activeProject = mockProjects.find((p) => p.id === activeProjectId) ??
    mockProjects[0];

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border/60 bg-background/85 backdrop-blur transition-[width] duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 overflow-hidden rounded-full border border-border/60">
            <img
              src="https://i.pravatar.cc/80?img=12"
              alt="user"
              className="h-full w-full object-cover"
            />
          </div>
          {!collapsed && (
            <div>
              <div className="text-xs uppercase text-muted-foreground">
                Текущий проект
              </div>
              <div className="font-semibold text-foreground">
                {activeProject.name}
              </div>
            </div>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={onToggleCollapse}
          className="rounded-full border border-border/60"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <Separator />

      {!collapsed && (
        <div className="px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground">
          Пайплайны
        </div>
      )}
      <ScrollArea className="flex-1 px-2">
        <div className="space-y-2 pb-6">
          {activeProject.pipelines.map((pipeline) => (
            <button
              key={pipeline.id}
              type="button"
              className="w-full rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
            >
              <div className="font-medium text-foreground">
                {pipeline.name}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {pipeline.nodes.length} нод
              </div>
            </button>
          ))}

          {!collapsed && (
            <div className="space-y-1">
              <div className="pt-2 text-xs uppercase tracking-wide text-muted-foreground">
                Другие проекты
              </div>
              {mockProjects
                .filter((project) => project.id !== activeProject.id)
                .map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => onSelectProject(project.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                  >
                    <Dot className="h-4 w-4 text-muted-foreground" />
                    {project.name}
                  </button>
                ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
