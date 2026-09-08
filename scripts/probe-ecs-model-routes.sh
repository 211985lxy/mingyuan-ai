#!/usr/bin/env bash
# 在 ECS 上以生产环境实测 AIM 质量链各跳（由 deploy-ecs-standalone.sh 在发布前调用）。
# 用法（本地执行）：ssh <ecs> 'bash -s' < scripts/probe-ecs-model-routes.sh
#
# 跳表须与 apps/web/src/lib/llm/agent-router.ts 的 QUALITY_PRIMARY_ROUTE 保持同步。
# 判定规则（来自 2026-09-08 事故复盘）：
#   - 非末位跳出现确定性死配置（模型未开通 / 鉴权失败）→ 非零退出，中止发布；
#     这正是「本地 probe 假绿、生产 ModelNotOpen」让死跳烧掉重试预算的事故模式。
#   - 瞬时故障（网络 / 超时 / 5xx / 额度）与末位死跳 → 仅告警，不阻断发布
#     （运行时降级链会自动换路）。
set -u

set -a
. /etc/mingyuan/mingyuan.env
set +a

PROBE_BODY="$(mktemp)"
trap 'rm -f "$PROBE_BODY"' EXIT

abort=0

probe_hop() {
  local name="$1" model="$2" base_url="$3" key="$4" proxy="$5" position="$6" total="$7"
  if [ -z "$key" ]; then
    echo "[model-probe] hop$position/$total $name: SKIP (key 未配置)"
    return
  fi
  local code body
  local args=(-sS -o "$PROBE_BODY" -w '%{http_code}' --max-time 20 \
    -X POST "$base_url/chat/completions" \
    -H "Authorization: Bearer $key" -H 'Content-Type: application/json' \
    -d "{\"model\":\"$model\",\"max_tokens\":256,\"messages\":[{\"role\":\"user\",\"content\":\"Reply with OK\"}]}")
  # shellcheck disable=SC2124
  [ -n "$proxy" ] && args+=(-x "$proxy")
  code="$(curl "${args[@]}" 2>/dev/null)" || true
  code="${code:-000}"
  body="$(head -c 300 "$PROBE_BODY" 2>/dev/null || true)"

  if [ "$code" = "200" ]; then
    echo "[model-probe] hop$position/$total $name ($model): healthy (200)"
    return
  fi
  if [ "$code" = "401" ] \
    || echo "$body" | grep -qiE 'ModelNotOpen|has not activated the model' \
    || echo "$body" | grep -qiE 'invalid.{0,10}api.?key|incorrect api key'; then
    echo "[model-probe] hop$position/$total $name ($model): CONFIG-DEAD ($code) ${body:0:160}"
    if [ "$position" -lt "$total" ]; then
      abort=1
    fi
    return
  fi
  echo "[model-probe] hop$position/$total $name ($model): transient ($code) ${body:0:160}"
}

# ── 跳表：模型名写死为 agent-router.ts QUALITY_PRIMARY_ROUTE 的路由覆盖值，
#    不读 env 模型变量（env 里的 *_MODEL 是 provider 默认值，质量链实际不用它们）。──
ZENMUX_MODEL_ID="anthropic/claude-sonnet-4.6"
APIMART_MODEL_ID="gpt-5.4"
DEEPSEEK_MODEL_ID="deepseek-v4-pro"
DOUBAO_MODEL_ID="doubao-seed-2-1-pro-260628"
DOUBAO_KEY="${DOUBAO_API_KEY:-${ARK_API_KEY:-}}"
DOUBAO_BASE="${DOUBAO_BASE_URL:-https://ark.cn-beijing.volces.com/api/v3}"

probe_hop zenmux   "$ZENMUX_MODEL_ID"    "${ZENMUX_BASE_URL:-https://zenmux.ai/api/v1}"    "${ZENMUX_API_KEY:-}"   "${ZENMUX_PROXY_URL:-}"  1 4
probe_hop doubao   "$DOUBAO_MODEL_ID"    "$DOUBAO_BASE"                                    "$DOUBAO_KEY"           ""                        2 4
probe_hop apimart  "$APIMART_MODEL_ID"   "${APIMART_BASE_URL:-https://api.apimart.ai/v1}" "${APIMART_API_KEY:-}"  "${APIMART_PROXY_URL:-}" 3 4
probe_hop deepseek "$DEEPSEEK_MODEL_ID"  "${DEEPSEEK_BASE_URL:-https://api.deepseek.com}" "${DEEPSEEK_API_KEY:-}" ""                        4 4

if [ "$abort" -ne 0 ]; then
  echo "[model-probe] GATE=ABORT：质量链非末位跳存在确定性死配置（未开通/鉴权失败），中止发布。请在方舟/网关控制台修复或调整 agent-router 跳序。" >&2
  exit 1
fi
echo "[model-probe] GATE=PASS（瞬时故障不阻断发布：运行时降级链会自动换路）"
