import React from "react";
import { LogOut } from "lucide-react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import "./App.css";

import { CanvasBoard } from "./components/canvas-board";
import { ModeToggle } from "./components/mode-toggle";
import { NodeInspector } from "./components/node-inspector";
import { NodeLibrary } from "./components/node-library";
import { RuntimePanel } from "./components/runtime-panel";
import { SidebarProjects } from "./components/sidebar-projects";
import { Button } from "./components/ui/button";
import {
  createPipeline,
  createProject,
  listNodeTypes,
  listPipelines,
  listProjects,
  listTools,
  type EdgeRecord,
  type NodeRecord,
  type NodeTypeRecord,
  type PipelineRecord,
  type ProjectRecord,
  type ToolRecord
} from "./lib/api";
import { AuthPage } from "./pages/auth-page";
import { useAuth } from "./providers/AuthProvider";

function MainPage(): React.ReactElement {
  const [projects, setProjects] = React.useState<ProjectRecord[]>([]);
  const [pipelines, setPipelines] = React.useState<PipelineRecord[]>([]);
  const [nodeTypes, setNodeTypes] = React.useState<NodeTypeRecord[]>([]);
  const [tools, setTools] = React.useState<ToolRecord[]>([]);
  const [activeProjectId, setActiveProjectId] = React.useState<number | null>(null);
  const [activePipelineId, setActivePipelineId] = React.useState<number | null>(null);
  const [selectedNodeId, setSelectedNodeId] = React.useState<number | null>(null);
  const [refreshToken, setRefreshToken] = React.useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [dataError, setDataError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [graphState, setGraphState] = React.useState<{ nodes: NodeRecord[]; edges: EdgeRecord[] }>({
    nodes: [],
    edges: []
  });
  const navigate = useNavigate();
  const { clearSession } = useAuth();

  const activePipeline = React.useMemo(
    () => pipelines.find((pipeline) => pipeline.pipeline_id === activePipelineId) ?? null,
    [activePipelineId, pipelines]
  );
  const selectedNode = React.useMemo(
    () => graphState.nodes.find((node) => node.node_id === selectedNodeId) ?? null,
    [graphState.nodes, selectedNodeId]
  );
  const selectedNodeType = React.useMemo(
    () => nodeTypes.find((nodeType) => nodeType.type_id === selectedNode?.fk_type_id) ?? null,
    [nodeTypes, selectedNode?.fk_type_id]
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
      const [nextProjects, nextNodeTypes, nextTools] = await Promise.all([
        listProjects(),
        listNodeTypes(),
        listTools()
      ]);

      setProjects(nextProjects);
      setNodeTypes(nextNodeTypes);
      setTools(nextTools);

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
      setDataError(error instanceof Error ? error.message : "Не удалось загрузить пайплайны.");
    });
  }, [activeProjectId, reloadPipelines]);

  React.useEffect(() => {
    setSelectedNodeId(null);
  }, [activePipelineId]);

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
      setDataError(createError instanceof Error ? createError.message : "Не удалось создать пайплайн.");
    }
  }, [activeProjectId, pipelines]);

  const handleRefreshGraph = React.useCallback(() => {
    setRefreshToken((current) => current + 1);
  }, []);

  return (
    <div className="App flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border/60 px-6 py-4 backdrop-blur">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">BrAIniac</p>
          <h1 className="text-2xl font-semibold">RAG-конструктор</h1>
          <p className="text-sm text-muted-foreground">
            Фронт работает поверх backend runtime: граф, датасет, запуск и execution/debug данные.
          </p>
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

      <main className="flex flex-1 overflow-hidden">
        <SidebarProjects
          projects={projects}
          pipelines={pipelines}
          activeProjectId={activeProjectId}
          activePipelineId={activePipelineId}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
          onSelectProject={setActiveProjectId}
          onSelectPipeline={setActivePipelineId}
          onCreateProject={handleCreateProject}
          onCreatePipeline={handleCreatePipeline}
        />

        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 flex-col overflow-hidden px-6 py-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Текущий контекст</div>
                <div className="text-lg font-semibold text-foreground">
                  {activePipeline?.name ?? "Пайплайн не выбран"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {activeProjectId
                    ? `Проект #${activeProjectId}${activePipeline ? ` · pipeline_id=${activePipeline.pipeline_id}` : ""}`
                    : "Выберите или создайте проект и пайплайн."}
                </div>
              </div>

              {isLoading && <div className="text-sm text-muted-foreground">Загружаем каталог backend...</div>}
            </div>

            {dataError && (
              <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {dataError}
              </div>
            )}

            <CanvasBoard
              pipelineId={activePipelineId}
              nodeTypes={nodeTypes}
              refreshToken={refreshToken}
              onGraphChange={setGraphState}
              onSelectNode={setSelectedNodeId}
              onError={setDataError}
            />
          </div>

          <aside className="flex w-[420px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border/60 px-4 py-6">
            <NodeLibrary nodeTypes={nodeTypes} />
            <NodeInspector
              node={selectedNode}
              nodeType={selectedNodeType}
              tools={tools}
              onSaved={() => {
                handleRefreshGraph();
              }}
            />
            <RuntimePanel
              pipeline={activePipeline}
              nodes={graphState.nodes}
              onDataChanged={handleRefreshGraph}
            />
          </aside>
        </div>
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
