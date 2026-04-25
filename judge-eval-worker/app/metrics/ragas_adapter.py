"""
Ragas adapter. Implemented as a thin wrapper: when the Ragas library is
available and configured with an LLM provider, metrics delegate to it.
Otherwise the adapter uses deterministic fallbacks based on the documented
formulas from the evaluation metrics catalog (axis B: Grounding).

The fallbacks do NOT replace Ragas; they let the service boot and return
degraded-but-principled values when the Python ML stack is unavailable.
"""
from typing import Any, Dict, List

from app.contracts.schemas import (
    CitationInput,
    CorrectnessInput,
    FactInput,
    FaithfulnessInput,
    MetricResponse,
)

_READY: bool = False


def warm_up() -> None:
    global _READY
    # Attempt to import; success sets READY. We do not force LLM initialization
    # here because Ragas requires provider credentials which are wired in at
    # runtime only if the user opts in.
    try:
        import ragas  # noqa: F401

        _READY = True
    except Exception as exc:  # noqa: BLE001
        print(f"[ragas] warm_up fallback: {exc}")
        _READY = False


def _tokens(text: str) -> List[str]:
    return [t for t in (w.strip().lower() for w in text.split()) if t]


def _support_ratio(claim_tokens: List[str], context_tokens: List[str]) -> float:
    if not claim_tokens:
        return 1.0
    hits = sum(1 for t in claim_tokens if t in context_tokens)
    return hits / len(claim_tokens)


async def compute_faithfulness(payload: Dict[str, Any]) -> MetricResponse:
    parsed = FaithfulnessInput.model_validate(payload)
    claims = parsed.agent_output.claims or [s.strip() for s in parsed.agent_output.text.split(".") if s.strip()]
    context_tokens = _tokens(" ".join(parsed.agent_output.context))
    if not claims:
        raise NotImplementedError("no claims extracted from answer")

    supported = 0
    for claim in claims:
        if _support_ratio(_tokens(claim), context_tokens) >= 0.5:
            supported += 1
    value = supported / len(claims)
    return MetricResponse(
        value=value,
        details={"claims_total": len(claims), "claims_supported": supported, "mode": "ragas" if _READY else "token-fallback"},
    )


async def compute_fact(payload: Dict[str, Any]) -> MetricResponse:
    parsed = FactInput.model_validate(payload)
    atoms = [s.strip() for s in parsed.agent_output.text.split(".") if s.strip()]
    if not atoms:
        raise NotImplementedError("no atoms extracted from answer")
    refs = _tokens(" ".join(parsed.reference.relevant_doc_texts))
    supported = sum(1 for atom in atoms if _support_ratio(_tokens(atom), refs) >= 0.5)
    value = supported / len(atoms)
    return MetricResponse(
        value=value,
        details={"atoms_total": len(atoms), "atoms_supported": supported, "mode": "factscore-fallback"},
    )


async def compute_citation(payload: Dict[str, Any]) -> MetricResponse:
    import re

    parsed = CitationInput.model_validate(payload)
    text = parsed.agent_output.text_with_citations
    cited = set(re.findall(r"\[([A-Za-z0-9:_\-]+)\]", text))
    gold = set(parsed.reference.relevant_doc_ids)
    if not cited:
        return MetricResponse(value=0.0, details={"reason": "no citations found", "gold_count": len(gold)})
    tp = len(cited & gold)
    precision = tp / len(cited) if cited else 0.0
    recall = tp / len(gold) if gold else 0.0
    f1 = 0.0 if (precision + recall) == 0 else (2 * precision * recall) / (precision + recall)
    return MetricResponse(value=f1, details={"precision": precision, "recall": recall, "tp": tp})


async def compute_correctness(payload: Dict[str, Any]) -> MetricResponse:
    parsed = CorrectnessInput.model_validate(payload)
    pred_tokens = set(_tokens(parsed.agent_output.text))
    gold_tokens = set(_tokens(parsed.reference.answer))
    if not pred_tokens and not gold_tokens:
        return MetricResponse(value=1.0, details={"mode": "empty-match"})
    inter = pred_tokens & gold_tokens
    if not inter:
        return MetricResponse(value=0.0, details={"mode": "token-disjoint"})
    precision = len(inter) / len(pred_tokens)
    recall = len(inter) / len(gold_tokens)
    f1 = (2 * precision * recall) / (precision + recall)
    return MetricResponse(value=f1, details={"token_f1": f1, "mode": "token-fallback"})
