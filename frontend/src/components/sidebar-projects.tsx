import React from "react";
import { ChevronLeft, ChevronRight, Dot } from "lucide-react";

import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { cn } from "../lib/utils";
import type { PipelineSummary, ProjectSummary } from "../lib/api";

interface SidebarProjectsProps {
  projects: ProjectSummary[];
  pipelines: PipelineSummary[];
  activeProjectId: string;
  activePipelineId: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectProject: (projectId: string) => void;
  onSelectPipeline: (pipelineId: string) => void;
  onCreateProject?: (name: string, description: string) => void;
  onDeleteProject?: (projectId: string) => void;
}

export function SidebarProjects({
  projects,
  pipelines,
  activeProjectId,
  activePipelineId,
  collapsed,
  onToggleCollapse,
  onSelectProject,
  onSelectPipeline
  , onCreateProject, onDeleteProject
}: SidebarProjectsProps): React.ReactElement {
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? projects[0];
  const otherProjects = projects.filter((project) => project.id !== activeProject?.id);

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
                {activeProject ? activeProject.name : "Нет проектов"}
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
          {pipelines.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Пайплайнов пока нет
            </div>
          )}
          {pipelines.map((pipeline) => (
            <button
              key={pipeline.id}
              type="button"
              onClick={() => onSelectPipeline(pipeline.id)}
              className={cn(
                "w-full rounded-lg border px-3 py-2 text-left text-sm transition",
                pipeline.id === activePipelineId
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <div className="font-medium text-foreground">
                {pipeline.name}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Версия {pipeline.version ?? 0}
              </div>
            </button>
          ))}

          {!collapsed && (
            <div className="space-y-1">
              <div className="pt-2 text-xs uppercase tracking-wide text-muted-foreground">
                Другие проекты
              </div>
              <div className="flex gap-2">
                <button
                  className="text-sm text-primary underline"
                  onClick={() => {
                    const name = prompt('Название нового проекта')?.trim();
                    if (name && typeof onCreateProject === 'function') {
                      onCreateProject(name, 'Создано пользователем');
                    }
                  }}
                >
                  + Создать проект
                </button>
              </div>
              {otherProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => onSelectProject(project.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                  >
                    <Dot className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">{project.name}</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (typeof onDeleteProject === 'function' && window.confirm('Удалить проект?')) {
                          onDeleteProject(project.id);
                        }
                      }}
                      className="text-xs text-red-400"
                    >
                      Удалить
                    </button>
                  </button>
                ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
