---
name: mingdong-workbuddy-wechat-topic-capture
description: Receive an @助手 / 收选题 message from a WorkBuddy WeChat group, enqueue it in Mingdong AIM, then deliver the durable topic reply back to the same group.
---

# 明动 AIM WorkBuddy 微信群选题 Skill

WorkBuddy 负责微信协议和群消息收发，AIM 只负责统一事件、视频文案提取、选题生成和正式入库。抖音群不需要也不允许被 AIM 直接监听：把抖音分享链接转发到绑定的 WorkBuddy 群即可。

## 触发规则

只处理绑定白名单群中包含 `@助手` 或 `收选题` 的消息。必须把完整消息原文、群 ID、发送者 ID 和消息 ID（如果 WorkBuddy 能提供）一并提交；没有消息 ID 时由 AIM 用五分钟窗口幂等。

## 接收事件

```http
POST /api/agent/v1/inspiration/events
Authorization: Bearer maim_xxx
Content-Type: application/json

{
  "platform": "workbuddy_wechat",
  "externalMessageId": "optional-message-id",
  "externalChatId": "wechat-chat-id",
  "externalSenderId": "wechat-sender-id",
  "projectId": "aim-project-id",
  "content": "@助手 收选题 https://v.douyin.com/xxxx/",
  "occurredAt": "2026-07-20T12:00:00Z"
}
```

收到 `202` 且 `duplicate=false` 后立即在原群回复“已收录，正在提取视频文案并生成选题。”；`shadowMode=true` 时只记录，不发送任何群消息。

## 领取最终回复

WorkBuddy 每 10 至 30 秒轮询一次：

```http
POST /api/agent/v1/inspiration/replies/claim
Authorization: Bearer maim_xxx
Content-Type: application/json

{"platform":"workbuddy_wechat","limit":5}
```

对每个返回项，使用 `externalChatId` 发送 `replyText` 到原群。发送成功后确认：

```http
POST /api/agent/v1/inspiration/replies/{id}/ack
Authorization: Bearer maim_xxx
Content-Type: application/json

{"claimToken":"uuid","sent":true}
```

发送失败时用 `sent=false` 和可读的 `errorMessage` 确认，AIM 会把消息重新放回出站箱。不要把 `claimToken` 泄露到群里，也不要重复提交已经确认的 token。

## 能力门槛

只有在专用常开设备、测试微信号、白名单群和异步回群轮询连续验收通过后，才把 `WORKBUDDY_WECHAT_ENABLED=true`。WorkBuddy 无法稳定调用 HTTPS API 或异步回原群时，保持关闭并使用企业微信适配器。
