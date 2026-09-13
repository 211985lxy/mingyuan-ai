# WP-2.1 统一指标层

> 状态：代码完成 · 日期：2026-09-12 · 分支：`feat/wp11-outcome-autofetch`（尚未拆 PR）
> 上游：《明动AIM-AI原生分批升级计划-2026-09-12》批次 2 / WP-2.1
> 红线：只统一读，不写飞书、不改 ContentOutcome / OutcomeAttribution 正本；null 不当 0；金额不编造。

## 1. 改了什么

- 新建 `metric-layer.ts`：六个主指标口径写在文件头。周报公式从这里出，`weekly-review.ts` 只做兼容出口。
- 周报 API 仍返回旧字段 `review`（ContentOutcome 快照差，看板不用改），另外加 `metricLayer`：线索/预约/成交读归因表；金额仍来自 ContentOutcome.revenue。
- 月报带 `metricLayer` 来源说明。数据看板在飞书结果旁并行拉最近 7 天账本，飞书仍是采集正本。

## 2. 不做

- 不改飞书 Base 写入。
- 不把 unknown 线索混进可追溯。
- 不宣称「连续 4 周零人工回填」——那是放量验收，要等 WP-1.1 生产回流跑起来。

## 3. 回滚

周报路由改回直接调 `computeWeeklyReview` 即可；指标层文件可留着不用。
