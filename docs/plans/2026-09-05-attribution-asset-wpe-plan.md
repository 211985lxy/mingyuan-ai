# WP-E 实施计划：归因数据资产化（客户月报 v1 + 跨客户基准表 v0）

> 状态：2.1 客户月报 v1 与 2.2 跨客户基准表 v0 均已实现（2026-09-05，含单测） · 日期：2026-09-05
> 技术正本。目标/边界/验收见《明动AIM-经营归因闭环升级计划-2026-09-03》第五节 WP-E。
> 前置：WP-A/B（71c5abef）、WP-D（8d872c0c）已提交。

## 交付记录（2026-09-05）

- 月报 v1 已交付：`lib/aim/monthly-report.ts`（聚合：最成熟快照 30&gt;14&gt;7、空值≠0、dataNotes 数据缺口）+ `lib/aim/monthly-report-html.ts`（一页式）+ `api/aim/reports/monthly/route.ts`（`?month=YYYY-MM&projectId=&format=json|html`）。测试 `aim-monthly-report.test.ts` 10 例。
- 基准表 v0 已交付：`lib/aim/benchmark-table.ts`（客户×内容任务聚合；单客户发布 &lt;3 不进表；活跃客户 &lt;5 强制「仅内部参考，禁止对外」；dealCount 空值≠0）+ `api/admin/benchmark-table/route.ts`（`withAdminOrEditor`，`?days=` 默认 90）。测试 `aim-benchmark-table.test.ts` 4 例。
- 门闩：typecheck ✅（本工作包文件）· 单测 3115 全过 ✅ · arch:size 基线内 ✅。
- 收尾批次（同日）：周报面板新增「本月经营月报」入口（`weekly-business-review.tsx` 直链 `/api/aim/reports/monthly?projectId=`，新标签打开，当前月缺省）；benchmark-table lint 修复（空接口→类型别名、未用变量）；新增 `aim-weekly-review-entry.test.ts` 4 例。



## 一、勘察结论（2026-09-05）

- WP-D 已交付 `attribution-insights.ts`：按内容任务聚合「发布数 / 播放合计（周期末快照）/ 可追溯线索 / 来源不明线索」，纪律齐（空值≠0、<3 条不下结论、未标注单列）。**月报可直接复用**。
- `ContentOutcome` 三组字段（商业结果 / 内容信号 / 用户判断）+ `OutcomeAttribution`（explicit/first_touch/unknown）是月报数据真源。
- 周报出口已有（`api/aim/review/weekly`），但**无任何月度聚合、无对外客户报告、无跨客户基准表**（全库检索无 monthly report / cross-customer 聚合代码）。
- 渲染管线可复用 retro-report-html 的模板风格（纯函数 → HTML 字符串）。

## 二、改动面

### 2.1 客户月报 v1（对客户）

| 文件 | 改动 |
| --- | --- |
| `apps/web/src/lib/aim/monthly-report.ts` | `computeMonthlyOperatingReport`：月度窗口 [月初, 次月初)，聚合：发布数、三组商业结果合计（每条内容取窗口内最成熟快照 30>14>7，空值跳过并计 known 数）、线索归因（可追溯/来源不明）、按内容任务聚合（复用 `computeTaskAttributionInsights`）；输出 `dataNotes[]` 显式列数据缺口 |
| `apps/web/src/lib/aim/monthly-report-html.ts` | 一页式 HTML：总览卡（发布/线索/预约/成交/营收）+ 按内容任务表 + 数据缺口说明 + 页脚数据真源声明；全字段转义；缺数据显式「未回填」 |
| `apps/web/src/app/api/aim/reports/monthly/route.ts` | GET：auth → `projectId` + `month=YYYY-MM` → 计算 → `?format=json` 返回 JSON（内部调试）/ 默认 `text/html` |

**纪律**：营收为 Decimal→number 转换需显式；空值≠0（known=0 时合计为 null）；样本不足沿用 WP-D 文案；月报只呈现事实，不写结论段（四段式长文属周报叙事 WP，另行立项）。

### 2.2 跨客户基准表 v0（对内）

- `apps/web/src/lib/aim/benchmark-table.ts`：跨用户聚合「选题类型 × 内容任务 × 转化漏斗（线索率=可追溯线索/发布数、成交率=deal/发布数）」，仅 admin 鉴权路由 `api/admin/benchmark-table/route.ts` 输出 JSON。
- 纪律：活跃客户 <5 时每行强制带「样本不足，仅内部参考，禁止对外」标注；单客户不足 3 条发布不进表。

## 三、不做（边界）

- 不做月报自动定时发送（email/飞书推送）——先人工打开链接验证价值，推送通道 R3 再议。
- 不做基准表对外呈现页（对内 JSON → AI 经营会口头/飞书呈现）。
- 不自动生成客户可见结论文案（人审 100% 红线：报告是数据呈现层，不是承诺层）。
- 不碰平台总线代码；不回填存量数据。

## 四、验收对照

| 计划验收（归因计划 WP-E） | 本期落点 |
| --- | --- |
| 试点客户 100% 收到自动月报 | 月报 HTML 可生成、可分享链接；「自动送达」R3 再做 |
| 基准表进入每周 AI 经营会固定议程 | v0 admin JSON 聚合 + 样本不足强制标注 |
| 复用复盘报告渲染管线 | monthly-report-html 与 retro-report-html 同风格纯函数 |

## 五、测试

`monthly-report.test.ts`（窗口边界/最成熟快照选择/空值≠0/Decimal 转换/dataNotes）、`monthly-report-html.test.ts`（转义/缺数据文案）、`benchmark-table.test.ts`（小样本标注/不足3条不进表）。
