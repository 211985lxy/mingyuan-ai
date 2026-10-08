---
name: mingdong-aim-agent-skill
description: Call Mingdong AIM agents to generate draft-only IP content assets for authorized projects. Use this when an external agent needs business diagnosis, IP positioning, video scripts, social posts, articles, community messages, or shooting briefs from Mingdong AIM.
---

# 明动 AIM Agent Skill

明动 AIM 是一个面向 IP 内容增长的草稿生成能力。外部 Agent 可以读取本文档，使用授权的 API Key 调用 AIM 智能体，为登录账号绑定的 IP 营销全案生成内容草稿。所有接口使用当前 `skill.md` 所在站点作为同源地址。

## 能力边界

当前版本只允许生成草稿：

- 商业诊断官：诊断商业模式、流量转化、交付结构与核心矛盾
- 定位策划官：处理 IP 定位、内容定位、人设表达与成交路径
- 内容生产官：生成视频脚本、朋友圈、社群文案、公众号文章、拍摄交接单
- 数据复盘官：对已发布或待发布内容做数据复盘、优化和复用建议
- 作品编辑：把已经写好的成稿做成能发出去的草稿。对应页面 `/aim?agent=work_editor&stage=publish`。能做的是文字二改/润色（去 AI 味）、审查违禁词、公众号排版、小红书图文，以及发布前质检。不会真的发出去。

当前版本明确不允许：

- 自动发布内容
- 同步或写入飞书
- 修改知识库
- 修改 IP 营销全案
- 发起批量长任务
- 执行任意 shell、webhook 或外部自动化动作

## 鉴权

所有接口都需要使用 Agent API Key：

```http
Authorization: Bearer maim_xxx
```

API Key 由明动 AIM 后台创建。每个 AIM 登录账号只能绑定一个 IP 营销全案；Key 会继承该账号的项目边界、可调用的智能体和每日调用上限。账号登录后自动使用绑定项目，不提供项目切换。

## 接口

### 查看能力

```http
GET /api/agent/v1/capabilities
```

返回当前可调用的智能体、支持的输出格式和能力边界。

### 查看当前绑定项目

```http
GET /api/agent/v1/projects
```

返回当前 API Key 所属账号的绑定项目。正常调用可以省略 `projectId`，AIM 会自动使用该项目；如果显式传入，必须与绑定项目一致。

### 生成内容草稿

```http
POST /api/agent/v1/aim/generate
Content-Type: application/json
Authorization: Bearer maim_xxx

{
  "agentId": "content_producer",
  "rawInput": "把这个选题生成视频脚本、朋友圈和拍摄交接单。",
  "targetFormats": ["video_script", "moments_post", "shooting_brief"],
  "instruction": "语气更像老板本人，少用营销黑话。",
  "topicTitle": "老板为什么要搭自己的 AI 内容系统",
  "topicRationale": "适合教育企业客户理解 AI 员工的价值"
}
```

`projectId` 为兼容旧调用保留为可选字段；不传时自动取账号绑定项目，传入其他项目会被拒绝。

允许的 `targetFormats`：

- `video_script`
- `moments_post`
- `wechat_article`
- `community_message`
- `shooting_brief`
- `raw_copy`

返回结构：

```json
{
  "id": "generation_id",
  "agentId": "content_producer",
  "projectId": "project_id",
  "results": [
    {
      "format": "video_script",
      "content": "生成的草稿内容",
      "wordCount": 300
    }
  ],
  "createdAt": "2026-06-21T01:00:00.000Z",
  "warnings": ["draft_only"]
}
```

## MCP

外部 Agent 也可以走 MCP。它调用的是登录网页上的同一套生成，不是另一条只排队的交稿通道。

- 地址：`/api/aim-mcp/mcp`（例如 `https://mingyuan-ai.cn/api/aim-mcp/mcp`）
- 传输：Streamable HTTP，POST JSON-RPC。先 `initialize`，再 `tools/list`。
- 鉴权：`Authorization: Bearer maim_xxx`。没有有效钥匙会返回 401。不接受浏览器 Cookie 代替钥匙。
- 默认关闭。管理员要在服务器设置 `AIM_MCP_ENABLED=true` 后重启，这个地址才会应答。没打开时返回 HTTP 503，正文是 `{"error":"MCP surface is disabled"}`。域名白名单用 `AIM_MCP_ALLOWED_HOSTS`，不设时只允许 `mingyuan-ai.cn`。

`tools/list` 里的工具和网页上的阶段、智能体、技能对应：

- 定方向：商业诊断 `aim_business_diagnosis_core`，选题策划 `aim_benchmark_topic_pool`、`aim_purpose_topics`、`aim_select_high_potential_topics`、`aim_meeting_topics`
- 做内容：`aim_traffic_funnel`、`aim_lead_acquisition`、`aim_general_story`
- 发作品：`aim_text_polish`、`aim_forbidden_word_audit`、`aim_wechat_layout`、`aim_xiaohongshu_edit`、`aim_full_publish_review`、`aim_publish_decision`
- 看结果：`aim_single_content_retro`、`aim_find_pattern_and_actions`
- 不点具体技能、只选一个智能体开工：`aim_start`，`agent` 用上面那些智能体 id，`material` 贴正文或素材

调用示例：

```json
{
  "name": "aim_text_polish",
  "arguments": { "material": "这里贴上要改的成稿正文" }
}
```

工具会直接返回草稿正文。返回里写着「还没发布」。不要再轮询另一条调用队列。

下面这些工具会明确拒绝，不会假装成功：

- `aim_publish`：自动发布
- `aim_feishu_write`：写入飞书
- `aim_knowledge_edit`：修改知识库
- `aim_ip_plan_edit`：修改 IP 营销全案

搜对标、批量文案工作室、数字人视频要在网页里打开面板，MCP 会说明做不了，不会编一个结果。

没有绑定项目、素材或成稿是空的、或跑完没有正文，都算失败，不能当成做完了。

## 使用建议

外部 Agent 应该先 `tools/list`，再按网页上的动作调用。生成结果只作为草稿，发布前需要人工确认。
