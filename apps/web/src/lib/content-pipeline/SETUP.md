# 内容素材流水线 — 配置与部署指南

## 概述

双路由视频内容处理流水线（5a→5b→5c→5d→5e→飞书存储），两条路由共享 AIM 处理层。

## 新增文件清单

```
src/lib/content-pipeline/
  index.ts                    — 模块导出
  video-link-detector.ts      — 视频链接检测（6大平台正则 + detectVideoPlatform）
  video-processor.ts          — 核心流水线编排（5a→5b→5c→5d→5e→飞书写入）
  lark-content-store.ts       — 飞书 Base 读写器（去重 + upsert）
  topic-bridge.ts             — 5c：转录→topicSources→generateTopicCards→TopicSelection DB
  competitor-bridge.ts        — 5d：视频作者→WatchAccount匹配→竞品标记
  copy-inspiration-bridge.ts  — 5e：转录+选题→content_producer LLM→文案方向

src/app/api/aim/process-video/route.ts                  — 视频处理 API（手动/Cron/前端调用）
src/app/api/integrations/wechat-mp/events/route.ts       — 公众号消息端点（路由二）

修改：
src/app/api/integrations/feishu/events/route.ts         — 新增视频链接分流（在现有 dispatcher 内）
```

## 环境变量

```bash
# ─── 新增（必须） ───────────────────────────────
LARK_CONTENT_BASE_TOKEN="app_xxx"             # 飞书 Base token
LARK_CONTENT_TABLE_ID="tbl_xxx"              # 飞书 Base table ID
LLM_SUMMARY_BASE_URL="https://api.deepseek.com/v1"  # 5b LLM 地址
LLM_SUMMARY_API_KEY="sk-xxx"                        # 5b LLM 密钥
LLM_SUMMARY_MODEL="deepseek-v4-flash"              # 5b 模型名（2026-07-31 正式版）
CONTENT_PIPELINE_USER_ID="user_xxx"             # 流水线默认用户（5c/5e 需要）

# ─── 新增（路由二） ───────────────────────────────
WECHAT_MP_TOKEN="your_token"                     # 公众号 Token
WECHAT_MP_APP_ID="wx_xxx"                        # 公众号 AppID
WECHAT_MP_APP_SECRET="xxx"                        # 公众号 AppSecret

# ─── 可选控制 ─────────────────────────────────────
CONTENT_PIPELINE_ENABLED="true"                   # 设为 false 关闭视频分流
CHANNELS_EXTRACT_API_URL=""                       # 视频号提取服务地址（待确定）
CHANNELS_EXTRACT_API_KEY=""                       # 视频号提取服务密钥
```

## 飞书 Base 创建

```bash
# 1. 创建 Base
lark-cli base +base-create --title "内容素材库"
# 记下 base_token

# 2. 创建数据表
lark-cli base +table-create --base-token app_xxx --title "视频素材"
# 记下 table_id

# 3. 创建 8 个字段
BASE="app_xxx" TABLE="tbl_xxx"
lark-cli base +field-create --base-token $BASE --table-id $TABLE --json '{"field_name":"视频标题","type":1}'
lark-cli base +field-create --base-token $BASE --table-id $TABLE --json '{"field_name":"原始链接","type":1}'
lark-cli base +field-create --base-token $BASE --table-id $TABLE --json '{"field_name":"来源","type":3,"property":{"options":[{"name":"抖音群"},{"name":"视频号"},{"name":"其他"}]}}'
lark-cli base +field-create --base-token $BASE --table-id $TABLE --json '{"field_name":"转录文本","type":1}'
lark-cli base +field-create --base-token $BASE --table-id $TABLE --json '{"field_name":"AI总结","type":1}'
lark-cli base +field-create --base-token $BASE --table-id $TABLE --json '{"field_name":"关键要点","type":1}'
lark-cli base +field-create --base-token $BASE --table-id $TABLE --json '{"field_name":"处理状态","type":3,"property":{"options":[{"name":"待处理"},{"name":"处理中"},{"name":"已完成"},{"name":"失败"}]}}'
lark-cli base +field-create --base-token $BASE --table-id $TABLE --json '{"field_name":"处理时间","type":5}'
```

## API 使用

```bash
# 手动触发完整流水线
curl -X POST https://your-domain.com/api/aim/process-video \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://v.douyin.com/xxx","source":"抖音群"}'

# 仅提取文案（跳过5b-5e）
curl -X POST https://your-domain.com/api/aim/process-video \\
  -d '{"url":"https://v.douyin.com/xxx","skipAiProcessing":true}'
```

## 处理流程

```
飞书群消息/公众号消息
  ↓ detectVideoLinks()
提取视频 URL + 平台识别
  ↓
5a 轻抖 API → 提取文案（submitTask → poll → result）
  ↓
5b LLM → AI 总结标题+摘要+关键要点
  ↓
5c generateTopicCards() → 4个选题卡片 → TopicSelection DB
  ↓
5d WatchAccount 查询 → 竞品标记（nickname/url 匹配）
  ↓
5e content_producer LLM → 文案灵感（hook+direction+platform）
  ↓
飞书 Base upsert → 统一素材库
  ↓
飞书群回复完整处理报告（5a-5e 各步骤结果）
```
