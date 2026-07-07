---
name: mingdong-aim-agent-skill
description: Call Mingdong AIM agents to generate draft-only IP content assets for authorized projects. Use this when an external agent needs business diagnosis, IP positioning, video scripts, social posts, articles, community messages, or shooting briefs from Mingdong AIM.
---

# 明动 AIM Agent Skill

明动 AIM 是一个面向 IP 内容增长的草稿生成能力。外部 Agent 可以读取本文档，使用授权的 API Key 调用 AIM 智能体，为指定 IP 营销全案生成内容草稿。所有接口使用当前 `skill.md` 所在站点作为同源地址。

## 能力边界

当前版本只允许生成草稿：

- 商业诊断官：诊断商业模式、流量转化、交付结构与核心矛盾
- 定位策划官：处理 IP 定位、内容定位、人设表达与成交路径
- 内容生产官：生成视频脚本、朋友圈、社群文案、公众号文章、拍摄交接单
- 数据复盘官：对已发布或待发布内容做数据复盘、优化和复用建议

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

API Key 由明动 AIM 后台创建。每个 Key 会绑定可访问的 IP 营销全案、可调用的智能体和每日调用上限。

## 接口

### 查看能力

```http
GET /api/agent/v1/capabilities
```

返回当前可调用的智能体、支持的输出格式和能力边界。

### 查看可访问项目

```http
GET /api/agent/v1/projects
```

返回当前 API Key 可访问的 IP 营销全案列表。外部 Agent 生成内容时必须显式传入其中一个 `projectId`。

### 生成内容草稿

```http
POST /api/agent/v1/aim/generate
Content-Type: application/json
Authorization: Bearer maim_xxx

{
  "agentId": "content_producer",
  "projectId": "project_id",
  "rawInput": "把这个选题生成视频脚本、朋友圈和拍摄交接单。",
  "targetFormats": ["video_script", "moments_post", "shooting_brief"],
  "instruction": "语气更像老板本人，少用营销黑话。",
  "topicTitle": "老板为什么要搭自己的 AI 内容系统",
  "topicRationale": "适合教育企业客户理解 AI 员工的价值"
}
```

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

## 使用建议

外部 Agent 应该先读取能力和项目列表，再生成草稿。生成结果只作为草稿，发布前需要人工确认。
