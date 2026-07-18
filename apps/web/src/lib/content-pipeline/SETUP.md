# 内容素材流水线 — 配置与部署指南

## 概述

双路由视频内容处理流水线，支持从抖音群和微信视频号收集视频内容，
自动提取文案、生成 AI 总结，并写入飞书多维表格。

## 新增文件清单

```
src/lib/content-pipeline/
  index.ts                  — 模块导出
  video-link-detector.ts    — 视频链接检测器（正则 + 平台识别）
  video-processor.ts        — 核心处理流水线（提取→总结→存储）
  lark-content-store.ts     — 飞书 Base 「内容素材库」读写器

src/app/api/integrations/feishu/events/route.ts  — 扩展（新增视频链接分流）
src/app/api/aim/process-video/route.ts            — 新增（视频处理 API）
src/app/api/integrations/wechat-mp/events/route.ts — 新增（微信公众号消息端点）
```

## 环境变量配置

### 必需（已有 + 新增）

```bash
# ─── 已有环境变量（无需新增） ─────────────────────
# 飞书应用
FEISHU_APP_ID="cli_xxx"                    # 飞书应用 App ID
FEISHU_APP_SECRET="xxx"                     # 飞书应用 App Secret
FEISHU_VERIFICATION_TOKEN="xxx"             # 飞书事件验证 Token
FEISHU_TOPIC_CHAT_USER_ID="xxx"             # 选题聊天用户 ID
FEISHU_TOPIC_CHAT_PROJECT_ID="xxx"          # 选题聊天项目 ID

# 轻抖 API（已有）
VIDEO_TEXT_EXTRACT_API_KEY="xxx"             # 轻抖文案提取 API Key

# lark-cli（已有）
LARK_CLI_PATH="/usr/local/bin/lark-cli"      # lark-cli 可执行文件路径

# ─── 新增环境变量 ───────────────────────────────
# 飞书 Base「内容素材库」
LARK_CONTENT_BASE_TOKEN="app_xxx"            # 内容素材库的 Base token
LARK_CONTENT_TABLE_ID="tbl_xxx"             # 内容素材数据表的 table ID

# AI 总结 LLM 配置（复用 AIM 现有 LLM Provider 或独立配置）
LLM_SUMMARY_BASE_URL="https://api.deepseek.com/v1"  # LLM API 地址
LLM_SUMMARY_API_KEY="sk-xxx"                       # LLM API Key
LLM_SUMMARY_MODEL="deepseek-chat"                   # 模型名称

# 微信公众号（路由二）
WECHAT_MP_TOKEN="your_token"                # 公众号后台设置的 Token
WECHAT_MP_ENCODING_AES_KEY=""               # 加密密钥（可选，明文模式留空）
WECHAT_MP_APP_ID="wx_xxx"                   # 公众号 AppID
WECHAT_MP_APP_SECRET="xxx"                   # 公众号 AppSecret

# 视频号文案提取（路由二，待确定服务商）
CHANNELS_EXTRACT_API_URL=""                  # 视频号提取服务地址
CHANNELS_EXTRACT_API_KEY=""                  # 视频号提取服务密钥
```

### 可选（用于 5c/5d/5e 扩展模块）

```bash
# 选题提取 — 复用 AIM 现有配置，无需新增
# 竞品分析 — 复用 AIM 现有 WatchAccount，无需新增
# 文案灵感 — 复用 AIM 现有 content_producer，无需新增
```

## 飞书 Base 创建步骤

### 1. 初始化 lark-cli（如未配置）

```bash
lark-cli config init --new
```

### 2. 创建 Base

```bash
lark-cli base +base-create --title "内容素材库"
```

记下返回的 `base_token`（如 `appBxxxOabc`）。

### 3. 创建数据表

```bash
lark-cli base +table-create \
  --base-token appBxxxOabc \
  --title "视频素材"
```

记下返回的 `table_id`（如 `tblUxxxOabc`）。

### 4. 创建字段

```bash
BASE_TOKEN="appBxxxOabc"
TABLE_ID="tblUxxxOabc"

# 视频标题（文本）
lark-cli base +field-create --base-token $BASE_TOKEN --table-id $TABLE_ID \
  --json '{"field_name":"视频标题","type":1}'

# 原始链接（URL）
lark-cli base +field-create --base-token $BASE_TOKEN --table-id $TABLE_ID \
  --json '{"field_name":"原始链接","type":1}'

# 来源（单选）
lark-cli base +field-create --base-token $BASE_TOKEN --table-id $TABLE_ID \
  --json '{"field_name":"来源","type":3,"property":{"options":[
    {"name":"抖音群"},{"name":"视频号"},{"name":"其他"}
  ]}}'

# 转录文本（多行文本）
lark-cli base +field-create --base-token $BASE_TOKEN --table-id $TABLE_ID \
  --json '{"field_name":"转录文本","type":1}'

# AI总结（多行文本）
lark-cli base +field-create --base-token $BASE_TOKEN --table-id $TABLE_ID \
  --json '{"field_name":"AI总结","type":1}'

# 关键要点（多行文本）
lark-cli base +field-create --base-token $BASE_TOKEN --table-id $TABLE_ID \
  --json '{"field_name":"关键要点","type":1}'

# 处理状态（单选）
lark-cli base +field-create --base-token $BASE_TOKEN --table-id $TABLE_ID \
  --json '{"field_name":"处理状态","type":3,"property":{"options":[
    {"name":"待处理"},{"name":"处理中"},{"name":"已完成"},{"name":"失败"}
  ]}}'

# 处理时间（日期）
lark-cli base +field-create --base-token $BASE_TOKEN --table-id $TABLE_ID \
  --json '{"field_name":"处理时间","type":5}'
```

### 5. 配置环境变量

将 `LARK_CONTENT_BASE_TOKEN` 和 `LARK_CONTENT_TABLE_ID` 写入 `.env.local` 和 `.env.production`。

## 飞书事件配置（路由一）

1. 登录[飞书开放平台](https://open.feishu.cn) → 进入应用
2. 事件与回调 → 订阅方式 → 选择「使用长连接接收事件」
3. 添加事件：`im.message.receive_v1`
4. 启用权限：`im:message:receive_as_bot`
5. 创建飞书群「抖音素材收集」，拉入 Bot

## 微信公众号配置（路由二）

1. 登录[微信公众平台](https://mp.weixin.qq.com)
2. 设置与开发 → 基本配置 → 服务器配置
3. 服务器地址(URL)：`https://your-domain.com/api/integrations/wechat-mp/events`
4. 令牌(Token)：自定义一个字符串（对应 `WECHAT_MP_TOKEN`）
5. 消息加解密方式：选择「明文模式」

## API 使用说明

### 手动触发视频处理

```bash
curl -X POST https://your-domain.com/api/aim/process-video \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://v.douyin.com/ixDNxBMK",
    "source": "抖音群"
  }'
```

### 飞书群发消息触发（路由一）

将抖音视频链接发到飞书「抖音素材收集」群，Bot 自动检测并处理。

### 公众号发消息触发（路由二）

将视频号链接发送给公众号，自动处理并回复。

## 扩展模块（5c/5d/5e）

当前实现包含核心的 5a（轻抖转录）和 5b（AI 总结）。
以下扩展模块待接入 AIM 现有能力：

- **5c 选题提取**：接入 `topic-generation.ts`，从转录文本中提取选题方向
- **5d 竞品分析**：接入 `WatchAccount` 查询，标记竞品内容
- **5e 文案灵感**：接入 `content_producer` agent，生成文案方向

这些模块不需要新增环境变量，复用 AIM 现有配置即可。
