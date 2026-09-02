# AIM 数字人：蝉镜真实供应商链路验收记录

日期：2026-09-02
实现分支：`codex/aim-digital-human-implementation`
关联补录：`2026-09-02-aim-digital-human-e2e-acceptance-addendum.md`

## 1. 范围

以独立 TTS → 数字人视频的真实任务验证蝉镜开放平台接入（隔离 E2E 假服务器
无法替代的部分）：鉴权、音色/数字人选择、TTS 合成轮询、audio 型视频下单、
视频轮询、成品可访问性与音画一致性。

OpenAPI 规范（doc.chanjing.cc）已先拉取核对；本记录不含凭证与临时供应商 URL。

## 2. 接入改动

- `src/lib/chanjing.ts`：`mapVideoStatus` 改为优先使用规范枚举 `queue_status`，
  数值 `status` 兜底；`request` 通道导出供同域子模块复用。
- `src/lib/chanjing-audio.ts`（新模块，满足 500 行上限）：`listCommonAudio`、
  `listCommonDigitalPersons`、`createAudioTask`、`getAudioTaskState`、
  `createDigitalHumanVideoFromAudio`（audio 型，wav_url 驱动，画布尺寸为
  顶层 screen_width/screen_height）。
- `src/types/chanjing.ts`：按规范补齐音色、数字人、形态、TTS 状态类型。
- `scripts/chanjing-acceptance.ts` / `scripts/chanjing-acceptance-resume.ts`：
  全流程验收与断点续跑（只轮询既有任务，不重复提交）。轮询节奏：TTS 首次
  3s / 上限 10s / 超时 5min；视频首次 5s / 上限 15s / 超时 20min。
- 凭证仅存于 `apps/web/.env.local`（gitignored，已验证不入库）。

## 3. 真实任务结果

| 步骤 | 接口 | code | 结果 |
| --- | --- | --- | --- |
| 音色列表 | GET /list_common_audio | 0 | 20 候选，选「台湾腔播报」 |
| TTS 下单 | POST /create_audio_task | 0 | task e212f856…dc2a |
| TTS 轮询 | POST /audio_task_state ×3 | 0 | status 1→1→9，full.duration=3.4s |
| 数字人列表 | GET /list_common_dp | 0 | 20 候选，选「海城-商务」whole_body 1080×1920 |
| 视频下单 | POST /create_video | 0 | 任务 2095112508620980224 |
| 视频轮询 | GET /video | 0 | queued→processing→completed，duration=4s |

三项验收全部通过：

1. 音频 URL HTTP 206、326,764 字节；视频 URL HTTP 206、2,791,104 字节。
2. 时长对比 3.4s vs 4s，差值 0.60s（≤2s），确认视频使用本次 TTS 音轨。
3. 成品已转存本地 `artifacts/chanjing-acceptance-2026-09-02/`
   （acceptance-tts.wav / acceptance-video.mp4，字节数与远端一致）。

## 4. 过程发现（均已修复）

1. `create_audio_task` 响应 `data` 为对象 `{task_id}`（规范 OpenTextToSpeechRes），
   客户端原样返回导致轮询 400「参数错误」；已改为取 `data.task_id`。
   代价：首个 TTS 任务 id 未捕获而作废（消耗一次小额 TTS）。
2. 原 `mapVideoStatus` 依赖无文档的数值映射；规范已有 `queue_status` 枚举，
   已切换为枚举优先（live-fire 假服务器同步返回双字段保持回归覆盖）。
3. 视频轮询期间一次本地网络瞬断（fetch failed，非供应商错误），按
   「不重复提交」要求用续跑脚本轮询同一任务至完成。

## 5. 回归

typecheck 0 错误；lint 0 errors；live-fire E2E 10/10；chanjing 相关单测 16/16；
`git diff` 扫描确认 0 处凭证泄漏。

## 6. 遗留

- 20 任务灰度矩阵、闪剪管理员备用链路的真实验证（等非生产闪剪凭证）。
- audio 型下单目前仅客户端能力，未接入产品路由流（建议单独评审后接入）。
- 供应商临时 URL 已过期风险已通过本地转存缓解；正式转存应走 AIM OSS
  （需配置 OSS 凭证后由转存重试通道完成）。
