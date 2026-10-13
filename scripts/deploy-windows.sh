#!/usr/bin/env bash
# Windows 开发机入口：只要 Git Bash 自带的 ssh、tar、node、git。
# 不注入 cwRsync，不改 ssh config。连通与否以一次真实 ssh 为准。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

for cmd in ssh tar node git; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required tool: $cmd" >&2
    exit 1
  fi
done

SSH_KEY="${SSH_KEY:-$HOME/.ssh/mingyuan_aliyun_deploy}"
SSH_USER="${SSH_USER:-root}"
SSH_HOST="${SSH_HOST:-120.25.106.146}"

if [ ! -f "$SSH_KEY" ]; then
  echo "Deploy key not found: $SSH_KEY" >&2
  exit 1
fi
chmod 600 "$SSH_KEY"

# Git Bash 会把单独成参数的 /opt 路径改写成 Windows 路径。排除这一段。
export MSYS2_ARG_CONV_EXCL="/opt"

mkdir -p "$ROOT_DIR/.deploy-tmp"
export TMPDIR="$ROOT_DIR/.deploy-tmp"

exclude="$(git rev-parse --git-path info/exclude)"
if [ "${exclude#/}" = "$exclude" ]; then
  exclude="$ROOT_DIR/$exclude"
fi
mkdir -p "$(dirname "$exclude")"
if [ ! -f "$exclude" ] || ! grep -qxF '.deploy-tmp/' "$exclude"; then
  printf '%s\n' '.deploy-tmp/' >> "$exclude"
fi

echo "Checking SSH to $SSH_USER@$SSH_HOST"
if ! ssh_ok="$(ssh -i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "$SSH_USER@$SSH_HOST" 'echo ok')"; then
  echo "SSH connectivity check failed for $SSH_USER@$SSH_HOST" >&2
  exit 1
fi
if [ "$ssh_ok" != "ok" ]; then
  echo "SSH connectivity check returned unexpected output: $ssh_ok" >&2
  exit 1
fi
echo "SSH connectivity: ok"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN=1 will be passed through."
fi

exec bash "$ROOT_DIR/scripts/deploy-ecs-standalone.sh"
