## Production readiness
- [x] 核对生产 DB 迁移 / 备份恢复方案（只读核对，不擅自迁生产库）
- [x] 配置正式环境变量与功能开关（影子默认）
- [x] 配置并验证至少 1 条飞书 `ChannelBinding`（已降档为 capture_only）
- [x] 验证视频提取服务可用性与降级（主路径可用；fallback 未部署保持关）

## Closed loop (shadow first)
- [ ] 跑通：群消息 → 视频识别 → 文案提取 → 选题生成（evaluate/capture_only）
- [x] 影子阶段配置：不写正式选题、不回群（env + binding = capture_only）
- [ ] 全链路幂等、可重试、项目隔离、错误可追踪（待真实样本）

## Acceptance evidence
- [ ] ≥30 条真实影子样本（见下定义；用 `executionModeSnapshot` ∈ capture_only|evaluate 计数）
- [ ] 连续 5 个工作日无 P0/P1
- [ ] 严重虚构 = 0；重复消息抑制率 100%
- [ ] 覆盖：长链/短链/无效链接/超长视频/Provider 失败与降级
- [ ] 飞书测试群正式运行 3 天（回执与结果正确）
- [x] 线上可回读发布版本、开关状态、健康状态（见 `docs/reports/group-video-topic-shadow-ops-2026-07-26.md`）

### 影子样本是什么
- 真实群消息触发管道后写入的 `Inspiration` 行。
- **仅**显式 `executionModeSnapshot` ∈ `capture_only` | `evaluate` 计入放量门槛；缺失或非法快照不计。
- 带 `topicSelectionId` 的影子行不计，记正式写入违规；`replyStatus` ≠ `suppressed` 不计，记外发违规。
- `live` 不算影子。手工 `source=text` 且无渠道痕迹的不算。
- 计数入口：`GET /api/admin/channel-metrics?platform=feishu&days=…` 的只读字段 `shadowSamples`（数据来自 Inspiration 表，非 Redis）。
- 代码：`lib/inspiration-shadow-samples.ts` + `lib/channel-metrics.ts` + 晋升门禁 `content-rollout-gate.ts`（满 30 条）。

## Channels
- [x] 飞书：入口与绑定已就位，等待真实影子投喂
- [x] WorkBuddy：保持关闭（不阻塞飞书主链）
- [x] 企微：保持关闭（不阻塞飞书主链）

## Explicit non-goals (this WP)
- [x] 不 merge 旧 backup 整包
- [x] 不开发内容血缘
- [x] 不并行合并无关产品功能
