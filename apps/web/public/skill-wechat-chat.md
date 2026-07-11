---
name: mingdong-wechat-chat-skill
description: Import WeChat or WeCom chat exports into Mingdong AIM as reviewed knowledge entries for an authorized project. Use this when an external agent needs to turn chat logs into tagged business knowledge instead of generating copy.
---

# 明动 AIM 微信聊天导入 Skill

这个 Skill 用于把微信/企微聊天导出文本转成明动 AIM 知识库条目。它适合整理客户聊天、成交问答、痛点反馈、项目讨论，不适合用来生成文案。

所有接口使用当前 `skill-wechat-chat.md` 所在站点作为同源地址。

## 能力边界

当前版本允许：

- 读取微信/企微聊天导出文本
- 预览 AIM 自动提取的标题、要点、分类、标签、价值分级
- 人工筛选后确认写入指定项目知识库

当前版本明确不允许：

- 自动发布内容
- 自动修改已存在知识条目
- 写入未授权项目
- 跳过确认直接大批量入库
- 执行任意 shell、webhook 或外部自动化动作

## 鉴权

所有接口都需要使用 Agent API Key：

```http
Authorization: Bearer maim_xxx
```

## 接口

### 预览导入结果

```http
POST /api/agent/v1/knowledge/wechat-chat/import
Content-Type: application/json
Authorization: Bearer maim_xxx

{
  "projectId": "project_id",
  "rawText": "2026-07-09 10:00 张三: 客户现在最担心的是交付效果..."
}
```

返回结构：

```json
{
  "projectId": "project_id",
  "processed": [
    {
      "index": 0,
      "detectedSource": "wechat_chat",
      "suggestedTitle": "客户最担心交付效果",
      "suggestedKeyPoints": "客户反馈签约前最关注交付结果和兑现方式。",
      "suggestedCategory": "customer_pain",
      "suggestedTags": ["kb_scope:project", "asset_role:pain", "usable_for:sales"],
      "suggestedValueGrade": "A",
      "confidence": "high"
    }
  ],
  "warnings": ["preview_only", "knowledge_mutation_requires_confirm"]
}
```

### 确认写入知识库

确认接口只会创建新条目。调用前必须取得人工对预览条目的明确确认；单次最多确认 50 条，不能用于更新或删除既有知识。

```http
POST /api/agent/v1/knowledge/wechat-chat/confirm
Content-Type: application/json
Authorization: Bearer maim_xxx

{
  "projectId": "project_id",
  "entries": [
    {
      "title": "客户最担心交付效果",
      "content": "客户反馈签约前最关注交付结果和兑现方式。",
      "category": "customer_pain",
      "tags": ["kb_scope:project", "asset_role:pain", "usable_for:sales"],
      "valueGrade": "A"
    }
  ]
}
```

## 使用建议

先走预览，再人工删掉闲聊、寒暄、无价值内容，最后调用确认接口写库。这个 Skill 的目标是沉淀可复用知识，不是替你判断所有内容都该入库。
