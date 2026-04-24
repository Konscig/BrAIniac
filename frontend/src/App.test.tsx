import { buildQuestionInput, isExecutionTerminal, type NodeRecord, type NodeTypeRecord } from "./lib/api";
import { buildNodeConfigPatch } from "./lib/node-config";
import { getNodeRoleVisual } from "./lib/node-roles";
import { getVisibleNodeTypeCatalog, getNodeTypeUiLabel, getNodeTypeUiTagline } from "./lib/node-catalog";
import { toReadableError } from "./lib/readable-errors";

const makeNodeType = (type_id: number, name: string): NodeTypeRecord => ({
  type_id,
  fk_tool_id: 1,
  name,
  desc: name,
  config_json: { role: "transform" }
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
