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
BACKGROUND_TASK_SERVICE="${BACKGROUND_TASK_SERVICE:-mingyuan-background-tasks.service}"
BACKGROUND_TASK_TIMER="${BACKGROUND_TASK_TIMER:-mingyuan-background-tasks.timer}"
HEALTH_URL="${HEALTH_URL:-https://mingyuan-ai.cn/api/healthz}"

SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "$SSH_USER@$SSH_HOST")
RSYNC=(rsync -az --partial --delete -e "ssh -i $SSH_KEY -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ServerAliveCountMax=10")
RSYNC_DEREF=(rsync -azL --partial --delete -e "ssh -i $SSH_KEY -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ServerAliveCountMax=10")

retry_transfer() {
  local attempt=1
  until "$@"; do
    if [ "$attempt" -ge 3 ]; then
      echo "Transfer failed after $attempt attempts." >&2
      return 1
    fi
    attempt=$((attempt + 1))
    echo "Transfer interrupted; resuming attempt $attempt/3 in 3s..." >&2
    sleep 3
  done
}

# 数据库迁移：服务器无 prisma CLI，经 SSH 隧道用本地 CLI 对生产库执行 prisma migrate deploy。
# 在补丁脚本之后、契约校验与代码切换之前运行；失败即中止发布，旧版本继续服务。
# 紧急情况下可 SKIP_MIGRATIONS=1 跳过（须自行确认 schema 已到位）。
run_migrations() {
  if [ "${SKIP_MIGRATIONS:-0}" = "1" ]; then
    echo "SKIP_MIGRATIONS=1 — prisma migrate deploy 已跳过。" >&2
    return 0
  fi
  local port="${MIGRATE_TUNNEL_PORT:-13390}" raw_url mod_url
  "${SSH[@]}" -f -N -L "$port:127.0.0.1:3306"
  raw_url="$("${SSH[@]}" 'grep "^DATABASE_URL=" /etc/mingyuan/mingyuan.env | head -1' | sed 's/^DATABASE_URL=//' | tr -d '"')"
  if ! mod_url="$(DATABASE_URL="$raw_url" node -e 'const u=new URL(process.env.DATABASE_URL); u.hostname="127.0.0.1"; u.port=process.argv[1]; process.stdout.write(u.toString())' "$port")"; then
    lsof -ti ":$port" | xargs kill 2>/dev/null || true
    echo "Failed to build tunneled DATABASE_URL for migrations." >&2
    return 1
  fi
  if ! (cd apps/web && DATABASE_URL="$mod_url" corepack pnpm exec prisma migrate deploy); then
    lsof -ti ":$port" | xargs kill 2>/dev/null || true
    echo "prisma migrate deploy 失败 — 已在切换新代码之前中止发布。" >&2
    return 1
  fi
  lsof -ti ":$port" | xargs kill 2>/dev/null || true
}

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
node apps/web/scripts/build-document-parser-worker.mjs

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

retry_transfer "${RSYNC_DEREF[@]}" apps/web/.next/standalone/ "$SSH_USER@$SSH_HOST:$REMOTE_INCOMING_DIR/"
retry_transfer "${RSYNC[@]}" apps/web/.next/static/ "$SSH_USER@$SSH_HOST:$REMOTE_INCOMING_DIR/apps/web/.next/static/"
retry_transfer "${RSYNC[@]}" apps/web/public/ "$SSH_USER@$SSH_HOST:$REMOTE_INCOMING_DIR/apps/web/public/"
retry_transfer "${RSYNC[@]}" apps/web/messages/ "$SSH_USER@$SSH_HOST:$REMOTE_INCOMING_DIR/apps/web/messages/"
retry_transfer "${RSYNC[@]}" apps/web/scripts/verify-production-schema.mjs "$SSH_USER@$SSH_HOST:$REMOTE_INCOMING_DIR/ops/"
retry_transfer "${RSYNC[@]}" apps/web/scripts/apply-production-schema-patches.mjs "$SSH_USER@$SSH_HOST:$REMOTE_INCOMING_DIR/ops/"
retry_transfer "${RSYNC[@]}" apps/web/prisma/production-schema-contract.json "$SSH_USER@$SSH_HOST:$REMOTE_INCOMING_DIR/ops/"
retry_transfer "${RSYNC[@]}" ops/systemd/mingyuan-background-tasks.service "$SSH_USER@$SSH_HOST:/etc/systemd/system/$BACKGROUND_TASK_SERVICE"
retry_transfer "${RSYNC[@]}" ops/systemd/mingyuan-background-tasks.timer "$SSH_USER@$SSH_HOST:/etc/systemd/system/$BACKGROUND_TASK_TIMER"

"${SSH[@]}" "cd '$REMOTE_INCOMING_DIR/apps/web' && /usr/bin/node -e \"const { createRequire } = require('node:module'); const { resolve } = require('node:path'); const appRequire = createRequire(resolve('server.js')); ['next','styled-jsx/package.json','@next/env','react','react-dom','pino'].forEach((id)=>appRequire.resolve(id)); console.log('remote-standalone-deps-ok')\""
"${SSH[@]}" "set -a; . /etc/mingyuan/mingyuan.env; set +a; /usr/bin/node '$REMOTE_INCOMING_DIR/ops/apply-production-schema-patches.mjs'"
run_migrations
"${SSH[@]}" "set -a; . /etc/mingyuan/mingyuan.env; set +a; /usr/bin/node '$REMOTE_INCOMING_DIR/ops/verify-production-schema.mjs' '$REMOTE_INCOMING_DIR/ops/production-schema-contract.json'"
"${SSH[@]}" "if ! systemctl cat '$SERVICE_NAME' | grep -q 'ExecStart=/usr/bin/node server.js'; then sed -i 's#^ExecStart=.*#ExecStart=/usr/bin/node server.js#' /etc/systemd/system/'$SERVICE_NAME'.service && systemctl daemon-reload; fi"
"${SSH[@]}" "set -e; rm -rf '$REMOTE_BACKUP_DIR'; if [ -d '$REMOTE_DIR' ]; then mv '$REMOTE_DIR' '$REMOTE_BACKUP_DIR'; fi; mv '$REMOTE_INCOMING_DIR' '$REMOTE_DIR'; if ! systemctl restart '$SERVICE_NAME'; then rm -rf '$REMOTE_DIR'; if [ -d '$REMOTE_BACKUP_DIR' ]; then mv '$REMOTE_BACKUP_DIR' '$REMOTE_DIR'; systemctl restart '$SERVICE_NAME'; fi; exit 1; fi; systemctl is-active '$SERVICE_NAME'"

# 切换后健康检查必须走 ECS 内网，避免本机 DNS 解析失败误触发回滚。
healthy=0
for attempt in {1..30}; do
  if "${SSH[@]}" "/usr/bin/curl --noproxy '*' --fail --silent --show-error --max-time 2 http://127.0.0.1:3000/api/healthz >/dev/null"; then
    healthy=1
    break
  fi
  sleep 1
done
if [ "$healthy" -ne 1 ]; then
  "${SSH[@]}" "set -e; systemctl stop '$SERVICE_NAME' || true; rm -rf '${REMOTE_DIR}.failed'; if [ -d '$REMOTE_DIR' ]; then mv '$REMOTE_DIR' '${REMOTE_DIR}.failed'; fi; if [ -d '$REMOTE_BACKUP_DIR' ]; then mv '$REMOTE_BACKUP_DIR' '$REMOTE_DIR'; systemctl start '$SERVICE_NAME'; fi"
  echo "Health check failed on ECS localhost: http://127.0.0.1:3000/api/healthz" >&2
  exit 1
fi

"${SSH[@]}" "set -e; if grep -q '^BACKGROUND_TASKS_ENABLED=' /etc/mingyuan/mingyuan.env; then sed -i 's/^BACKGROUND_TASKS_ENABLED=.*/BACKGROUND_TASKS_ENABLED=true/' /etc/mingyuan/mingyuan.env; else printf '\nBACKGROUND_TASKS_ENABLED=true\n' >> /etc/mingyuan/mingyuan.env; fi; chmod 600 /etc/mingyuan/mingyuan.env; systemctl daemon-reload; systemctl enable --now '$BACKGROUND_TASK_TIMER'; systemctl restart '$SERVICE_NAME'; systemctl is-active '$SERVICE_NAME'; ready=0; for attempt in {1..30}; do if /usr/bin/curl --noproxy '*' --fail --silent --show-error --max-time 2 http://127.0.0.1:3000/api/healthz >/dev/null; then ready=1; break; fi; sleep 1; done; if [ \"\$ready\" -ne 1 ]; then exit 1; fi; systemctl start '$BACKGROUND_TASK_SERVICE'; systemctl is-active '$BACKGROUND_TASK_TIMER'"

# 回读线上发布事实：releaseSha 必须等于本地 HEAD（经 SSH 内网，不依赖本机 DNS）。
LIVE_SHA="$("${SSH[@]}" "/usr/bin/curl --noproxy '*' --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/api/healthz" | node -e "let d='';process.stdin.on('data',(c)=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).releaseSha??'unknown')}catch{console.log('unknown')}})")"
echo "healthz releaseSha=$LIVE_SHA (expected $RELEASE_SHA)"
if [ "$LIVE_SHA" != "$RELEASE_SHA" ]; then
  echo "ERROR: live releaseSha does not match local HEAD; aborting as failed release." >&2
  exit 1
fi

# 对外冒烟：失败只告警，不回滚（避免本机 DNS/网络抖动误伤）。
if ! curl -fsS --max-time 8 "$HEALTH_URL" >/dev/null; then
  echo "WARNING: public smoke failed for $HEALTH_URL (deploy still accepted via ECS localhost)." >&2
else
  echo "deployed: $HEALTH_URL"
fi
