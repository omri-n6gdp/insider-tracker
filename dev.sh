#!/usr/bin/env bash
# Dev mode: Vite dev server (hot reload) + uvicorn, side by side.
set -e
cd "$(dirname "$0")"
PORT="${PORT:-8077}"
( cd frontend && npm run dev ) &
VITE_PID=$!
trap 'kill $VITE_PID 2>/dev/null' EXIT
exec ./.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port "$PORT" --reload
