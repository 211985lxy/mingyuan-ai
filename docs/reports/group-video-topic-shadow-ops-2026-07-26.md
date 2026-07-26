# 群聊选题影子采集 — 生产就绪执行记录

日期：2026-07-26  
线上 SHA：`6eb912d`（含影子门禁 `c7fb23f`）  
范围：飞书主链影子采集；不升 live；不夹带网站/血缘。

## 已完成（运维）

### 1. 生产环境变量（`/etc/mingyuan/mingyuan.env`）

| 键 | 值 | 说明 |
|---|---|---|
| `INSPIRATION_PIPELINE_ENABLED` | `true` | 管道开启 |
| `INSPIRATION_PIPELINE_SHADOW_MODE` | `true` | 影子压制回群 |
| `INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE` | `capture_only` | 全局降档天花板 |
| `FEISHU_TOPIC_PIPELINE_ENABLED` | `true` | 飞书入口开 |
| `BACKGROUND_TASKS_ENABLED` | `true` | 后台任务开 |
| `WORKBUDDY_WECHAT_ENABLED` | `false` | 不阻塞飞书 |
| `WECOM_INSPIRATION_ENABLED` | `false` | 不阻塞飞书 |
| `VIDEO_EXTRACT_FALLBACK_ENABLED` | `false` | fallback 未部署，保持关 |

服务已重启；healthz `ok=true`，`feishuReady=true`。

### 2. ChannelBinding

- 1 条 active 飞书绑定：`cb_835c67770805221236da4439` → chat `oc_9d76e75034137e0…`
- 项目：明动远见｜相宇个人 IP（`cmqn850o…`）
- **原 executionMode=`live` → 已降为 `capture_only`**

### 3. DB / Schema（只读）

- `Inspiration` 列齐全：`executionModeSnapshot` / `replyStatus` / `topicSelectionId` / …
- 历史 1 条 feishu=`live` → **不计影子**（符合门禁）
- 当前影子计数：**0/30**（`remainingToGate=30`）

### 4. 视频提取

- 主路径：应用内提取；fallback 未部署属预期
- Provider 失败降级：待真实样本验证

### 5. 代码上线

- `shadowSamples` 已随 `c7fb23f` 进入 `6eb912d` 生产包
- 管理员接口：`GET /api/admin/channel-metrics?platform=feishu&days=30`

## 下一步（需人工投喂）

1. 在绑定飞书群发视频/链接（可带「收选题」或 @机器人）。
2. 群内不应有正式回执。
3. 查 `shadowSamples.total` 应递增；违规计数保持 0。
4. 满 30 条且连续 5 工作日无 P0/P1 后再谈 evaluate/live。

## 回滚

停入口：`FEISHU_TOPIC_PIPELINE_ENABLED=false`  
升 live（仅验收后）：关 SHADOW、OVERRIDE=live，并把 binding 改回 live。
