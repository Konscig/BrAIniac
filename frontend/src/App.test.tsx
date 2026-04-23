import { buildQuestionInput, isExecutionTerminal, type NodeTypeRecord } from "./lib/api";
import { getVisibleNodeTypeCatalog, getNodeTypeUiLabel } from "./lib/node-catalog";

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
});
