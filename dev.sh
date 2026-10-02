#!/usr/bin/env bash
# Development mode: API with auto-reload (port 8000) + Vite dev server with hot reload (port 5180).
# Usage: ./dev.sh            → http://localhost:5180   (Ctrl+C stops both)
set -euo pipefail
cd "$(dirname "$0")"

(cd frontend && { [ -d node_modules ] || npm ci; })
(cd backend && uv sync --quiet)

# On exit, stop everything started from this script (API, reloader, Vite).
trap 'trap - EXIT INT TERM; kill 0 2>/dev/null' EXIT INT TERM

(cd backend && uv run uvicorn paint_plotter.main:app --host 127.0.0.1 --port 8000 --reload) &

echo "Paint Plotter (dev): http://localhost:5180"
cd frontend && npm run dev
