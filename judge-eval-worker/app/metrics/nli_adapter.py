from typing import Any, Dict, List, Optional

from app.contracts.schemas import ContraInput, MetricResponse, SimInput

_EMBED_MODEL: Any = None
_NLI_PIPE: Any = None


def warm_up() -> None:
    global _EMBED_MODEL, _NLI_PIPE
    from sentence_transformers import SentenceTransformer
    from transformers import pipeline

    _EMBED_MODEL = SentenceTransformer("sentence-transformers/all-mpnet-base-v2")
    _NLI_PIPE = pipeline("text-classification", model="roberta-large-mnli", return_all_scores=True)


def _require_models() -> None:
    if _EMBED_MODEL is None or _NLI_PIPE is None:
        raise RuntimeError("nli/sim models are not loaded; check worker /health")


def _cosine(a: List[float], b: List[float]) -> float:
    import numpy as np

    va = np.array(a, dtype=float)
    vb = np.array(b, dtype=float)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
    if denom == 0:
        return 0.0
    return max(0.0, float(np.dot(va, vb) / denom))


async def compute_sim(payload: Dict[str, Any]) -> MetricResponse:
    _require_models()
    parsed = SimInput.model_validate(payload)
    emb = _EMBED_MODEL.encode([parsed.agent_output.text, parsed.reference.answer])
    value = _cosine(list(emb[0]), list(emb[1]))
    return MetricResponse(value=value, details={"strategy": "mpnet-cosine"})


async def compute_contra(payload: Dict[str, Any]) -> MetricResponse:
    _require_models()
    parsed = ContraInput.model_validate(payload)
    context = parsed.agent_output.context
    hypothesis = parsed.agent_output.text
    if not context:
        raise NotImplementedError("context is empty; contradiction not applicable")

    contradictions = 0
    total = len(context)
    for premise in context:
        scores = _NLI_PIPE(f"{premise} </s> {hypothesis}")[0]
        by_label = {str(s["label"]).lower(): float(s["score"]) for s in scores}
        label = max(by_label, key=by_label.get)
        if label.startswith("contradict"):
            contradictions += 1

    rate = contradictions / total if total else 0.0
    value = max(0.0, 1.0 - rate)
    return MetricResponse(value=value, details={"contradictions": contradictions, "total": total})
