#!/bin/sh
# Resolve the headless-shell binary HyperFrames renders with.
#
# Sourced by run.sh and scripts/entrypoint.sh — not executed directly.
#
# Why this exists
# ---------------
# Two different resolvers look for a browser, and neither is portable:
#
#   @hypit/browser-capture  reads $PUPPETEER_CACHE_DIR and expects full Chrome.
#   @hyperframes/engine     reads $HYPERFRAMES_BROWSER_PATH, and otherwise walks
#                           a hard-coded platform/arch table that has entries for
#                           darwin/arm64, darwin/x64, linux/x64 and win32 only.
#
# There is no `linux/arm64` entry: on Apple Silicon hosts the engine's cache
# discovery can never succeed, so `hypit doctor` reports
# "HyperFrames browser is unavailable" even though the binary is right there.
# Pinning the path removes the dependency on that table and works on every arch.
# -----------------------------------------------------------------------------

# Prints the newest cached chrome-headless-shell, or nothing when none exists.
resolve_headless_shell() {
  cache=${PUPPETEER_CACHE_DIR:-"$HOME/.cache/puppeteer"}
  base="$cache/chrome-headless-shell"
  [ -d "$base" ] || return 0

  for version in $(ls -1 "$base" | sort -Vr 2>/dev/null); do
    for binary in "$base/$version"/*/chrome-headless-shell; do
      if [ -x "$binary" ]; then
        echo "$binary"
        return 0
      fi
    done
  done
}

# Exports HYPERFRAMES_BROWSER_PATH unless the operator already pinned one.
export_hyperframes_browser_path() {
  if [ -n "${HYPERFRAMES_BROWSER_PATH:-}" ]; then
    return 0
  fi
  resolved=$(resolve_headless_shell)
  if [ -n "$resolved" ]; then
    HYPERFRAMES_BROWSER_PATH="$resolved"
    export HYPERFRAMES_BROWSER_PATH
    echo "browser: HYPERFRAMES_BROWSER_PATH=$HYPERFRAMES_BROWSER_PATH"
  else
    echo "browser: no cached chrome-headless-shell under ${PUPPETEER_CACHE_DIR:-$HOME/.cache/puppeteer}; leaving resolution to HyperFrames" >&2
  fi
}
