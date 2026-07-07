#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/mingyuan_aliyun_deploy}"
SSH_USER="${SSH_USER:-root}"
SSH_HOST="${SSH_HOST:-120.25.106.146}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/mingyuan/standalone-new}"
SERVICE_NAME="${SERVICE_NAME:-mingyuan-web}"
HEALTH_URL="${HEALTH_URL:-https://mingyuan-ai.cn/api/healthz}"

SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$SSH_USER@$SSH_HOST")
RSYNC=(rsync -az --delete -e "ssh -i $SSH_KEY -o BatchMode=yes -o StrictHostKeyChecking=accept-new")
RSYNC_DEREF=(rsync -azL --delete -e "ssh -i $SSH_KEY -o BatchMode=yes -o StrictHostKeyChecking=accept-new")

cd "$ROOT_DIR"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1 && [ "${ALLOW_DIRTY_DEPLOY:-0}" != "1" ]; then
  if [ -n "$(git status --porcelain)" ]; then
    echo "Refusing to deploy a dirty worktree. Commit/stash changes or set ALLOW_DIRTY_DEPLOY=1." >&2
    git status --short >&2
    exit 1
  fi
fi

CI=true corepack pnpm --dir apps/web exec prisma generate
CI=true corepack pnpm --filter @mingyuan/web exec next build --webpack
node scripts/materialize-standalone-node-modules.mjs apps/web/.next/standalone

node -e "require.resolve('./apps/web/.next/standalone/apps/web/server.js')"
node -e "const { createRequire } = require('node:module'); const { resolve } = require('node:path'); const appDir = resolve('apps/web/.next/standalone/apps/web'); const appRequire = createRequire(resolve(appDir, 'server.js')); ['next','styled-jsx/package.json','@next/env','react','react-dom','pino'].forEach((id)=>appRequire.resolve(id)); console.log('standalone-deps-ok')"

"${SSH[@]}" "mkdir -p '$REMOTE_DIR/apps/web/.next/static' '$REMOTE_DIR/apps/web/public' '$REMOTE_DIR/apps/web/messages'"
"${SSH[@]}" "rm -rf '$REMOTE_DIR/node_modules' '$REMOTE_DIR/apps/web/node_modules'"

"${RSYNC_DEREF[@]}" apps/web/.next/standalone/ "$SSH_USER@$SSH_HOST:$REMOTE_DIR/"
"${RSYNC[@]}" apps/web/.next/static/ "$SSH_USER@$SSH_HOST:$REMOTE_DIR/apps/web/.next/static/"
"${RSYNC[@]}" apps/web/public/ "$SSH_USER@$SSH_HOST:$REMOTE_DIR/apps/web/public/"
"${RSYNC[@]}" apps/web/messages/ "$SSH_USER@$SSH_HOST:$REMOTE_DIR/apps/web/messages/"

"${SSH[@]}" "cd '$REMOTE_DIR/apps/web' && /usr/bin/node -e \"const { createRequire } = require('node:module'); const { resolve } = require('node:path'); const appRequire = createRequire(resolve('server.js')); ['next','styled-jsx/package.json','@next/env','react','react-dom','pino'].forEach((id)=>appRequire.resolve(id)); console.log('remote-standalone-deps-ok')\""
"${SSH[@]}" "if ! systemctl cat '$SERVICE_NAME' | grep -q 'ExecStart=/usr/bin/node server.js'; then sed -i 's#^ExecStart=.*#ExecStart=/usr/bin/node server.js#' /etc/systemd/system/'$SERVICE_NAME'.service && systemctl daemon-reload; fi"
"${SSH[@]}" "systemctl restart '$SERVICE_NAME' && systemctl is-active '$SERVICE_NAME'"
healthy=0
for attempt in {1..20}; do
  if curl -fsS "$HEALTH_URL" >/dev/null; then
    healthy=1
    break
  fi
  sleep 1
done
if [ "$healthy" -ne 1 ]; then
  echo "Health check failed: $HEALTH_URL" >&2
  exit 1
fi
echo "deployed: $HEALTH_URL"
