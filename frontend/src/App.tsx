import React from "react";
import { Route, Routes } from "react-router-dom";

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
import { AuthPage } from "./pages/auth-page";

function MainPage(): React.ReactElement {
  const [activeProjectId, setActiveProjectId] = React.useState<string>(
    mockProjects[0]?.id ?? ""
  );
  const [environmentMode, setEnvironmentMode] = React.useState<EnvironmentMode>(
    "test"
  );
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

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
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="rounded-full">
            Сохранить черновик
          </Button>
          <Button className="rounded-full">Запустить пайплайн</Button>
          <ModeToggle />
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <SidebarProjects
          activeProjectId={activeProjectId}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          onSelectProject={setActiveProjectId}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 gap-4 overflow-hidden px-6 py-6">
            <CanvasBoard />
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

function App(): React.ReactElement {
  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/auth" element={<AuthPage />} />
    </Routes>
  );
}

export default App;