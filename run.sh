#!/usr/bin/env bash
# Production mode: build the frontend once, then FastAPI serves app + API on one port.
# Usage: ./run.sh            → http://localhost:8000
set -euo pipefail
cd "$(dirname "$0")"

(cd frontend && { [ -d node_modules ] || npm ci; } && npm run build)
(cd backend && uv sync --quiet)

echo "Paint Plotter: http://localhost:8000"
cd backend && exec uv run paint-plotter
