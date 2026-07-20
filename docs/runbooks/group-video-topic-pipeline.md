# 群聊视频选题自动采集 Runbook

## 开源组件

- 飞书事件：[`@larksuiteoapi/node-sdk`](https://github.com/larksuite/node-sdk)
- 抖音解析：[`Johnserf-Seed/f2`](https://github.com/Johnserf-Seed/f2)
- 多平台下载：[`yt-dlp`](https://github.com/yt-dlp/yt-dlp)
- 语音转写：[`faster-whisper`](https://github.com/SYSTRAN/faster-whisper)

AIM 自有代码只负责项目权限、群绑定、幂等、后台任务、事务写库和出站回复。WorkBuddy 是闭源微信网关，AIM 不接触个人微信协议。

## 上线顺序

1. 执行 Prisma migration，确认 `Inspiration`、`ChannelBinding` 和 `VideoCopyExtraction` 新字段存在。
2. 开启 `BACKGROUND_TASKS_ENABLED=true`，保持所有平台入口关闭。
3. 设置 `INSPIRATION_PIPELINE_ENABLED=true`、`INSPIRATION_PIPELINE_SHADOW_MODE=true`。
4. 在账户设置绑定一个测试群和一个 active 项目。
5. 先开飞书，验证一条纯文本和一条抖音短链。
6. 部署可选 `video-extractor`，通过真实公开视频验证 10 分钟/200 MB 限制后再开 fallback。
7. 在专用常开设备安装 WorkBuddy Skill，只对白名单测试群启用。
8. WorkBuddy 连续三天无重复、无越权并能异步回原群后，关闭影子模式。
9. 企业微信仅在官方回调确实提供可绑定 `ChatId` 时启用；普通内部群能力未获官方支持时保持关闭。

## WorkBuddy 验收门槛

- 能取得外部群 ID、发送者、完整消息原文；消息 ID 可选。
- `POST /api/agent/v1/inspiration/events` 在三秒内返回 `202`。
- `duplicate=false` 时能立即发送接收确认；`shadowMode=true` 时不发群消息。
- 能周期调用 `/api/agent/v1/inspiration/replies/claim`，发送 `replyText` 后调用 ack。
- 发送失败使用 `sent=false` 回执，后续能重新领取。
- 设备或 WorkBuddy 重启后不会重复创建 `TopicSelection`。

任一项不通过时保持 `WORKBUDDY_WECHAT_ENABLED=false`，不得标记生产可用。

## 关键开关

```env
INSPIRATION_PIPELINE_ENABLED=true
INSPIRATION_PIPELINE_SHADOW_MODE=true
FEISHU_TOPIC_PIPELINE_ENABLED=false
WORKBUDDY_WECHAT_ENABLED=false
WECOM_INSPIRATION_ENABLED=false
VIDEO_EXTRACT_FALLBACK_ENABLED=false
```

回滚时关闭对应平台开关或总开关。已写入的 `Inspiration`、`KnowledgeEntry` 和 `TopicSelection` 不删除。

## 验收查询

- 事件状态：`GET /api/agent/v1/inspiration/events/{id}`
- 后台任务：检查 `BackgroundTask.status/attempt/lastError`
- 流水线：检查 `Inspiration.processingStage/errorMessage/replyStatus/replyErrorMessage`
- 目标：确认小于 3 秒，95% 五分钟内完成，同一外部消息只有一条正式选题。
