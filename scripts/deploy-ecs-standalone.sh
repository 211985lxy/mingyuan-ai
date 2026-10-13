#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUDIT_CORRELATION_ID="${AUDIT_CORRELATION_ID:-deploy-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
export AUDIT_CORRELATION_ID

# 发布传输：本地打一个 tar.gz，经 ssh 整包上传，远端对上 sha256 再解压。
# 不依赖 rsync / cwRsync。构建门禁、迁移、切换和回滚仍走原来的步骤。

# 部署事件复用仓库外队列适配器；审计发送失败不能阻断已具备独立回滚门禁的发布流程。
audit_event() {
  if [ -f "$ROOT_DIR/scripts/audit-event.mjs" ]; then
    node "$ROOT_DIR/scripts/audit-event.mjs" "$@" --repo-path "$ROOT_DIR" --source server --category deployment --correlation-id "$AUDIT_CORRELATION_ID" >/dev/null 2>&1 || true
  fi
}

# ── 部署互斥锁：同一时刻只允许一个部署。两个会话并发部署会在服务器
#    standalone-new.incoming 目录互踩，一方失败于 rm 步骤（2026-09-12 实测）。
#    用 mkdir 原子锁 + PID 残留回收：flock 在 macOS（部署发起端）不可用。 ──
DEPLOY_LOCK_DIR="${TMPDIR:-/tmp}/mingyuan-deploy.lock"

release_deploy_lock() {
  # 只回收自己持有的锁；acquire 失败时不误删别人的锁。
  if [ -f "$DEPLOY_LOCK_DIR/pid" ] && [ "$(cat "$DEPLOY_LOCK_DIR/pid" 2>/dev/null)" = "$$" ]; then
    rm -rf "$DEPLOY_LOCK_DIR" 2>/dev/null || true
  fi
}

acquire_deploy_lock() {
  if mkdir "$DEPLOY_LOCK_DIR" 2>/dev/null; then
    echo $$ > "$DEPLOY_LOCK_DIR/pid"
    return 0
  fi
  local lock_pid
  lock_pid="$(cat "$DEPLOY_LOCK_DIR/pid" 2>/dev/null || true)"
  if [ -n "$lock_pid" ] && ! kill -0 "$lock_pid" 2>/dev/null; then
    echo "⚠️ 发现残留部署锁（持有者 PID $lock_pid 已退出），回收后继续" >&2
    rm -rf "$DEPLOY_LOCK_DIR"
    if mkdir "$DEPLOY_LOCK_DIR" 2>/dev/null; then
      echo $$ > "$DEPLOY_LOCK_DIR/pid"
      return 0
    fi
  fi
  echo "❌ 另一个部署正在进行（锁: ${DEPLOY_LOCK_DIR}，持有者 PID ${lock_pid:-未知}）。" >&2
  echo "   确认无部署在跑后，删除该目录即可解锁。" >&2
  return 1
}

# .deploy-tmp 在仓库里面。不写进排除列表的话，第二次发布会被「工作区不干净」拦住。
ensure_deploy_tmp_git_exclude() {
  local exclude
  if ! exclude="$(git -C "$ROOT_DIR" rev-parse --git-path info/exclude 2>/dev/null)"; then
    return 0
  fi
  if [ "${exclude#/}" = "$exclude" ]; then
    exclude="$ROOT_DIR/$exclude"
  fi
  mkdir -p "$(dirname "$exclude")"
  if [ ! -f "$exclude" ] || ! grep -qxF '.deploy-tmp/' "$exclude"; then
    printf '%s\n' '.deploy-tmp/' >> "$exclude"
  fi
}

cleanup_transport() {
  rm -rf "$ROOT_DIR/.deploy-tmp/release-staging" "$ROOT_DIR/.deploy-tmp/release-bundle.tar.gz" 2>/dev/null || true
  if [ -z "${REMOTE_STAGE_DIR:-}" ] || [ "${#SSH[@]}" -eq 0 ]; then
    return 0
  fi
  "${SSH[@]}" "rm -rf '$REMOTE_STAGE_DIR' '${REMOTE_BUNDLE_PATH:-/root/deploy-bundle.tar.gz}' '${REMOTE_BUNDLE_PART:-/root/deploy-bundle.tar.gz.part}'" >/dev/null 2>&1 || true
  if [ "${DRY_RUN:-0}" = "1" ]; then
    "${SSH[@]}" "rm -rf /tmp/deploy-dryrun-*" >/dev/null 2>&1 || true
  fi
}

finish_audit() {
  local exit_code=$?
  cleanup_transport || true
  release_deploy_lock
  if [ "$exit_code" -eq 0 ]; then
    if [ "${DRY_RUN:-0}" = "1" ]; then
      audit_event finish --action deploy.finish --summary "ECS dry-run completed" --environment production
    else
      audit_event finish --action deploy.finish --summary "ECS deployment completed" --environment production
    fi
  else
    audit_event fail --action deploy.fail --summary "ECS deployment failed" --environment production
  fi
  return "$exit_code"
}

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
# 统计/审计控制中心 cron（cadence 见 docs/operations/unified-control-centers-production-runbook.md）
CONTROL_CENTER_CRON_UNITS=(
  mingyuan-cron-audit-reconcile
  mingyuan-cron-operational-alerts
  mingyuan-cron-channel-metrics-rollup
  mingyuan-cron-control-center-retention
  mingyuan-cron-integration-probe
)
CONTROL_CENTER_CRON_TIMER_LIST="${CONTROL_CENTER_CRON_UNITS[*]/%/.timer}"

SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "$SSH_USER@$SSH_HOST")
REMOTE_STAGE_DIR=""
REMOTE_BUNDLE_PATH="/root/deploy-bundle.tar.gz"
REMOTE_BUNDLE_PART="/root/deploy-bundle.tar.gz.part"

# 数据库迁移：服务器无 prisma CLI，经 SSH 隧道用本地 CLI 对生产库执行 prisma migrate deploy。
# 在补丁脚本之后、契约校验与代码切换之前运行；失败即中止发布，旧版本继续服务。
# 紧急情况下可 SKIP_MIGRATIONS=1 跳过（须自行确认 schema 已到位）。
#
# 迁移后跑漂移门禁（check-migration-drift.mjs）：prisma migrate deploy 只保证
# 迁移记录齐全，不校验 DDL 真的生效——2026-09-08 有迁移被 resolve --applied
# 标记完成但一条 SQL 都没跑，外键缺失五天无人发现。门禁把 schema 目录合并成
# 单文件再 diff（绕开 Prisma 7.8 加载 schema 目录时关系合并出错的 bug），只拦截
# 「真缺失」，发现即中止发布。紧急情况下可 SKIP_DRIFT_GUARD=1 跳过门禁。
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
  local drift_ok=1
  if [ "${SKIP_DRIFT_GUARD:-0}" = "1" ]; then
    echo "SKIP_DRIFT_GUARD=1 — 迁移后漂移门禁已跳过。" >&2
  elif ! (cd apps/web && DATABASE_URL="$mod_url" node "$ROOT_DIR/scripts/check-migration-drift.mjs" check --web-dir .); then
    echo "迁移后漂移门禁未通过 — 已在切换新代码之前中止发布（旧版本继续服务）。" >&2
    drift_ok=0
  fi
  lsof -ti ":$port" | xargs kill 2>/dev/null || true
  [ "$drift_ok" = "1" ]
}

file_sha256() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -b "$file" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    node -e 'const fs=require("node:fs"); const crypto=require("node:crypto"); const h=crypto.createHash("sha256"); h.update(fs.readFileSync(process.argv[1])); process.stdout.write(h.digest("hex"));' "$file"
  fi
}

# 只检查会在远端当脚本或 systemd 单元执行的文本。node_modules 里的 \r 不在此列。
collect_deploy_text_files() {
  local root="$1"
  # 依赖包里的 .sh 不归这次换行检查管，否则上游文件自带 CR 会把发布拦住。
  if [ -d "$root" ]; then
    find "$root" -path '*/node_modules' -prune -o -type f -name '*.sh' -print0
  fi
  if [ -d "$root/systemd" ]; then
    find "$root/systemd" -type f -print0
  fi
  if [ -d "$root/bin" ]; then
    find "$root/bin" -type f -print0
  fi
}

assert_no_crlf() {
  local root="$1" file found=0 cr
  # 运行时再造 CR。不要把原始回车写进脚本，否则经 ssh 传过去时可能被吃掉，检查会失真。
  cr="$(printf '\r')"
  while IFS= read -r -d '' file; do
    if grep -q "$cr" "$file"; then
      echo "CRLF detected in $file" >&2
      echo "Hint: set core.autocrlf=input (or false). .gitattributes keeps *.sh, systemd units/drop-ins, and mingyuan-refuse-older-release as LF." >&2
      found=1
    fi
  done < <(collect_deploy_text_files "$root")
  [ "$found" -eq 0 ]
}

normalize_tree_perms() {
  local stage="$1"
  find "$stage" -type d -exec chmod 755 {} +
  find "$stage" -type f -exec chmod 644 {} +
  if [ -d "$stage/web/ops" ]; then
    find "$stage/web/ops" -type f \( -name '*.sh' -o -name '*.mjs' \) -exec chmod 755 {} +
  fi
  if [ -f "$stage/bin/mingyuan-refuse-older-release" ]; then
    chmod 755 "$stage/bin/mingyuan-refuse-older-release"
  fi
  if [ -d "$stage/renderer" ]; then
    find "$stage/renderer" -type f -name '*.sh' -exec chmod 755 {} +
  fi
}

stage_web() {
  local root="$1" dest="$2"
  mkdir -p "$dest/apps/web/.next/static" "$dest/apps/web/public" "$dest/apps/web/messages" "$dest/ops"
  # standalone 里 pnpm 的软链接要展开成真实文件，等价于以前的 rsync -L。
  tar -C "$root/apps/web/.next/standalone" --dereference -cf - . | tar -C "$dest" -xf -
  tar -C "$root/apps/web/.next/static" -cf - . | tar -C "$dest/apps/web/.next/static" -xf -
  tar -C "$root/apps/web/public" -cf - . | tar -C "$dest/apps/web/public" -xf -
  tar -C "$root/apps/web/messages" -cf - . | tar -C "$dest/apps/web/messages" -xf -
  cp -p "$root/apps/web/scripts/verify-production-schema.mjs" "$dest/ops/verify-production-schema.mjs"
  cp -p "$root/apps/web/scripts/apply-production-schema-patches.mjs" "$dest/ops/apply-production-schema-patches.mjs"
  cp -p "$root/apps/web/prisma/production-schema-contract.json" "$dest/ops/production-schema-contract.json"
}

stage_systemd() {
  local root="$1" dest="$2" unit drop base
  mkdir -p "$dest"
  cp -p "$root/ops/systemd/${BACKGROUND_TASK_SERVICE}" "$dest/"
  cp -p "$root/ops/systemd/${BACKGROUND_TASK_TIMER}" "$dest/"
  for unit in "${CONTROL_CENTER_CRON_UNITS[@]}"; do
    cp -p "$root/ops/systemd/${unit}.service" "$dest/"
    cp -p "$root/ops/systemd/${unit}.timer" "$dest/"
  done
  for drop in "$root/ops/systemd/"*.d; do
    [ -d "$drop" ] || continue
    base="$(basename "$drop")"
    mkdir -p "$dest/$base"
    tar -C "$drop" -cf - . | tar -C "$dest/$base" -xf -
  done
}

# 当前仓库没有这份拒绝旧版本的脚本。文件出现后会自动打进 bin/，不会因此猜路径。
stage_bin_if_present() {
  local root="$1" stage="$2" candidate src=""
  for candidate in \
    "$root/ops/bin/mingyuan-refuse-older-release" \
    "$root/scripts/mingyuan-refuse-older-release"
  do
    if [ -f "$candidate" ]; then
      src="$candidate"
      break
    fi
  done
  if [ -z "$src" ]; then
    return 0
  fi
  mkdir -p "$stage/bin"
  cp -p "$src" "$stage/bin/mingyuan-refuse-older-release"
}

# 本仓库的发布脚本没有 REMOTION_PREPARE，也没有无条件的 glibc.deb 检查可挪进
# `if [ ! -x "$glibc_loader" ]`。目录在不在，都不打包 renderer，避免猜 chrome/glibc 路径。
stage_renderer_if_present() {
  local root="$1"
  if [ -d "$root/services/remotion-renderer" ]; then
    echo "NOTE: services/remotion-renderer is not part of this bundle. No REMOTION_PREPARE and no chrome/glibc paths are defined here." >&2
  fi
}

stage_release_tree() {
  local root="$1" stage="$2"
  rm -rf "$stage"
  mkdir -p "$stage"
  stage_web "$root" "$stage/web"
  stage_systemd "$root" "$stage/systemd"
  stage_bin_if_present "$root" "$stage"
  stage_renderer_if_present "$root"
  if [ ! -f "$stage/web/apps/web/server.js" ]; then
    echo "Staged release is missing apps/web/server.js." >&2
    return 1
  fi
  assert_no_crlf "$stage"
}

upload_bundle() {
  local bundle="$1" part="$2" final="$3" hash="$4" attempt=1
  while [ "$attempt" -le 3 ]; do
    if "${SSH[@]}" "cat > '$part'" < "$bundle" \
      && "${SSH[@]}" "printf '%s *%s\n' '$hash' '$part' | sha256sum -c -"; then
      "${SSH[@]}" "mv -f '$part' '$final'"
      return 0
    fi
    echo "Transfer attempt $attempt/3 failed (upload error or sha256 mismatch)." >&2
    if [ "$attempt" -ge 3 ]; then
      echo "Transfer failed after $attempt attempts." >&2
      return 1
    fi
    attempt=$((attempt + 1))
    echo "Transfer interrupted; resuming attempt $attempt/3 in 3s..." >&2
    sleep 3
  done
}

# shellcheck disable=SC2016
remote_extract_normalize() {
  # 单引号是故意的：这段脚本在远端 bash 里才展开 $1/$stage。
  local bundle="$1" stage="$2" script status
  script="$(mktemp)"
  {
    printf '%s\n' 'set -euo pipefail' 'bundle="$1"' 'stage="$2"'
    declare -f collect_deploy_text_files
    declare -f assert_no_crlf
    declare -f normalize_tree_perms
    printf '%s\n' \
      'rm -rf "$stage"' \
      'mkdir -p "$stage"' \
      'tar --no-same-owner --no-same-permissions -xzf "$bundle" -C "$stage"' \
      'normalize_tree_perms "$stage"' \
      'assert_no_crlf "$stage"'
  } > "$script"
  status=0
  "${SSH[@]}" bash -s -- "$bundle" "$stage" < "$script" || status=$?
  rm -f "$script"
  return "$status"
}

remote_place() {
  local stage="$1"
  "${SSH[@]}" bash -s -- "$stage" "$REMOTE_INCOMING_DIR" <<'EOS'
set -euo pipefail
stage="$1"
incoming="$2"
rm -rf "$incoming"
mkdir -p "$incoming"
tar -C "$stage/web" -cf - . | tar -C "$incoming" -xf -
if [ -d "$stage/systemd" ]; then
  # 只覆盖本次要发布的单元，不删除 /etc/systemd/system 里的其他文件。
  # 以前 rsync 也是按文件覆盖，没有对整个目录 --delete。daemon-reload 仍留在后面的切换步骤。
  tar -C "$stage/systemd" -cf - . | tar -C /etc/systemd/system -xf -
fi
if [ -d "$stage/bin" ]; then
  mkdir -p /usr/local/sbin
  find "$stage/bin" -type f -exec cp -p {} /usr/local/sbin/ \;
  if [ -f /usr/local/sbin/mingyuan-refuse-older-release ]; then
    chmod 755 /usr/local/sbin/mingyuan-refuse-older-release
  fi
fi
if [ -d "$stage/renderer" ]; then
  renderer_incoming="$(dirname "$incoming")/renderer.incoming"
  rm -rf "$renderer_incoming"
  mkdir -p "$renderer_incoming"
  tar -C "$stage/renderer" -cf - . | tar -C "$renderer_incoming" -xf -
fi
EOS
}

dry_run_checks() {
  local stage="$1"
  "${SSH[@]}" bash -s -- "$stage" <<'EOS'
set -euo pipefail
stage="$1"
web="$stage/web"
echo "dry-run spot checks:"
if [ ! -f "$web/apps/web/server.js" ]; then
  echo "FAIL server.js missing" >&2
  exit 1
fi
echo "server.js: ok"
static_count="$(find "$web/apps/web/.next/static" -type f | wc -l | tr -d ' ')"
echo "static files: $static_count"
if [ "${static_count:-0}" -lt 1 ]; then
  echo "FAIL no static files" >&2
  exit 1
fi
unit_count="$(find "$stage/systemd" -type f | wc -l | tr -d ' ')"
echo "systemd units: $unit_count"
if [ "${unit_count:-0}" -lt 1 ]; then
  echo "FAIL no systemd units" >&2
  exit 1
fi
if find "$web" -path '*/node_modules/*' -name package.json -type l | grep -q .; then
  echo "FAIL node_modules still contains symlinked package.json" >&2
  exit 1
fi
mapfile -t pkgs < <(find "$web" -path '*/node_modules/*' -name package.json -type f | shuf | head -3)
if [ "${#pkgs[@]}" -lt 1 ]; then
  echo "FAIL no node_modules packages" >&2
  exit 1
fi
for pkg in "${pkgs[@]}"; do
  if [ -L "$pkg" ] || [ ! -f "$pkg" ]; then
    echo "FAIL package is not a real file: $pkg" >&2
    exit 1
  fi
  echo "package ok: $pkg"
done
for script in "$web/ops/verify-production-schema.mjs" "$web/ops/apply-production-schema-patches.mjs"; do
  if [ ! -x "$script" ]; then
    echo "FAIL not executable: $script" >&2
    exit 1
  fi
  echo "executable: $script"
done
if [ -e "$web/ops/production-schema-contract.json" ] && [ ! -f "$web/ops/production-schema-contract.json" ]; then
  echo "FAIL schema contract missing" >&2
  exit 1
fi
if [ -f "$stage/bin/mingyuan-refuse-older-release" ]; then
  if [ ! -x "$stage/bin/mingyuan-refuse-older-release" ]; then
    echo "FAIL bin script not executable" >&2
    exit 1
  fi
  echo "executable: bin/mingyuan-refuse-older-release"
else
  echo "bin/mingyuan-refuse-older-release: not in this release"
fi
cd "$web/apps/web"
/usr/bin/node -e "const { createRequire } = require('node:module'); const { resolve } = require('node:path'); const appRequire = createRequire(resolve('server.js')); ['next','styled-jsx/package.json','@next/env','react','react-dom','pino'].forEach((id)=>appRequire.resolve(id)); console.log('remote-standalone-deps-ok')"
EOS
}

transfer_release() {
  local stage="$ROOT_DIR/.deploy-tmp/release-staging"
  local bundle="$ROOT_DIR/.deploy-tmp/release-bundle.tar.gz"
  local hash
  mkdir -p "$ROOT_DIR/.deploy-tmp"
  stage_release_tree "$ROOT_DIR" "$stage"
  rm -f "$bundle"
  tar --format=gnu -czf "$bundle" -C "$stage" .
  hash="$(file_sha256 "$bundle")"
  echo "release bundle: $(wc -c < "$bundle" | tr -d ' ') bytes sha256=$hash"
  if [ "${DRY_RUN:-0}" = "1" ]; then
    REMOTE_STAGE_DIR="/tmp/deploy-dryrun-${RELEASE_SHA}"
  else
    REMOTE_STAGE_DIR="/root/deploy-stage-${RELEASE_SHA}"
  fi
  upload_bundle "$bundle" "$REMOTE_BUNDLE_PART" "$REMOTE_BUNDLE_PATH" "$hash"
  remote_extract_normalize "$REMOTE_BUNDLE_PATH" "$REMOTE_STAGE_DIR"
  if [ "${DRY_RUN:-0}" = "1" ]; then
    dry_run_checks "$REMOTE_STAGE_DIR"
    echo "DRY_RUN=1 checked $REMOTE_STAGE_DIR only. No systemd, sbin, incoming, database, or version switch."
    return 0
  fi
  remote_place "$REMOTE_STAGE_DIR"
}

main() {
  cd "$ROOT_DIR"
  ensure_deploy_tmp_git_exclude

  trap finish_audit EXIT
  audit_event start --action deploy.start --summary "ECS deployment started" --environment production

  acquire_deploy_lock || exit 1

  if git rev-parse --is-inside-work-tree >/dev/null 2>&1 && [ "${ALLOW_DIRTY_DEPLOY:-0}" != "1" ]; then
    if [ -n "$(git status --porcelain)" ]; then
      echo "Refusing to deploy a dirty worktree. Commit/stash changes or set ALLOW_DIRTY_DEPLOY=1." >&2
      git status --short >&2
      exit 1
    fi
  fi

  if [ "${DRY_RUN:-0}" = "1" ]; then
    echo "DRY_RUN=1: local gates, bundle, upload, and /tmp extract only. Skipping model/Fish probes."
  else
    # 模型链部署前门禁：在 ECS 上以生产 env 实测质量链各跳（跳表与
    # apps/web/src/lib/llm/agent-router.ts 的 QUALITY_PRIMARY_ROUTE 同步）。
    # 非末位跳确定性死配置（模型未开通/鉴权失败）直接中止发布——2026-09-08 事故
    # 即因本地 probe 假绿把 ModelNotOpen 死跳送上线、烧光重试预算。SKIP_MODEL_PROBE=1 可临时跳过。
    if [ "${SKIP_MODEL_PROBE:-0}" != "1" ]; then
      if ! model_probe_output="$("${SSH[@]}" 'bash -s' < "$ROOT_DIR/scripts/probe-ecs-model-routes.sh" 2>&1)"; then
        echo "$model_probe_output" >&2
        echo "Model route probe gate FAILED — aborting before touching production." >&2
        exit 1
      fi
      echo "$model_probe_output"
    fi

    # Fish Audio 集成契约探针（list+tts+克隆往返）：上游接口漂移当场暴露，
    # 不再等用户点克隆时才看到 422（2026-09-11 train_mode 事故）。
    # 声音是辅助功能：契约漂移以显著告警呈现，不阻断核心发布；SKIP_FISH_PROBE=1 可跳过。
    if [ "${SKIP_FISH_PROBE:-0}" != "1" ]; then
      if ! fish_probe_output="$("${SSH[@]}" 'bash -s' < "$ROOT_DIR/scripts/probe-fish-audio-contract.sh" 2>&1)"; then
        echo "$fish_probe_output"
        echo "WARNING: Fish Audio contract probe FAILED — 语音克隆/合成将不可用（不阻断本次发布）" >&2
      else
        echo "$fish_probe_output"
      fi
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

  transfer_release
  if [ "${DRY_RUN:-0}" = "1" ]; then
    exit 0
  fi

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

  # shellcheck disable=SC2140
  "${SSH[@]}" "set -e; if grep -q '^BACKGROUND_TASKS_ENABLED=' /etc/mingyuan/mingyuan.env; then sed -i 's/^BACKGROUND_TASKS_ENABLED=.*/BACKGROUND_TASKS_ENABLED=true/' /etc/mingyuan/mingyuan.env; else printf '\nBACKGROUND_TASKS_ENABLED=true\n' >> /etc/mingyuan/mingyuan.env; fi; chmod 600 /etc/mingyuan/mingyuan.env; systemctl daemon-reload; systemctl enable --now '$BACKGROUND_TASK_TIMER'; for t in $CONTROL_CENTER_CRON_TIMER_LIST; do systemctl enable --now "\$t"; done; systemctl restart '$SERVICE_NAME'; systemctl is-active '$SERVICE_NAME'; ready=0; for attempt in {1..30}; do if /usr/bin/curl --noproxy '*' --fail --silent --show-error --max-time 2 http://127.0.0.1:3000/api/healthz >/dev/null; then ready=1; break; fi; sleep 1; done; if [ \"\$ready\" -ne 1 ]; then exit 1; fi; systemctl start '$BACKGROUND_TASK_SERVICE'; systemctl is-active '$BACKGROUND_TASK_TIMER'"

  # 发布后外部集成探针：一次 curl 拉起全量集成探测（结果落 OperationalAlert + 飞书）。
  # 失败只告警不回滚——声音/数据类集成故障不阻断核心生成链。
  # 注意这里有两处取值坑，任一都会让探针恒定 403、再被下面的「非阻断」吞掉而静默失效：
  #   1) header 用单引号会阻止远端展开 $(...)，等于把字面量 `$(grep …)` 当 token 发出去；
  #   2) `cut -d= -f2` 会在密钥自带的 `=` 处截断（实测截掉 1 字符），必须用 `-f2-` 取到行尾。
  if [ "${SKIP_FISH_PROBE:-0}" != "1" ]; then
    "${SSH[@]}" "/usr/bin/curl --noproxy '*' --fail --silent --show-error --max-time 120 -H \"Authorization: Bearer \$(grep ^CRON_SECRET= /etc/mingyuan/mingyuan.env | cut -d= -f2-)\" http://127.0.0.1:3000/api/cron/integration-probe"     | tail -c 1200 || echo "WARNING: integration probe after deploy failed (非阻断)" >&2
  fi

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
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
