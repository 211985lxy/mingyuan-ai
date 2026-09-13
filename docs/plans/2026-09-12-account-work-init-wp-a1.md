# WP-A1 账号接入即全量初始化

> 状态：代码完成，放量待做 · 日期：2026-09-12 · 分支：`feat/wp-a2-a6-batch1`
> 上游：《明动AIM-竞品借鉴增量升级计划-2026-09-12》WP-A1
> 红线：历史作品不进 `ContentOutcome`；飞书 Base 仍是采集正本；Postgres 只做生成上下文投影。

## 1. 改了什么

- 新投影表 `AccountWorkAsset`：账号 + 作品 ID 幂等，存标题、发布时间、封面、互动快照、逐字稿。
- 抖音绑定成功后投递后台任务 `account_work_init`；存量账号由管理员 `POST /api/admin/account-work/backfill` 补一次。
- 逐字稿复用现成轻抖通道。只对「近 90 天或互动 Top 30」立刻抽，其余等上下文第一次碰到再懒提取。抽过的不重复抽。
- 生成上下文多了一路「账号真实发布历史」：`prepareAimContext` 拼进知识块，选题链带来源 `account_history`。run metadata 带 hash。
- 开关：`AIM_ACCOUNT_WORK_INIT_ENABLED`（默认开，设 `false` 关闭）。
- 本 worktree 没有 WP-1.1 的短链归一文件，列表同步走现成 `fetchDouyinRecentVideos`，避免再造一套短链模块。

## 2. 不做

- 不把历史作品写成 AIM 自己发的效果数据。
- 不改飞书 Base 写入正本。
- 不新建探针：轻抖通道已在 `qingdou-video-extract` 里。

## 3. 验收

- 单测：`account-work-asset`（90 天/Top30 才立刻抽稿、空库不编造成有历史、摘要带最佳/最差）。
- 放量级：真实账号绑定后 24 小时内投影表有全量作品；选题上下文看得见历史段；近 90 天逐字稿覆盖率 100%；重复提取 0。未上线前不能宣称业务完成。
