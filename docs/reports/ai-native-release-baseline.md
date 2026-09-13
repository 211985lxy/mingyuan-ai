# AIM AI 原生发布基线（WP-0，2026-09-13）

> 本文件是 9 月 13 日升级计划 WP-0 的验收记录。它只记录 Git / 工作目录 / 候选版本事实，不宣称生产放量完成。

## 唯一候选版本

- GitHub `main` / 本地 `main` / P0 分支起点：`1b12bfb84dfa2da4950cab28a119d0f9030e21dc`（Merge PR #56）
- `pnpm release:context`：`candidate=main`，workingTree 当时为 clean
- 生产 `releaseSha` 未在 WP-0 回读

## 当前工作目录（2/3）

1. 生产主目录 `mingyuan/` → `main` @ `1b12bfb8`
2. P0 `.worktrees/ai-native-p0` → `codex/ai-native-p0-release-evidence`

## 归档（已推 origin）

- `archive/feat/aim-incremental-a-series-20260913` = `1e06195b`
- `archive/wp0-digital-human-plan-doc-20260913` = `c9ecc802`
- `archive/codex/aim-normal-conversation-20260913` = `d6501f5f`
- `archive/feat/wp-a2-a6-batch1-uncommitted-20260913` = `46b993a8`
- `archive/feat/restore-digital-human-pipeline-uncommitted-20260913` = `fe0a2f2e`

stash 14 条未删。husky 并发改动已在主干 `22695699`。
