import React from "react";
import { LogOut } from "lucide-react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import "./App.css";

import { CanvasBoard } from "./components/canvas-board";
import {
  EnvironmentModeSwitch,
  type EnvironmentMode
} from "./components/environment-mode-switch";
import { ModeToggle } from "./components/mode-toggle";
import { NodeLibrary } from "./components/node-library";
import { SidebarProjects } from "./components/sidebar-projects";
import { PipelineRunner } from "./components/pipeline-runner";
import { Button } from "./components/ui/button";
import {
  createPipeline,
  createProject,
  executePipeline,
  listPipelines,
  listProjects,
  publishPipelineVersion,
  deleteProject,
  type EnvironmentModeApi,
  type ExecutePipelineResponse,
  type PipelineSummary,
  type ProjectSummary
} from "./lib/api";
import { AuthPage } from "./pages/auth-page";
import { useAuth } from "./providers/AuthProvider";

const MODE_API_MAP: Record<EnvironmentMode, EnvironmentModeApi> = {
  test: "ENVIRONMENT_MODE_TEST",
  hybrid: "ENVIRONMENT_MODE_HYBRID",
  real: "ENVIRONMENT_MODE_REAL"
};

function MainPage(): React.ReactElement {
  const [projects, setProjects] = React.useState<ProjectSummary[]>([]);
  const [pipelines, setPipelines] = React.useState<PipelineSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = React.useState<string>("");
  const [activePipelineId, setActivePipelineId] = React.useState<string>("");
  const [environmentMode, setEnvironmentMode] = React.useState<EnvironmentMode>(
    "test"
  );
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [refreshToken, setRefreshToken] = React.useState(0);
  const [boardStatus, setBoardStatus] = React.useState({
    isOffline: false,
    hasUnsavedChanges: false,
    lastError: null as string | null
  });
  const [saveFeedback, setSaveFeedback] = React.useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [dataError, setDataError] = React.useState<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = React.useState(false);
  const [isLoadingPipelines, setIsLoadingPipelines] = React.useState(false);
  const [triggerInput, setTriggerInput] = React.useState("");
  const [runResult, setRunResult] = React.useState<ExecutePipelineResponse | null>(null);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [isRunning, setIsRunning] = React.useState(false);
  const navigate = useNavigate();
  const { clearSession } = useAuth();

  const handleLogout = React.useCallback(() => {
    clearSession();
    navigate("/auth", { replace: true });
  }, [clearSession, navigate]);

  const handleSelectProject = React.useCallback((projectId: string) => {
    setActiveProjectId(projectId);
    setActivePipelineId("");
    setRunResult(null);
    setRunError(null);
  }, []);

  const handleSelectPipeline = React.useCallback((pipelineId: string) => {
    setActivePipelineId(pipelineId);
    setRunResult(null);
    setRunError(null);
  }, []);

  const loadProjects = React.useCallback(async () => {
    setIsLoadingProjects(true);
    setDataError(null);
    try {
      let projectList = await listProjects();
      if (projectList.length === 0) {
        const created = await createProject(
          "Демо проект",
          "Проект создан автоматически"
        );
        projectList = [created];
      }
      setProjects(projectList);
      setActiveProjectId((prev) => {
        if (prev && projectList.some((project) => project.id === prev)) {
          return prev;
        }
        return projectList[0]?.id ?? "";
      });
    } catch (error) {
      console.error("Failed to load projects", error);
      setDataError("Не удалось загрузить проекты");
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  const handleCreateProject = React.useCallback(async (name: string, description: string) => {
    setIsLoadingProjects(true);
    try {
      const p = await createProject(name, description);
      setProjects((prev) => [p, ...prev]);
      setActiveProjectId(p.id);
    } catch (err) {
      console.error('Failed to create project', err);
      setDataError('Не удалось создать проект');
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  const handleDeleteProject = React.useCallback(async (projectId: string) => {
    setIsLoadingProjects(true);
    try {
      await deleteProject(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      if (activeProjectId === projectId) {
        setActiveProjectId("");
        setPipelines([]);
        setActivePipelineId("");
      }
    } catch (err) {
      console.error('Failed to delete project', err);
      setDataError('Не удалось удалить проект');
    } finally {
      setIsLoadingProjects(false);
    }
  }, [activeProjectId]);

  const loadPipelines = React.useCallback(async (projectId: string) => {
    if (!projectId) {
      setPipelines([]);
      setActivePipelineId("");
      return;
    }

    setIsLoadingPipelines(true);
    setDataError(null);
    try {
      let pipelineList = await listPipelines(projectId);
      if (pipelineList.length === 0) {
        const created = await createPipeline(
          projectId,
          "Основной пайплайн",
          "Пайплайн создан автоматически"
        );
        pipelineList = [created];
      }
      setPipelines(pipelineList);
      setActivePipelineId((prev) => {
        if (prev && pipelineList.some((pipeline) => pipeline.id === prev)) {
          return prev;
        }
        return pipelineList[0]?.id ?? "";
      });
    } catch (error) {
      console.error("Failed to load pipelines", error);
      setDataError("Не удалось загрузить пайплайны");
      setPipelines([]);
      setActivePipelineId("");
    } finally {
      setIsLoadingPipelines(false);
    }
  }, []);

  React.useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  React.useEffect(() => {
    if (activeProjectId) {
      void loadPipelines(activeProjectId);
    }
  }, [activeProjectId, loadPipelines]);

  React.useEffect(() => {
    setTriggerInput("");
  }, [activeProjectId, activePipelineId]);

  const handleBoardStatusChange = React.useCallback(
    (status: { isOffline: boolean; hasUnsavedChanges: boolean; lastError?: string | null }) => {
      setBoardStatus({
        isOffline: status.isOffline,
        hasUnsavedChanges: status.hasUnsavedChanges,
        lastError: status.lastError ?? null
      });
    },
    []
  );

  const handleSaveDraft = React.useCallback(async () => {
    setSaveFeedback(null);

    if (!activeProjectId || !activePipelineId) {
      setSaveFeedback({ type: "error", message: "Выберите проект и пайплайн" });
      return;
    }

    if (isLoadingProjects || isLoadingPipelines) {
      setSaveFeedback({ type: "error", message: "Подождите завершения загрузки данных" });
      return;
    }

    if (boardStatus.isOffline) {
      setSaveFeedback({
        type: "error",
        message: "Синхронизация недоступна — работаем в локальном режиме"
      });
      return;
    }

    try {
      await publishPipelineVersion(
        activeProjectId,
        activePipelineId,
        "Черновик сохранён из интерфейса"
      );
      setSaveFeedback({ type: "success", message: "Черновик сохранён" });
      setRefreshToken((prev) => prev + 1);
    } catch (error) {
      console.error("Failed to save draft", error);
      setSaveFeedback({ type: "error", message: "Не удалось сохранить черновик" });
    }
  }, [
    activePipelineId,
    activeProjectId,
    boardStatus.isOffline,
    isLoadingPipelines,
    isLoadingProjects
  ]);

  const handleRunPipeline = React.useCallback(async () => {
    setRunError(null);

    if (!activeProjectId || !activePipelineId) {
      setRunError("Выберите проект и пайплайн");
      return;
    }

    const prompt = triggerInput.trim();
    if (!prompt) {
      setRunError("Введите запрос для запуска пайплайна");
      return;
    }

    if (boardStatus.isOffline) {
      setRunError("Пайплайн работает в офлайн-режиме. Синхронизируйте изменения");
      return;
    }

    setIsRunning(true);
    setRunResult(null);
    try {
      const response = await executePipeline(
        activeProjectId,
        activePipelineId,
        MODE_API_MAP[environmentMode],
        prompt
      );
      setRunResult(response);
    } catch (error) {
      console.error("Failed to execute pipeline", error);
      const apiError = error as { status?: number; message?: string };
      const fallbackMessage = apiError.status === 404
        ? "Опубликуйте пайплайн или добавьте узлы"
        : apiError.message ?? "Не удалось запустить пайплайн";
      setRunError(fallbackMessage);
    } finally {
      setIsRunning(false);
    }
  }, [
    activePipelineId,
    activeProjectId,
    boardStatus.isOffline,
    environmentMode,
    triggerInput
  ]);

  return (
    <div className="App flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border/60 px-6 py-4 backdrop-blur">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            BrAIniac
          </p>
          <h1 className="text-2xl font-semibold">AI Agent Lab</h1>
          <p className="text-sm text-muted-foreground">
            Настройте пайплайн агента, перетаскивая ноды и соединяя их.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="rounded-full"
              disabled={
                !activePipelineId ||
                boardStatus.isOffline ||
                isLoadingProjects ||
                isLoadingPipelines
              }
              onClick={handleSaveDraft}
            >
              Сохранить черновик
            </Button>
            <Button
              className="rounded-full"
              disabled={
                !activePipelineId ||
                !triggerInput.trim() ||
                boardStatus.isOffline ||
                isLoadingProjects ||
                isLoadingPipelines ||
                isRunning
              }
              onClick={handleRunPipeline}
            >
              {isRunning ? "Запускаем..." : "Запустить пайплайн"}
            </Button>
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
          {saveFeedback && (
            <span
              className={`text-xs ${
                saveFeedback.type === "success" ? "text-emerald-300" : "text-red-300"
              }`}
            >
              {saveFeedback.message}
            </span>
          )}
          {dataError && (
            <span className="text-xs text-red-300">{dataError}</span>
          )}
          {boardStatus.lastError && (
            <span className="text-xs text-red-300">{boardStatus.lastError}</span>
          )}
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <SidebarProjects
          projects={projects}
          pipelines={pipelines}
          activeProjectId={activeProjectId}
          activePipelineId={activePipelineId}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          onSelectProject={handleSelectProject}
          onSelectPipeline={handleSelectPipeline}
          onCreateProject={handleCreateProject}
          onDeleteProject={handleDeleteProject}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 gap-4 overflow-hidden px-6 py-6">
            <CanvasBoard
              projectId={activeProjectId}
              pipelineId={activePipelineId}
              mode={environmentMode}
              refreshToken={refreshToken}
              onStatusChange={handleBoardStatusChange}
            />
            <div className="flex w-[340px] flex-col gap-4">
              <NodeLibrary />
              <PipelineRunner
                triggerInput={triggerInput}
                onTriggerInputChange={setTriggerInput}
                onRun={handleRunPipeline}
                isRunning={isRunning}
                isDisabled={
                  !activePipelineId ||
                  boardStatus.isOffline ||
                  isLoadingProjects ||
                  isLoadingPipelines ||
                  !triggerInput.trim()
                }
                result={runResult}
                error={runError}
              />
            </div>
          </div>

          <footer className="flex items-center justify-between border-t border-border/60 px-6 py-4 backdrop-blur">
            <EnvironmentModeSwitch
              value={environmentMode}
              onChange={setEnvironmentMode}
            />
            <div className="text-xs text-muted-foreground">
              Статус: {environmentMode === "test"
                ? "используем моки"
                : environmentMode === "hybrid"
                ? "частично реальные данные"
                : "реальный режим"}
            </div>
          </footer>
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