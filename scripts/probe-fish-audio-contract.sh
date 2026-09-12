#!/usr/bin/env bash
# 在 ECS 上以生产环境实测 Fish Audio 集成契约（list / tts / clone 往返）。
# 背景（2026-09-11 事故）：上游新增必填字段 train_mode，无契约探测导致用户先看到 422。
# 用法：ssh <ecs> 'bash -s' < scripts/probe-fish-audio-contract.sh
#   CONTRACT_CLONE=0 跳过克隆往返（默认执行；会产生一个临时模型并立即删除）
# 退出码：0=PASS；1=至少一项契约失败（供调用方决定告警/中止）。
set -u

set -a
. /etc/mingyuan/mingyuan.env
set +a

P="${FISH_AUDIO_PROXY_URL:-${ZENMUX_PROXY_URL:-}}"
BASE="https://api.fish.audio"
fail=0

# 合成 1 秒 220Hz 正弦 wav（服务器无 ffmpeg，用 node 生成合法 PCM 容器）
make_probe_wav() {
  node -e '
const fs = require("fs")
const sr = 16000, seconds = 1
const n = sr * seconds
const h = Buffer.alloc(44)
h.write("RIFF", 0); h.writeUInt32LE(36 + n * 2, 4); h.write("WAVE", 8)
h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
h.write("data", 36); h.writeUInt32LE(n * 2, 40)
const d = Buffer.alloc(n * 2)
for (let i = 0; i < n; i++) d.writeInt16LE(Math.round(3000 * Math.sin((2 * Math.PI * 220 * i) / sr)), i * 2)
fs.writeFileSync("/tmp/fish-probe.wav", Buffer.concat([h, d]))
'
}
make_probe_wav

curl_args=(-sS -x "$P" --max-time 30 -H "Authorization: Bearer ${FISH_AUDIO_API_KEY:-}")

# 1) 音色列表（读契约）
code="$(curl "${curl_args[@]}" -o /tmp/fish-probe-list.json -w '%{http_code}' "$BASE/model?self=true&page_size=1" 2>/dev/null)" || code=000
if [ "$code" = "200" ]; then
  echo "[fish-probe] list: healthy (200)"
else
  echo "[fish-probe] list: FAILED ($code) $(head -c 120 /tmp/fish-probe-list.json 2>/dev/null)"
  fail=1
fi

# 2) TTS 最小合成（合成契约；消耗 ~2 字符额度）。
#    402=API 额度耗尽：契约本身正常（请求形状被接受），单独告警不计契约失败。
body='{"text":"探针","format":"mp3"}'
code="$(curl "${curl_args[@]}" -o /tmp/fish-probe-tts.mp3 -w '%{http_code}' -X POST "$BASE/v1/tts" -H 'Content-Type: application/json' -H "model: ${FISH_AUDIO_MODEL:-s2.1-pro-free}" -d "$body" 2>/dev/null)" || code=000
size=$(wc -c < /tmp/fish-probe-tts.mp3 2>/dev/null || echo 0)
if [ "$code" = "200" ] && [ "$size" -gt 1000 ]; then
  echo "[fish-probe] tts: healthy (200, ${size}B)"
elif [ "$code" = "402" ]; then
  echo "[fish-probe] tts: QUOTA-BLOCKED (402) — 契约正常但 API 额度耗尽，语音合成当前不可用，请充值 Fish Audio API credit"
else
  echo "[fish-probe] tts: FAILED ($code, ${size}B) $(head -c 120 /tmp/fish-probe-tts.mp3 2>/dev/null)"
  fail=1
fi

# 3) 克隆往返（克隆契约：train_mode 必填校验 + 训练受理 + 删除清理）
if [ "${CONTRACT_CLONE:-1}" = "1" ]; then
  code="$(curl "${curl_args[@]}" -o /tmp/fish-probe-clone.json -w '%{http_code}' -X POST "$BASE/model" \
    -F "title=contract-probe-temp" -F "type=tts" -F "visibility=private" -F "train_mode=fast" \
    -F "voices=@/tmp/fish-probe.wav;type=audio/wav" 2>/dev/null)" || code=000
  model_id="$(grep -oE '"_id":"[a-f0-9]+"' /tmp/fish-probe-clone.json 2>/dev/null | head -1 | grep -oE '[a-f0-9]{24,}' || true)"
  if { [ "$code" = "200" ] || [ "$code" = "201" ]; } && [ -n "$model_id" ]; then
    echo "[fish-probe] clone: healthy ($code, model=${model_id:0:12}…)"
    del="$(curl "${curl_args[@]}" -o /dev/null -w '%{http_code}' -X DELETE "$BASE/model/$model_id" 2>/dev/null)" || del=000
    if [ "$del" = "204" ] || [ "$del" = "200" ]; then
      echo "[fish-probe] clone cleanup: deleted ($del)"
    else
      echo "[fish-probe] clone cleanup: FAILED ($del) — 请手动删除模型 $model_id"
    fi
  else
    echo "[fish-probe] clone: FAILED ($code) $(head -c 160 /tmp/fish-probe-clone.json 2>/dev/null)"
    fail=1
  fi
fi

rm -f /tmp/fish-probe.wav /tmp/fish-probe-list.json /tmp/fish-probe-tts.mp3 /tmp/fish-probe-clone.json

if [ "$fail" -ne 0 ]; then
  echo "[fish-probe] GATE=CONTRACT-DRIFT：Fish Audio 集成契约有变化，声音功能受影响；请核对 docs.fish.audio 并适配 src/lib/voice/fish-audio.ts"
  exit 1
fi
echo "[fish-probe] GATE=PASS"
