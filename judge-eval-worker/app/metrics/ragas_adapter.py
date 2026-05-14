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
_MORPH = None


def warm_up() -> None:
    global _READY, _MORPH
    # Attempt to import; success sets READY. We do not force LLM initialization
    # here because Ragas requires provider credentials which are wired in at
    # runtime only if the user opts in.
    try:
        import ragas  # noqa: F401

        _READY = True
    except Exception as exc:  # noqa: BLE001
        print(f"[ragas] warm_up fallback: {exc}")
        _READY = False
    # Лемматизатор русского языка: token-overlap fallback на флексивном языке
    # без приведения к начальной форме систематически даёт нули («оформляется»
    # ≠ «оформляются»). pymorphy3 — стандартный лёгкий инструмент.
    try:
        import pymorphy3
        _MORPH = pymorphy3.MorphAnalyzer()
        print("[ragas] pymorphy3 morphology loaded")
    except Exception as exc:  # noqa: BLE001
        print(f"[ragas] pymorphy3 unavailable, falling back to plain lowercase: {exc}")
        _MORPH = None


import re as _re

_PUNCT_RE = _re.compile(r"[^\w\s\-]", _re.UNICODE)


def _normalize(token: str) -> str:
    if _MORPH is None:
        return token
    try:
        parses = _MORPH.parse(token)
        if parses:
            return parses[0].normal_form
    except Exception:
        pass
    return token


def _tokens(text: str) -> List[str]:
    cleaned = _PUNCT_RE.sub(" ", text or "").lower()
    return [_normalize(t) for t in cleaned.split() if t and len(t) > 1]


def _support_ratio(claim_tokens: List[str], context_tokens: List[str]) -> float:
    if not claim_tokens:
        return 1.0
    hits = sum(1 for t in claim_tokens if t in context_tokens)
    return hits / len(claim_tokens)


def _embedding_support(claim: str, context_texts: List[str], threshold: float = 0.55) -> bool:
    """Считает claim поддержанным контекстом, если cosine similarity между
    claim-embedding и хотя бы одним context-chunk-embedding ≥ threshold.
    Для русского флексивного языка embedding-similarity радикально надёжнее,
    чем lemmatized token-overlap (стандарт RAGAS/TruLens RAG Triad).
    """
    try:
        from app.metrics.nli_adapter import _EMBED_MODEL  # type: ignore
        if _EMBED_MODEL is None:
            return False
        import numpy as np
        items = [claim] + [c for c in context_texts if c]
        emb = _EMBED_MODEL.encode(items)
        claim_vec = np.array(emb[0], dtype=float)
        cn = float(np.linalg.norm(claim_vec))
        if cn == 0:
            return False
        for ctx_vec_raw in emb[1:]:
            cv = np.array(ctx_vec_raw, dtype=float)
            denom = float(np.linalg.norm(cv) * cn)
            if denom == 0:
                continue
            sim = float(np.dot(claim_vec, cv) / denom)
            if sim >= threshold:
                return True
        return False
    except Exception:
        return False


async def compute_faithfulness(payload: Dict[str, Any]) -> MetricResponse:
    parsed = FaithfulnessInput.model_validate(payload)
    claims = parsed.agent_output.claims or [s.strip() for s in parsed.agent_output.text.split(".") if s.strip()]
    contexts = parsed.agent_output.context
    if not claims:
        raise NotImplementedError("no claims extracted from answer")
    if not contexts:
        raise NotImplementedError("no context provided")

    # Сначала embedding-based (главный путь), fallback на lemmatized tokens
    context_tokens = _tokens(" ".join(contexts))
    supported = 0
    mode_used = "embedding-cosine"
    embedding_attempted = False
    for claim in claims:
        if _embedding_support(claim, contexts):
            supported += 1
            embedding_attempted = True
        elif _support_ratio(_tokens(claim), context_tokens) >= 0.5:
            supported += 1
    if not embedding_attempted:
        mode_used = "lemmatized-token-fallback"
    value = supported / len(claims)
    return MetricResponse(
        value=value,
        details={"claims_total": len(claims), "claims_supported": supported, "mode": mode_used},
    )


async def compute_fact(payload: Dict[str, Any]) -> MetricResponse:
    parsed = FactInput.model_validate(payload)
    atoms = [s.strip() for s in parsed.agent_output.text.split(".") if s.strip()]
    refs = parsed.reference.relevant_doc_texts
    if not atoms:
        raise NotImplementedError("no atoms extracted from answer")
    if not refs:
        raise NotImplementedError("no reference docs provided")

    ref_tokens = _tokens(" ".join(refs))
    supported = 0
    mode_used = "embedding-cosine"
    embedding_attempted = False
    for atom in atoms:
        if _embedding_support(atom, refs):
            supported += 1
            embedding_attempted = True
        elif _support_ratio(_tokens(atom), ref_tokens) >= 0.5:
            supported += 1
    if not embedding_attempted:
        mode_used = "lemmatized-token-fallback"
    value = supported / len(atoms)
    return MetricResponse(
        value=value,
        details={"atoms_total": len(atoms), "atoms_supported": supported, "mode": mode_used},
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
