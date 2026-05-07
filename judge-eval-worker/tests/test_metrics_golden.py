"""Minimal golden-input tests that do not require downloaded models."""
import asyncio

from app.metrics.ragas_adapter import (
    compute_citation,
    compute_correctness,
    compute_faithfulness,
)


def test_correctness_exact_match():
    payload = {"agent_output": {"text": "Paris"}, "reference": {"answer": "Paris"}}
    result = asyncio.run(compute_correctness(payload))
    assert 0.99 <= result.value <= 1.0


def test_citation_precision_recall():
    payload = {
        "agent_output": {"text_with_citations": "Observed in [d1] and [d2]."},
        "reference": {"relevant_doc_ids": ["d1"]},
    }
    result = asyncio.run(compute_citation(payload))
    assert 0.0 <= result.value <= 1.0


def test_faithfulness_token_support():
    payload = {
        "agent_output": {
            "text": "Paris is the capital of France.",
            "context": ["Paris is the capital city of France."],
            "claims": ["Paris is the capital of France."],
        }
    }
    result = asyncio.run(compute_faithfulness(payload))
    assert result.value >= 0.5
