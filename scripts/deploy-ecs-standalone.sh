#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/mingyuan_aliyun_deploy}"
SSH_USER="${SSH_USER:-root}"
SSH_HOST="${SSH_HOST:-120.25.106.146}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/mingyuan/standalone-new}"
REMOTE_INCOMING_DIR="${REMOTE_DIR}.incoming"
REMOTE_BACKUP_DIR="${REMOTE_DIR}.previous"
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
CI=true corepack pnpm --filter @mingyuan/web run typecheck
CI=true corepack pnpm --filter @mingyuan/web run test:harness
CI=true corepack pnpm --filter @mingyuan/web run arch:check
CI=true corepack pnpm --filter @mingyuan/web run arch:size
CI=true corepack pnpm --filter @mingyuan/web exec next build --webpack
node scripts/materialize-standalone-node-modules.mjs apps/web/.next/standalone
node scripts/validate-standalone-artifact.mjs apps/web/.next/standalone

# 写入发布事实清单：线上可通过 /api/healthz 回读 releaseSha/buildTime/version，
# 使「线上版本 = 哪个 Git 提交」始终可验证（90 天计划 0.3）。
RELEASE_SHA="$(git rev-parse HEAD)"
RELEASE_BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RELEASE_VERSION="$(node -p "require('./apps/web/package.json').version")"
node -e "require('node:fs').writeFileSync('apps/web/.next/standalone/apps/web/release-manifest.json', JSON.stringify({ releaseSha: process.argv[1], buildTime: process.argv[2], version: process.argv[3], generatedAt: new Date().toISOString() }, null, 2) + '\n')" "$RELEASE_SHA" "$RELEASE_BUILD_TIME" "$RELEASE_VERSION"
echo "release-manifest: sha=$RELEASE_SHA buildTime=$RELEASE_BUILD_TIME version=$RELEASE_VERSION"

node -e "require.resolve('./apps/web/.next/standalone/apps/web/server.js')"
node -e "const { createRequire } = require('node:module'); const { resolve } = require('node:path'); const appDir = resolve('apps/web/.next/standalone/apps/web'); const appRequire = createRequire(resolve(appDir, 'server.js')); ['next','styled-jsx/package.json','@next/env','react','react-dom','pino'].forEach((id)=>appRequire.resolve(id)); console.log('standalone-deps-ok')"

"${SSH[@]}" "rm -rf '$REMOTE_INCOMING_DIR' && mkdir -p '$REMOTE_INCOMING_DIR/apps/web/.next/static' '$REMOTE_INCOMING_DIR/apps/web/public' '$REMOTE_INCOMING_DIR/apps/web/messages' '$REMOTE_INCOMING_DIR/ops'"

"${RSYNC_DEREF[@]}" apps/web/.next/standalone/ "$SSH_USER@$SSH_HOST:$REMOTE_INCOMING_DIR/"
"${RSYNC[@]}" apps/web/.next/static/ "$SSH_USER@$SSH_HOST:$REMOTE_INCOMING_DIR/apps/web/.next/static/"
"${RSYNC[@]}" apps/web/public/ "$SSH_USER@$SSH_HOST:$REMOTE_INCOMING_DIR/apps/web/public/"
"${RSYNC[@]}" apps/web/messages/ "$SSH_USER@$SSH_HOST:$REMOTE_INCOMING_DIR/apps/web/messages/"
"${RSYNC[@]}" apps/web/scripts/verify-production-schema.mjs "$SSH_USER@$SSH_HOST:$REMOTE_INCOMING_DIR/ops/"
"${RSYNC[@]}" apps/web/prisma/production-schema-contract.json "$SSH_USER@$SSH_HOST:$REMOTE_INCOMING_DIR/ops/"

"${SSH[@]}" "cd '$REMOTE_INCOMING_DIR/apps/web' && /usr/bin/node -e \"const { createRequire } = require('node:module'); const { resolve } = require('node:path'); const appRequire = createRequire(resolve('server.js')); ['next','styled-jsx/package.json','@next/env','react','react-dom','pino'].forEach((id)=>appRequire.resolve(id)); console.log('remote-standalone-deps-ok')\""
"${SSH[@]}" "set -a; . /etc/mingyuan/mingyuan.env; set +a; /usr/bin/node '$REMOTE_INCOMING_DIR/ops/verify-production-schema.mjs' '$REMOTE_INCOMING_DIR/ops/production-schema-contract.json'"
"${SSH[@]}" "if ! systemctl cat '$SERVICE_NAME' | grep -q 'ExecStart=/usr/bin/node server.js'; then sed -i 's#^ExecStart=.*#ExecStart=/usr/bin/node server.js#' /etc/systemd/system/'$SERVICE_NAME'.service && systemctl daemon-reload; fi"
"${SSH[@]}" "set -e; rm -rf '$REMOTE_BACKUP_DIR'; if [ -d '$REMOTE_DIR' ]; then mv '$REMOTE_DIR' '$REMOTE_BACKUP_DIR'; fi; mv '$REMOTE_INCOMING_DIR' '$REMOTE_DIR'; if ! systemctl restart '$SERVICE_NAME'; then rm -rf '$REMOTE_DIR'; if [ -d '$REMOTE_BACKUP_DIR' ]; then mv '$REMOTE_BACKUP_DIR' '$REMOTE_DIR'; systemctl restart '$SERVICE_NAME'; fi; exit 1; fi; systemctl is-active '$SERVICE_NAME'"
healthy=0
for attempt in {1..20}; do
  if curl -fsS "$HEALTH_URL" >/dev/null; then
    healthy=1
    break
  fi
  sleep 1
done
if [ "$healthy" -ne 1 ]; then
  "${SSH[@]}" "set -e; systemctl stop '$SERVICE_NAME' || true; rm -rf '${REMOTE_DIR}.failed'; if [ -d '$REMOTE_DIR' ]; then mv '$REMOTE_DIR' '${REMOTE_DIR}.failed'; fi; if [ -d '$REMOTE_BACKUP_DIR' ]; then mv '$REMOTE_BACKUP_DIR' '$REMOTE_DIR'; systemctl start '$SERVICE_NAME'; fi"
  echo "Health check failed: $HEALTH_URL" >&2
  exit 1
fi

# 回读线上发布事实：releaseSha 必须等于本地 HEAD，否则视为发布事实不一致。
LIVE_SHA="$(curl -fsS "$HEALTH_URL" | node -e "let d='';process.stdin.on('data',(c)=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).releaseSha??'unknown')}catch{console.log('unknown')}})")"
echo "healthz releaseSha=$LIVE_SHA (expected $RELEASE_SHA)"
if [ "$LIVE_SHA" != "$RELEASE_SHA" ]; then
  echo "WARNING: live releaseSha does not match local HEAD; 线上版本与代码版本不一致，需人工确认。" >&2
fi
echo "deployed: $HEALTH_URL"
