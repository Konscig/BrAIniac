import { listNodesByVersion } from './node.service.js';
import { listEdgesByVersion } from './edge.service.js';
import { getPipelineById } from './pipeline.service.js';
import { getLatestPipelineVersion } from './pipeline_version.service.js';
import {
  findAlternatives,
  assessLogistics,
  assessFinance,
  customerServiceDecision,
  consensusScore,
  crisisManagerLLM,
  planBdiToolsLLM,
  type BdiToolDescription,
  OrderContext,
  SupplyOption,
  LogisticsAssessment,
  FinanceAssessment,
  CustomerServiceDecision
} from "./agents/index.js";
import { getToolById } from "./tool.service.js";

export interface ExecutionResult {
  nodeId: string;
  type: string;
  status: 'succeeded' | 'failed';
  output?: any;
  error?: string;
}

interface NodeLike {
  id: string;
  key: string;
  label: string;
  category: string;
  type: string;
  configJson: any;
}

interface EdgeLike { fromNode: string; toNode: string; }

function topoSort(nodes: NodeLike[], edges: EdgeLike[]): string[] {
  const incoming = new Map<string, number>();
  const adj = new Map<string, string[]>();
  nodes.forEach(n => { incoming.set(n.id, 0); adj.set(n.id, []); });
  edges.forEach(e => {
    incoming.set(e.toNode, (incoming.get(e.toNode) ?? 0) + 1);
    adj.get(e.fromNode)?.push(e.toNode);
  });
  const queue = Array.from(incoming.entries()).filter(([_, deg]) => deg === 0).map(([id]) => id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const nxt of adj.get(id) ?? []) {
      const deg = (incoming.get(nxt) ?? 1) - 1;
      incoming.set(nxt, deg);
      if (deg === 0) queue.push(nxt);
    }
  }
  return order.length === nodes.length ? order : order; // if cycle, partially ordered
}

// BDI tooling helpers
const BDI_TOOL_TYPES = new Set<string>([
  "priority_scheduler",
  "supply_agent",
  "logistics_agent",
  "finance_agent",
  "customer_service_agent",
  "consensus"
]);
const OUTPUT_NODE_TYPES = new Set<string>(["action", "output-response"]);

function parseNodeConfigJson(config: any): Record<string, any> {
  if (!config) return {};
  if (typeof config === "string") {
    try {
      return JSON.parse(config);
    } catch {
      return {};
    }
  }
  return config;
}

function isBdiToolNode(node: NodeLike | undefined): node is NodeLike {
  return !!node && BDI_TOOL_TYPES.has(node.type);
}

async function describeBdiToolNode(node: NodeLike): Promise<BdiToolDescription> {
  const config = parseNodeConfigJson(node.configJson);
  const directId = config?.toolId ?? config?.tool_id ?? config?.tool?.id;
  let toolRecord: any = null;

  if (typeof directId === "string" && directId.trim().length > 0) {
    try {
      toolRecord = await getToolById(directId);
    } catch (err) {
      console.error("Failed to fetch tool metadata", directId, err);
    }
  }

  const metadata = toolRecord
    ? {
        id: toolRecord.id,
        kind: toolRecord.kind,
        name: toolRecord.name,
        version: toolRecord.version,
        config: toolRecord.configJson ?? {}
      }
    : undefined;

  const description =
    config?.description ??
    config?.summary ??
    metadata?.config?.description ??
    metadata?.config?.summary ??
    toolRecord?.name ??
    node.label;

  const base: BdiToolDescription = {
    id: node.id,
    key: node.key,
    type: node.type,
    label: node.label,
    category: node.category,
    description,
    toolId: metadata?.id ?? (typeof directId === "string" ? directId : undefined),
    configJson: config
  };

  if (metadata) {
    base.toolMetadata = metadata;
  }

  return base;
}

async function resolveBdiToolDescriptions(nodes: NodeLike[]): Promise<BdiToolDescription[]> {
  if (!nodes.length) return [];
  return Promise.all(nodes.map(describeBdiToolNode));
}

// Вспомогательные чистые функции для вызова подчинённых агентов.
function runPriority(orderCtx: OrderContext) {
  const basePriority =
    (orderCtx.isVip ? 0.3 : 0) +
    Math.max(0, 1 - orderCtx.slaHours / 72) +
    (orderCtx.penaltyCost > 0 ? 0.2 : 0);

  const queue = [
    { taskId: "find_alternative_supplier", priority: basePriority + 0.3 },
    { taskId: "evaluate_finance", priority: basePriority + 0.2 },
    { taskId: "evaluate_logistics", priority: basePriority + 0.1 },
    { taskId: "evaluate_customer_impact", priority: basePriority }
  ].sort((a, b) => b.priority - a.priority);

  return { basePriority, queue };
}

function runSupply(orderCtx: OrderContext): SupplyOption[] {
  return findAlternatives(orderCtx);
}

function runLogistics(orderCtx: OrderContext, option: SupplyOption | undefined): LogisticsAssessment | undefined {
  if (!option) return undefined;
  return assessLogistics(orderCtx, option);
}

function runFinance(
  orderCtx: OrderContext,
  option: SupplyOption | undefined,
  logistics: LogisticsAssessment | undefined
): FinanceAssessment | undefined {
  if (!option || !logistics) return undefined;
  return assessFinance(orderCtx, option, logistics);
}

function runCustomerService(
  orderCtx: OrderContext,
  finance: FinanceAssessment | undefined
): CustomerServiceDecision | undefined {
  if (!finance) return undefined;
  return customerServiceDecision(orderCtx, finance);
}

export async function executePipelineGraph(pipelineId: string, mode: string, triggerInput?: string): Promise<{ results: ExecutionResult[]; finalOutput?: string; versionId: string; }> {
  const pipeline = await getPipelineById(pipelineId);
  if (!pipeline) throw new Error('pipeline not found');
  const version = await getLatestPipelineVersion(pipelineId);
  if (!version) throw new Error('pipeline version not found');

  const [nodes, edges] = await Promise.all([
	listNodesByVersion(version.id),
	listEdgesByVersion(version.id)
	]);

  const nodeMap = new Map(nodes.map((n: any) => [n.id, n as NodeLike]));
  const order = topoSort(nodes as any, edges as any);

  // Карты входящих и исходящих рёбер для реального взаимодействия нод.
  const incomingByNode = new Map<string, EdgeLike[]>();
  const outgoingByNode = new Map<string, EdgeLike[]>();
  (edges as any as EdgeLike[]).forEach((e) => {
	if (!incomingByNode.has(e.toNode)) incomingByNode.set(e.toNode, []);
	incomingByNode.get(e.toNode)!.push(e);
	if (!outgoingByNode.has(e.fromNode)) outgoingByNode.set(e.fromNode, []);
	outgoingByNode.get(e.fromNode)!.push(e);
  });

  const results: ExecutionResult[] = [];
  // shared context для BDI-агента кризисного менеджера
  // Сложный дефолтный кейс: VIP-B2B-клиент, объёмный заказ, жёсткое SLA и высокий штраф
  // чтобы мнения логистики, финансов и клиентского сервиса расходились.
  let orderCtx: OrderContext = {
  id: "order-crisis-1",
  sku: "server-rack-42u-premium",
  quantity: 12,
  slaHours: 18,
  isVip: true,
  penaltyCost: 25000,
  basePrice: 4800
  };
  if (triggerInput) {
    try {
      const parsed = JSON.parse(triggerInput);
      orderCtx = { ...orderCtx, ...parsed };
    } catch {
      // ignore parse errors, keep default
    }
  }

  let supplyOptions: SupplyOption[] = [];
  let logistics: LogisticsAssessment | undefined;
  let finance: FinanceAssessment | undefined;
  let cs: CustomerServiceDecision | undefined;
  let finalOutput: string | undefined;
  // текстовый план, сформированный BDI-агентом (без LLM или с LLM)
  let bdiPlanText: string | undefined;
  let bdiPreferredOutputNodeId: string | undefined;

  for (const nodeId of order) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const type = node.type;
    // Собираем входы ноды на основе рёбер: выходы всех родительских нод.
    const parentEdges = incomingByNode.get(nodeId) ?? [];
    const parentIds = parentEdges.map((e) => e.fromNode);
    const inputsForNode = results
      .filter((r) => parentIds.includes(r.nodeId) && r.status === "succeeded")
      .map((r) => r.output);
    try {
      switch (type) {
        case "input": {
      // входной контекст заказа (beliefs)
      if (node.configJson && typeof node.configJson === "object") {
        orderCtx = { ...orderCtx, ...(node.configJson.order ?? {}) };
      }
      results.push({ nodeId, type, status: "succeeded", output: orderCtx });
      break;
    }
    case "bdi_crisis_manager": {
      // BDI-агент: сначала LLM планирует, какими инструментами пользоваться, затем мы их исполняем.

      const outgoingEdgesFromBdi = outgoingByNode.get(nodeId) ?? [];
      const candidateToolIds = new Set<string>();

      // Инструменты, подключённые по исходящим рёбрам (BDI -> подчинённые).
      for (const edge of outgoingEdgesFromBdi) {
        const maybeTool = nodeMap.get(edge.toNode);
        if (isBdiToolNode(maybeTool)) {
          candidateToolIds.add(maybeTool.id);
        }
      }

      // Инструменты, которые соединены входящими рёбрами (подчинённые -> BDI).
      for (const edge of parentEdges) {
        const maybeTool = nodeMap.get(edge.fromNode);
        if (isBdiToolNode(maybeTool)) {
          candidateToolIds.add(maybeTool.id);
        }
      }

      const connectedToolNodes = Array.from(candidateToolIds)
        .map((id) => nodeMap.get(id))
        .filter((n): n is NodeLike => !!n);

      const availableTools = await resolveBdiToolDescriptions(connectedToolNodes);
      const toolById = new Map(availableTools.map((tool) => [tool.id, tool]));
      const toolByKey = new Map(availableTools.map((tool) => [tool.key, tool]));

      const outputNodes = outgoingEdgesFromBdi
        .map((e) => nodeMap.get(e.toNode))
        .filter((n): n is NodeLike => !!n && OUTPUT_NODE_TYPES.has(n.type))
        .map((n) => ({ id: n.id, key: n.key, type: n.type, label: n.label }));

      const bdiPlan = await planBdiToolsLLM(orderCtx, availableTools, outputNodes);
      if (bdiPlan.final?.outputNodeId) {
        bdiPreferredOutputNodeId = bdiPlan.final.outputNodeId;
      }

      // Исполняем шаги плана по инструментам.
      let priorityScore = 0;
      let priorityQueue: Array<{ taskId: string; priority: number }> | undefined;

      for (const step of bdiPlan.tools ?? []) {
		const toolInfo = toolById.get(step.id) ?? toolByKey.get(step.key);
		const toolType = toolInfo?.type ?? step.type;
		try {
		  switch (toolType) {
			case "priority_scheduler": {
			  const { basePriority, queue } = runPriority(orderCtx);
			  priorityScore = basePriority;
			  priorityQueue = queue;
			  break;
			}
			case "supply_agent": {
			  supplyOptions = runSupply(orderCtx);
			  break;
			}
			case "logistics_agent": {
			  const option = supplyOptions[0];
			  logistics = runLogistics(orderCtx, option);
			  break;
			}
			case "finance_agent": {
			  const option = supplyOptions[0];
			  finance = runFinance(orderCtx, option, logistics);
			  break;
			}
			case "customer_service_agent": {
			  cs = runCustomerService(orderCtx, finance);
			  break;
			}
			default:
			  // неизвестный инструмент — пропускаем, чтобы не падать
			  break;
		  }
		} catch (e) {
		  console.error("BDI tool step failed", toolType, e);
		}
	  }

      // Если планировщик не проставил приоритет — используем эвристику.
      if (!priorityScore) {
		priorityScore =
		  (orderCtx.isVip ? 0.3 : 0) +
		  Math.max(0, 1 - orderCtx.slaHours / 72) +
		  (orderCtx.penaltyCost > 0 ? 0.2 : 0);
	  }

      const desires = {
        minimizeDelay: true,
        minimizePenalty: orderCtx.penaltyCost > 0,
        protectVip: orderCtx.isVip
      };

      const votes = [finance?.vote ?? 0, cs?.vote ?? 0].filter((v) => typeof v === "number");
      const consensus = votes.length ? consensusScore(votes as number[]) : null;

      // Структурный конспект для LLM и UI (слегка ужатый).
      const summary = {
        order: {
          id: orderCtx.id,
          sku: orderCtx.sku,
          quantity: orderCtx.quantity,
          slaHours: orderCtx.slaHours,
          isVip: orderCtx.isVip,
          penaltyCost: orderCtx.penaltyCost,
          basePrice: orderCtx.basePrice
        },
        desires,
        priority: priorityScore,
        priorityQueue,
        supply: supplyOptions.slice(0, 2),
        logistics,
        finance,
        customerService: cs,
        consensus
      };

      const summaryText = JSON.stringify(summary, null, 2);

      // Пытаемся получить более человечный план от LLM, если доступен ключ.
      let llmPlan: string | null = null;
      try {
        llmPlan = await crisisManagerLLM(summaryText);
      } catch (e) {
        // не валим пайплайн, просто логируем
        console.error("crisisManagerLLM failed", e);
      }

      bdiPlanText =
        llmPlan ||
        "Кризисный менеджер сформировал план на основе внутренних агентов. " +
          "LLM недоступна, используется базовое описание ситуации.\n\n" +
          summaryText;

      results.push({
        nodeId,
        type,
        status: "succeeded",
        output: {
          beliefs: orderCtx,
          desires,
          priority: priorityScore,
          priorityQueue,
          supply: supplyOptions,
          logistics,
          finance,
          customerService: cs,
          consensus,
          planText: bdiPlanText,
          toolsPlanned: bdiPlan.tools ?? [],
          availableTools,
          preferredOutputNodeId: bdiPreferredOutputNodeId
        }
      });
      break;
    }
    case "priority_scheduler": {
      const { basePriority, queue } = runPriority(orderCtx);
      results.push({ nodeId, type, status: "succeeded", output: { basePriority, queue } });
      break;
    }
    case "supply_agent": {
      // мок-агент поставок
      supplyOptions = runSupply(orderCtx);
      results.push({ nodeId, type, status: "succeeded", output: { agent: "SupplyAgent", options: supplyOptions } });
      break;
    }
    case "logistics_agent": {
      if (!supplyOptions.length) {
        for (const input of inputsForNode) {
          if (input?.agent === "SupplyAgent" && Array.isArray(input.options)) {
            supplyOptions = input.options as SupplyOption[];
            break;
          }
          if (Array.isArray(input?.supply)) {
            supplyOptions = input.supply as SupplyOption[];
            break;
          }
        }
      }

      const option = supplyOptions[0];
      if (!option) throw new Error("нет альтернативных поставщиков");
      logistics = runLogistics(orderCtx, option);
      results.push({ nodeId, type, status: "succeeded", output: { agent: "LogisticsAgent", assessment: logistics } });
      break;
    }
    case "finance_agent": {
      if (!supplyOptions.length) {
        for (const input of inputsForNode) {
          if (input?.agent === "SupplyAgent" && Array.isArray(input.options)) {
            supplyOptions = input.options as SupplyOption[];
            break;
          }
          if (Array.isArray(input?.supply)) {
            supplyOptions = input.supply as SupplyOption[];
            break;
          }
        }
      }

      if (!logistics) {
        for (const input of inputsForNode) {
          if (input?.agent === "LogisticsAgent" && input.assessment) {
            logistics = input.assessment as LogisticsAssessment;
            break;
          }
          if (input?.logistics) {
            logistics = input.logistics as LogisticsAssessment;
            break;
          }
        }
      }

      const option = supplyOptions[0];
      if (!logistics && option) {
        logistics = runLogistics(orderCtx, option);
      }

      if (!option || !logistics) throw new Error("нет данных о поставщике/логистике");
      finance = runFinance(orderCtx, option, logistics);
      results.push({ nodeId, type, status: "succeeded", output: { agent: "FinanceAgent", assessment: finance } });
      break;
    }
    case "customer_service_agent": {
      if (!finance) {
        for (const input of inputsForNode) {
          if (input?.agent === "FinanceAgent" && input.assessment) {
            finance = input.assessment as FinanceAssessment;
            break;
          }
          if (input?.finance) {
            finance = input.finance as FinanceAssessment;
            break;
          }
        }
      }

      if (!finance) throw new Error("нет финансовой оценки");
      cs = runCustomerService(orderCtx, finance);
      results.push({ nodeId, type, status: "succeeded", output: { agent: "CustomerServiceAgent", decision: cs } });
      break;
    }
    case "consensus": {
      const votes = [finance?.vote ?? 0, cs?.vote ?? 0].filter((v) => typeof v === "number");
      const cons = consensusScore(votes as number[]);
      results.push({ nodeId, type, status: "succeeded", output: cons });
      break;
    }
    case "output-response": {
      // Специальная нода "Ответ": просто показывает финальный план.
      // Предпочитает результат BDI-менеджера, но умеет работать и с legacy finalOutput.
      const shouldUseBdiPlan =
        !!bdiPlanText && (!bdiPreferredOutputNodeId || bdiPreferredOutputNodeId === nodeId);
      const effective = shouldUseBdiPlan ? bdiPlanText : finalOutput;
      if (shouldUseBdiPlan && bdiPlanText) {
        finalOutput = bdiPlanText;
      }
      if (effective) {
        results.push({ nodeId, type, status: "succeeded", output: effective });
      } else {
        results.push({
          nodeId,
          type,
          status: "failed",
          error: "нет финального решения от BDI или action-ноды"
        });
      }
      break;
    }
    case "action": {
      // Для демо BDI: если есть план от кризисного менеджера — используем его как финальный ответ.
      const shouldUseBdiPlan =
        !!bdiPlanText && (!bdiPreferredOutputNodeId || bdiPreferredOutputNodeId === nodeId);
      if (shouldUseBdiPlan && bdiPlanText) {
        finalOutput = bdiPlanText;
      } else {
        const option = supplyOptions[0];
        const votes = [finance?.vote ?? 0, cs?.vote ?? 0].filter(
          (v) => typeof v === "number"
        );
        const cons = consensusScore(votes as number[]);
        if (cons.accepted && option && logistics && finance) {
          finalOutput = `Переназначить заказ ${orderCtx.id} на поставщика ${option.name}, ETA ${logistics.etaHours}ч, ожидаемая маржа ${finance.margin.toFixed(2)}. Клиенту отправить уведомление о смене поставщика.`;
        } else {
          finalOutput =
            "Консенсус не достигнут: уведомить клиента о задержке и предложить компенсацию.";
        }
      }

      results.push({ nodeId, type, status: "succeeded", output: { finalOutput } });
      break;
    }
        default: {
          results.push({ nodeId, type, status: 'failed', error: 'unsupported node type' });
          break;
        }
      }
    } catch (err: any) {
      results.push({ nodeId, type, status: 'failed', error: err?.message ?? 'error' });
      break;
    }
  }

  const payload: { results: ExecutionResult[]; versionId: string; finalOutput?: string } = {
    results,
    versionId: version.id
  };
  if (typeof finalOutput === 'string') {
    payload.finalOutput = finalOutput;
  }
  return payload;
}
