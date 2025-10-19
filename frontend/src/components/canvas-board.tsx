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
	type NodePositionChange,
	type ReactFlowInstance
} from "reactflow";

import "reactflow/dist/style.css";

import { Card } from "./ui/card";
import { nodeTypes, type VkNodeData } from "./custom-nodes";
import type { EnvironmentMode } from "./environment-mode-switch";
import {
	createPipelineEdge,
	createPipelineNode,
	deletePipelineEdge,
	deletePipelineNode,
	getPipelineGraph,
	updatePipelineNode,
	type ApiError,
	type EnvironmentModeApi,
	type PipelineEdgeDto,
	type PipelineNodeCategory,
	type PipelineNodeDto
} from "../lib/api";
import { cn } from "../lib/utils";

const DEFAULT_NODE_STATUS = "idle";
const FALLBACK_CONFIG = "{}";

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

const MODE_MAP: Record<EnvironmentMode, EnvironmentModeApi> = {
	test: "ENVIRONMENT_MODE_TEST",
	hybrid: "ENVIRONMENT_MODE_HYBRID",
	real: "ENVIRONMENT_MODE_REAL"
};

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DraggedNodePayload = {
	label: string;
	category: PipelineNodeCategory;
	type: string;
};

type LocalGraphSnapshot = {
	nodes: Array<Node<VkNodeData>>;
	edges: Edge[];
	dirty: boolean;
};

const cloneNodes = (nodes: Array<Node<VkNodeData>>): Array<Node<VkNodeData>> =>
	nodes.map((node) => ({
		...node,
		position: { ...node.position },
		data: { ...node.data }
	}));

const cloneEdges = (edges: Edge[]): Edge[] =>
	edges.map((edge) => ({
		...edge,
		data: edge.data ? { ...edge.data } : undefined
	}));

const generateLocalId = (prefix: string): string => {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return `${prefix}-${crypto.randomUUID()}`;
	}
	return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
};

const createLocalNode = (
	payload: DraggedNodePayload,
	position: { x: number; y: number }
): Node<VkNodeData> => ({
	id: generateLocalId("node"),
	type: "vkNode",
	position,
	data: {
		label: payload.label,
		category: payload.category,
		status: DEFAULT_NODE_STATUS,
		nodeType: payload.type,
		configJson: FALLBACK_CONFIG
	}
});

const toFlowNode = (node: PipelineNodeDto): Node<VkNodeData> => ({
	id: node.id,
	type: "vkNode",
	position: {
		x: Number.isFinite(node.positionX) ? node.positionX : 0,
		y: Number.isFinite(node.positionY) ? node.positionY : 0
	},
	data: {
		label: node.label,
		category: node.category,
		status: node.status || DEFAULT_NODE_STATUS,
		nodeType: node.type,
		configJson: node.configJson || FALLBACK_CONFIG
	}
});

const toFlowEdge = (edge: PipelineEdgeDto): Edge => ({
	id: edge.id,
	source: edge.source,
	target: edge.target,
	animated: true,
	style: { ...defaultEdgeStyle },
	markerEnd: { ...defaultMarker },
	data: { label: edge.label }
});

export interface CanvasBoardProps {
	projectId: string;
	pipelineId: string;
	mode: EnvironmentMode;
	refreshToken: number;
	className?: string;
	onGraphLoaded?: (nodes: PipelineNodeDto[]) => void;
	onGraphError?: (message: string) => void;
	onStatusChange?: (status: {
		isOffline: boolean;
		hasUnsavedChanges: boolean;
		lastError?: string | null;
	}) => void;
}

export function CanvasBoard({
	projectId,
	pipelineId,
	mode,
	refreshToken,
	className,
	onGraphLoaded,
	onGraphError,
	onStatusChange
}: CanvasBoardProps): React.ReactElement {
	const [nodes, setNodes] = React.useState<Array<Node<VkNodeData>>>([]);
	const [edges, setEdges] = React.useState<Edge[]>([]);
	const [isLoading, setIsLoading] = React.useState(false);
	const [fetchError, setFetchError] = React.useState<string | null>(null);
	const [emptyStateMessage, setEmptyStateMessage] = React.useState<string | null>(null);
	const [offlineNotice, setOfflineNotice] = React.useState<string | null>(null);
	const [fallbackMode, setFallbackMode] = React.useState(false);
	const [localUnsaved, setLocalUnsaved] = React.useState(false);

	const reactFlowWrapper = React.useRef<HTMLDivElement | null>(null);
	const reactFlowInstance = React.useRef<ReactFlowInstance<VkNodeData> | null>(null);
	const localGraphsRef = React.useRef<Record<string, LocalGraphSnapshot>>({});

	const modeParam = MODE_MAP[mode];
	const hasContext = Boolean(projectId && pipelineId);
	const hasValidProjectId = !projectId || uuidRegex.test(projectId);
	const hasValidPipelineId = uuidRegex.test(pipelineId);
	const canAttemptApi = hasContext && hasValidProjectId && hasValidPipelineId;
	const isOfflineMode = fallbackMode || !canAttemptApi;
	const pipelineKey = React.useMemo(
		() => `${projectId || "local"}:${pipelineId || "local"}`,
		[projectId, pipelineId]
	);

	const updateEmptyState = React.useCallback((nodeCount: number, edgeCount: number) => {
		if (nodeCount === 0 && edgeCount === 0) {
			setEmptyStateMessage(
				"Граф пустой — перетащите элемент из библиотеки, чтобы создать первую ноду"
			);
		} else {
			setEmptyStateMessage(null);
		}
	}, []);

	const persistLocalGraph = React.useCallback(
		(nodeList: Array<Node<VkNodeData>>, edgeList: Edge[], markDirty = true) => {
			if (!isOfflineMode) {
				return;
			}
			const existing = localGraphsRef.current[pipelineKey];
			localGraphsRef.current[pipelineKey] = {
				nodes: cloneNodes(nodeList),
				edges: cloneEdges(edgeList),
				dirty: markDirty || existing?.dirty || false
			};
		},
		[isOfflineMode, pipelineKey]
	);

	const restoreLocalGraph = React.useCallback(() => {
		const snapshot = localGraphsRef.current[pipelineKey];
		if (snapshot) {
			const nodesClone = cloneNodes(snapshot.nodes);
			const edgesClone = cloneEdges(snapshot.edges);
			setNodes(nodesClone);
			setEdges(edgesClone);
			setLocalUnsaved(snapshot.dirty);
			updateEmptyState(nodesClone.length, edgesClone.length);
			return nodesClone.length === 0 && edgesClone.length === 0;
		}
		setNodes([]);
		setEdges([]);
		setLocalUnsaved(false);
		updateEmptyState(0, 0);
		return true;
	}, [pipelineKey, updateEmptyState]);

	React.useEffect(() => {
		onStatusChange?.({
			isOffline: isOfflineMode,
			hasUnsavedChanges: localUnsaved,
			lastError: fetchError
		});
	}, [fetchError, isOfflineMode, localUnsaved, onStatusChange]);

	const loadGraph = React.useCallback(async () => {
		if (!hasContext) {
			setFallbackMode(true);
			setOfflineNotice("Выберите проект и пайплайн в панели слева");
			setEmptyStateMessage("Выберите проект и пайплайн, чтобы начать работу");
			setNodes([]);
			setEdges([]);
			setLocalUnsaved(false);
			return;
		}

		if (!canAttemptApi) {
			setFallbackMode(true);
			setFetchError(null);
			const isEmpty = restoreLocalGraph();
			setOfflineNotice("Локальный режим: изменения не синхронизируются с сервером");
			if (isEmpty) {
				setEmptyStateMessage(
					"Пайплайн пока не привязан к реальным данным — работаем локально, изменения не сохраняются"
				);
			}
			return;
		}

		setIsLoading(true);
		setFetchError(null);
		try {
			const graph = await getPipelineGraph(projectId, pipelineId, modeParam);
			const apiNodes = graph.nodes.map(toFlowNode);
			const apiEdges = graph.edges.map(toFlowEdge);
			setNodes(apiNodes);
			setEdges(apiEdges);
			updateEmptyState(apiNodes.length, apiEdges.length);
			setFallbackMode(false);
			setOfflineNotice(null);
			setLocalUnsaved(false);
			onGraphLoaded?.(graph.nodes);
		} catch (error) {
			console.error("Failed to load pipeline graph", error);
			const apiError = error as ApiError;
			if (apiError?.status === 404) {
				setFallbackMode(true);
				setFetchError(null);
				const isEmpty = restoreLocalGraph();
				setOfflineNotice(
					"Сервер не нашёл этот пайплайн. Продолжаем в локальном режиме — данные сохраняются в браузере"
				);
				if (isEmpty) {
					setEmptyStateMessage(
						"Создайте узлы — мы сохраним их локально до синхронизации с сервером"
					);
				}
			} else {
				const message = "Не удалось загрузить граф пайплайна";
				setFetchError(message);
				setOfflineNotice(null);
				onGraphError?.(message);
			}
		} finally {
			setIsLoading(false);
		}
	}, [
		canAttemptApi,
		hasContext,
		modeParam,
		onGraphError,
		onGraphLoaded,
		pipelineId,
		projectId,
		restoreLocalGraph,
		updateEmptyState
	]);

	React.useEffect(() => {
		void loadGraph();
	}, [loadGraph, refreshToken]);

	const handleNodesChange = React.useCallback(
		(changes: NodeChange[]) => {
			setNodes((current) => {
				const next = applyNodeChanges(changes, current);

				if (isOfflineMode) {
					const moved = changes.some(
						(change) => change.type === "position" && !(change as NodePositionChange).dragging
					);
					if (moved) {
						setLocalUnsaved(true);
						persistLocalGraph(next, edges);
					}
					updateEmptyState(next.length, edges.length);
					return next;
				}

				const finishedMoves = changes.filter(
					(change): change is NodePositionChange => change.type === "position" && !change.dragging
				);

				finishedMoves.forEach((change) => {
					const movedNode = next.find((node) => node.id === change.id);
					if (!movedNode) {
						return;
					}

					void updatePipelineNode(projectId, pipelineId, {
						nodeId: movedNode.id,
						label: movedNode.data.label,
						category: movedNode.data.category,
						type: movedNode.data.nodeType ?? movedNode.data.category.toLowerCase(),
						status: movedNode.data.status ?? DEFAULT_NODE_STATUS,
						positionX: movedNode.position.x,
						positionY: movedNode.position.y,
						configJson: movedNode.data.configJson ?? FALLBACK_CONFIG
					}).catch((error) => {
						console.error("Failed to update node position", error);
						onGraphError?.("Не удалось сохранить позицию узла");
					});
				});

				updateEmptyState(next.length, edges.length);
				return next;
			});
		},
		[edges, isOfflineMode, onGraphError, persistLocalGraph, pipelineId, projectId, updateEmptyState]
	);

	const handleEdgesChange = React.useCallback(
		(changes: EdgeChange[]) => {
			setEdges((current) => {
				const next = applyEdgeChanges(changes, current);
				if (isOfflineMode) {
					persistLocalGraph(nodes, next);
					setLocalUnsaved(true);
				}
				return next;
			});
		},
		[isOfflineMode, nodes, persistLocalGraph]
	);

	const handleConnect = React.useCallback(
		(connection: Connection) => {
			if (!connection.source || !connection.target) {
				return;
			}

			if (isOfflineMode || !projectId || !pipelineId) {
				const localEdge: Edge = {
					id: generateLocalId("edge"),
					source: connection.source,
					target: connection.target,
					animated: true,
					markerEnd: { ...defaultMarker },
					style: { ...defaultEdgeStyle },
					type: "smoothstep"
				};
				setEdges((current) => {
					const next = addEdge(localEdge, current);
					persistLocalGraph(nodes, next);
					setLocalUnsaved(true);
					updateEmptyState(nodes.length, next.length);
					return next;
				});
				setFetchError(null);
				return;
			}

			void createPipelineEdge(projectId, pipelineId, {
				source: connection.source,
				target: connection.target,
				label: ""
			})
				.then((edge) => {
					setEdges((current) => addEdge(toFlowEdge(edge), current));
				})
				.catch((error) => {
					console.error("Failed to create edge", error);
					setFetchError("Не удалось соединить узлы");
					onGraphError?.("Не удалось соединить узлы");
				});
		},
		[isOfflineMode, nodes, onGraphError, pipelineId, projectId, updateEmptyState, persistLocalGraph]
	);

	const handleNodesDelete = React.useCallback(
		(deleted: Node<VkNodeData>[]) => {
			if (isOfflineMode) {
				const removedIds = new Set(deleted.map((node) => node.id));
				const nextNodes = nodes.filter((node) => !removedIds.has(node.id));
				const nextEdges = edges.filter(
					(edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target)
				);
				setNodes(nextNodes);
				setEdges(nextEdges);
				setLocalUnsaved(true);
				persistLocalGraph(nextNodes, nextEdges);
				updateEmptyState(nextNodes.length, nextEdges.length);
				return;
			}

			if (!hasContext) {
				return;
			}

			deleted.forEach((node) => {
				void deletePipelineNode(projectId, pipelineId, node.id).catch((error) => {
					console.error("Failed to delete node", error);
					onGraphError?.("Не удалось удалить узел");
				});
			});
		},
		[edges, hasContext, isOfflineMode, nodes, onGraphError, persistLocalGraph, pipelineId, projectId, updateEmptyState]
	);

	const handleEdgesDelete = React.useCallback(
		(deletedEdges: Edge[]) => {
			if (isOfflineMode) {
				const removedIds = new Set(deletedEdges.map((edge) => edge.id));
				const nextEdges = edges.filter((edge) => !removedIds.has(edge.id));
				setEdges(nextEdges);
				setLocalUnsaved(true);
				persistLocalGraph(nodes, nextEdges);
				updateEmptyState(nodes.length, nextEdges.length);
				return;
			}

			if (!hasContext) {
				return;
			}

			deletedEdges.forEach((edge) => {
				void deletePipelineEdge(projectId, pipelineId, edge.id).catch((error) => {
					console.error("Failed to delete edge", error);
					onGraphError?.("Не удалось удалить связь");
				});
			});
		},
		[edges, hasContext, isOfflineMode, nodes, onGraphError, persistLocalGraph, pipelineId, projectId, updateEmptyState]
	);

	const handleDrop = React.useCallback(
		(event: React.DragEvent) => {
			event.preventDefault();
			if (!reactFlowInstance.current || !reactFlowWrapper.current) {
				onGraphError?.("Сначала выберите проект и пайплайн");
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

			const position = reactFlowInstance.current.screenToFlowPosition({
				x: event.clientX,
				y: event.clientY
			});

			if (isOfflineMode || !projectId || !pipelineId) {
				const node = createLocalNode(payload, position);
				setNodes((current) => {
					const next = current.concat(node);
					persistLocalGraph(next, edges);
					setLocalUnsaved(true);
					updateEmptyState(next.length, edges.length);
					return next;
				});
				setEmptyStateMessage(null);
				setFetchError(null);
				return;
			}

			void createPipelineNode(projectId, pipelineId, {
				label: payload.label,
				category: payload.category,
				type: payload.type,
				status: DEFAULT_NODE_STATUS,
				positionX: position.x,
				positionY: position.y,
				configJson: FALLBACK_CONFIG
			})
				.then((node) => {
					setNodes((current) => {
						const next = current.concat(toFlowNode(node));
						updateEmptyState(next.length, edges.length);
						return next;
					});
					setEmptyStateMessage(null);
					setFetchError(null);
				})
				.catch((error) => {
					console.error("Failed to create node", error);
					setFetchError("Не удалось создать узел");
					onGraphError?.("Не удалось создать узел");
				});
		},
		[edges, isOfflineMode, onGraphError, persistLocalGraph, pipelineId, projectId, updateEmptyState]
	);

	const handleDragOver = React.useCallback((event: React.DragEvent) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
	}, []);

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

	const setInstance = React.useCallback((instance: ReactFlowInstance<VkNodeData>) => {
		reactFlowInstance.current = instance;
	}, []);

	return (
		<Card className={cn("relative flex-1 overflow-hidden border-border/60", className)}>
			<div ref={reactFlowWrapper} className="h-full w-full">
				<ReactFlow
					nodes={nodes}
					edges={edges}
					nodeTypes={nodeTypes}
					onNodesChange={handleNodesChange}
					onEdgesChange={handleEdgesChange}
					onNodesDelete={handleNodesDelete}
					onEdgesDelete={handleEdgesDelete}
					onConnect={handleConnect}
					onInit={setInstance}
					onDrop={handleDrop}
					onDragOver={handleDragOver}
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

			{offlineNotice && (
				<div className="pointer-events-none absolute left-4 top-4 max-w-sm rounded-lg border border-border/70 bg-background/85 px-3 py-2 text-xs text-muted-foreground shadow-sm">
					{offlineNotice}
				</div>
			)}

			{isLoading && (
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60 text-sm text-muted-foreground">
					Загружаем граф...
				</div>
			)}

			{fetchError && !isLoading && (
				<div className="pointer-events-none absolute inset-x-6 bottom-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-center text-sm text-red-200">
					{fetchError}
				</div>
			)}

			{emptyStateMessage && !isLoading && !fetchError && (
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-muted-foreground">
					{emptyStateMessage}
				</div>
			)}

			<div className="pointer-events-none absolute left-4 bottom-4 max-w-sm rounded-lg bg-background/80 px-3 py-2 text-xs text-muted-foreground shadow-sm">
				Подсказка: выделите узел или ребро и нажмите Delete, чтобы удалить. Перетащите нижний
				или верхний круглый хэндл для соединения. Двойной клик по узлу откроет настройки (скоро).
			</div>
		</Card>
	);
}
