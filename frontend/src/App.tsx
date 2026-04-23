import React from "react";
import { LogOut } from "lucide-react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import "./App.css";

import { CanvasBoard } from "./components/canvas-board";
import { ModeToggle } from "./components/mode-toggle";
import { NodeLibrary } from "./components/node-library";
import { SidebarProjects } from "./components/sidebar-projects";
import { Button } from "./components/ui/button";
import {
  createPipeline,
  createProject,
  listNodeTypes,
  listPipelines,
  listProjects,
  type EdgeRecord,
  type NodeRecord,
  type NodeTypeRecord,
  type PipelineRecord,
  type ProjectRecord
} from "./lib/api";
import { AuthPage } from "./pages/auth-page";
import { useAuth } from "./providers/AuthProvider";

function MainPage(): React.ReactElement {
  const [projects, setProjects] = React.useState<ProjectRecord[]>([]);
  const [pipelines, setPipelines] = React.useState<PipelineRecord[]>([]);
  const [nodeTypes, setNodeTypes] = React.useState<NodeTypeRecord[]>([]);
  const [activeProjectId, setActiveProjectId] = React.useState<number | null>(null);
  const [activePipelineId, setActivePipelineId] = React.useState<number | null>(null);
  const [dataError, setDataError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [, setGraphState] = React.useState<{ nodes: NodeRecord[]; edges: EdgeRecord[] }>({
    nodes: [],
    edges: []
  });
  const navigate = useNavigate();
  const { clearSession } = useAuth();

  const activeProject = React.useMemo(
    () => projects.find((project) => project.project_id === activeProjectId) ?? null,
    [activeProjectId, projects]
  );
  const activePipeline = React.useMemo(
    () => pipelines.find((pipeline) => pipeline.pipeline_id === activePipelineId) ?? null,
    [activePipelineId, pipelines]
  );

  const handleLogout = React.useCallback(() => {
    clearSession();
    navigate("/auth", { replace: true });
  }, [clearSession, navigate]);

  const reloadPipelines = React.useCallback(async (projectId: number) => {
    const nextPipelines = await listPipelines(projectId);
    setPipelines(nextPipelines);
    setActivePipelineId((current) => {
      if (current && nextPipelines.some((pipeline) => pipeline.pipeline_id === current)) {
        return current;
      }
      return nextPipelines[0]?.pipeline_id ?? null;
    });
  }, []);

  const loadInitialData = React.useCallback(async () => {
    setIsLoading(true);
    setDataError(null);

    try {
      const [nextProjects, nextNodeTypes] = await Promise.all([
        listProjects(),
        listNodeTypes()
      ]);

      setProjects(nextProjects);
      setNodeTypes(nextNodeTypes);

      const projectId = nextProjects[0]?.project_id ?? null;
      setActiveProjectId((current) => {
        if (current && nextProjects.some((project) => project.project_id === current)) {
          return current;
        }
        return projectId;
      });

      if (projectId) {
        await reloadPipelines(projectId);
      } else {
        setPipelines([]);
        setActivePipelineId(null);
      }
    } catch (loadError) {
      console.error("Failed to load initial data", loadError);
      setDataError(loadError instanceof Error ? loadError.message : "Не удалось загрузить данные.");
    } finally {
      setIsLoading(false);
    }
  }, [reloadPipelines]);

  React.useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  React.useEffect(() => {
    if (!activeProjectId) {
      setPipelines([]);
      setActivePipelineId(null);
      return;
    }

    void reloadPipelines(activeProjectId).catch((error) => {
      console.error("Failed to load pipelines", error);
      setDataError(error instanceof Error ? error.message : "Не удалось загрузить агентов.");
    });
  }, [activeProjectId, reloadPipelines]);

  const handleCreateProject = React.useCallback(async (name: string) => {
    try {
      const created = await createProject({ name });
      const nextProjects = [created, ...projects];
      setProjects(nextProjects);
      setActiveProjectId(created.project_id);
      setPipelines([]);
      setActivePipelineId(null);
      setDataError(null);
    } catch (createError) {
      console.error("Failed to create project", createError);
      setDataError(createError instanceof Error ? createError.message : "Не удалось создать проект.");
    }
  }, [projects]);

  const handleCreatePipeline = React.useCallback(async (name: string) => {
    if (!activeProjectId) {
      setDataError("Сначала выберите проект.");
      return;
    }

    try {
      const created = await createPipeline({
        fk_project_id: activeProjectId,
        name
      });
      const nextPipelines = [created, ...pipelines];
      setPipelines(nextPipelines);
      setActivePipelineId(created.pipeline_id);
      setDataError(null);
    } catch (createError) {
      console.error("Failed to create pipeline", createError);
      setDataError(createError instanceof Error ? createError.message : "Не удалось создать агента.");
    }
  }, [activeProjectId, pipelines]);

  return (
    <div className="App flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border/60 px-6 py-4 backdrop-blur">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">BrAIniac</p>
          <h1 className="text-3xl font-semibold">Конструктор агентов</h1>
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

      <main className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_320px] overflow-hidden">
        <SidebarProjects
          projects={projects}
          pipelines={pipelines}
          activeProjectId={activeProjectId}
          activePipelineId={activePipelineId}
          onSelectProject={setActiveProjectId}
          onSelectPipeline={setActivePipelineId}
          onCreateProject={handleCreateProject}
          onCreatePipeline={handleCreatePipeline}
        />

        <section className="flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden border-r border-border/60 px-5 py-5">
          <div className="grid shrink-0 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Проект</div>
              <div className="mt-1 text-base font-semibold text-foreground">
                {activeProject?.name ?? "Не выбран"}
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Агент</div>
              <div className="mt-1 text-base font-semibold text-foreground">
                {activePipeline?.name ?? "Не выбран"}
              </div>
            </div>
          </div>

          {isLoading && <div className="shrink-0 text-sm text-muted-foreground">Загружаем каталог узлов...</div>}

          {dataError && (
            <div className="shrink-0 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {dataError}
            </div>
          )}

          <CanvasBoard
            pipelineId={activePipelineId}
            nodeTypes={nodeTypes}
            className="min-h-0"
            onGraphChange={setGraphState}
            onError={setDataError}
          />
        </section>

        <aside className="flex min-h-0 flex-col overflow-hidden px-4 py-5">
          <NodeLibrary nodeTypes={nodeTypes} />
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

  if (isAuthenticated) {
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
