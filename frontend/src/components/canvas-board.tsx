import React from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionLineType,
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

import "reactflow/dist/style.css";

import {
  createEdge,
  createNode,
  deleteEdge,
  deleteNode,
  listEdges,
  listNodes,
  readNodeLabel,
  readNodePosition,
  type EdgeRecord,
  type NodeRecord,
  type NodeTypeRecord,
  updateNode
} from "../lib/api";
import { getNodeTypeRole, getNodeTypeUiLabel, normalizeNodeTypeName } from "../lib/node-catalog";
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

type DraggedNodePayload = {
  typeId: number;
  typeName: string;
  label: string;
};

type GraphState = {
  nodes: NodeRecord[];
  edges: EdgeRecord[];
};

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

function toFlowNode(node: NodeRecord, nodeType: NodeTypeRecord | undefined): Node<CanvasNodeData> {
  const position = readNodePosition(node);
  const role = nodeType ? getNodeTypeRole(nodeType) : "transform";

  return {
    id: String(node.node_id),
    type: "runtimeNode",
    position,
    data: {
      label: readNodeLabel(node),
      nodeTypeName: nodeType ? normalizeNodeTypeName(nodeType.name) : `NodeType ${node.fk_type_id}`,
      role,
      status: getExecutionStatus(node),
      isIncomplete: isNodeIncomplete(node, nodeType),
      description: nodeType?.desc ?? undefined
    }
  };
}

function toFlowEdge(edge: EdgeRecord): Edge {
  return {
    id: String(edge.edge_id),
    source: String(edge.fk_from_node),
    target: String(edge.fk_to_node),
    type: "smoothstep",
    animated: true,
    style: { ...defaultEdgeStyle },
    markerEnd: { ...defaultMarker }
  };
}

export interface CanvasBoardProps {
  pipelineId: number | null;
  nodeTypes: NodeTypeRecord[];
  className?: string;
  onGraphChange?: (state: GraphState) => void;
  onError?: (message: string | null) => void;
}

export function CanvasBoard({
  pipelineId,
  nodeTypes: nodeTypesCatalog,
  className,
  onGraphChange,
  onError
}: CanvasBoardProps): React.ReactElement {
  const [nodes, setNodes] = React.useState<Array<Node<CanvasNodeData>>>([]);
  const [edges, setEdges] = React.useState<Edge[]>([]);
  const [backendNodes, setBackendNodes] = React.useState<NodeRecord[]>([]);
  const [backendEdges, setBackendEdges] = React.useState<EdgeRecord[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [emptyStateMessage, setEmptyStateMessage] = React.useState<string | null>(null);
  const reactFlowWrapper = React.useRef<HTMLDivElement | null>(null);
  const reactFlowInstance = React.useRef<ReactFlowInstance<CanvasNodeData> | null>(null);

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
      setBackendEdges(nextEdges);
      setNodes(nextNodes.map((node) => toFlowNode(node, nodeTypeMap.get(node.fk_type_id))));
      setEdges(nextEdges.map(toFlowEdge));
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
  }, [emitGraphChange, nodeTypeMap, onError, pipelineId]);

  React.useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  const updateNodeCache = React.useCallback(
    (nextNodes: NodeRecord[]) => {
      setBackendNodes(nextNodes);
      setNodes(nextNodes.map((node) => toFlowNode(node, nodeTypeMap.get(node.fk_type_id))));
      emitGraphChange(nextNodes, backendEdges);
    },
    [backendEdges, emitGraphChange, nodeTypeMap]
  );

  const updateEdgeCache = React.useCallback(
    (nextEdges: EdgeRecord[]) => {
      setBackendEdges(nextEdges);
      setEdges(nextEdges.map(toFlowEdge));
      emitGraphChange(backendNodes, nextEdges);
    },
    [backendNodes, emitGraphChange]
  );

  const handleNodesChange = React.useCallback(
    (changes: NodeChange[]) => {
      setNodes((current) => applyNodeChanges(changes, current));

      const finishedMoves = changes.filter(
        (change): change is NodePositionChange => change.type === "position" && !change.dragging
      );

      for (const change of finishedMoves) {
        const nodeId = Number(change.id);
        const existing = backendNodes.find((node) => node.node_id === nodeId);
        if (!existing || !change.position) continue;

        const nextUiJson = {
          ...existing.ui_json,
          x: change.position.x,
          y: change.position.y
        };

        const nextNodes = backendNodes.map((node) =>
          node.node_id === nodeId ? { ...node, ui_json: nextUiJson } : node
        );
        setBackendNodes(nextNodes);
        emitGraphChange(nextNodes, backendEdges);

        void updateNode(nodeId, {
          top_k: existing.top_k,
          ui_json: nextUiJson
        }).catch((error) => {
          console.error("Failed to update node position", error);
          onError?.("Не удалось сохранить позицию узла.");
        });
      }
    },
    [backendEdges, backendNodes, emitGraphChange, onError]
  );

  const handleEdgesChange = React.useCallback((changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const handleConnect = React.useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      void createEdge({
        fk_from_node: Number(connection.source),
        fk_to_node: Number(connection.target)
      })
        .then((edge) => {
          const nextEdges = [...backendEdges, edge];
          updateEdgeCache(nextEdges);
          setFetchError(null);
          onError?.(null);
        })
        .catch((error) => {
          console.error("Failed to create edge", error);
          const message = "Не удалось создать связь.";
          setFetchError(message);
          onError?.(message);
        });
    },
    [backendEdges, onError, updateEdgeCache]
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
          const nextNodes = [...backendNodes, created];
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
    [backendNodes, nodeTypeMap, onError, pipelineId, updateNodeCache]
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
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onInit={setInstance}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          snapToGrid
          snapGrid={[16, 16]}
          defaultEdgeOptions={{
            type: "smoothstep",
            animated: true,
            style: { ...defaultEdgeStyle },
            markerEnd: { ...defaultMarker }
          }}
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
        <div className="pointer-events-none absolute inset-x-6 bottom-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {fetchError}
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
