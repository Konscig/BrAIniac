import { listNodesByVersion } from './node.service.js';
import { listEdgesByVersion } from './edge.service.js';
import { getPipelineById } from './pipeline.service.js';
import { getLatestPipelineVersion } from './pipeline_version.service.js';
import { findAlternatives, assessLogistics, assessFinance, customerServiceDecision, consensusScore, OrderContext, SupplyOption, LogisticsAssessment, FinanceAssessment, CustomerServiceDecision } from './agents/index.js';

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

export async function executePipelineGraph(pipelineId: string, mode: string, triggerInput?: string): Promise<{ results: ExecutionResult[]; finalOutput?: string; versionId: string; }> {
  const pipeline = await getPipelineById(pipelineId);
  if (!pipeline) throw new Error('pipeline not found');
  const version = await getLatestPipelineVersion(pipelineId);
  if (!version) throw new Error('pipeline version not found');

  const [nodes, edges] = await Promise.all([
    listNodesByVersion(version.id),
    listEdgesByVersion(version.id),
  ]);

  const nodeMap = new Map(nodes.map((n: any) => [n.id, n as NodeLike]));
  const order = topoSort(nodes as any, edges as any);

  const results: ExecutionResult[] = [];
  // shared context for our simple linear BDI demo
  let orderCtx: OrderContext = {
    id: 'order-1',
    sku: 'laptop-15',
    quantity: 1,
    slaHours: 24,
    isVip: true,
    penaltyCost: 200,
    basePrice: 1200,
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

  for (const nodeId of order) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const type = node.type;
    try {
      switch (type) {
        case 'input': {
          // allow overriding order from config
          if (node.configJson && typeof node.configJson === 'object') {
            orderCtx = { ...orderCtx, ...(node.configJson.order ?? {}) };
          }
          results.push({ nodeId, type, status: 'succeeded', output: orderCtx });
          break;
        }
        case 'priority_scoring': {
          // simple derived priority
          const priority = (orderCtx.isVip ? 0.3 : 0) + Math.max(0, 1 - orderCtx.slaHours / 72) + (orderCtx.penaltyCost > 0 ? 0.2 : 0);
          results.push({ nodeId, type, status: 'succeeded', output: { priority } });
          break;
        }
        case 'supply': {
          supplyOptions = findAlternatives(orderCtx);
          results.push({ nodeId, type, status: 'succeeded', output: supplyOptions });
          break;
        }
        case 'logistics': {
          const option = supplyOptions[0];
          if (!option) throw new Error('no supply options');
          logistics = assessLogistics(orderCtx, option);
          results.push({ nodeId, type, status: 'succeeded', output: logistics });
          break;
        }
        case 'finance': {
          const option = supplyOptions[0];
          if (!option || !logistics) throw new Error('no supply/logistics');
          finance = assessFinance(orderCtx, option, logistics);
          results.push({ nodeId, type, status: 'succeeded', output: finance });
          break;
        }
        case 'customer_service': {
          if (!finance) throw new Error('no finance');
          cs = customerServiceDecision(orderCtx, finance);
          results.push({ nodeId, type, status: 'succeeded', output: cs });
          break;
        }
        case 'consensus': {
          const votes = [finance?.vote ?? 0, cs?.vote ?? 0].filter(v => typeof v === 'number');
          const cons = consensusScore(votes as number[]);
          results.push({ nodeId, type, status: 'succeeded', output: cons });
          break;
        }
        case 'action': {
          const option = supplyOptions[0];
          const votes = [finance?.vote ?? 0, cs?.vote ?? 0].filter(v => typeof v === 'number');
          const cons = consensusScore(votes as number[]);
          if (cons.accepted && option && logistics && finance) {
            finalOutput = `Поставщик ${option.name}, ETA ${logistics.etaHours}ч, маржа ${finance.margin.toFixed(2)}.`;
          } else {
            finalOutput = 'Консенсус не достигнут: уведомить клиента и пересчитать план';
          }
          results.push({ nodeId, type, status: 'succeeded', output: { finalOutput } });
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
