# A 系列增量工作包设计记录（2026-09-12）

> 依据《明动AIM-竞品借鉴增量升级计划-2026-09-12.md》。分支 `feat/aim-incremental-a-series`（基于 main 0294fede，与 Cursor 在途的 `feat/wp11-outcome-autofetch` 完全隔离）。

## 已实现

| WP | 交付物 | 关键文件 |
|---|---|---|
| A2 V1 自动化台账（只读） | 静态注册表 + 未关闭告警/后台任务执行记录 → 健康态；admin 页面 + API | `src/lib/aim/automation-ledger.ts`、`src/app/api/admin/automation-ledger/route.ts`、`src/app/admin/automation-ledger/page.tsx`、`__tests__/unit/automation-ledger.test.ts` |
| A6 L0 数据主权 | 项目数据一键导出（json/markdown，限 2000 条/类）+ 「你的数据」承诺页 + account 页入口 | `src/lib/aim/data-export.ts`、`src/app/api/aim/data-export/route.ts`、`src/app/(dashboard)/account/data-ownership/page.tsx`、`__tests__/unit/data-export.test.ts` |
| A5 第一步 检索基线 | hitRate@k / MRR / 关键词命中率评估模块 + 用例集 + 真实环境 CLI | `src/lib/aim/retrieval-eval.ts`、`scripts/aim-retrieval-baseline{,-cases.json}.ts/.json`、`__tests__/unit/retrieval-eval.test.ts` |
| A1 账号全量初始化（可移植 90%） | `AccountWorkAsset` 模型 + 幂等合并/逐字稿提取计划/历史摘要（sha256 打点） | `prisma/aim.prisma`、`prisma/migrations/20260912120000_*`、`src/lib/aim/account-work-assets.ts`、`__tests__/unit/account-work-assets.test.ts` |
| A3 预测 vs 实际（可移植 90%） | `PublishPrediction` 模型 + 基线预测/对账/系统性偏差检测 + 对账 cron + 学习候选（pending 人批） | `prisma/operating.prisma`、`prisma/migrations/20260912130000_*`、`src/lib/aim/publish-prediction.ts`、`src/app/api/cron/prediction-reconcile/route.ts`、`ops/systemd/mingyuan-cron-prediction-reconcile.{service,timer}`、vercel.json、`__tests__/unit/publish-prediction.test.ts` |

## 质量门自检结果

- vitest 新增 33 用例全绿；`tsc --noEmit` 全绿；eslint（--quiet）0 error
- `arch:size` functions>80 = 217 = 基线（净回归 0；长函数拆分至无新增）
- `api:contracts` ✓（296 路由，含新增 3 条）；`check-env-contract` ✓（无新增 env）
- `check-migration-integrity` ✓（103 migrations）；`arch:domains`/`arch:retired` ✓
- 注：`longfn:check`（基线 163 已过期）在 main 上即失败（190 vs 163），本分支同为 190，净回归 0——基线刷新是独立待办，不属本批

## WP-1.1 合入后的接线点（各 ≤10 行）

1. **A1 数据适配**：新建 `account-work-assets-prisma.ts`，绑定成功回调/后台任务里调 `dedupeAndMergeWorks` + upsert；逐字稿提取用 `planTranscriptExtraction` 输出驱动 `video-text-extractor`。
2. **A1 上下文注入**：`context-assembly.ts` 的 prepareAimContext 增加可选第五路 `accountHistory`（内容用 `buildAccountHistoryDigest().digest`，metadata 记 `accountHistoryHash`）。
3. **A3 发布触发**：`workflow-status.ts` published 态登记处调 `buildBaselinePrediction`（基线来自 AccountWorkAsset 近 90 天播放四分位）落 `PublishPrediction`。

## 放量验收（待生产，代码不代替）

- A2 V1：admin 台账页可回答"系统每天自动做哪几件事、健康态如何"
- A6 L0：一次真实导出演练归档（json + markdown 各一）
- A5：真实租户环境跑 baseline CLI，报告落 `docs/reports/`，作为图谱投入闸门对照点
- A1/A3：迁移在预发验证后进生产；A3 需连续 4 周预测-对账数据才算闭环运转

## 明确未做（按计划纪律）

- A4 评审侧栏：观察项，需 5 用户纸面原型验证后才立项
- DEC-1 隔离边界决策：批次 2 末用 WP-2.1 数据定
- 知识图谱 UI（关系图/观点地图）：等基线报告 + 注入 eval 达标后
- 生产部署：高风险区，需人工审批，本批不涉及
