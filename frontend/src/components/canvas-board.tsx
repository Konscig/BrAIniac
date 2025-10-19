import React from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MarkerType,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance
} from "reactflow";

import "reactflow/dist/style.css";

import { Card } from "./ui/card";
import { nodeTypes, type VkNodeData } from "./custom-nodes";
import { mockProjects, type PipelineNode } from "../data/mock-data";
import { cn } from "../lib/utils";

const defaultProject = mockProjects[0];
const defaultPipeline = defaultProject?.pipelines[0];

type DraggedNodePayload = {
  label: string;
  category: PipelineNode["category"];
};

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

const initialNodes: Array<Node<VkNodeData>> = defaultPipeline
  ? defaultPipeline.nodes.map((node, index) => ({
      id: node.id,
      type: "vkNode",
      data: {
        label: node.label,
        category: node.category,
        status: node.status ?? "idle"
      },
      position: {
        x: 160 + index * 220,
        y: 140 + index * 120
      }
    }))
  : [];

const initialEdges: Edge[] = defaultPipeline
  ? defaultPipeline.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      animated: true,
      style: { ...defaultEdgeStyle },
      markerEnd: { ...defaultMarker }
    }))
  : [];

const generateNodeId = (category: PipelineNode["category"]): string => {
  return `${category.toLowerCase()}-${Math.random().toString(36).slice(2, 10)}`;
};

export interface CanvasBoardProps {
  className?: string;
}

export function CanvasBoard({ className }: CanvasBoardProps): React.ReactElement {
  const [nodes, setNodes] = React.useState<Array<Node<VkNodeData>>>(initialNodes);
  const [edges, setEdges] = React.useState<Edge[]>(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = React.useState<ReactFlowInstance<VkNodeData> | null>(null);
  const reactFlowWrapper = React.useRef<HTMLDivElement | null>(null);

  const onNodesChange = React.useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = React.useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = React.useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "smoothstep",
            animated: true,
            style: { ...defaultEdgeStyle },
            markerEnd: { ...defaultMarker }
          },
          eds
        )
      );
    },
    []
  );

  const onInit = React.useCallback((instance: ReactFlowInstance<VkNodeData>) => {
    setReactFlowInstance(instance);
  }, []);

  const onDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!reactFlowInstance || !reactFlowWrapper.current) {
        return;
      }

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      ) {
        return;
      }

      const raw = event.dataTransfer.getData("application/reactflow");
      if (!raw) {
        return;
      }

      let payload: DraggedNodePayload;
      try {
        payload = JSON.parse(raw) as DraggedNodePayload;
      } catch {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });

      const newNode: Node<VkNodeData> = {
        id: generateNodeId(payload.category),
        type: "vkNode",
        position,
        data: {
          label: payload.label,
          category: payload.category,
          status: "idle"
        }
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance]
  );

  const connectionLineStyle = React.useMemo(
    () => ({ stroke: "rgba(39, 135, 245, 0.65)", strokeWidth: 2 }),
    []
  );

  const defaultEdgeOptions = React.useMemo(
    () => ({
      type: "smoothstep" as const,
      animated: true,
      markerEnd: { ...defaultMarker },
      style: { ...defaultEdgeStyle }
    }),
    []
  );

  return (
    <Card className={cn("relative flex-1 overflow-hidden border-border/60", className)}>
      <div ref={reactFlowWrapper} className="h-full w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={onInit}
          onDrop={onDrop}
          onDragOver={onDragOver}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          snapToGrid
          snapGrid={[16, 16]}
          panOnScroll
          selectionOnDrag
          defaultEdgeOptions={defaultEdgeOptions}
          connectionLineType={ConnectionLineType.SmoothStep}
          connectionLineStyle={connectionLineStyle}
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
    </Card>
  );
}
