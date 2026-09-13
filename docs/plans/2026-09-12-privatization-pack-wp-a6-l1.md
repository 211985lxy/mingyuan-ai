# WP-A6 L1 私有化部署包（文档，未改生产编排）

> 状态：文档完成，等客户合规信号再实装 · 日期：2026-09-12 · 分支：`feat/wp-a2-a6-batch1`
> 上游：《明动AIM-竞品借鉴增量升级计划-2026-09-12》WP-A6 L1
> 红线：本包**不改** `docker-compose.prod.yml`、`k8s/`、`ops/`。底子现成，只整理给人看的说明书。L2 单机个人版仍不收。

## 1. 包里有什么

现成底子：

- 单机编排：`docker-compose.prod.yml`（web + MySQL + Redis；视频抽取是可选 profile）。
- 部署脚本：`scripts/deploy-ecs-standalone.sh`（生产发布仍需审批，私有化演练用隔离环境）。
- 备份：`apps/web` 的 `backup:database` / `backup:verify`。
- 开箱探针：`GET /api/cron/integration-probe`（要 `CRON_SECRET`）。

说明书与模板：

- 环境变量模板：见 `apps/web/.env.example`，私有化最少还要配数据库、Redis、`CRON_SECRET`、飞书/抖音等渠道密钥。
- 探针清单：见下文。
- 学习回流约束：私有实例只同步脱敏方法论（`methodology_revision`），不回流客户原文。跨客户基准仍由 SaaS 主实例承担。

## 2. 开箱探针清单（必须全绿才算交包）

| 探针名 | 关键吗 | 人话 |
|---|---|---|
| ali-oss | 是 | 对象存储活着，素材不会 24 小时后丢 |
| tikhub | 是 | 对标/热榜数据源活着 |
| qingdou-video-extract | 是 | 逐字稿通道活着 |
| aliyun-nls | 是 | 语音识别活着 |
| redfox | 是 | 渠道采集活着 |
| llm-env-drift | 是 | 模型密钥没配错环境 |
| fish-audio | 是 | 配音通道活着 |
| feishu-bots | 是 | 飞书机器人凭证有效 |
| siliconflow-embedding | 否 | 向量检索；没配就标未配置，不算挂 |
| aliyun-sms | 否 | 短信；没配不算挂 |

另要确认：后台队列开关 `BACKGROUND_TASKS_ENABLED`、13 个 timer 在客户侧能自转、备份能恢复。

## 3. 不做

- 不改生产编排文件。
- 不把数据散落到个人电脑文件夹（那是 L2，已否决）。
- 没有真实客户合规合同/书面需求前，不在隔离环境之外开私有实例。

## 4. 验收

放量级：隔离环境完整跑通「部署 → 探针全绿 → 备份可恢复」。本包只把清单写清，演练等客户信号。
