#!/usr/bin/env bash
# Insider Trading Tracker — one-command launcher.
# Creates a local virtual environment the first time, installs the two
# dependencies, then starts the server and opens your browser.
set -e
cd "$(dirname "$0")"

PORT="${PORT:-8077}"

# 1. Make sure we have a Python virtual environment with the deps.
if [ ! -d ".venv" ]; then
  echo "First run: creating a private Python environment (one-time, ~20s)…"
  python3 -m venv .venv
  ./.venv/bin/python -m pip install --quiet --upgrade pip
  ./.venv/bin/python -m pip install --quiet -r requirements.txt
  echo "Setup done."
fi

# 2. Open the dashboard in the browser a moment after the server starts.
( sleep 2; (open "http://localhost:${PORT}" 2>/dev/null || true) ) &

# 3. Start the server (this stays running — press Ctrl+C to stop).
echo ""
echo "  Insider Trading Tracker is starting…"
echo "  Open this in your browser:  http://localhost:${PORT}"
echo "  (It keeps fetching new SEC filings every few minutes. Press Ctrl+C to stop.)"
echo ""
exec ./.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port "${PORT}"
