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
  OrderContext,
  SupplyOption,
  LogisticsAssessment,
  FinanceAssessment,
  CustomerServiceDecision
} from "./agents/index.js";

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

  // Реестр доступных подчинённых агентов для BDI-ноды.
  const hasPriorityNode = nodes.some((n: any) => n.type === "priority_scheduler");
  const hasSupplyNode = nodes.some((n: any) => n.type === "supply_agent");
  const hasLogisticsNode = nodes.some((n: any) => n.type === "logistics_agent");
  const hasFinanceNode = nodes.some((n: any) => n.type === "finance_agent");
  const hasCustomerServiceNode = nodes.some((n: any) => n.type === "customer_service_agent");

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

  for (const nodeId of order) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const type = node.type;
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
      // BDI-агент сам оркестрирует вызовы доступных подчинённых агентов.
      const desires = {
        minimizeDelay: true,
        minimizePenalty: orderCtx.penaltyCost > 0,
        protectVip: orderCtx.isVip
      };

      let priorityScore = 0;
      let priorityQueue: Array<{ taskId: string; priority: number }> | undefined;

      // Приоритизация (если в графе есть нода priority_scheduler).
      if (hasPriorityNode) {
        try {
          const { basePriority, queue } = runPriority(orderCtx);
          priorityScore = basePriority;
          priorityQueue = queue;
        } catch (e) {
          console.error("priority scheduler failed in BDI", e);
        }
      } else {
        // Фолбэк: минимальная встроенная эвристика, если отдельной ноды нет.
        priorityScore =
          (orderCtx.isVip ? 0.3 : 0) +
          Math.max(0, 1 - orderCtx.slaHours / 72) +
          (orderCtx.penaltyCost > 0 ? 0.2 : 0);
      }

      // Supply
      if (hasSupplyNode) {
        try {
          supplyOptions = runSupply(orderCtx);
        } catch (e) {
          console.error("supply agent failed in BDI", e);
        }
      }

      // Logistics
      if (hasLogisticsNode) {
        try {
          const option = supplyOptions[0];
          logistics = runLogistics(orderCtx, option);
        } catch (e) {
          console.error("logistics agent failed in BDI", e);
        }
      }

      // Finance
      if (hasFinanceNode) {
        try {
          const option = supplyOptions[0];
          finance = runFinance(orderCtx, option, logistics);
        } catch (e) {
          console.error("finance agent failed in BDI", e);
        }
      }

      // Customer service
      if (hasCustomerServiceNode) {
        try {
          cs = runCustomerService(orderCtx, finance);
        } catch (e) {
          console.error("customer service agent failed in BDI", e);
        }
      }

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
          planText: bdiPlanText
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
      const option = supplyOptions[0];
      if (!option) throw new Error("нет альтернативных поставщиков");
      logistics = runLogistics(orderCtx, option);
      results.push({ nodeId, type, status: "succeeded", output: { agent: "LogisticsAgent", assessment: logistics } });
      break;
    }
    case "finance_agent": {
      const option = supplyOptions[0];
      if (!option || !logistics) throw new Error("нет данных о поставщике/логистике");
      finance = runFinance(orderCtx, option, logistics);
      results.push({ nodeId, type, status: "succeeded", output: { agent: "FinanceAgent", assessment: finance } });
      break;
    }
    case "customer_service_agent": {
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
      const effective = bdiPlanText ?? finalOutput;
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
      if (bdiPlanText) {
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
