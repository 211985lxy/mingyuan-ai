# 会议纪要 Agent 扩展方案：腾讯会议本地录制 → 云端 ASR → AIM 智能体

> 归档日期：2026-08-02。
> 范围：把"会议（重点是腾讯会议）"作为信号源接入 AIM IP 智能体系统，自动产出结构化纪要、选题、知识库沉淀、飞书文档。
> 本方案在充分调研飞书/腾讯会议开放能力 + 查证 mingyuan 现有代码后收敛而成，目标是**最大化复用现有管道、最小化新增代码**。

## Summary

把"腾讯会议本地录制视频 → 转写文字 → 进飞书 + IP 智能体"这条链路接入 AIM。核心结论：

1. **不接腾讯会议开放平台的会中能力。** 腾讯会议 REST API 只管会前/会后，不开放会中实时机器人入会/转写（与飞书会议能力严重不对称）。强行走 webhook 需要**企业版 + 应用态**，且转写接口不支持 OAuth。对一个个人/小团队场景，这条路代价过大。
2. **采纳"本地录制视频 + 云端 ASR"路线。** 腾讯会议原生支持本地录制 MP4。把录制文件经**阿里云录音文件识别**（云端、按量计费、自带说话人分离）转写，再喂入 AIM 现有 `meeting-insight` 管道。完全不依赖腾讯会议任何开放 API，个人版腾讯会议即可用。
3. **ASR 选阿里云而非本地 FunASR 或腾讯云。** mingyuan 已接阿里云 ASR（`lib/aliyun-asr.ts`，同一套 AccessKey），录音文件识别是它的"长音频版"，同源 Paraformer 底座，质量与 FunASR 一致但无需自建服务；腾讯云 ASR 说话人分离仅支持"单通道双人"，多参会人会议不适用。
4. **OSS 基础设施已就绪，零存储开发。** `OSS_BUCKET/REGION/ACCESS_KEY_ID/SECRET` 已配齐，`ali-oss` 已是依赖，`uploadBufferToOss` / `generateSignedUrl` 现成可用。
5. **真正要新增的只有一块：** 在 `lib/aliyun-asr.ts` 增加"录音文件识别"调用（提交 + POP 签名 + 轮询），并渲染成带说话人前缀的可读逐字稿。其余（纪要、选题、飞书 Wiki 落地、IP 维基反哺）全部复用现有管道，**零改动**。

> 设计原则：FunASR/阿里云 ASR 是**数据采集层的传感器**，通过"POST 一个 transcript 文本"与 IP 智能体解耦，不嵌进任何 Agent。符合 `docs/architecture/adr-001-aim-harness-execution-kernel.md`（唯一执行内核、Agent 不直接读模型/数据层）。

## 背景：为什么是"本地录制 + 云端 ASR"

最初的设想是"飞书会议 + 腾讯会议双平台机器人自动入会"。经调研两家开放能力后，发现能力严重不对称：

| 维度 | 飞书会议（Lark VC） | 腾讯会议 |
|---|---|---|
| 机器人自动入会 | ✅ 原生 `microphone/bot` | ❌ REST API 不支持会中实时操作 |
| 实时转写（会中） | ✅ 原生 `vc` API | ❌ 不开放给第三方 |
| 会后逐字稿 | ✅ 妙记 Minutes API | ✅ 录制转写接口（⚠️ 不支持 OAuth，需应用态） |
| 事件订阅 | ✅ `vc.meeting.*` / `vc.recording.*` | ✅ `meeting.created/ended` / `recording.*` |
| 企业版前置要求 | 自建应用即可 | 需企业版/商业版 + 开放平台应用审核 |

考虑过三个绕开腾讯限制的方案，逐一否决：

- **飞书会议套娃**（腾讯开会时本地再开飞书会议，虚拟声卡转接）：技术上能跑通，但腾讯会议的系统输出是**所有远程参会人的混音**，飞书妙记收到的是单路音频，会把整场会议当成一个发言人——**说话人分离彻底丢失**，而"发言人及时间线"是纪要的硬需求。声学层面的硬伤，配置无法解决。
- **腾讯会议 webhook + 应用态**：可行但前置门槛高（需企业版、应用审核、转写接口鉴权限制），对个人/小团队不划算。
- **本地常驻 FunASR 服务**：可行且能做说话人分离，但要在 Apple Silicon Mac 上维护一个常驻进程（Docker 镜像 x86 模拟有性能损失，Python 原生需自管），运维成本高。

最终收敛到"本地录制 + 云端 ASR"——绕开所有平台限制，零运维，且与 mingyuan 现有阿里云栈天然契合。

## Key Changes

### 新增（仅 ASR 采集层）

- 在 `apps/web/src/lib/aliyun-asr.ts` 新增**录音文件识别**调用，与现有"一句话识别"`transcribeAudioWav` 并存（不替换、不动现有的）：
  - `transcribeRecordingFile(fileLink, { speakerNum? })`：提交任务 → POP RPC 签名鉴权 → 轮询拿结果。
  - 复用现有 `getAliyunNlsToken` 不适用（录音文件识别用 AccessKey POP 签名，非 NLS Token），签名算法参照现有 `getAliyunNlsToken` 的 HMAC-SHA1 实现。
  - 端点：`filetrans.cn-shanghai.aliyuncs.com`（POP RPC 风格）。
  - 关键参数：`version:"4.0"`、`auto_split:true`（说话人分离）、可选 `supervise_type:1` + `speaker_num`（手动指定说话人数）。
  - 返回归一化结构：`Sentences[]` 每段含 `{ Text, ChannelId, BeginTime, EndTime }`。

- 新增结果渲染函数：把 `Sentences` 按 `ChannelId` 映射成 `发言人A / 发言人B / ...` 前缀的可读逐字稿文本（`string`）。

### 复用（零改动）

- **OSS 上传**：`uploadBufferToOss`（`lib/oss/index.ts`）、`generateSignedUrl`（私有桶读签名）。录音文件传 OSS → 拿签名 URL → 作为 `file_link` 传给 ASR。
- **meeting-insight 管道**：`runMeetingInsightWorkflow`（`lib/aim/meeting-workflow.ts`）+ `extractMeetingInsightFromTranscript`（`lib/aim/meeting-insight-extract.ts`）。接口 `POST /api/integrations/feishu/work-items/meeting-insight` 只收 `transcript: string`，把渲染好的可读逐字稿喂入即可。
- **飞书落地**：`orchestrateAssetLanding` + `renderMeetingInsightMarkdown`（飞书 Doc/Wiki）+ `createLarkWorkItemStore`（经营事项回写）+ `sendCardAsBot`（Bot 推送）。全部现成。
- **凭证**：复用 `OSS_ACCESS_KEY_ID/SECRET` + `ALIYUN_NLS_APP_KEY`，**不新申请任何云账号/飞书应用**。

### 不做的事

- 不接腾讯会议开放平台 API（会中能力 / webhook / 应用态转写）。本地录制路线已完全满足需求。
- 不本地部署 FunASR（云端阿里云录音文件识别同源质量、零运维）。
- 不改 meeting-insight 管道的数据结构（保持吃 `string`）。说话人信息靠"发言人A: xxx"前缀让 LLM 理解，不引入结构化 transcript 字段。
- 不动现有"一句话识别"`transcribeAudioWav`（它服务于短语音口令场景，职责不同）。
- 不在本期做实时转写（会后离线处理录音文件即可）。
- 不在本期做说话人姓名对齐（输出仍是 `发言人A/B` 占位，真实姓名需后续用 attendee 名单映射）。

## Public Interfaces / Types

### 新增内部类型（`lib/aliyun-asr.ts`）

```ts
interface FileTranscriptionSegment {
  speaker: string        // "发言人A" / "发言人B"（由 ChannelId 映射）
  channelId: number
  startMs: number
  endMs: number
  text: string
}

interface FileTranscriptionResult {
  taskId: string
  segments: FileTranscriptionSegment[]
  readableTranscript: string  // 带说话人前缀的可读逐字稿（喂 meeting-insight 用）
  stats: {
    segmentCount: number
    speakerCount: number
    durationSec: number
    totalChars: number
  }
}

// 入参：fileLink 必须是公网可访问的音频/视频 URL（推荐 OSS 签名 URL）
async function transcribeRecordingFile(
  fileLink: string,
  options?: { speakerNum?: number; pollTimeoutMs?: number },
): Promise<FileTranscriptionResult>
```

### 现有接口复用（不变）

- `POST /api/integrations/feishu/work-items/meeting-insight`
  - 请求体不变：`{ recordId, projectId, meetingTitle, customer, transcript }`
  - `transcript` 填入 `FileTranscriptionResult.readableTranscript`。
  - 鉴权不变：`Authorization: Bearer <AIM_WORK_ITEM_API_SECRET>`。

## 端到端数据流

```
腾讯会议本地录制（MP4，个人版即可）
   │
   ▼  上传（复用 uploadBufferToOss）
阿里云 OSS（meeting-recordings/{id}.mp4）
   │  generateSignedUrl 临时读签名
   ▼
阿里云录音文件识别（auto_split 说话人分离）   ← 唯一新写：transcribeRecordingFile
   │  轮询拿 Sentences[{Text, ChannelId, BeginTime, EndTime}]
   ▼  渲染
"发言人A: xxx\n发言人B: yyy..." 可读逐字稿（string）
   │
   ▼  POST（复用，零改动）
meeting-insight 接口（transcript: string）
   │  runMeetingInsightWorkflow
   ▼  复用现有管道
飞书 Wiki 纪要 + 经营事项 Base 回写 + 选题子系统 + IP 维基反哺 + Obsidian 双写
```

## 与 IP 智能体系统的联动

会议纪要 Agent 不新建独立智能体，而是作为**会议信号源**喂入 AIM 现有内核（见 `docs/architecture/adr-001-aim-harness-execution-kernel.md`）。具体联动点：

1. **纪要洞察 → 飞书 Wiki**：`meeting-insight-result-sink` 把九类洞察（痛点/目标/预算/异议/跟进/诊断问题/选题/交付任务/决策阶段）渲染成 Markdown，经 `orchestrateAssetLanding` 落飞书 Doc/Wiki。
2. **选题信号 → 选题子系统**：洞察中的 `topicCandidates` 可经 `POST /api/topics/generate` 进入选题池，在控制台"选题规划"页可见，复用 `hot-topic-intelligence` 做外部热度交叉验证。
3. **洞察 → IP 维基反哺**（二期）：高置信度洞察自动 patch 到 IP 维基的 `audience` / `positioning` / `topic_direction` / `viral_methodology` 页，复用 `lib/ip-wiki`，带人工审核门（复用经营事项"待审核"状态机）。
4. **本地并行**：纪要同时落 `第二大脑/{客户}/会议纪要/`（符合 `customer-second-brain` 标准结构，该目录已有真实数据），选题写 `选题脚本/`（当前空缺，正好补上）供 `client-content-matrix` / `mingdong-writer` 消费。

## 平台能力与 ASR 选型依据

### 飞书会议 / 腾讯会议开放能力对比

- **飞书会议**：原生支持机器人入会（`microphone/bot`）、会中转写、妙记 Minutes API、`vc.meeting.*` / `vc.recording.*` 事件订阅。注意坑：webhook 必须 3 秒内回 200，但 `meeting.ended` 到妙记生成约需 10 秒，必须异步队列处理。
- **腾讯会议**：REST API 只管会前/会后，不开放会中实时机器人。录制转写接口暂不支持 OAuth 2.0，需企业应用态。Webhook 需通过 GET 校验机制（base64）。

### 云端 ASR 横评

| | 阿里云录音文件识别 | 腾讯云 ASR | 阿里百炼 Fun-ASR | 本地 FunASR |
|---|---|---|---|---|
| 接入成本 | ⭐ 已接同账号 | 新接 | 新接 | 自建服务 |
| 说话人分离 | ✅ `auto_split`，多说话人 | ⚠️ 仅单通道双人 | ✅ | ✅ CAM++ |
| 时长上限 | ≤12h（分离建议 ≤2h） | — | 分离建议 ≤2h | 取决于硬件 |
| 计费 | 按时长，新用户免费 2h/天 | 按时长/资源包 | 按 token | 免费 |
| 运维 | 零 | 零 | 零 | 自管常驻进程 |

**结论：阿里云录音文件识别胜出。** 复用现有阿里云账号与 ASR 项目，质量同源 FunASR，说话人分离无"双人"硬限制，零运维。

### 限制（需在实现时处理）

- **说话人分离时长建议 ≤2 小时**：超长会议可能失败/超时，需分段或联系阿里云。正常会议在范围内。
- **音频文件需公网可访问 URL**：必须经 OSS 托管（mingyuan 已具备），不支持提交本地文件二进制。
- **`meeting-insight-extract.ts:89` 截断 transcript 到 12000 字**：1 小时会议转写约 3-5 万字，直接喂入会丢失后半段洞察。需后续：① 分段抽取；② 或扩大截断阈值；③ 或先抽取关键段。**这是落地后需决策的工程问题。**
- **evidence.quote 要求逐字定位原文**（`meeting-insight-extract.ts:70`）：转写若有错别字，quote 对不上原文会被域层校验丢弃。ASR 质量直接影响洞察召回。

## 已交付的验证脚本（POC）

两个 POC 脚本已就位，供质量验证（你判断"问题不大"，云端 ASR 质量基本有保障，是否跑可选）：

- `mingyuan/scripts/aliyun-filetrans-poc.py`（**主线推荐**）：阿里云录音文件识别 + 说话人分离，支持 `--url`（公网音频）或 `--file`（本地文件自动传 OSS）。纯标准库，无额外依赖。
- `mingyuan/scripts/funasr-transcribe-poc.py`（备用）：本地 FunASR WebSocket 转写，含 ffmpeg 抽音 + 说话人分离渲染。

> 注意：`aliyun-filetrans-poc.py` 中提交任务的 Action 名（`PostAsrTask`）是基于阿里云 POP RPC 常规命名推断，首次运行若报"Action 不存在"，错误响应会给出正确 Action 名，改一个字符串即可。

## Test Plan

- **单元测试**（`transcribeRecordingFile`）：
  - POP 签名与现有 `getAliyunNlsToken` 算法一致性（同 HMAC-SHA1）。
  - `Sentences` 正确归一化为 `FileTranscriptionResult`，`ChannelId` 正确映射发言人标签。
  - 说话人数为 1 时（无分离）仍能输出单发言人逐字稿。
  - 轮询超时正确报错，不静默挂起。
- **集成测试**：
  - 本地 MP4 → OSS 上传 → 签名 URL → 录音文件识别 → 可读逐字稿 → meeting-insight 接口，全链路跑通。
  - meeting-insight 接口收到带说话人前缀的 transcript 后，`evidence.quote` 能在原文定位（验证 LLM 抽取不受前缀干扰）。
- **回归验证**：
  - 现有 `/api/aim/transcribe`（一句话识别）行为不变，短语音场景不退化。
  - OSS 上传、签名 URL 生成不破坏现有视频资产管理链路。
- **lint / build**：
  - `pnpm --dir mingyuan/apps/web lint -- src/lib/aliyun-asr.ts`
  - `pnpm --dir mingyuan/apps/web build`

## Assumptions

- 腾讯会议使用**本地录制**功能（个人版即支持），不需要企业版或开放平台应用。
- 阿里云账号已开通智能语音交互（NLS）服务并有 `ALIYUN_NLS_APP_KEY`（mingyuan 已配）。
- OSS Bucket 已配齐且 `isOssConfigured()` 返回 true（已确认）。
- 会议时长在说话人分离建议范围内（≤2 小时）；超长会议作为已知限制，不在本期解决。
- 输出的说话人是 `发言人A/B` 占位标签，真实姓名对齐是后续工作（需 attendee 名单 + 声纹匹配）。
- 录音文件经 OSS 临时签名 URL 传递给 ASR，签名有效期需覆盖识别完成时间。

## 分阶段路线图

| 期 | 目标 | 新增 vs 复用 | 验收 |
|---|---|---|---|
| **P1 主线** | 腾讯会议录制 → 阿里云录音文件识别 → meeting-insight → 飞书 Wiki | 新增 `transcribeRecordingFile` + 渲染；复用 OSS + meeting-insight 全管道 | 一场腾讯会议录制自动产出飞书 Wiki 纪要 + 经营事项 |
| **P2 选题联动** | 会议洞察 → 选题子系统 → 控制台 | 复用 `/api/topics/generate` + 增强选题信号 | 纪要自动产出 3-5 条选题进选题池 |
| **P3 IP 维基反哺** | 洞察自动 patch IP 维基 + Obsidian 双写 | 复用 `lib/ip-wiki` + `lib/knowledge`；新增反哺逻辑 + 审核门 | IP 维基随会议生长，客户画像自动更新 |
| **P4 增强** | 说话人姓名对齐 + 12000 字截断处理 + 选题标题增强 | 复用 `dbs-xhs-title` 等 skills | 人物识别准确率提升，长会议不丢洞察 |

## 飞书会议的并行路径（可选增强）

飞书会议能力最完整，体验最好。若后续要覆盖飞书会议，走原生 Bot 路线（与腾讯会议本地录制路线并行，不互斥）：
- `vc.meeting.started/ended` 事件 → Bot 自动入会 → 妙记原生转写 → 同样汇入可读逐字稿 → meeting-insight 管道（完全复用）。
- 可新增 `meeting-source-adapter.ts` 统一适配器，上层（meeting-insight）不关心来源是飞书妙记还是阿里云录音文件识别。

这是"双轨 + 一兜底"架构的体现：飞书原生 Bot（最优体验）/ 阿里云录音文件识别（腾讯会议 & 任意平台主线）/ 本地音频抓取（Meetily 模式，未来平台兜底）。

---

## 参考

- 现有代码（查证依据）：
  - `apps/web/src/lib/aliyun-asr.ts`（一句话识别，60 秒限制，本次新增录音文件识别于此）
  - `apps/web/src/lib/aim/meeting-workflow.ts`（meeting-insight 工作流，零改动复用）
  - `apps/web/src/lib/aim/meeting-insight-extract.ts`（LLM 抽取层，吃 string transcript）
  - `apps/web/src/app/api/integrations/feishu/work-items/meeting-insight/route.ts`（接入接口）
  - `apps/web/src/lib/oss/index.ts`（OSS 上传/签名，复用）
  - `apps/web/src/env.ts`（OSS_* 与 ALIYUN_* 环境变量，已配齐）
- 官方文档：
  - 阿里云录音文件识别：`filetrans.cn-shanghai.aliyuncs.com`，`auto_split` 说话人分离，音频 ≤512MB / ≤12h
  - 飞书开放平台 VC API：`vc.meeting.*` / `vc.recording.*` 事件，妙记 Minutes API
  - 腾讯会议开放平台：REST API 会前/会后，转写接口不支持 OAuth
- 架构规范：`docs/architecture/adr-001-aim-harness-execution-kernel.md`（唯一执行内核）
- 验证脚本：`scripts/aliyun-filetrans-poc.py`、`scripts/funasr-transcribe-poc.py`
