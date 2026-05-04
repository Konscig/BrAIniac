import {
  apiRequest,
  AUTH_EXPIRED_MESSAGE,
  AUTH_REFRESHED_EVENT,
  buildQuestionInput,
  completeVscodeAuth,
  isExecutionTerminal,
  type NodeRecord,
  type NodeTypeRecord,
  type ToolRecord
} from "./lib/api";
import { act, render, screen, waitFor } from "@testing-library/react";
import { buildNodeConfigPatch } from "./lib/node-config";
import { getNodeRoleVisual } from "./lib/node-roles";
import { getVisibleNodeTypeCatalog, getVisibleToolCatalog, getNodeTypeUiLabel, getNodeTypeUiTagline } from "./lib/node-catalog";
import { toReadableError } from "./lib/readable-errors";
import { completeVscodeAuthState, readVscodeAuthState, shouldRenderAuthPage } from "./lib/vscode-auth";
import { AuthProvider, useAuth } from "./providers/AuthProvider";

const makeNodeType = (type_id: number, name: string): NodeTypeRecord => ({
  type_id,
  fk_tool_id: 1,
  name,
  desc: name,
  config_json: { role: "transform" }
});

const makeTool = (tool_id: number, name: string, config_json: ToolRecord["config_json"] = {}): ToolRecord => ({
  tool_id,
  name,
  config_json
});

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
  json: async () => body
}) as Response;

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

test("reads VS Code auth state from the frontend auth URL", () => {
  expect(readVscodeAuthState("?vscode_state=vscode-state-123")).toBe("vscode-state-123");
  expect(readVscodeAuthState("?other=value")).toBeNull();
  expect(shouldRenderAuthPage(false, "")).toBe(true);
  expect(shouldRenderAuthPage(true, "")).toBe(false);
  expect(shouldRenderAuthPage(true, "?vscode_state=vscode-state-123")).toBe(true);
});

test("completes VS Code auth with the issued BrAIniac access token", async () => {
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
    jsonResponse({ status: "authorized", expiresAt: "2026-04-30T12:00:00.000Z" })
  );

  await completeVscodeAuth("vscode-state-123", "browser-token");

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe("/auth/vscode/complete");
  expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
    Authorization: "Bearer browser-token"
  });
  expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({ state: "vscode-state-123" }));
});

test("allows web login to continue when VS Code completion fails", async () => {
  const onError = jest.fn();
  const completed = await completeVscodeAuthState(
    "vscode-state-456",
    "browser-token",
    async () => {
      throw new Error("completion failed");
    },
    onError
  );

  expect(completed).toBe(false);
  expect(onError).toHaveBeenCalledTimes(1);
});

function AuthStateProbe() {
  const { authNotice, authStatus, isAuthenticated, tokens } = useAuth();
  return (
    <div>
      <span data-testid="auth-state">{isAuthenticated ? "authenticated" : "guest"}</span>
      <span data-testid="auth-status">{authStatus}</span>
      <span data-testid="refresh-token-state">{tokens && "refreshToken" in tokens ? "has-refresh" : "no-refresh"}</span>
      {authNotice && <span>{authNotice}</span>}
    </div>
  );
}

test("clears stale browser tokens and exposes session-expired state on invalid protected token", async () => {
  localStorage.setItem("brainiac.tokens", JSON.stringify({ accessToken: "stale-token" }));
  jest.spyOn(global, "fetch").mockResolvedValue(
    jsonResponse({ ok: false, code: "UNAUTHORIZED", message: "invalid token" }, 401)
  );

  render(
    <AuthProvider>
      <AuthStateProbe />
    </AuthProvider>
  );

  expect(screen.getByTestId("auth-state")).toHaveTextContent("authenticated");
  let requestError: unknown;
  await act(async () => {
    try {
      await apiRequest("/projects");
    } catch (error) {
      requestError = error;
    }
  });

  expect(requestError).toMatchObject({ message: AUTH_EXPIRED_MESSAGE });
  await waitFor(() => expect(localStorage.getItem("brainiac.tokens")).toBeNull());
  expect(screen.getByTestId("auth-state")).toHaveTextContent("guest");
  expect(await screen.findByText(AUTH_EXPIRED_MESSAGE)).toBeInTheDocument();
});

test("updates browser auth state after web refresh without storing refresh token", async () => {
  localStorage.setItem("brainiac.tokens", JSON.stringify({ accessToken: "stale-token", refreshToken: "old-refresh" }));

  render(
    <AuthProvider>
      <AuthStateProbe />
    </AuthProvider>
  );

  expect(screen.getByTestId("auth-state")).toHaveTextContent("authenticated");
  expect(screen.getByTestId("refresh-token-state")).toHaveTextContent("no-refresh");

  act(() => {
    window.dispatchEvent(new CustomEvent(AUTH_REFRESHED_EVENT, { detail: { accessToken: "fresh-token", refreshToken: "ignored" } }));
  });

  await waitFor(() => expect(localStorage.getItem("brainiac.tokens")).toBe(JSON.stringify({ accessToken: "fresh-token" })));
  expect(screen.getByTestId("auth-status")).toHaveTextContent("signed_in");
  expect(screen.getByTestId("refresh-token-state")).toHaveTextContent("no-refresh");
});

test("builds canonical question input for pipeline execution", () => {
  expect(buildQuestionInput("What is RAG?")).toEqual({
    question: "What is RAG?",
    user_query: "What is RAG?"
  });
});

test("detects terminal execution statuses", () => {
  expect(isExecutionTerminal("succeeded")).toBe(true);
  expect(isExecutionTerminal("failed")).toBe(true);
  expect(isExecutionTerminal("queued")).toBe(false);
  expect(isExecutionTerminal("running")).toBe(false);
});

test("keeps frontend catalog scoped to implemented runtime nodes", () => {
  const visible = getVisibleNodeTypeCatalog([
    makeNodeType(1, "ManualInput"),
    makeNodeType(2, "ToolNode"),
    makeNodeType(3, "AgentCall"),
    makeNodeType(4, "DatasetInput"),
    makeNodeType(5, "LoopGate")
  ]);

  expect(visible.map((nodeType) => nodeType.name)).toEqual(["ManualInput", "AgentCall", "ToolNode"]);
  expect(getNodeTypeUiLabel(visible[0])).toBe("Вопрос пользователя");
  expect(getNodeTypeUiTagline(visible[2])).toBe("Объявляет инструмент для агента или исполняет его как шаг.");
});

test("keeps tool picker scoped to builtin contract tools", () => {
  const visible = getVisibleToolCatalog([
    makeTool(1, "it-tool-1777050203306"),
    makeTool(2, "mvp-core-nodes", { family: "builtin", catalog: "mvp-node-catalog" }),
    makeTool(3, "DocumentLoader", { family: "builtin-contract", catalog: "mvp-tool-contracts" }),
    makeTool(4, "HybridRetriever", { family: "builtin-contract", catalog: "mvp-tool-contracts" }),
    makeTool(5, "custom-tool", { family: "custom", catalog: "user-tools" })
  ]);

  expect(visible.map((tool) => tool.name)).toEqual(["DocumentLoader", "HybridRetriever"]);
});

test("maps node roles to distinct palette labels", () => {
  expect(getNodeRoleVisual("source").label).toBe("вход");
  expect(getNodeRoleVisual("transform").label).toBe("обработка");
  expect(getNodeRoleVisual("control").label).toBe("ветвление");
  expect(getNodeRoleVisual("sink").label).toBe("выход");
});

test("builds AgentCall node config patch under ui_json.agent", () => {
  const node: NodeRecord = {
    node_id: 10,
    fk_pipeline_id: 20,
    fk_type_id: 30,
    fk_sub_pipeline: null,
    top_k: 1,
    ui_json: { x: 1, y: 2, label: "Агент" }
  };

  expect(
    buildNodeConfigPatch(node, "AgentCall", {
      modelId: "openai/gpt-4o-mini",
      systemPrompt: "Answer briefly.",
      maxToolCalls: "4",
      temperature: "0.2"
    })
  ).toEqual({
    ui_json: {
      x: 1,
      y: 2,
      label: "Агент",
      agent: {
        modelId: "openai/gpt-4o-mini",
        systemPrompt: "Answer briefly.",
        maxToolCalls: 4,
        temperature: 0.2
      }
    }
  });
});

test("formats common execution errors for users", () => {
  expect(toReadableError(new Error("invalid token")).title).toBe("Проблема с токеном");
  expect(toReadableError(new Error("HTTP 429 rate limit")).title).toBe("Лимит провайдера");
});
