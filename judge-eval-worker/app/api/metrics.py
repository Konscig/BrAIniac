from typing import Any, Awaitable, Callable, Dict

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.contracts.schemas import MetricResponse

router = APIRouter()

Handler = Callable[[Dict[str, Any]], Awaitable[MetricResponse] | MetricResponse]


async def _dispatch(code: str, payload: Dict[str, Any]) -> MetricResponse:
    # Lazy imports keep the worker bootable even when some optional deps fail.
    if code == "f_faith":
        from app.metrics.ragas_adapter import compute_faithfulness
        return await compute_faithfulness(payload)
    if code == "f_fact":
        from app.metrics.ragas_adapter import compute_fact
        return await compute_fact(payload)
    if code == "f_cite":
        from app.metrics.ragas_adapter import compute_citation
        return await compute_citation(payload)
    if code == "f_corr":
        from app.metrics.ragas_adapter import compute_correctness
        return await compute_correctness(payload)
    if code == "f_contra":
        from app.metrics.nli_adapter import compute_contra
        return await compute_contra(payload)
    if code == "f_sim":
        from app.metrics.nli_adapter import compute_sim
        return await compute_sim(payload)
    if code == "f_judge_ref":
        from app.metrics.rubric_adapter import compute_rubric
        return await compute_rubric(payload)
    if code == "f_safe":
        from app.metrics.detoxify_adapter import compute_safe
        return await compute_safe(payload)
    raise HTTPException(status_code=404, detail={"code": "EVAL_WORKER_UNKNOWN_METRIC", "metric": code})


@router.post("/{metric_code}")
async def compute_metric(metric_code: str, request: Request) -> JSONResponse:
    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail={"code": "EVAL_WORKER_INVALID_JSON"})

    try:
        result = await _dispatch(metric_code, payload)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"code": "EVAL_WORKER_INVALID_INPUT", "message": str(exc)})
    except NotImplementedError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "EVAL_WORKER_METRIC_NOT_APPLICABLE", "reason": str(exc)},
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail={"code": "EVAL_WORKER_NOT_READY", "message": str(exc)})

    return JSONResponse(status_code=200, content=result.model_dump())
