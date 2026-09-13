# WP-3.4 悬置分支决策 + 月度模型档位

> 状态：决策已写 · 日期：2026-09-12
> 上游：批次 3 / WP-3.4
> 红线：数字人分支禁止直接 merge 进 main；月度档位脚本不改路由表。

## 数字人分支决定

**决定：暂缓 merge，按「精选重放」收编；远端分支先保留，不删除。**

依据（已有交付计划 `2026-09-12-aim-digital-human-chanjing-delivery-plan.md`）：

- `feat/digital-human-chanjing-integration` 与 `codex/aim-digital-human-implementation` 相对 main 分叉点落后约 300 个提交。
- 分支为恢复数字人域掏空了退休域门禁（`check-retired-capabilities.mjs`）。直接 merge 会把 main 护栏一起回退。
- 蝉镜接口本身已验收过；缺的是凭证、产品路由流、以及和 main 的精选重放。

落地排期：批次 4 的 4.2 观察项。启动条件仍是批次 3 收口 + 有真实客户信号。在此之前这两条分支不算「悬挂无主」，算「已归档待精选」。

## 动态模型路由

- 新增纯函数 `recommendMonthlyModelTiers` + 脚本 `scripts/recommend-monthly-model-tiers.ts`。
- 只打印建议：保持 / 降档 / 人工复核。不写表、不做实时调度。

## 不做

- 不删远端分支。
- 不把数字人代码合进本分支。
- 不开批次 4。
