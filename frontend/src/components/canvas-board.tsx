import React from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  MarkerType,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodePositionChange,
  type ReactFlowInstance
} from "reactflow";
import { Info } from "lucide-react";

import "reactflow/dist/style.css";

import {
  createEdge,
  createNode,
  deleteEdge,
  deleteNode,
  listEdges,
  listNodes,
  listTools,
  readNodeLabel,
  readNodePosition,
  type EdgeRecord,
  type NodeRecord,
  type NodeTypeRecord,
  type ToolRecord,
  updateNode
} from "../lib/api";
import {
  getNodeTypeRole,
  getNodeTypeTechnicalLabel,
  getNodeTypeUiLabel,
  getNodeTypeUiTagline,
  getToolUiLabel,
  normalizeNodeTypeName
} from "../lib/node-catalog";
import { cn } from "../lib/utils";
import { type CanvasNodeData, nodeTypes } from "./custom-nodes";
import { Card } from "./ui/card";

const defaultEdgeStyle = {
  stroke: "rgba(39, 135, 245, 0.75)",
  strokeWidth: 2
};

const defaultMarker = {
  type: MarkerType.ArrowClosed,
  width: 18,
  height: 18,
  color: "rgba(39, 135, 245, 0.85)"
} as const;

const capabilityMarker = {
  type: MarkerType.ArrowClosed,
  width: 16,
  height: 16,
  color: "rgba(245, 158, 11, 0.9)"
} as const;

type DraggedNodePayload = {
  typeId: number;
  typeName: string;
  label: string;
};

type GraphState = {
  nodes: NodeRecord[];
  edges: EdgeRecord[];
};

type NodeCallbacks = Pick<CanvasNodeData, "onManualQuestionCommit" | "onToolSelect">;

function readManualQuestion(node: NodeRecord): string {
  const manualInput = node.ui_json?.manualInput;
  const record =
    manualInput && typeof manualInput === "object" && !Array.isArray(manualInput)
      ? (manualInput as Record<string, unknown>)
      : null;
  const question = record?.question;
  return typeof question === "string" ? question : "";
}

function readSelectedToolId(node: NodeRecord): number | null {
  const tool = node.ui_json?.tool;
  const record = tool && typeof tool === "object" && !Array.isArray(tool) ? (tool as Record<string, unknown>) : null;
  const toolId = Number(record?.tool_id);
  return Number.isInteger(toolId) && toolId > 0 ? toolId : null;
}

function readSelectedToolName(node: NodeRecord): string {
  const tool = node.ui_json?.tool;
  const record = tool && typeof tool === "object" && !Array.isArray(tool) ? (tool as Record<string, unknown>) : null;
  return typeof record?.name === "string" ? record.name : "";
}

function toPreviewText(value: unknown, maxLength = 420): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    return value.length > maxLength ? `${value.slice(0, maxLength - 15)}...(truncated)` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidates = [
      record.text,
      record.answer,
      record.cited_answer,
      record.output_preview,
      record.preview,
      (record.contract_output as Record<string, unknown> | undefined)?.text,
      (record.contract_output as Record<string, unknown> | undefined)?.answer,
      (record.contract_output as Record<string, unknown> | undefined)?.cited_answer
    ];
    for (const candidate of candidates) {
      const text = toPreviewText(candidate, maxLength);
      if (text) return text;
    }
  }
  try {
    const text = JSON.stringify(value);
    return text.length > maxLength ? `${text.slice(0, maxLength - 15)}...(truncated)` : text;
  } catch {
    return "";
  }
}

function readFinalOutputPreview(node: NodeRecord, nodeTypeName: string): string | undefined {
  if (nodeTypeName !== "SaveResult") return undefined;
  const wrapper = node.output_json && typeof node.output_json === "object" ? (node.output_json as Record<string, unknown>) : null;
  const data = wrapper?.data;
  const preview = toPreviewText(data);
  return preview || undefined;
}

function readTracePreview(node: NodeRecord): string | undefined {
  const wrapper = node.output_json && typeof node.output_json === "object" ? (node.output_json as Record<string, unknown>) : null;
  const candidates = [wrapper?.error, wrapper?.node_error, wrapper?.trace, wrapper?.diagnostics];
  for (const candidate of candidates) {
    const preview = toPreviewText(candidate, 520);
    if (preview) return preview;
  }
  return undefined;
}

function getExecutionStatus(node: NodeRecord): CanvasNodeData["status"] {
  const wrapper = node.output_json && typeof node.output_json === "object" ? (node.output_json as Record<string, unknown>) : null;
  const raw = wrapper?.status;
  if (raw === "completed" || raw === "failed" || raw === "skipped" || raw === "running") {
    return raw;
  }
  return "idle";
}

function isNodeIncomplete(node: NodeRecord, nodeType: NodeTypeRecord | undefined): boolean {
  if (!nodeType) return false;
  if (normalizeNodeTypeName(nodeType.name) === "ToolNode") {
    const tool = node.ui_json?.tool;
    const toolRecord = tool && typeof tool === "object" && !Array.isArray(tool) ? (tool as Record<string, unknown>) : null;
    return !toolRecord || typeof toolRecord.name !== "string" || toolRecord.name.trim().length === 0;
  }
  return false;
}

function toFlowNode(
  node: NodeRecord,
  nodeType: NodeTypeRecord | undefined,
  tools: ToolRecord[],
  callbacks: NodeCallbacks
): Node<CanvasNodeData> {
  const position = readNodePosition(node);
  const role = nodeType ? getNodeTypeRole(nodeType) : "transform";
  const nodeTypeName = nodeType ? normalizeNodeTypeName(nodeType.name) : `NodeType ${node.fk_type_id}`;
  const selectedToolName = nodeTypeName === "ToolNode" ? readSelectedToolName(node) : "";
  const label =
    nodeTypeName === "ToolNode" && selectedToolName
      ? getToolUiLabel(selectedToolName)
      : nodeType
        ? getNodeTypeUiLabel(nodeType)
        : readNodeLabel(node);

  return {
    id: String(node.node_id),
    type: "runtimeNode",
    position,
    data: {
      nodeId: node.node_id,
      label,
      nodeTypeName,
      technicalLabel: getNodeTypeTechnicalLabel(nodeTypeName),
      role,
      status: getExecutionStatus(node),
      isIncomplete: isNodeIncomplete(node, nodeType),
      description: nodeType ? getNodeTypeUiTagline(nodeType) : undefined,
      manualQuestion: nodeTypeName === "ManualInput" ? readManualQuestion(node) : undefined,
      selectedToolId: nodeTypeName === "ToolNode" ? readSelectedToolId(node) : undefined,
      selectedToolLabel: selectedToolName ? getToolUiLabel(selectedToolName) : undefined,
      finalOutputPreview: readFinalOutputPreview(node, nodeTypeName),
      tracePreview: readTracePreview(node),
      tools,
      ...callbacks
    }
  };
}

function isCapabilityEdge(
  edge: EdgeRecord,
  backendNodes: NodeRecord[],
  nodeTypeMap: Map<number, NodeTypeRecord>
): boolean {
  const fromNode = backendNodes.find((node) => node.node_id === edge.fk_from_node);
  const toNode = backendNodes.find((node) => node.node_id === edge.fk_to_node);
  if (!fromNode || !toNode) return false;
  const fromType = nodeTypeMap.get(fromNode.fk_type_id);
  const toType = nodeTypeMap.get(toNode.fk_type_id);
  return normalizeNodeTypeName(fromType?.name ?? "") === "ToolNode" && normalizeNodeTypeName(toType?.name ?? "") === "AgentCall";
}

function getNodeTypeName(node: NodeRecord | undefined, nodeTypeMap: Map<number, NodeTypeRecord>): string {
  if (!node) return "";
  return normalizeNodeTypeName(nodeTypeMap.get(node.fk_type_id)?.name ?? "");
}

function isCapabilityConnectionHandle(handleId: string | null | undefined): boolean {
  return Boolean(handleId?.startsWith("capability-"));
}

function isToolAgentConnection(sourceType: string, targetType: string): boolean {
  return (
    (sourceType === "ToolNode" && targetType === "AgentCall") ||
    (sourceType === "AgentCall" && targetType === "ToolNode")
  );
}

function resolveCapabilityHandles(
  edge: EdgeRecord,
  backendNodes: NodeRecord[]
): { sourceHandle: string; targetHandle: string } {
  const fromNode = backendNodes.find((node) => node.node_id === edge.fk_from_node);
  const toNode = backendNodes.find((node) => node.node_id === edge.fk_to_node);
  const fromPosition = fromNode ? readNodePosition(fromNode) : { x: 0, y: 0 };
  const toPosition = toNode ? readNodePosition(toNode) : { x: 0, y: 0 };
  const toolBelowAgent = fromPosition.y >= toPosition.y;

  return {
    sourceHandle: toolBelowAgent ? "capability-target-top" : "capability-target-bottom",
    targetHandle: toolBelowAgent ? "capability-target-bottom" : "capability-target-top"
  };
}

function toFlowEdge(edge: EdgeRecord, backendNodes: NodeRecord[], nodeTypeMap: Map<number, NodeTypeRecord>): Edge {
  const capability = isCapabilityEdge(edge, backendNodes, nodeTypeMap);
  const capabilityHandles = capability ? resolveCapabilityHandles(edge, backendNodes) : null;
  return {
    id: String(edge.edge_id),
    source: String(edge.fk_from_node),
    target: String(edge.fk_to_node),
    sourceHandle: capability ? capabilityHandles?.sourceHandle : "flow-out",
    targetHandle: capability ? capabilityHandles?.targetHandle : "flow-in",
    type: "smoothstep",
    animated: false,
    style: {
      ...defaultEdgeStyle,
      ...(capability ? { stroke: "rgba(245, 158, 11, 0.82)", strokeDasharray: "5 5", strokeWidth: 2 } : {})
    },
    markerStart: capability ? { ...capabilityMarker } : undefined,
    markerEnd: capability ? { ...capabilityMarker } : { ...defaultMarker }
  };
}

export interface CanvasBoardProps {
  pipelineId: number | null;
  nodeTypes: NodeTypeRecord[];
  refreshToken?: number;
  className?: string;
  onGraphChange?: (state: GraphState) => void;
  onError?: (message: string | null) => void;
}

export function CanvasBoard({
  pipelineId,
  nodeTypes: nodeTypesCatalog,
  refreshToken = 0,
  className,
  onGraphChange,
  onError
}: CanvasBoardProps): React.ReactElement {
  const [nodes, setNodes] = React.useState<Array<Node<CanvasNodeData>>>([]);
  const [edges, setEdges] = React.useState<Edge[]>([]);
  const [backendNodes, setBackendNodes] = React.useState<NodeRecord[]>([]);
  const [backendEdges, setBackendEdges] = React.useState<EdgeRecord[]>([]);
  const [tools, setTools] = React.useState<ToolRecord[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [emptyStateMessage, setEmptyStateMessage] = React.useState<string | null>(null);
  const reactFlowWrapper = React.useRef<HTMLDivElement | null>(null);
  const reactFlowInstance = React.useRef<ReactFlowInstance<CanvasNodeData> | null>(null);
  const backendNodesRef = React.useRef<NodeRecord[]>([]);
  const backendEdgesRef = React.useRef<EdgeRecord[]>([]);

  const nodeTypeMap = React.useMemo(
    () => new Map(nodeTypesCatalog.map((nodeType) => [nodeType.type_id, nodeType])),
    [nodeTypesCatalog]
  );

  const emitGraphChange = React.useCallback(
    (nextNodes: NodeRecord[], nextEdges: EdgeRecord[]) => {
      onGraphChange?.({ nodes: nextNodes, edges: nextEdges });
    },
    [onGraphChange]
  );
  const nodeCallbacksRef = React.useRef<NodeCallbacks>({});

  const showCanvasNotice = React.useCallback((message: string) => {
    setFetchError(message);
  }, []);

  React.useEffect(() => {
    backendNodesRef.current = backendNodes;
  }, [backendNodes]);

  React.useEffect(() => {
    backendEdgesRef.current = backendEdges;
  }, [backendEdges]);

  const updateBackendNode = React.useCallback(
    (nodeId: number, updater: (node: NodeRecord) => NodeRecord) => {
      setBackendNodes((currentNodes) => {
        const existing = currentNodes.find((node) => node.node_id === nodeId);
        if (!existing) return currentNodes;
        const updated = updater(existing);
        const nextNodes = currentNodes.map((node) => (node.node_id === nodeId ? updated : node));
        setNodes(nextNodes.map((node) => toFlowNode(node, nodeTypeMap.get(node.fk_type_id), tools, nodeCallbacksRef.current)));
        setEdges(backendEdgesRef.current.map((edge) => toFlowEdge(edge, nextNodes, nodeTypeMap)));
        emitGraphChange(nextNodes, backendEdgesRef.current);

        void updateNode(nodeId, {
          top_k: updated.top_k,
          ui_json: updated.ui_json
        }).catch((error) => {
          console.error("Failed to update node", error);
          onError?.("Не удалось сохранить настройки узла.");
        });

        return nextNodes;
      });
    },
    [emitGraphChange, nodeTypeMap, onError, tools]
  );

  const handleManualQuestionCommit = React.useCallback(
    (nodeId: number, question: string) => {
      updateBackendNode(nodeId, (node) => ({
        ...node,
        ui_json: {
          ...node.ui_json,
          manualInput: {
            ...((node.ui_json.manualInput && typeof node.ui_json.manualInput === "object" && !Array.isArray(node.ui_json.manualInput)
              ? (node.ui_json.manualInput as Record<string, unknown>)
              : {})),
            question
          }
        }
      }));
    },
    [updateBackendNode]
  );

  const handleToolSelect = React.useCallback(
    (nodeId: number, toolId: number | null) => {
      const selectedTool = toolId ? tools.find((tool) => tool.tool_id === toolId) : null;
      updateBackendNode(nodeId, (node) => {
        const nextUiJson = { ...node.ui_json };
        if (selectedTool) {
          nextUiJson.tool = {
            tool_id: selectedTool.tool_id,
            name: selectedTool.name,
            config_json: selectedTool.config_json
          };
          nextUiJson.label = getToolUiLabel(selectedTool.name);
        } else {
          delete nextUiJson.tool;
        }
        return {
          ...node,
          ui_json: nextUiJson
        };
      });
    },
    [tools, updateBackendNode]
  );

  const nodeCallbacks = React.useMemo<NodeCallbacks>(
    () => ({
      onManualQuestionCommit: handleManualQuestionCommit,
      onToolSelect: handleToolSelect
    }),
    [handleManualQuestionCommit, handleToolSelect]
  );

  React.useEffect(() => {
    nodeCallbacksRef.current = nodeCallbacks;
  }, [nodeCallbacks]);

  React.useEffect(() => {
    void listTools()
      .then((nextTools) => {
        setTools(nextTools);
      })
      .catch((error) => {
        console.error("Failed to load tools", error);
        onError?.("Не удалось загрузить каталог инструментов.");
      });
  }, [onError]);

  const loadGraph = React.useCallback(async () => {
    if (!pipelineId) {
      setNodes([]);
      setEdges([]);
      setBackendNodes([]);
      setBackendEdges([]);
      setFetchError(null);
      setEmptyStateMessage("Выберите агента, чтобы начать собирать схему.");
      emitGraphChange([], []);
      return;
    }

    setIsLoading(true);
    setFetchError(null);
    onError?.(null);

    try {
      const [nextNodes, nextEdges] = await Promise.all([listNodes(pipelineId), listEdges(pipelineId)]);
      setBackendNodes(nextNodes);
      backendNodesRef.current = nextNodes;
      setBackendEdges(nextEdges);
      backendEdgesRef.current = nextEdges;
      setNodes(nextNodes.map((node) => toFlowNode(node, nodeTypeMap.get(node.fk_type_id), tools, nodeCallbacksRef.current)));
      setEdges(nextEdges.map((edge) => toFlowEdge(edge, nextNodes, nodeTypeMap)));
      setEmptyStateMessage(nextNodes.length === 0 ? "Перетащите узел из библиотеки, чтобы начать собирать схему." : null);
      emitGraphChange(nextNodes, nextEdges);
    } catch (error) {
      console.error("Failed to load pipeline graph", error);
      const message = "Не удалось загрузить схему агента.";
      setFetchError(message);
      setEmptyStateMessage(null);
      onError?.(message);
    } finally {
      setIsLoading(false);
    }
  }, [emitGraphChange, nodeTypeMap, onError, pipelineId, tools]);

  React.useEffect(() => {
    void loadGraph();
  }, [loadGraph, refreshToken]);

  const updateNodeCache = React.useCallback(
    (nextNodes: NodeRecord[]) => {
      setBackendNodes(nextNodes);
      backendNodesRef.current = nextNodes;
      setNodes(nextNodes.map((node) => toFlowNode(node, nodeTypeMap.get(node.fk_type_id), tools, nodeCallbacksRef.current)));
      emitGraphChange(nextNodes, backendEdges);
    },
    [backendEdges, emitGraphChange, nodeTypeMap, tools]
  );

  const updateEdgeCache = React.useCallback(
    (nextEdges: EdgeRecord[]) => {
      setBackendEdges(nextEdges);
      backendEdgesRef.current = nextEdges;
      setEdges(nextEdges.map((edge) => toFlowEdge(edge, backendNodes, nodeTypeMap)));
      emitGraphChange(backendNodes, nextEdges);
    },
    [backendNodes, emitGraphChange, nodeTypeMap]
  );

  const handleNodesChange = React.useCallback(
    (changes: NodeChange[]) => {
      const finishedMoves = changes.filter(
        (change): change is NodePositionChange => change.type === "position" && !change.dragging
      );

      setNodes((current) => {
        const nextFlowNodes = applyNodeChanges(changes, current);
        if (finishedMoves.length === 0) return nextFlowNodes;

        const movedPositions = new Map<number, { x: number; y: number }>();
        for (const change of finishedMoves) {
          const nodeId = Number(change.id);
          const movedNode = nextFlowNodes.find((node) => Number(node.id) === nodeId);
          if (!movedNode) continue;
          movedPositions.set(nodeId, movedNode.position);
        }

        if (movedPositions.size === 0) return nextFlowNodes;

        setBackendNodes((currentNodes) => {
          const nextBackendNodes = currentNodes.map((node) => {
            const position = movedPositions.get(node.node_id);
            if (!position) return node;
            return {
              ...node,
              ui_json: {
                ...node.ui_json,
                x: position.x,
                y: position.y
              }
            };
          });
          backendNodesRef.current = nextBackendNodes;
          setEdges(backendEdgesRef.current.map((edge) => toFlowEdge(edge, nextBackendNodes, nodeTypeMap)));
          emitGraphChange(nextBackendNodes, backendEdgesRef.current);

          for (const node of nextBackendNodes) {
            if (!movedPositions.has(node.node_id)) continue;
            void updateNode(node.node_id, {
              top_k: node.top_k,
              ui_json: node.ui_json
            }).catch((error) => {
              console.error("Failed to update node position", error);
              onError?.("Не удалось сохранить позицию узла.");
            });
          }

          return nextBackendNodes;
        });

        return nextFlowNodes;
      });
    },
    [emitGraphChange, nodeTypeMap, onError]
  );

  const handleEdgesChange = React.useCallback((changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const isValidCanvasConnection = React.useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) return false;

      const sourceNode = backendNodesRef.current.find((node) => node.node_id === Number(connection.source));
      const targetNode = backendNodesRef.current.find((node) => node.node_id === Number(connection.target));
      const sourceType = getNodeTypeName(sourceNode, nodeTypeMap);
      const targetType = getNodeTypeName(targetNode, nodeTypeMap);
      const usesCapabilityHandle =
        isCapabilityConnectionHandle(connection.sourceHandle) || isCapabilityConnectionHandle(connection.targetHandle);

      if (usesCapabilityHandle) {
        return isToolAgentConnection(sourceType, targetType);
      }

      return connection.sourceHandle === "flow-out" && connection.targetHandle === "flow-in";
    },
    [nodeTypeMap]
  );

  const handleConnect = React.useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const sourceId = Number(connection.source);
      const targetId = Number(connection.target);
      const sourceNode = backendNodesRef.current.find((node) => node.node_id === sourceId);
      const targetNode = backendNodesRef.current.find((node) => node.node_id === targetId);
      const sourceType = getNodeTypeName(sourceNode, nodeTypeMap);
      const targetType = getNodeTypeName(targetNode, nodeTypeMap);
      const isAgentToTool = sourceType === "AgentCall" && targetType === "ToolNode";
      const usesCapabilityHandle =
        isCapabilityConnectionHandle(connection.sourceHandle) || isCapabilityConnectionHandle(connection.targetHandle);

      if (usesCapabilityHandle && !isToolAgentConnection(sourceType, targetType)) {
        showCanvasNotice("Нельзя создать такую связь.");
        return;
      }

      const edgePayload = isAgentToTool
        ? { fk_from_node: targetId, fk_to_node: sourceId }
        : { fk_from_node: sourceId, fk_to_node: targetId };

      const alreadyExists = backendEdgesRef.current.some(
        (edge) => edge.fk_from_node === edgePayload.fk_from_node && edge.fk_to_node === edgePayload.fk_to_node
      );
      if (alreadyExists) {
        setFetchError(null);
        onError?.(null);
        return;
      }

      void createEdge(edgePayload)
        .then((edge) => {
          const nextEdges = [...backendEdgesRef.current, edge];
          updateEdgeCache(nextEdges);
          setFetchError(null);
          onError?.(null);
        })
        .catch((error) => {
          console.error("Failed to create edge", error);
          showCanvasNotice("Нельзя создать такую связь.");
        });
    },
    [nodeTypeMap, onError, showCanvasNotice, updateEdgeCache]
  );

  const handleNodesDelete = React.useCallback(
    (deletedNodes: Array<Node<CanvasNodeData>>) => {
      const deletedIds = new Set(deletedNodes.map((node) => Number(node.id)));
      const nextNodes = backendNodes.filter((node) => !deletedIds.has(node.node_id));
      const nextEdges = backendEdges.filter(
        (edge) => !deletedIds.has(edge.fk_from_node) && !deletedIds.has(edge.fk_to_node)
      );

      updateNodeCache(nextNodes);
      updateEdgeCache(nextEdges);

      for (const deletedNode of deletedNodes) {
        void deleteNode(Number(deletedNode.id)).catch((error) => {
          console.error("Failed to delete node", error);
          onError?.("Не удалось удалить узел.");
        });
      }
    },
    [backendEdges, backendNodes, onError, updateEdgeCache, updateNodeCache]
  );

  const handleEdgesDelete = React.useCallback(
    (deletedEdges: Edge[]) => {
      const deletedIds = new Set(deletedEdges.map((edge) => Number(edge.id)));
      const nextEdges = backendEdges.filter((edge) => !deletedIds.has(edge.edge_id));
      updateEdgeCache(nextEdges);

      for (const deletedEdge of deletedEdges) {
        void deleteEdge(Number(deletedEdge.id)).catch((error) => {
          console.error("Failed to delete edge", error);
          onError?.("Не удалось удалить связь.");
        });
      }
    },
    [backendEdges, onError, updateEdgeCache]
  );

  const handleDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!reactFlowInstance.current || !reactFlowWrapper.current || !pipelineId) return;

      const payloadRaw = event.dataTransfer.getData("application/brainiac-node-type");
      if (!payloadRaw) return;

      let payload: DraggedNodePayload;
      try {
        payload = JSON.parse(payloadRaw) as DraggedNodePayload;
      } catch {
        return;
      }

      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });
      const nodeType = nodeTypeMap.get(payload.typeId);
      const defaultLabel = nodeType ? getNodeTypeUiLabel(nodeType) : payload.label || payload.typeName;

      void createNode({
        fk_pipeline_id: pipelineId,
        fk_type_id: payload.typeId,
        top_k: 1,
        ui_json: {
          label: defaultLabel,
          x: position.x,
          y: position.y
        }
      })
        .then((created) => {
          const nextNodes = [...backendNodesRef.current, created];
          updateNodeCache(nextNodes);
          setEmptyStateMessage(null);
          setFetchError(null);
          onError?.(null);
        })
        .catch((error) => {
          console.error("Failed to create node", error);
          const message = "Не удалось создать узел.";
          setFetchError(message);
          onError?.(message);
        });
    },
    [nodeTypeMap, onError, pipelineId, updateNodeCache]
  );

  const handleDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const setInstance = React.useCallback((instance: ReactFlowInstance<CanvasNodeData>) => {
    reactFlowInstance.current = instance;
  }, []);

  return (
    <Card className={cn("relative flex-1 min-h-0 overflow-hidden border-border/60", className)}>
      <div ref={reactFlowWrapper} className="h-full w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onNodesDelete={handleNodesDelete}
          onEdgesDelete={handleEdgesDelete}
          isValidConnection={isValidCanvasConnection}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onInit={setInstance}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          snapToGrid
          snapGrid={[16, 16]}
          defaultEdgeOptions={{
            type: "smoothstep",
            animated: false,
            style: { ...defaultEdgeStyle },
            markerEnd: { ...defaultMarker }
          }}
          connectionMode={ConnectionMode.Loose}
          connectionLineType={ConnectionLineType.SmoothStep}
          className="bg-[radial-gradient(circle_at_center,_rgba(39,135,245,0.06),_transparent_40%)]"
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={1.6}
            color="rgba(148, 163, 184, 0.3)"
          />
          <Controls
            showInteractive={false}
            className="!border-none !bg-transparent !shadow-none"
            style={{ left: "50%", transform: "translateX(-50%)", bottom: 24 }}
          />
        </ReactFlow>
      </div>

      {isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70 text-sm text-muted-foreground">
          Загружаем схему...
        </div>
      )}

      {fetchError && !isLoading && (
        <div className="group pointer-events-auto absolute right-4 top-4 z-10 flex max-w-[320px] items-center gap-1.5 overflow-hidden rounded-full border border-red-400/45 bg-red-500/10 px-2 py-1 text-red-100 shadow-sm backdrop-blur">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-100">
            <Info className="h-3.5 w-3.5" />
          </span>
          <span className="max-w-0 whitespace-nowrap text-[11px] leading-4 opacity-0 transition-all duration-200 group-hover:max-w-[280px] group-hover:opacity-100">
            {fetchError}
          </span>
        </div>
      )}

      {emptyStateMessage && !isLoading && !fetchError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-10 text-center text-sm text-muted-foreground">
          {emptyStateMessage}
        </div>
      )}

      <div className="pointer-events-none absolute left-4 bottom-4 max-w-sm rounded-lg bg-background/85 px-3 py-2 text-xs text-muted-foreground shadow-sm">
        Перетаскивайте узлы из библиотеки и соединяйте их стрелками.
      </div>
    </Card>
  );
}
