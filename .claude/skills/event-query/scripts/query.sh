#!/bin/bash
# 埋点数据查询脚本
# 用法: query.sh <sql> [config_path]
# 示例: query.sh "SELECT count(*) FROM roi_ods.pwa_event_point_log LIMIT 10"

set -euo pipefail

SQL="$1"
CONFIG_PATH="${2:-$(dirname "$0")/../config.local.md}"

if [ ! -f "$CONFIG_PATH" ]; then
  echo "ERROR: 配置文件不存在: $CONFIG_PATH" >&2
  echo "请在 config.local.md 中配置 api_url, authorization, x_access_key" >&2
  exit 1
fi

# 从 YAML frontmatter 中提取配置
parse_yaml() {
  local key="$1"
  sed -n '/^---$/,/^---$/p' "$CONFIG_PATH" | grep "^${key}:" | sed "s/^${key}: *//"
}

API_URL=$(parse_yaml "api_url")
AUTHORIZATION=$(parse_yaml "authorization")
X_ACCESS_KEY=$(parse_yaml "x_access_key")

if [ -z "$API_URL" ] || [ -z "$AUTHORIZATION" ] || [ -z "$X_ACCESS_KEY" ]; then
  echo "ERROR: 配置不完整，请检查 config.local.md" >&2
  exit 1
fi

# 将 SQL 转为 JSON 安全字符串（用 python 处理转义）
JSON_BODY=$(python3 -c "
import json, sys
sql = sys.stdin.read()
print(json.dumps({'query': sql}))
" <<< "$SQL")

# 执行查询
RESPONSE=$(curl -s --request POST \
  --url "$API_URL" \
  --header "authorization: $AUTHORIZATION" \
  --header 'content-type: application/json' \
  --header "x-access-key: $X_ACCESS_KEY" \
  --data "$JSON_BODY" \
  --max-time 30)

echo "$RESPONSE"
