---
name: heygen
description: "HeyGen External API (v3) integration guide for 明远AIM. Avatar video generation (script-driven and audio-driven lip-sync), avatar consent guarding, voices, webhooks with HMAC-SHA256 signature verification, error contract, and acceptance tooling. Third digital-human provider alongside Chanjing (default) and Shanjian (manual fallback)."
category: Video AI Integration
tags: [heygen, digital-human, video-generation, webhook, consent, audio-driven]
---

# HeyGen (v3 External API) 深度集成指南

本 Skill 是 明远AIM 与 HeyGen 数字人开放平台对接的权威参考。

**规范来源（字段以此为准，勿凭记忆）：**
- `https://developers.heygen.com/openapi/external-api.json` — v3 权威规格（108 端点）
- `https://developers.heygen.com/openapi.yaml` — 旧 v2 规格（52 端点，勿用于新开发）
- 文档站直连易超时，本机代理 `127.0.0.1:10808` 可用

**Base:** `https://api.heygen.com` · **鉴权：** `X-Api-Key` 请求头
**核心代码：** `apps/web/src/lib/heygen.ts`（客户端）+ `apps/web/src/app/api/webhook/heygen`（回调）

---

## 一、我们用到哪条链

| 能力 | 端点 | 代码入口 |
| --- | --- | --- |
| 账号配额 | `GET /v3/users/me` | `getUserMe` |
| 形象列表 | `GET /v3/avatars`、`GET /v3/avatars/looks` | `listAvatars` / `listAvatarLooks` |
| 声音列表 | `GET /v3/voices` | `listVoices` |
| 出片 | `POST /v3/videos` | `createVideo` |
| 状态轮询 | `GET /v3/videos/{id}` | `getVideo` |
| webhook 端点管理 | `POST/GET /v3/webhooks/endpoints`、`rotate-secret` | `createWebhookEndpoint` 等 |

与蝉镜的分工：蝉镜（默认）走 open-api.chanjing.cc 的 tts/audio 两型；
**HeyGen 的 `/v3/videos` 单端点即支持两种驱动**——`script`+`voice_id`（供应商 TTS）
或 `audio_url`（自有语音对口型，与我们的 Fish→OSS 签名桥天然对齐）。闪剪仅管理员手动备用。

## 二、踩过的坑（已修，勿再犯）

1. **响应解包**：`{data: [...]}` 的 `data` **就是数组本身**。
   曾按 `{data:{data:[...]}}` 解包 → 三个 list 函数恒返回空数组（PR #68）。
2. **env 枚举**：`DIGITAL_HUMAN_PROVIDER` 的 zod 枚举必须随 provider 扩展，
   否则新供应商在启动期被 env 校验拒绝（PR #68）。
3. **测试体内 `vi.mock` 无效**（不会提升）——必须写在文件顶层（hoisted），
   否则用例悄悄走错路径（PR #72 调试记录）。
4. **供应商类型单一来源**：`DigitalHumanProvider` 只在
   `lib/digital-human-provider.ts` 声明，信号量等处 re-export，避免两处分叉。

## 三、错误契约

错误体两种形态，**都按失败处理**（否则把错误当成功返回）：

- HTTP 非 2xx + `{error:{code,message}}`
- HTTP 200 却带 `error` 字段

`mapHeygenVideoToTaskResult`：`status` 枚举 `pending|processing|completed|failed`；
**failed 时 `failure_code` 用于归因、`failure_message` 面向用户，二者不混用**；
`completed` 但 `video_url` 为空时不伪造产物 URL。

## 四、授权（consent）——合规重点

`GET /v3/avatars` 返回 `consent_status`（`AvatarGroupItem`）：

| 值 | 含义 | 可否出片 |
| --- | --- | --- |
| `null` / 缺失 | **不需要授权**（照片形象、公共形象） | ✅ |
| `"approved"` | 已取得授权 | ✅ |
| 其余（`pending`/`rejected`/`expired`…） | 尚未授权 | ❌ **必须剔除** |

守卫实现在 `public-persons` 路由的 `isHeygenConsentUsable`；
用未授权形象出片 = 生成没同意过的人的视频。
自有形象的授权**提交**走 `POST /v3/avatars/{group_id}/consent`
（webcam 流程的 url 24h 过期；enterprise 可传 `consent_video`）——尚未接入。

## 五、Webhook

- 注册：`POST /v3/webhooks/endpoints`，响应里的 `secret` **只显示一次**
- 签名：`signature` 头 = `hex(HMAC-SHA256(rawBody, secret))`；
  **必须用原始字节**（parse 后再 stringify 会因键序/空白失配）；`timingSafeEqual` 比对
- 事件：`avatar_video.success|fail`；`event_data.video_id` 定位任务
- 我方路由 `/api/webhook/heygen` 防线顺序固定：
  验签 fail-closed → Redis 幂等(event_id 24h) → **回调查询复核**（推送体不可信，
  以主动查询结果结算）→ 结算 + 释放并发槽；provider 非 heygen 的任务拒结算

## 六、验收工具

- `scripts/heygen-acceptance.ts` — 实弹全链路（账号→形象→声音→出片→轮询→核验），
  轮询 5s/15s/20min； ffprobe 核时长
- e2e：`__tests__/e2e/heygen-live-fire.test.ts`（进程内假供应商 + 真实 HTTP 客户端，
  断言供应商实收请求体；音频驱动时 **script 与 audio_url 互斥**）

## 七、环境变量（键名，值只进 .env.local）

```
HEYGEN_API_KEY          # 必需
HEYGEN_BASE_URL         # 默认 https://api.heygen.com
HEYGEN_MAX_CONCURRENT   # 并发槽，默认 1
HEYGEN_WEBHOOK_URL      # 回调地址（公网 HTTPS）
HEYGEN_WEBHOOK_SECRET   # 注册端点后从响应取，只显示一次
```

## 八、未接入（含 2026-09-14 评估结论）

### 8.1 声音克隆 `POST /v3/voices/clone`（Instant Clone）

- 入参：`voice_name`* + `audio`（`{type:"url"|"asset_id"|"base64", ...}`）+ 可选 `language` 提示；**规格中无 consent 字段**（与形象克隆不同——授权责任完全落在调用方）
- 异步：轮询 `GET /v3/voices/{voice_clone_id}` 至 `complete`（processing/complete/failed）
- 成本：每账号有克隆额度，超额 `400 resource_limit_reached`；`DELETE /v3/voices/{id}` 释放
- **评估结论：暂不接入**。我们已有 Fish Audio 自有语音方案（合成→OSS 签名→`audio_url` 出片），
  覆盖同样场景且音色资产已沉淀在语音工坊；再引入 HeyGen 克隆会形成两套音色资产。
  触发条件：需要「在 HeyGen 生态内直接用 voice_id 出片且不想走外部音频」时再接。

### 8.2 Professional Voice Clone（`POST /v3/models/audio/voices`，mode=professional）

- 20+ 分钟录音、付费槽位（`400 resource_limit_reached`=无空槽）、每槽 5 次训练/月
- 结论：同上暂不接入；接入时用 `Idempotency-Key` 防重复训练

### 8.3 形象授权提交 `POST /v3/avatars/{group_id}/consent`

- 三种方式：`reroute_url`（浏览器授权页，链接 24h 过期）、`consent_text`（**自定义授权文案**，
  渲染在授权页上替代 HeyGen 默认文案）、`consent_video`（enterprise 直接传预录授权视频）
- **与我们的对接点**：`consent_text` 可以直接填我们 `{name}` 实例化后的授权原文——
  供应商侧授权页展示的文案与我方门禁逐字一致，两套门禁合成一条证据链。
  触发条件：需要在 HeyGen 侧克隆自有形象（digital twin）时接。
- 完成状态轮询：`GET /v3/avatars/{group_id}` 看 `consent_status` → `approved`

### 8.4 实弹验收

等 `HEYGEN_API_KEY`。脚本就绪：`scripts/heygen-acceptance.ts`。
