#!/bin/sh
# Start the Hypit rendering backend.
#
#   ./run.sh                 # foreground, reads ./.env
#   ENV_FILE=/path/to/.env ./run.sh
#
# Nothing here prints the token.
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
env_file=${ENV_FILE:-"$project_dir/.env"}

if [ ! -f "$env_file" ]; then
  echo "missing $env_file — copy .env.example and set HYPIT_API_TOKEN" >&2
  exit 1
fi

# Export every assignment in the env file.
set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

if [ -z "${HYPIT_API_TOKEN:-}" ] || [ "${HYPIT_API_TOKEN}" = "replace-me" ]; then
  echo "HYPIT_API_TOKEN is unset or still the placeholder" >&2
  exit 1
fi

# Same browser resolution the container uses, so a local run and a container run
# cannot diverge. See scripts/resolve-browser.sh for why this is needed at all.
# shellcheck source=scripts/resolve-browser.sh
. "$project_dir/scripts/resolve-browser.sh"
export_hyperframes_browser_path

if [ "${HYPIT_PS_SHIM:-1}" = "1" ] && [ ! -x "$project_dir/bin/ps" ]; then
  echo "building the ps shim (required for local renders on macOS 26)"
  "$project_dir/scripts/build_ps_shim.sh"
fi

# Prefer a project-local virtualenv, then whatever python3 is on PATH.
python_bin="$project_dir/.venv/bin/python"
if [ ! -x "$python_bin" ]; then
  python_bin=$(command -v python3)
fi

exec "$python_bin" -m uvicorn app.main:app \
  --host "${HYPIT_HOST:-127.0.0.1}" \
  --port "${HYPIT_PORT:-8787}" \
  --app-dir "$project_dir"
