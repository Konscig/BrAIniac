import React from "react";
import { ChevronLeft, ChevronRight, FolderKanban, GitBranch } from "lucide-react";

import type { PipelineRecord, ProjectRecord } from "../lib/api";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";

export interface SidebarProjectsProps {
  projects: ProjectRecord[];
  pipelines: PipelineRecord[];
  activeProjectId: number | null;
  activePipelineId: number | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectProject: (projectId: number) => void;
  onSelectPipeline: (pipelineId: number) => void;
  onCreateProject: (name: string) => void;
  onCreatePipeline: (name: string) => void;
}

export function SidebarProjects({
  projects,
  pipelines,
  activeProjectId,
  activePipelineId,
  collapsed,
  onToggleCollapse,
  onSelectProject,
  onSelectPipeline,
  onCreateProject,
  onCreatePipeline
}: SidebarProjectsProps): React.ReactElement {
  const [projectDraft, setProjectDraft] = React.useState("");
  const [pipelineDraft, setPipelineDraft] = React.useState("");
  const activeProject = projects.find((project) => project.project_id === activeProjectId) ?? null;

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border/60 bg-background/90 backdrop-blur",
        collapsed ? "w-16" : "w-80"
      )}
    >
      <div className="flex items-center justify-between px-4 py-4">
        {!collapsed && (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Рабочая область</div>
            <div className="text-lg font-semibold text-foreground">Проекты и пайплайны</div>
          </div>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="rounded-full border border-border/60"
          onClick={onToggleCollapse}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <Separator />

      {!collapsed && (
        <div className="space-y-3 px-4 py-4">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Новый проект</label>
            <div className="flex gap-2">
              <input
                value={projectDraft}
                onChange={(event) => setProjectDraft(event.target.value)}
                placeholder="Например, Корпус знаний"
                className="flex-1 rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
              />
              <Button
                type="button"
                onClick={() => {
                  const name = projectDraft.trim();
                  if (!name) return;
                  onCreateProject(name);
                  setProjectDraft("");
                }}
              >
                Создать
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Активный проект</div>
            <div className="mt-1 text-sm font-medium text-foreground">
              {activeProject?.name ?? "Проект не выбран"}
            </div>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 px-3 py-3">
        <div className="space-y-5">
          <div className="space-y-2">
            {!collapsed && (
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Проекты</div>
            )}
            {projects.length === 0 && !collapsed && (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                Пока нет проектов.
              </div>
            )}
            {projects.map((project) => (
              <button
                key={project.project_id}
                type="button"
                onClick={() => onSelectProject(project.project_id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition",
                  project.project_id === activeProjectId
                    ? "border-primary/45 bg-primary/10 text-foreground"
                    : "border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/35 hover:text-foreground"
                )}
              >
                <FolderKanban className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate text-sm font-medium">{project.name}</span>}
              </button>
            ))}
          </div>

          {!collapsed && (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Новый пайплайн</label>
                <div className="flex gap-2">
                  <input
                    value={pipelineDraft}
                    onChange={(event) => setPipelineDraft(event.target.value)}
                    placeholder="Например, RAG-агент"
                    disabled={!activeProjectId}
                    className="flex-1 rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <Button
                    type="button"
                    disabled={!activeProjectId}
                    onClick={() => {
                      const name = pipelineDraft.trim();
                      if (!name) return;
                      onCreatePipeline(name);
                      setPipelineDraft("");
                    }}
                  >
                    Создать
                  </Button>
                </div>
              </div>

              <div className="text-xs uppercase tracking-wide text-muted-foreground">Пайплайны</div>
            </div>
          )}

          <div className="space-y-2">
            {pipelines.length === 0 && !collapsed && (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                У проекта пока нет пайплайнов.
              </div>
            )}
            {pipelines.map((pipeline) => (
              <button
                key={pipeline.pipeline_id}
                type="button"
                onClick={() => onSelectPipeline(pipeline.pipeline_id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition",
                  pipeline.pipeline_id === activePipelineId
                    ? "border-primary/45 bg-primary/10 text-foreground"
                    : "border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/35 hover:text-foreground"
                )}
              >
                <GitBranch className="mt-0.5 h-4 w-4 shrink-0" />
                {!collapsed && (
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{pipeline.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Лимиты: время {pipeline.max_time}s, стоимость {pipeline.max_cost}
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}
