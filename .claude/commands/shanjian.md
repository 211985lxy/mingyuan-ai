---
name: shanjian
description: "Shanjian (闪剪) AI OpenAPI integration guide. Digital human cloning (professional/fast/image), voice cloning (v1-v3/s1/s3), TTS/ASR, video generation (virtualman broadcast, realman broadcast, material mixcut, news mixcut, custom variants), AI cover, template management, task lifecycle, webhook handling, file validation, cost estimation, and best practices for ClipFlow deep integration."
category: Video AI Integration
tags: [shanjian, digital-human, voice-clone, video-generation, tts, asr, ai-cover, template, webhook]
---

# 闪剪 (Shanjian) AI OpenAPI 深度集成指南

本 Skill 是 ClipFlow 与闪剪 OpenAPI 深度对接的权威参考。涵盖全部 22 个 API 端点、5 大业务流程、文件校验规则、算力成本体系、错误处理策略和生产级最佳实践。

**Base URL:** `https://openapi.shanjian.tv`
**认证方式:** `Authorization: Bearer {APP_KEY}` + `Content-Type: application/json`
**核心代码:** `apps/web/src/lib/shanjian.ts` (API Client) + `apps/web/src/types/shanjian.ts` (Type Definitions)

---

## 一、架构总览

```
用户操作 → Next.js API Routes → lib/shanjian.ts → 闪剪 OpenAPI
                                       ↑
                              Webhook 回调 ← 闪剪异步通知
                                       ↓
                              Prisma DB + Redis 幂等 + OSS 转存
```

**核心原则:**
1. 所有闪剪调用集中在 `lib/shanjian.ts`，禁止 API Route 直接调用
2. 所有操作都是异步的 — 提交后返回 `taskId`，结果通过 Webhook 或轮询获取
3. 闪剪结果**仅保留 24 小时**，必须在回调后立即转存到自有 OSS
4. Webhook 处理必须幂等（Redis SET NX）
5. 闪剪错误码统一映射为 ClipFlow 业务错误码

---

## 二、API 全景图 — 22 个端点

### 2.1 资产查询（免费，可缓存）

| # | 方法 | 路径 | 用途 | 缓存策略 |
|---|------|------|------|---------|
| 1 | GET | `/v1/assets/voice/common` | 公共配音列表 | 24h |
| 2 | GET | `/v1/assets/virtualman/common` | 公共数字人列表 | 24h |
| 18 | GET | `/v1/clip/template` | 模板列表（按 scene 筛选） | 6h |
| 19 | GET | `/v1/clip/template/detail/{id}` | 模板详情（含图层结构） | 6h |
| 20 | GET | `/v1/clip/image/template` | AI 封面模板列表 | 6h |

### 2.2 克隆服务（异步任务）

| # | 方法 | 路径 | 用途 | 算力消耗 | 耗时 |
|---|------|------|------|---------|------|
| 3 | POST | `/v1/virtualman/train` | 专业数字人克隆 | 500/次 | 1-6 小时 |
| 4 | POST | `/v1/virtualman/fast/train` | 极速数字人克隆 | 免费 | 首次 3-5 分钟 |
| 5 | POST | `/v1/virtualman/image/train` | 图生数字人 | — | ~10 分钟 |
| 6 | POST | `/v1/voice/train` | 声音克隆 | 免费(V1-V3) | 数分钟 |
| 7 | DELETE | `/v1/assets/{id}` | 删除数字人/声音 | 0 | 同步 |

### 2.3 效果服务（异步任务）

| # | 方法 | 路径 | 用途 |
|---|------|------|------|
| 8 | POST | `/v1/effect/tts` | 文字转语音 |
| 9 | POST | `/v1/effect/asr` | 语音转文字（26 种语言） |

### 2.4 视频生成（异步任务，核心能力）

| # | 方法 | 路径 | 用途 | 算力/分钟 |
|---|------|------|------|----------|
| 10 | POST | `/v1/virtualman/video` | 数字人纯口播（无包装） | 50 |
| 11 | POST | `/v1/clip/video/virtualman_broadcast` | **数字人口播混剪 (MVP核心)** | 70 |
| 12 | POST | `/v1/clip/video/realman_broadcast` | 真人口播混剪 | 10 |
| 13 | POST | `/v1/clip/video/custom_realman_broadcast` | 自定义真人口播混剪 | 10 |
| 14 | POST | `/v1/clip/video/broadcast_mixcut` | 素材混剪 | 10 |
| 15 | POST | `/v1/clip/video/news_mixcut` | 新闻体视频 | 4 |
| 16 | POST | `/v1/clip/video/custom_virtualman_broadcast` | 自定义数字人口播混剪 | 70 |
| 17 | POST | `/v1/clip/video/custom_broadcast_mixcut` | 自定义素材混剪 | 10 |

### 2.5 图片生成与任务管理

| # | 方法 | 路径 | 用途 |
|---|------|------|------|
| 21 | POST | `/v1/clip/image/ai_cover` | AI 封面生成 |
| 22 | GET | `/v1/task/info` | 查询任务状态和结果 |

---

## 三、五大业务模式详解

### 3.1 数字人口播混剪 — MVP 主力（70 算力/分钟）

**场景:** 数字人 + AI 配音 + 文案 + 素材，60+ 套模板自动包装。最适合个人 IP 短视频批量生产。

**接口:** `POST /v1/clip/video/virtualman_broadcast`

**两种输入模式:**
- **文字模式:** `content` + `speakerId` — 系统自动 TTS 合成
- **音频模式:** `audioUrl` — 提供预录制音频

**关键参数:**

```typescript
{
  styleId: "模板ID",           // 必填，从 /v1/clip/template?scene=virtualman 获取
  virtualmanId: "数字人ID",     // 必填，公共 or 自建
  content: "口播文案",          // 3-1800 字符（与 audioUrl 二选一）
  speakerId: "配音ID",         // content 模式必填
  speakerExtra: {
    speedRatio: 1.0,           // 语速 0.5-2.0
    language: "zh-CN"
  },
  title: "视频标题",
  materials: [                 // 插入的图片/视频素材
    { type: "image", fileUrl: "https://..." },
    { type: "video", fileUrl: "https://...", soundSwitch: false }
  ],
  introduceCard: {             // 身份栏
    name: "用户名",
    description: "身份描述"
  },
  packRules: {                 // 包装控制
    headerSwitch: true,        // 标题效果
    subtitleSwitch: true,      // 字幕效果
    materialSwitch: true,      // 素材效果
    keywordSwitch: false,      // 关键词效果
    backgroundMusic: {
      audioSwitch: true,       // 背景音乐
      volume: 0.3
    }
  },
  processRules: {
    watermarkShow: false,      // AI 生成水印
    firstFrameCover: {
      coverSwitch: true        // 自动生成封面
    }
  },
  structLayers: [              // 图层定制
    { markCode: "headerLayer", show: true, showMode: "customize", showTime: 3.0 },
    { markCode: "subtitleLayer", show: true },
    { markCode: "ipLayer", show: true }
  ],
  callbackUrl: "https://你的域名/api/webhook/shanjian"
}
```

### 3.2 真人口播混剪（10 算力/分钟）

**场景:** 剪辑用户真人拍摄的视频，自动去除气口和无声片段，添加包装效果。

**接口:** `POST /v1/clip/video/realman_broadcast`

**核心区别:** 输入是 `videoUrl`（真人视频），而非 `virtualmanId`

```typescript
{
  styleId: "模板ID",           // 从 /v1/clip/template?scene=realMan 获取
  videoUrl: "真人视频URL",      // MP4/MOV, <5min, <500MB
  language: "zh-CN",           // 用于 ASR 识别语言
  // ...其余与 virtualman_broadcast 相同
}
```

### 3.3 素材混剪（10 算力/分钟）

**场景:** 纯素材（图片+视频）配合 AI 配音，无数字人/真人出镜。

**接口:** `POST /v1/clip/video/broadcast_mixcut`

```typescript
{
  styleId: "模板ID",           // 从 /v1/clip/template?scene=oralMixCutting 获取
  materials: [...],            // 必填，素材列表
  content: "配音文案",
  speakerId: "配音ID",
  // ...packRules, processRules 同上
}
```

### 3.4 新闻体视频（4 算力/分钟，最经济）

**场景:** 素材 + 标题 + 背景音乐快速生成新闻风格视频。无需配音。

**接口:** `POST /v1/clip/video/news_mixcut`

```typescript
{
  styleId: "模板ID",           // 从 /v1/clip/template?scene=newsMixCutting 获取
  title: "新闻标题文案",        // 必填，3-1800 字符
  materials: [...],            // 必填
  // 注意：标题行数不能超过模板封面行数，否则回退默认模板
}
```

### 3.5 自定义场景级控制（高级）

**接口:** `custom_virtualman_broadcast` / `custom_broadcast_mixcut`

**核心区别:** 使用 `scenes[]` 数组替代单一 content，实现逐镜头/逐场景控制。

```typescript
{
  scenes: [
    {
      captions: {
        content: "第一段文案",
        marks: [{ type: "break", index: 5, time: 500 }]  // 在第5个字后停顿500ms
      },
      materials: [
        { fileUrl: "...", entryPoint: 2.0, duration: 5.0 }  // 精确控制素材时间
      ]
    },
    {
      captions: { content: "第二段文案" },
      materials: [{ fileUrl: "..." }]
    }
  ]
}
```

---

## 四、数字人克隆完整流程

### 4.1 三种克隆方式对比

| 方式 | 接口 | 输入 | 耗时 | 算力 | 适用 |
|------|------|------|------|------|------|
| 极速克隆 | `/v1/virtualman/fast/train` | 5-60s 视频 | 首次3-5min | 免费 | MVP 主用，初体验 |
| 专业克隆 | `/v1/virtualman/train` | 30-120s 视频 | 1-6h | 500/次 | 高质量需求 |
| 图生克隆 | `/v1/virtualman/image/train` | 照片 | ~10min | — | 无视频素材时 |

### 4.2 素材要求速查

**训练视频（专业版）:**
- 时长: 30-120 秒
- 大小: <=1GB
- 分辨率: 单边 <=2000px
- 帧率: 10-60fps（推荐 25fps）
- 编码: H.264 / HEVC (H.265)
- 格式: MP4, MOV

**训练视频（极速版）:**
- 时长: 5-60 秒
- 大小: <=500MB
- 其余同上

**训练图片（图生版）:**
- 分辨率: 300-2000px
- 大小: <=5MB
- 格式: JPG, PNG, WebP
- 宽高比: 0.4-2.5

**授权视频（所有克隆方式必须）:**
- 大小: <=100MB
- 时长: <2 分钟
- 编码: H.264 / HEVC
- 格式: MP4, MOV

### 4.3 授权话术模板

> "我是 XXX（真实姓名），我授权【ClipFlow】使用视频中的肖像、声音，为我生成定制数字人及声音，并在本人【ClipFlow】账号中创作使用。"

### 4.4 拍摄指导（必须告知用户）

- 光线充足、安静环境
- **第一秒闭嘴**（关键！）
- 不遮挡嘴巴
- 不拍侧脸（侧脸幅度不超 45 度）
- 画面中只有一个人
- 人物始终在画面内
- 推荐 25fps

---

## 五、声音克隆

### 5.1 模型选择

| 模型 | 支持语言 | 音频时长 | 适用场景 |
|------|---------|---------|---------|
| V1/V2 | 中英日西印葡（6种） | 5-120s | 标准需求 |
| V3 | 中英（2种） | 5-120s | 中英场景 |
| S1/S3 | 40+ 语言 | 10-120s | 多语种需求 |

### 5.2 录制要求（告知用户）

- 安静环境（无杂音、噪音、回声、混响）
- 麦克风距嘴约 10cm
- 情绪稳定，语速均匀
- 使用普通话，避免方言和英文混杂
- 格式: mp3, wav (推荐), m4a
- 大小: <=10MB

---

## 六、TTS 高级用法

### 6.1 基础调用

```typescript
{
  text: "你好，欢迎来到 ClipFlow",
  speakerId: "配音ID",
  language: "zh-CN",
  speedRatio: 1.0,       // 0.5-2.0
  volume: 1.0,           // 0.5-2.0
  codec: "mp3",          // mp3 or wav
  returnSubtitle: true   // 返回字幕时间轴
}
```

### 6.2 TextMark 停顿控制

```typescript
{
  text: "今天我们来聊聊一个重要的话题",
  marks: [
    { type: "break", index: 8, time: 800 }  // 在"聊聊"后停顿800ms
  ]
}
```

- `index`: 字符位置（0 到 text.length）
- `time`: 停顿时长（100-10000ms）

### 6.3 多音字处理

闪剪不支持拼音标注。使用**同音字替代**：
```typescript
{
  text: "请长按关注",  // "长" 可能被读错
  marks: [
    { type: "replace", indexRange: [1, 2], text: "常" }  // 用同音字替代
  ]
}
```

**注意:** 替换仅影响发音，不影响字幕显示。

---

## 七、模板系统

### 7.1 四种模板场景

| scene 值 | 模板类型 | 配合接口 |
|----------|---------|---------|
| `virtualman` | 数字人口播模板 | virtualman_broadcast, custom_virtualman_broadcast |
| `realMan` | 真人口播模板 | realman_broadcast, custom_realman_broadcast |
| `oralMixCutting` | 素材混剪模板 | broadcast_mixcut, custom_broadcast_mixcut |
| `newsMixCutting` | 新闻体模板 | news_mixcut |

### 7.2 模板详情解读

```typescript
const detail = await getTemplateDetail("template-id");

// 画布尺寸
detail.videoStructInfo.editInfo.canvas // { width: 720, height: 1280 }

// 图层结构（空对象 = 该模板不支持此图层）
detail.videoStructInfo.editInfo.headerLayer   // 标题图层
detail.videoStructInfo.editInfo.subtitleLayer  // 字幕图层
detail.videoStructInfo.editInfo.ipLayer        // 身份栏图层

// 每个图层包含位置信息
headerLayer.transform.position // [x, y, z] 坐标系原点在左上角
```

### 7.3 structLayers 图层定制

```typescript
structLayers: [
  {
    markCode: "headerLayer",
    show: true,
    showMode: "customize",   // "always" 或 "customize"
    showTime: 3.000,         // customize 模式下显示时长（秒，3位小数）
    layer: {
      transform: {
        position: [360, 160, 0]  // 自定义位置
      }
    }
  },
  {
    markCode: "subtitleLayer",
    show: true
  },
  {
    markCode: "ipLayer",
    show: false  // 隐藏身份栏
  }
]
```

---

## 八、任务生命周期管理

### 8.1 统一响应格式

```json
{
  "code": "Succeed",
  "data": { ... },
  "message": "错误描述（仅失败时）",
  "requestId": "请求追踪ID"
}
```

### 8.2 任务状态流转

```
提交任务 → taskId
    │
    ├─ status: "processing" ← 处理中
    │
    ├─ status: "succeed" ← 成功
    │      └─ result: { videoUrl, audioUrl, imageUrl, coverUrl, ... }
    │
    └─ status: "failed" ← 失败
           └─ errorCode + errorMessage
```

### 8.3 Webhook 回调处理

**端点:** `POST /api/webhook/shanjian`

**回调体结构:**
```typescript
interface WebhookPayload {
  taskId: string;
  status: "processing" | "succeed" | "failed";
  result?: {
    videoUrl?: string;       // 视频任务
    audioUrl?: string;       // TTS 任务
    imageUrl?: string;       // 图片/封面任务
    text?: string;           // ASR 任务
    coverUrl?: string;       // 视频封面
    duration?: number;       // 时长（秒）
    virtualmanId?: string;   // 数字人克隆结果
    speakerId?: string;      // 声音克隆结果
    demoAudioUrl?: string;   // 声音克隆试听
    subtitle?: SubtitleResult[];
    aiCoverSucceed?: boolean;
  };
  costRights?: {
    credits: number;         // 消耗算力
  };
  errorCode?: string;
  errorMessage?: string;
}
```

**处理流程:**
1. Redis SET NX 幂等检查（防重复回调）
2. 通过 taskId 匹配内部记录（avatar / videoTask / voiceAsset）
3. 成功 → 转存 OSS + 更新状态 + 结算算力
4. 失败 → 记录错误 + 不扣费
5. 立即返回 HTTP 200（避免闪剪超时重试）

**重要:** 失败通知最多重试 3 次。

### 8.4 兜底轮询机制

```
Cron 每 5 分钟:
  - avatar: status='cloning' AND updated_at < now()-10min → 轮询
  - video: status='processing' AND updated_at < now()-5min → 轮询
  - Redis SET NX 轮询锁 (poll:{taskId}, TTL 60s) 防并发
```

### 8.5 结果转存（24 小时过期！）

```typescript
// 闪剪结果仅保留 24 小时！回调成功后必须立即转存
async function persistResult(taskId: string, result: TaskResult['result']) {
  // 1. 下载闪剪结果文件
  // 2. 上传到自有 OSS (videos/{taskId}/output.mp4)
  // 3. 如有封面同步转存
  // 4. 更新数据库为 OSS URL
}
```

**输出域名白名单（下载转存时信任）:**
- `*.cos.ap-guangzhou.myqcloud.com` — 纯口播视频（无水印）
- `*.cos.ap-beijing.myqcloud.com` — 纯口播视频（加水印）
- `*.oss-cn-beijing.aliyuncs.com` — 口播混剪视频、TTS 音频

---

## 九、文件校验规则

在调用闪剪 API 前必须前置校验，避免浪费 API 调用：

### 9.1 视频素材

| 参数 | 真人口播视频 | 素材视频 | 口播音频 | 背景音乐 |
|------|------------|---------|---------|---------|
| 格式 | MP4/MOV | MP4/MOV | MP3/WAV/M4A | MP3/WAV/M4A |
| 编码 | H.264/HEVC | H.264/HEVC | — | — |
| 帧率 | 10-60fps | 10-60fps | — | — |
| 分辨率 | <=2000px | <=2000px | — | — |
| 时长 | <5min | <60s/个 | 0.5s-5min | <=5min |
| 大小 | <500MB | <500MB | <100MB | <=120MB |
| 总素材时长 | — | <=5min | — | — |

### 9.2 图片素材

- 格式: JPG, PNG, WebP
- 分辨率: 单边 <=2000px
- 大小: <=10MB（封面用）

### 9.3 输出规格

- 分辨率: 1080p
- 画面比例: 9:16（竖屏）
- 码率: 6M

---

## 十、错误码速查与处理

### 10.1 错误码映射表

| 闪剪错误码 | HTTP | ClipFlow 码 | 含义 | 处理建议 |
|-----------|------|------------|------|---------|
| Invalid.Authorization | 401 | SHANJIAN_AUTH_FAILED | API Key 无效 | 检查 SHANJIAN_APP_KEY |
| Invalid.TrainAuth | 422 | INVALID_AUTH_VIDEO | 授权视频验证失败 | 检查人脸匹配 |
| Request.Limit | 429 | RATE_LIMITED | QPS 超限 | 排队重试 |
| Concurrency.Limit | 429 | CONCURRENCY_EXCEEDED | 并发任务超限 | 提示用户等待 |
| Account.NotExist | 403 | SHANJIAN_ACCOUNT_ERROR | 账户异常 | 联系闪剪 |
| Resource.NotExist | 404 | RESOURCE_NOT_FOUND | 资源不存在 | 检查 ID 有效性 |
| Resource.Disable | 403 | RESOURCE_DISABLED | 资源被禁用 | 联系闪剪 |
| Task.NotExist | 404 | TASK_NOT_FOUND | 任务不存在 | 检查 taskId |
| Invalid.File.Format | 422 | INVALID_FILE_FORMAT | 文件格式错误 | 前端校验 |
| Invalid.File.Resolution | 422 | INVALID_FILE_RESOLUTION | 分辨率超限 | 压缩/裁剪 |
| Invalid.File.Duration | 422 | INVALID_FILE_DURATION | 时长不符 | 前端校验 |
| Invalid.File.Size | 422 | INVALID_FILE_SIZE | 文件过大 | 压缩 |
| Invalid.File.FPS | 422 | INVALID_FILE_FPS | 帧率不符 | 转码 |
| Invalid.File.Codec | 422 | INVALID_FILE_CODEC | 编码不支持 | 转码 H.264 |
| Invalid.File.Audio | 422 | INVALID_AUDIO | 音频异常 | 检查音轨 |
| Invalid.Face.Detection | 422 | FACE_NOT_DETECTED | 未检测到人脸 | 换照片/视频 |
| Invalid.Face.Completeness | 422 | FACE_INCOMPLETE | 侧脸/遮挡 | 重新拍摄 |
| Invalid.Speech | 422 | SPEECH_QUALITY_LOW | 语音质量差 | 重新录制 |
| Invalid.Face.Comparison | 422 | FACE_MISMATCH | 人脸不匹配 | 确保同一人 |
| Failed.Timeout | 504 | PROCESSING_TIMEOUT | 处理超时 | 重试 |
| Service.Error | 502 | SHANJIAN_SERVICE_ERROR | 服务异常 | 等待重试 |

### 10.2 内容审核

闪剪接入树美审核平台，审核不通过仅返回大类（黄、赌、毒、涉政），不指出具体位置。

**ClipFlow 处理:** 将审核错误翻译为用户可理解的提示，引导用户检查文案和素材。

---

## 十一、算力成本体系

### 11.1 算力消耗表

| 功能 | 算力/分钟 | 备注 |
|------|----------|------|
| 数字人口播混剪 | 70 | MVP 主力 |
| 纯数字人口播 | 50 | 无包装 |
| 真人口播智剪 | 10 | |
| 素材混剪 | 10 | |
| 新闻体 | 4 | 最经济 |
| 专业数字人克隆 | 500/次 | 固定消耗 |
| 极速数字人克隆 | 0 | 免费 |
| 声音克隆 V1-V3 | 0 | 套餐内 |
| 失败任务 | — | 自动退还 |

### 11.2 费用预估公式

```typescript
// 中文口播语速约 300 字/分钟
const estimatedMinutes = textLength / 300;
const costPerMinute = { virtualman_broadcast: 70, realman_broadcast: 10, broadcast_mixcut: 10, news_mixcut: 4, virtualman_video: 50 };
const estimatedCredits = Math.ceil(estimatedMinutes * costPerMinute[videoType]);
```

### 11.3 并发限制

| 套餐 | 同时处理视频数 | 同时克隆数字人数 |
|------|-------------|---------------|
| free | 1 | 1 |
| basic | 2 | 1 |
| pro | 5 | 2 |

超并发直接返回 `Concurrency.Limit`，需自行排队。

---

## 十二、ClipFlow 集成最佳实践

### 12.1 MVP 接口优先级

| 优先级 | 接口 | 产品能力 |
|--------|------|---------|
| P0 核心 | virtualman_broadcast | 数字人口播混剪视频 |
| P0 核心 | /v1/virtualman/fast/train | 极速克隆数字人 |
| P0 核心 | /v1/task/info | 任务状态查询 |
| P0 核心 | /v1/clip/template | 模板选择 |
| P0 核心 | /v1/assets/voice/common | 配音选择 |
| P1 重要 | /v1/effect/tts | TTS 试听 |
| P1 重要 | /v1/clip/image/ai_cover | AI 封面 |
| P2 扩展 | realman_broadcast | 真人口播 |
| P2 扩展 | broadcast_mixcut | 素材混剪 |
| P2 扩展 | /v1/voice/train | 声音克隆 |
| P3 后期 | custom_* 系列 | 场景级精细控制 |
| P3 后期 | news_mixcut | 新闻体 |

### 12.2 典型视频生成流程

```
1. 用户设置 IP Profile（头像、名称、行业）
2. 选择/生成脚本文案（模板系统 + LLM）
3. 选择数字人（公共 or 自建克隆）
4. 选择配音（公共 or 自建克隆）
5. 选择视频模板（按场景筛选）
6. 上传辅助素材（图片、视频片段）
7. 算力预估 → 余额校验
8. 提交 generateVirtualmanBroadcast()
9. 等待 Webhook 回调 → 转存 OSS
10. 展示成品视频 + 封面
```

### 12.3 开发注意事项

1. **结果过期:** 闪剪生成结果仅 24 小时有效，转存 OSS 是强制动作
2. **幂等处理:** Webhook 可能重复投递（最多 3 次），必须 Redis 去重
3. **前置校验:** 所有文件格式/大小在上传时就校验，避免到闪剪才报错
4. **优雅降级:** 闪剪并发超限时提示用户排队，不要直接报 500
5. **缓存资产列表:** 公共配音和数字人列表变化极少，24h 缓存
6. **模板缓存:** 模板列表 6h 缓存，模板详情可更短
7. **费用透明:** 生成前预估费用展示给用户，避免意外扣费
8. **多音字:** 使用同音字替代策略，音频替换文本不影响字幕
9. **签名验证:** 闪剪文档未提及回调签名，当前通过 taskId 匹配验证来源

### 12.4 环境变量

```env
SHANJIAN_APP_KEY=          # 闪剪 API 密钥（Bearer Token）
SHANJIAN_BASE_URL=https://openapi.shanjian.tv
SHANJIAN_WEBHOOK_URL=      # Webhook 回调地址（必须公网可达）
```

---

## 十三、接口文档链接速查

| 接口 | 文档 |
|------|------|
| 公共配音列表 | https://openapi-doc.shanjian.tv/397345823e0 |
| 公共数字人列表 | https://openapi-doc.shanjian.tv/397369717e0 |
| 专业数字人克隆 | https://openapi-doc.shanjian.tv/342231002e0 |
| 极速数字人克隆 | https://openapi-doc.shanjian.tv/342232918e0 |
| 图生数字人克隆 | https://openapi-doc.shanjian.tv/347502607e0 |
| 声音克隆 | https://openapi-doc.shanjian.tv/342241374e0 |
| 删除资产 | https://openapi-doc.shanjian.tv/344550029e0 |
| TTS | https://openapi-doc.shanjian.tv/359919256e0 |
| ASR | https://openapi-doc.shanjian.tv/342294933e0 |
| 纯数字人口播 | https://openapi-doc.shanjian.tv/342245572e0 |
| 数字人口播混剪 | https://openapi-doc.shanjian.tv/342271033e0 |
| 真人口播混剪 | https://openapi-doc.shanjian.tv/342282685e0 |
| 自定义真人口播 | https://openapi-doc.shanjian.tv/360232310e0 |
| 素材混剪 | https://openapi-doc.shanjian.tv/347508346e0 |
| 新闻体视频 | https://openapi-doc.shanjian.tv/347517114e0 |
| 自定义数字人混剪 | https://openapi-doc.shanjian.tv/354590181e0 |
| 自定义素材混剪 | https://openapi-doc.shanjian.tv/354615984e0 |
| 模板列表 | https://openapi-doc.shanjian.tv/342258231e0 |
| 模板详情 | https://openapi-doc.shanjian.tv/382122111e0 |
| AI封面模板 | https://openapi-doc.shanjian.tv/389221892e0 |
| AI封面生成 | https://openapi-doc.shanjian.tv/389226151e0 |
| 任务查询 | https://openapi-doc.shanjian.tv/342296170e0 |
| 回调数据 | https://openapi-doc.shanjian.tv/7694236m0 |

---

## 十四、代码定位

| 文件 | 职责 |
|------|------|
| `apps/web/src/lib/shanjian.ts` | 闪剪 API 客户端（全部 22 个接口封装） |
| `apps/web/src/types/shanjian.ts` | 完整 TypeScript 类型定义 |
| `apps/web/src/app/api/webhook/shanjian/route.ts` | Webhook 回调处理端点 |
| `docs/shanjian-openapi-reference.md` | API 完整参考文档 |
| `docs/shanjian-backend-service-spec.md` | 后端集成规范（流程、校验、成本） |
