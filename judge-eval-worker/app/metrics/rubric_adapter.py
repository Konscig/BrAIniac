"""
Rubric-based LLM judge (f_judge_ref). In MVP the worker exposes a deterministic
token-overlap fallback that preserves the `[0, 1]` normalization contract.
Replacing with a real Prometheus/G-Eval rubric call requires wiring a provider
(Anthropic / OpenAI / vLLM etc.); the hook is intentionally narrow so that
swap-in does not alter the sidecar contract.
"""
from typing import Any, Dict

from app.contracts.schemas import JudgeRefInput, MetricResponse


async def compute_rubric(payload: Dict[str, Any]) -> MetricResponse:
    parsed = JudgeRefInput.model_validate(payload)
    pred = parsed.agent_output.text.strip().lower()
    gold = parsed.reference.answer.strip().lower()

    if not gold:
        return MetricResponse(value=0.0, details={"reason": "empty reference"})
    if pred == gold:
        return MetricResponse(value=1.0, details={"mode": "exact", "rubric": parsed.config.rubric})

    # Proxy heuristic: scaled substring overlap. Explicitly documented as a
    # placeholder until a real rubric model is connected.
    tokens_gold = set(gold.split())
    tokens_pred = set(pred.split())
    if not tokens_gold:
        return MetricResponse(value=0.0, details={"reason": "no gold tokens"})
    overlap = len(tokens_gold & tokens_pred) / len(tokens_gold)
    return MetricResponse(
        value=max(0.0, min(1.0, overlap)),
        details={"mode": "placeholder-token-overlap", "rubric": parsed.config.rubric, "scale": parsed.config.scale},
        warnings=["f_judge_ref is using a placeholder implementation; wire a real rubric provider for thesis-grade results"],
    )
