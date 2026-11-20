# Contexto de build: a raiz do repositório (compose.yaml), porque a API usa o pacote do pipeline.
FROM ghcr.io/astral-sh/uv:0.12-python3.12-trixie-slim
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
COPY pipeline/riasense pipeline/riasense
RUN uv sync --frozen --no-dev
COPY api api
COPY config config
EXPOSE 8000
CMD ["uv", "run", "--no-sync", "uvicorn", "app:app", "--app-dir", "api", "--host", "0.0.0.0", "--port", "8000"]
