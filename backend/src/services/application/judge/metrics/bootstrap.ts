import { registerMetric } from '../metric_registry.js';

// Axis A — Correctness
import { ExactMatchMetric } from './correctness/exact-match.metric.js';
import { TokenF1Metric } from './correctness/token-f1.metric.js';
import { SemanticSimilarityMetric } from './correctness/semantic-similarity.metric.js';
import { AnswerCorrectnessMetric } from './correctness/answer-correctness.metric.js';

// Axis B — Grounding
import { FaithfulnessMetric } from './grounding/faithfulness.metric.js';
import { FactScoreMetric } from './grounding/fact-score.metric.js';
import { CitationF1Metric } from './grounding/citation-f1.metric.js';
import { ContradictionRateMetric } from './grounding/contradiction-rate.metric.js';

// Axis C — Retrieval
import { RecallAtKMetric } from './retrieval/recall-at-k.metric.js';
import { NDCGAtKMetric } from './retrieval/ndcg-at-k.metric.js';
import { ContextPrecisionMetric } from './retrieval/context-precision.metric.js';
import { ContextRecallMetric } from './retrieval/context-recall.metric.js';

// Axis D — Tool-Use & Trajectory
import { ToolSelectionAccuracyMetric } from './tool_use/tool-selection.metric.js';
import { ParameterF1Metric } from './tool_use/parameter-f1.metric.js';
import { ToolCallSuccessMetric } from './tool_use/tool-call-success.metric.js';
import { TrajectoryIoUMetric } from './tool_use/trajectory-iou.metric.js';
import { PlanEfficiencyMetric } from './tool_use/plan-efficiency.metric.js';
import { NodeCoverageMetric } from './tool_use/node-coverage.metric.js';

// Axis E — Structure
import { SchemaValidityMetric } from './structure/schema-validity.metric.js';
import { FieldF1Metric } from './structure/field-f1.metric.js';
import { TreeEditDistanceMetric } from './structure/tree-edit-distance.metric.js';

// Axis F — Control Flow
import { LoopTerminationMetric } from './control_flow/loop-term.metric.js';
import { LoopBudgetMetric } from './control_flow/loop-budget.metric.js';
import { LoopConvergenceMetric } from './control_flow/loop-conv.metric.js';
import { RetryEfficacyMetric } from './control_flow/retry-efficacy.metric.js';

// Axis G — LLM as Judge
import { RubricJudgeMetric } from './llm_judge/rubric-judge.metric.js';
import { CheckEvalMetric } from './llm_judge/checkeval.metric.js';

// Axis H — Safety
import { SafetyMetric } from './safety/safety-score.metric.js';
import { SelfConsistencyMetric } from './safety/self-consistency.metric.js';

// Adding a new metric = one import + one registerMetric(...) call. No
// core changes required (FR-012, SC-005).
registerMetric(new ExactMatchMetric());
registerMetric(new TokenF1Metric());
registerMetric(new SemanticSimilarityMetric());
registerMetric(new AnswerCorrectnessMetric());

registerMetric(new FaithfulnessMetric());
registerMetric(new FactScoreMetric());
registerMetric(new CitationF1Metric());
registerMetric(new ContradictionRateMetric());

registerMetric(new RecallAtKMetric());
registerMetric(new NDCGAtKMetric());
registerMetric(new ContextPrecisionMetric());
registerMetric(new ContextRecallMetric());

registerMetric(new ToolSelectionAccuracyMetric());
registerMetric(new ParameterF1Metric());
registerMetric(new ToolCallSuccessMetric());
registerMetric(new TrajectoryIoUMetric());
registerMetric(new PlanEfficiencyMetric());
registerMetric(new NodeCoverageMetric());

registerMetric(new SchemaValidityMetric());
registerMetric(new FieldF1Metric());
registerMetric(new TreeEditDistanceMetric());

registerMetric(new LoopTerminationMetric());
registerMetric(new LoopBudgetMetric());
registerMetric(new LoopConvergenceMetric());
registerMetric(new RetryEfficacyMetric());

registerMetric(new RubricJudgeMetric());
registerMetric(new CheckEvalMetric());

registerMetric(new SafetyMetric());
registerMetric(new SelfConsistencyMetric());
