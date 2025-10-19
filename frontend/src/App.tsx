import React from "react";
import { LogOut } from "lucide-react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import "./App.css";

import { AgentChatDock } from "./components/agent-chat-dock";
import { CanvasBoard } from "./components/canvas-board";
import {
  EnvironmentModeSwitch,
  type EnvironmentMode
} from "./components/environment-mode-switch";
import { ModeToggle } from "./components/mode-toggle";
import { NodeLibrary } from "./components/node-library";
import { SidebarProjects } from "./components/sidebar-projects";
import { Button } from "./components/ui/button";
import { mockProjects } from "./data/mock-data";
import { publishPipelineVersion } from "./lib/api";
import { AuthPage } from "./pages/auth-page";
import { useAuth } from "./providers/AuthProvider";

function MainPage(): React.ReactElement {
  const [activeProjectId, setActiveProjectId] = React.useState<string>(
    mockProjects[0]?.id ?? ""
  );
  const [activePipelineId, setActivePipelineId] = React.useState<string>(
    mockProjects[0]?.pipelines[0]?.id ?? ""
  );
  const [environmentMode, setEnvironmentMode] = React.useState<EnvironmentMode>(
    "test"
  );
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [refreshToken, setRefreshToken] = React.useState(0);
  const [boardStatus, setBoardStatus] = React.useState({
    isOffline: false,
    hasUnsavedChanges: false
  });
  const [saveFeedback, setSaveFeedback] = React.useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const navigate = useNavigate();
  const { clearSession } = useAuth();

  const handleLogout = React.useCallback(() => {
    clearSession();
    navigate("/auth", { replace: true });
  }, [clearSession, navigate]);

  React.useEffect(() => {
    const project = mockProjects.find((p) => p.id === activeProjectId);
    if (!project) {
      setActivePipelineId("");
      return;
    }

    const belongsToProject = project.pipelines.some((pipeline) => pipeline.id === activePipelineId);
    if (!belongsToProject) {
      setActivePipelineId(project.pipelines[0]?.id ?? "");
    }
  }, [activePipelineId, activeProjectId]);

  const handleBoardStatusChange = React.useCallback(
    (status: { isOffline: boolean; hasUnsavedChanges: boolean }) => {
      setBoardStatus({
        isOffline: status.isOffline,
        hasUnsavedChanges: status.hasUnsavedChanges
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
  }, [activePipelineId, activeProjectId, boardStatus.isOffline]);

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
              disabled={!activePipelineId || boardStatus.isOffline}
              onClick={handleSaveDraft}
            >
              Сохранить черновик
            </Button>
            <Button className="rounded-full">Запустить пайплайн</Button>
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
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <SidebarProjects
          activeProjectId={activeProjectId}
          activePipelineId={activePipelineId}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          onSelectProject={setActiveProjectId}
          onSelectPipeline={setActivePipelineId}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 gap-4 overflow-hidden px-6 py-6">
            <CanvasBoard
              projectId={activeProjectId}
              pipelineId={activePipelineId}
              mode={environmentMode}
              refreshToken={refreshToken}
            />
            <div className="flex w-[320px] flex-col gap-4">
              <NodeLibrary />
              <AgentChatDock />
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