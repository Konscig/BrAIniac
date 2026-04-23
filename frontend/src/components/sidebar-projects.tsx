import React from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  GitBranch,
  Pencil,
  Plus,
  Trash2,
  X
} from "lucide-react";

import type { PipelineRecord, ProjectRecord } from "../lib/api";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

export interface SidebarProjectsProps {
  projects: ProjectRecord[];
  pipelinesByProject: Record<number, PipelineRecord[]>;
  activeProjectId: number | null;
  activePipelineId: number | null;
  onSelectProject: (projectId: number) => void;
  onSelectPipeline: (pipelineId: number) => void;
  onCreateProject: (name: string) => void;
  onCreatePipeline: (projectId: number, name: string) => void;
  onRenameProject: (projectId: number, name: string) => void;
  onDeleteProject: (projectId: number) => void;
  onRenamePipeline: (pipelineId: number, name: string) => void;
  onDeletePipeline: (pipelineId: number) => void;
}

type EditingState =
  | { kind: "project"; id: number; value: string }
  | { kind: "pipeline"; id: number; projectId: number; value: string }
  | null;

export function SidebarProjects({
  projects,
  pipelinesByProject,
  activeProjectId,
  activePipelineId,
  onSelectProject,
  onSelectPipeline,
  onCreateProject,
  onCreatePipeline,
  onRenameProject,
  onDeleteProject,
  onRenamePipeline,
  onDeletePipeline
}: SidebarProjectsProps): React.ReactElement {
  const [isProjectsOpen, setIsProjectsOpen] = React.useState(true);
  const [projectDraft, setProjectDraft] = React.useState("");
  const [pipelineDraftByProject, setPipelineDraftByProject] = React.useState<Record<number, string>>({});
  const [expandedProjects, setExpandedProjects] = React.useState<Record<number, boolean>>({});
  const [editing, setEditing] = React.useState<EditingState>(null);

  React.useEffect(() => {
    if (!activeProjectId) return;
    setExpandedProjects((current) => ({ ...current, [activeProjectId]: true }));
  }, [activeProjectId]);

  const toggleProject = React.useCallback((projectId: number) => {
    setExpandedProjects((current) => ({
      ...current,
      [projectId]: !current[projectId]
    }));
  }, []);

  const cancelEditing = React.useCallback(() => {
    setEditing(null);
  }, []);

  const commitEditing = React.useCallback(() => {
    if (!editing) return;

    const nextName = editing.value.trim();
    if (!nextName) {
      setEditing(null);
      return;
    }

    if (editing.kind === "project") {
      const currentProject = projects.find((project) => project.project_id === editing.id);
      if (currentProject && currentProject.name !== nextName) {
        onRenameProject(editing.id, nextName);
      }
      setEditing(null);
      return;
    }

    const currentPipeline = (pipelinesByProject[editing.projectId] ?? []).find(
      (pipeline) => pipeline.pipeline_id === editing.id
    );
    if (currentPipeline && currentPipeline.name !== nextName) {
      onRenamePipeline(editing.id, nextName);
    }
    setEditing(null);
  }, [editing, onRenamePipeline, onRenameProject, pipelinesByProject, projects]);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-border/60 bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--card))_100%)] backdrop-blur">
      <div className="border-b border-border/60 px-4 py-3">
        <button
          type="button"
          onClick={() => setIsProjectsOpen((current) => !current)}
          className="flex w-full items-center justify-between rounded-xl px-1 text-left transition hover:text-foreground"
        >
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              Проекты
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              Проекты и агенты
            </div>
          </div>
          {isProjectsOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </div>

      {isProjectsOpen && (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-3 py-3">
            <section className="rounded-2xl border border-border/60 bg-card/45 p-3">
              <div className="flex items-center gap-2">
                <input
                  value={projectDraft}
                  onChange={(event) => setProjectDraft(event.target.value)}
                  placeholder="Новый проект"
                  className="h-9 flex-1 rounded-lg border border-border/60 bg-background/80 px-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
                />
                <Button
                  type="button"
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  onClick={() => {
                    const name = projectDraft.trim();
                    if (!name) return;
                    onCreateProject(name);
                    setProjectDraft("");
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </section>

            <section className="space-y-2">
              {projects.length === 0 && (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/15 px-3 py-3 text-sm text-muted-foreground">
                  Пока нет проектов.
                </div>
              )}

              {projects.map((project) => {
                const projectPipelines = pipelinesByProject[project.project_id] ?? [];
                const isExpanded = expandedProjects[project.project_id] ?? project.project_id === activeProjectId;
                const isActiveProject = project.project_id === activeProjectId;
                const isEditingProject = editing?.kind === "project" && editing.id === project.project_id;

                return (
                  <div
                    key={project.project_id}
                    className={cn(
                      "overflow-hidden rounded-2xl border transition",
                      isActiveProject
                        ? "border-primary/45 bg-primary/8 shadow-[inset_0_0_0_1px_rgba(39,135,245,0.12)]"
                        : "border-border/50 bg-card/30"
                    )}
                  >
                    <div className="flex items-center gap-1 px-2 py-2">
                      <button
                        type="button"
                        onClick={() => toggleProject(project.project_id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted/20 hover:text-foreground"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>

                      {isEditingProject ? (
                        <div className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2">
                          <FolderKanban className="h-4 w-4 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <input
                              value={editing.value}
                              onChange={(event) =>
                                setEditing((current) =>
                                  current?.kind === "project" && current.id === project.project_id
                                    ? { ...current, value: event.target.value }
                                    : current
                                )
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  commitEditing();
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  cancelEditing();
                                }
                              }}
                              autoFocus
                              className="h-8 w-full rounded-lg border border-primary/40 bg-background/85 px-3 text-sm font-semibold text-foreground outline-none ring-offset-background focus:ring-2 focus:ring-ring"
                            />
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (editing) return;
                            onSelectProject(project.project_id);
                            setExpandedProjects((current) => ({ ...current, [project.project_id]: true }));
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-muted/15"
                        >
                          <FolderKanban className="h-4 w-4 shrink-0" />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">{project.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {projectPipelines.length} агент{projectPipelines.length === 1 ? "" : projectPipelines.length < 5 ? "а" : "ов"}
                            </div>
                          </div>
                        </button>
                      )}

                      {isEditingProject ? (
                        <>
                          <button
                            type="button"
                            onClick={commitEditing}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-200 transition hover:bg-emerald-500/10"
                            aria-label="Сохранить проект"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditing}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted/20 hover:text-foreground"
                            aria-label="Отменить редактирование проекта"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditing({ kind: "project", id: project.project_id, value: project.name })}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted/20 hover:text-foreground"
                            aria-label="Переименовать проект"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm(`Удалить проект "${project.name}"?`)) return;
                              onDeleteProject(project.project_id);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-red-500/10 hover:text-red-200"
                            aria-label="Удалить проект"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="border-t border-border/50 px-3 py-3">
                        <div className="space-y-1.5">
                          {projectPipelines.map((pipeline) => {
                            const isEditingPipeline =
                              editing?.kind === "pipeline" && editing.id === pipeline.pipeline_id;

                            return (
                              <div
                                key={pipeline.pipeline_id}
                                className={cn(
                                  "flex items-center gap-2 rounded-xl border px-2 py-2 transition",
                                  pipeline.pipeline_id === activePipelineId
                                    ? "border-primary/50 bg-primary/12"
                                    : "border-border/40 bg-background/20"
                                )}
                              >
                                {isEditingPipeline ? (
                                  <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1.5 py-1">
                                    <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <input
                                      value={editing.value}
                                      onChange={(event) =>
                                        setEditing((current) =>
                                          current?.kind === "pipeline" && current.id === pipeline.pipeline_id
                                            ? { ...current, value: event.target.value }
                                            : current
                                        )
                                      }
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          commitEditing();
                                        }
                                        if (event.key === "Escape") {
                                          event.preventDefault();
                                          cancelEditing();
                                        }
                                      }}
                                      autoFocus
                                      className="h-8 min-w-0 flex-1 rounded-lg border border-primary/40 bg-background/85 px-3 text-sm font-medium text-foreground outline-none ring-offset-background focus:ring-2 focus:ring-ring"
                                    />
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (editing) return;
                                      onSelectProject(project.project_id);
                                      onSelectPipeline(pipeline.pipeline_id);
                                    }}
                                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1.5 py-1 text-left"
                                  >
                                    <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <span className="truncate text-sm font-medium text-foreground">
                                      {pipeline.name}
                                    </span>
                                  </button>
                                )}

                                {isEditingPipeline ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={commitEditing}
                                      className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-200 transition hover:bg-emerald-500/10"
                                      aria-label="Сохранить агента"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEditing}
                                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted/20 hover:text-foreground"
                                      aria-label="Отменить редактирование агента"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEditing({
                                          kind: "pipeline",
                                          id: pipeline.pipeline_id,
                                          projectId: project.project_id,
                                          value: pipeline.name
                                        })
                                      }
                                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted/20 hover:text-foreground"
                                      aria-label="Переименовать агента"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!window.confirm(`Удалить агента "${pipeline.name}"?`)) return;
                                        onDeletePipeline(pipeline.pipeline_id);
                                      }}
                                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-red-500/10 hover:text-red-200"
                                      aria-label="Удалить агента"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            );
                          })}

                          <div className="flex items-center gap-2 pt-1">
                            <input
                              value={pipelineDraftByProject[project.project_id] ?? ""}
                              onChange={(event) =>
                                setPipelineDraftByProject((current) => ({
                                  ...current,
                                  [project.project_id]: event.target.value
                                }))
                              }
                              placeholder="Новый агент"
                              className="h-9 flex-1 rounded-lg border border-border/60 bg-background/80 px-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
                            />
                            <Button
                              type="button"
                              size="icon"
                              className="h-9 w-9 rounded-full"
                              onClick={() => {
                                const name = (pipelineDraftByProject[project.project_id] ?? "").trim();
                                if (!name) return;
                                onCreatePipeline(project.project_id, name);
                                setPipelineDraftByProject((current) => ({
                                  ...current,
                                  [project.project_id]: ""
                                }));
                              }}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          </div>
        </ScrollArea>
      )}
    </aside>
  );
}
