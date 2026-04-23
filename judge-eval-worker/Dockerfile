FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml ./

RUN pip install --index-url https://download.pytorch.org/whl/cpu torch && \
    pip install "fastapi>=0.115" "uvicorn[standard]>=0.32" "pydantic>=2.8" \
        "httpx>=0.27" "numpy>=1.26" "ragas>=0.2" "deepeval>=1.0" \
        "detoxify>=0.5" "sentence-transformers>=3.0" "transformers>=4.44"

COPY app ./app

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
