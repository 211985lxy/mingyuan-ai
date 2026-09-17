#!/bin/sh
# Container entrypoint: resolve the render browser, then start the API.
#
# Kept separate from run.sh because the container takes its configuration from
# the environment, not from a .env file.
set -eu

# shellcheck source=resolve-browser.sh
. /app/scripts/resolve-browser.sh
export_hyperframes_browser_path

exec python3 -m uvicorn app.main:app \
  --host "${HYPIT_HOST:-0.0.0.0}" \
  --port "${HYPIT_PORT:-8787}" \
  --app-dir /app
