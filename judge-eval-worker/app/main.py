from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.metrics import router as metrics_router
from app.metrics.registry import list_ready_models, warm_up_models

app = FastAPI(title="judge-eval-worker", version="0.1.0")


@app.on_event("startup")
async def _startup() -> None:
    warm_up_models()


@app.get("/health")
def health() -> JSONResponse:
    ready = list_ready_models()
    if not ready.all_ready:
        # Возвращаем 200 с degraded-статусом, чтобы compose healthcheck не блокировал
        # сервис во время загрузки моделей — нативные метрики работают без моделей.
        return JSONResponse(
            status_code=200,
            content={
                "status": "degraded",
                "version": "0.1.0",
                "models_loaded": ready.loaded,
                "pending_models": ready.pending,
            },
        )
    return JSONResponse(
        status_code=200,
        content={"status": "ok", "version": "0.1.0", "models_loaded": ready.loaded},
    )


@app.get("/ready")
def ready() -> JSONResponse:
    """Readiness probe: 200 только когда все модели загружены."""
    r = list_ready_models()
    if not r.all_ready:
        return JSONResponse(
            status_code=503,
            content={"ready": False, "pending_models": r.pending},
        )
    return JSONResponse(status_code=200, content={"ready": True})


@app.exception_handler(ValueError)
async def _value_error_handler(_: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"code": "EVAL_WORKER_INVALID_INPUT", "message": str(exc)},
    )


app.include_router(metrics_router, prefix="/metrics")
