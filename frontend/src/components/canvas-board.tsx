import React from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type Node
} from "reactflow";

import "reactflow/dist/style.css";

import { Card } from "./ui/card";
import { mockProjects } from "../data/mock-data";
import { cn } from "../lib/utils";

const defaultProject = mockProjects[0];
const defaultPipeline = defaultProject.pipelines[0];

const initialNodes: Node[] = defaultPipeline.nodes.map((node, index) => ({
  id: node.id,
  data: { label: node.label, status: node.status },
  position: { x: 100 + index * 200, y: 100 + index * 80 },
  style: {
    borderRadius: 14,
    padding: "12px 16px",
    border: "1px solid hsl(var(--border))",
    background: "rgba(30, 41, 59, 0.85)",
    color: "hsl(var(--foreground))",
    backdropFilter: "blur(8px)"
  }
}));

const initialEdges: Edge[] = defaultPipeline.edges.map((edge) => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
  animated: true,
  style: {
    stroke: "rgba(94, 234, 212, 0.6)",
    strokeWidth: 2
  }
}));

export interface CanvasBoardProps {
  className?: string;
}

export function CanvasBoard({ className }: CanvasBoardProps): React.ReactElement {
  const [nodes, setNodes] = React.useState<Node[]>(initialNodes);
  const [edges, setEdges] = React.useState<Edge[]>(initialEdges);
  const onNodesChange = React.useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = React.useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  return (
    <Card className={cn("relative flex-1 overflow-hidden border-border/60", className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        className="bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.08),transparent_35%),radial-gradient(circle_at_center,rgba(94,234,212,0.04),transparent_45%),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(0deg,rgba(148,163,184,0.12)_1px,transparent_1px)]"
        style={{
          backgroundColor: "rgba(15, 23, 42, 0.75)",
          backgroundSize: "24px 24px, 320px 320px, 48px 48px, 48px 48px"
        }}
      >
        <Background color="rgba(100,116,139,0.15)" gap={24} />
        <MiniMap
          zoomable
          pannable
          nodeColor={() => "rgba(94,234,212,0.8)"}
          maskColor="rgba(15,23,42,0.6)"
        />
        <Controls
          showInteractive={false}
          className="!bg-background/80 !text-foreground"
        />
      </ReactFlow>
    </Card>
  );
}
