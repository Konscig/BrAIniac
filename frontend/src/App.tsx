import React from "react";
import { LogOut } from "lucide-react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import "./App.css";

import { CanvasBoard } from "./components/canvas-board";
import { ModeToggle } from "./components/mode-toggle";
import { NodeLibrary } from "./components/node-library";
import { RunPanel } from "./components/run-panel";
import { SidebarProjects } from "./components/sidebar-projects";
import { Button } from "./components/ui/button";
import {
  createPipeline,
  createProject,
  deletePipeline,
  deleteProject,
  listNodeTypes,
  listPipelines,
  listProjects,
  updatePipeline,
  updateProject,
  type EdgeRecord,
  type NodeRecord,
  type NodeTypeRecord,
  type PipelineRecord,
  type ProjectRecord
} from "./lib/api";
import { AuthPage } from "./pages/auth-page";
import { useAuth } from "./providers/AuthProvider";

function normalizeProjectRecord(project: ProjectRecord): ProjectRecord {
  return {
    ...project,
    name: project.name.trim()
  };
}

function normalizePipelineRecord(pipeline: PipelineRecord): PipelineRecord {
  return {
    ...pipeline,
    name: pipeline.name.trim()
  };
}

function MainPage(): React.ReactElement {
  const [projects, setProjects] = React.useState<ProjectRecord[]>([]);
  const [pipelinesByProject, setPipelinesByProject] = React.useState<Record<number, PipelineRecord[]>>({});
  const [nodeTypes, setNodeTypes] = React.useState<NodeTypeRecord[]>([]);
  const [activeProjectId, setActiveProjectId] = React.useState<number | null>(null);
  const [activePipelineId, setActivePipelineId] = React.useState<number | null>(null);
  const [dataError, setDataError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isGraphRunning, setIsGraphRunning] = React.useState(false);
  const [graphRefreshToken, setGraphRefreshToken] = React.useState(0);
  const [graphState, setGraphState] = React.useState<{ nodes: NodeRecord[]; edges: EdgeRecord[] }>({
    nodes: [],
    edges: []
  });
  const activeProjectIdRef = React.useRef<number | null>(null);
  const activePipelineIdRef = React.useRef<number | null>(null);
  const navigate = useNavigate();
  const { clearSession } = useAuth();

  React.useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  React.useEffect(() => {
    activePipelineIdRef.current = activePipelineId;
  }, [activePipelineId]);

  const activeProject = React.useMemo(
    () => projects.find((project) => project.project_id === activeProjectId) ?? null,
    [activeProjectId, projects]
  );

  const activePipeline = React.useMemo(() => {
    for (const pipelineList of Object.values(pipelinesByProject)) {
      const found = pipelineList.find((pipeline) => pipeline.pipeline_id === activePipelineId);
      if (found) return found;
    }
    return null;
  }, [activePipelineId, pipelinesByProject]);

  const ensureActiveSelection = React.useCallback(
    (
      nextProjects: ProjectRecord[],
      nextPipelinesByProject: Record<number, PipelineRecord[]>,
      preferredProjectId?: number | null,
      preferredPipelineId?: number | null
    ) => {
      const resolvedProjectId =
        preferredProjectId && nextProjects.some((project) => project.project_id === preferredProjectId)
          ? preferredProjectId
          : nextProjects[0]?.project_id ?? null;

      const projectPipelines = resolvedProjectId ? nextPipelinesByProject[resolvedProjectId] ?? [] : [];
      const resolvedPipelineId =
        preferredPipelineId && projectPipelines.some((pipeline) => pipeline.pipeline_id === preferredPipelineId)
          ? preferredPipelineId
          : projectPipelines[0]?.pipeline_id ?? null;

      setActiveProjectId(resolvedProjectId);
      setActivePipelineId(resolvedPipelineId);
    },
    []
  );

  const loadInitialData = React.useCallback(async () => {
    setIsLoading(true);
    setDataError(null);

    try {
      const [rawProjects, nextNodeTypes] = await Promise.all([listProjects(), listNodeTypes()]);
      const nextProjects = rawProjects.map(normalizeProjectRecord);
      const projectPipelinePairs = await Promise.all(
        nextProjects.map(async (project) => [
          project.project_id,
          (await listPipelines(project.project_id)).map(normalizePipelineRecord)
        ] as const)
      );
      const nextPipelinesByProject = Object.fromEntries(projectPipelinePairs);

      setProjects(nextProjects);
      setNodeTypes(nextNodeTypes);
      setPipelinesByProject(nextPipelinesByProject);
      ensureActiveSelection(
        nextProjects,
        nextPipelinesByProject,
        activeProjectIdRef.current,
        activePipelineIdRef.current
      );
    } catch (loadError) {
      console.error("Failed to load initial data", loadError);
      setDataError(loadError instanceof Error ? loadError.message : "Не удалось загрузить данные.");
    } finally {
      setIsLoading(false);
    }
  }, [ensureActiveSelection]);

  React.useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  React.useEffect(() => {
    if (!activeProjectId) {
      setActivePipelineId(null);
      return;
    }

    const activeProjectPipelines = pipelinesByProject[activeProjectId] ?? [];
    if (!activeProjectPipelines.some((pipeline) => pipeline.pipeline_id === activePipelineId)) {
      setActivePipelineId(activeProjectPipelines[0]?.pipeline_id ?? null);
    }
  }, [activePipelineId, activeProjectId, pipelinesByProject]);

  const handleLogout = React.useCallback(() => {
    clearSession();
    navigate("/auth", { replace: true });
  }, [clearSession, navigate]);

  const handleCreateProject = React.useCallback(async (name: string) => {
    try {
      const created = normalizeProjectRecord(await createProject({ name }));
      setProjects((current) => [created, ...current]);
      setPipelinesByProject((current) => ({ ...current, [created.project_id]: [] }));
      setActiveProjectId(created.project_id);
      setActivePipelineId(null);
      setDataError(null);
    } catch (createError) {
      console.error("Failed to create project", createError);
      setDataError(createError instanceof Error ? createError.message : "Не удалось создать проект.");
    }
  }, []);

  const handleCreatePipeline = React.useCallback(async (projectId: number, name: string) => {
    try {
      const created = normalizePipelineRecord(await createPipeline({
        fk_project_id: projectId,
        name
      }));

      setPipelinesByProject((current) => ({
        ...current,
        [projectId]: [created, ...(current[projectId] ?? [])]
      }));
      setActiveProjectId(projectId);
      setActivePipelineId(created.pipeline_id);
      setDataError(null);
    } catch (createError) {
      console.error("Failed to create pipeline", createError);
      setDataError(createError instanceof Error ? createError.message : "Не удалось создать агента.");
    }
  }, []);

  const handleRenameProject = React.useCallback(async (projectId: number, name: string) => {
    try {
      const updated = normalizeProjectRecord(await updateProject(projectId, { name }));
      setProjects((current) =>
        current.map((project) => (project.project_id === projectId ? updated : project))
      );
      setDataError(null);
    } catch (updateError) {
      console.error("Failed to rename project", updateError);
      setDataError(updateError instanceof Error ? updateError.message : "Не удалось переименовать проект.");
    }
  }, []);

  const handleDeleteProject = React.useCallback(async (projectId: number) => {
    try {
      await deleteProject(projectId);

      const nextProjects = projects.filter((project) => project.project_id !== projectId);
      const nextPipelinesByProject = { ...pipelinesByProject };
      delete nextPipelinesByProject[projectId];

      setProjects(nextProjects);
      setPipelinesByProject(nextPipelinesByProject);
      ensureActiveSelection(
        nextProjects,
        nextPipelinesByProject,
        activeProjectId === projectId ? null : activeProjectId,
        activeProjectId === projectId ? null : activePipelineId
      );
      setDataError(null);
    } catch (deleteError) {
      console.error("Failed to delete project", deleteError);
      setDataError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить проект.");
    }
  }, [activePipelineId, activeProjectId, ensureActiveSelection, pipelinesByProject, projects]);

  const handleRenamePipeline = React.useCallback(async (pipelineId: number, name: string) => {
    try {
      const updated = normalizePipelineRecord(await updatePipeline(pipelineId, { name }));
      setPipelinesByProject((current) => {
        const next = { ...current };
        for (const projectId of Object.keys(next)) {
          const numericProjectId = Number(projectId);
          next[numericProjectId] = (next[numericProjectId] ?? []).map((pipeline) =>
            pipeline.pipeline_id === pipelineId ? updated : pipeline
          );
        }
        return next;
      });
      setDataError(null);
    } catch (updateError) {
      console.error("Failed to rename pipeline", updateError);
      setDataError(updateError instanceof Error ? updateError.message : "Не удалось переименовать агента.");
    }
  }, []);

  const handleDeletePipeline = React.useCallback(async (pipelineId: number) => {
    try {
      await deletePipeline(pipelineId);

      setPipelinesByProject((current) => {
        const next = { ...current };
        let deletedProjectId: number | null = null;

        for (const projectId of Object.keys(next)) {
          const numericProjectId = Number(projectId);
          const filtered = (next[numericProjectId] ?? []).filter((pipeline) => pipeline.pipeline_id !== pipelineId);
          if (filtered.length !== (next[numericProjectId] ?? []).length) {
            deletedProjectId = numericProjectId;
          }
          next[numericProjectId] = filtered;
        }

        if (pipelineId === activePipelineId) {
          const fallbackList = deletedProjectId ? next[deletedProjectId] ?? [] : [];
          setActivePipelineId(fallbackList[0]?.pipeline_id ?? null);
          if (deletedProjectId) {
            setActiveProjectId(deletedProjectId);
          }
        }

        return next;
      });

      setDataError(null);
    } catch (deleteError) {
      console.error("Failed to delete pipeline", deleteError);
      setDataError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить агента.");
    }
  }, [activePipelineId]);

  return (
    <div className="App flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 backdrop-blur">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">BrAIniac</p>
          <h1 className="text-2xl font-semibold">Конструктор агентов</h1>
        </div>

        <div className="flex items-center gap-3">
          <ModeToggle />
          <Button
            type="button"
            variant="ghost"
            className="rounded-full border border-border/60 bg-background/60 px-3"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Выйти
          </Button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_286px] overflow-hidden">
        <SidebarProjects
          projects={projects}
          pipelinesByProject={pipelinesByProject}
          activeProjectId={activeProjectId}
          activePipelineId={activePipelineId}
          onSelectProject={setActiveProjectId}
          onSelectPipeline={setActivePipelineId}
          onCreateProject={handleCreateProject}
          onCreatePipeline={handleCreatePipeline}
          onRenameProject={handleRenameProject}
          onDeleteProject={handleDeleteProject}
          onRenamePipeline={handleRenamePipeline}
          onDeletePipeline={handleDeletePipeline}
        />

        <section className="flex min-h-0 min-w-0 flex-col gap-2.5 overflow-hidden border-r border-border/60 border-l border-border/60 px-3 py-3">
          <RunPanel
            pipelineId={activePipelineId}
            projectName={activeProject?.name ?? null}
            pipelineName={activePipeline?.name ?? null}
            nodes={graphState.nodes}
            nodeTypes={nodeTypes}
            onError={setDataError}
            onRunningChange={setIsGraphRunning}
            onExecutionComplete={() => setGraphRefreshToken((current) => current + 1)}
          />

          {isLoading && <div className="shrink-0 text-sm text-muted-foreground">Загружаем каталог узлов...</div>}

          {dataError && (
            <div className="shrink-0 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {dataError}
            </div>
          )}

          <CanvasBoard
            pipelineId={activePipelineId}
            nodeTypes={nodeTypes}
            refreshToken={graphRefreshToken}
            isGraphRunning={isGraphRunning}
            className="min-h-0"
            onGraphChange={setGraphState}
            onError={setDataError}
          />
        </section>

        <aside className="flex min-h-0 min-w-0 flex-col gap-2.5 overflow-hidden px-2.5 py-3">
          <div className="min-h-0 flex-1">
            <NodeLibrary nodeTypes={nodeTypes} />
          </div>
        </aside>
      </main>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactElement }): React.ReactElement {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  return children;
}

function PublicOnly({ children }: { children: React.ReactElement }): React.ReactElement {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const hasVscodeState = new URLSearchParams(location.search).has("vscode_state");

  if (isAuthenticated && !hasVscodeState) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App(): React.ReactElement {
  return (
    <Routes>
      <Route
        path="/"
        element={(
          <RequireAuth>
            <MainPage />
          </RequireAuth>
        )}
      />
      <Route
        path="/auth"
        element={(
          <PublicOnly>
            <AuthPage />
          </PublicOnly>
        )}
      />
    </Routes>
  );
}

export default App;
