from dataclasses import dataclass
from typing import Dict, List

_LOADED: Dict[str, bool] = {}


@dataclass
class ReadyState:
    all_ready: bool
    loaded: List[str]
    pending: List[str]


def mark_loaded(name: str) -> None:
    _LOADED[name] = True


def mark_pending(name: str) -> None:
    _LOADED.setdefault(name, False)


def list_ready_models() -> ReadyState:
    loaded = [k for k, v in _LOADED.items() if v]
    pending = [k for k, v in _LOADED.items() if not v]
    return ReadyState(all_ready=not pending, loaded=loaded, pending=pending)


def warm_up_models() -> None:
    # Lazy imports so a missing optional dependency does not crash the whole
    # service — a metric that relies on a missing model will return 503 on call.
    for name in ("ragas:default", "nli:mnli-base", "detoxify:unbiased-small", "sim:mpnet-base"):
        mark_pending(name)

    try:
        from app.metrics.nli_adapter import warm_up as _nli_warm
        _nli_warm()
        mark_loaded("nli:mnli-base")
        mark_loaded("sim:mpnet-base")
    except Exception as exc:  # noqa: BLE001
        print(f"[warmup] nli/sim skipped: {exc}")

    try:
        from app.metrics.detoxify_adapter import warm_up as _detoxify_warm
        _detoxify_warm()
        mark_loaded("detoxify:unbiased-small")
    except Exception as exc:  # noqa: BLE001
        print(f"[warmup] detoxify skipped: {exc}")

    try:
        from app.metrics.ragas_adapter import warm_up as _ragas_warm
        _ragas_warm()
        mark_loaded("ragas:default")
    except Exception as exc:  # noqa: BLE001
        print(f"[warmup] ragas skipped: {exc}")
