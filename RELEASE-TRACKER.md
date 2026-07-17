# Release Tracker — 单一事实来源

> **最后更新**: 2026-07-17
> **规则**: Z-Code 每次会话开始前必须读本文件，确认当前分支对应的目标版本。
> **铁律**: 不在本文件中的分支 = 不允许继续开发。

---

## 🚨 关键发现（2026-07-17 审计）

**main 分支停留在 `ad20a8e`（2026-04-05 之后无新 commit）。所有 17 个分支均未合并回 main。**

这意味着：main 上 **没有** 任何 v5.0 之后的能力。所有开发工作都散落在分支中，生产环境没有获得任何新能力。

### 分支共享关系

多个分支共享大量相同 commit（从同一 base 分叉后各自推进），合并时需要解决重复 commit 问题。

---

## v5.1 (candidate) — 目标上线: 待定

| # | 分支 | 能力摘要 | Commits | 文件数 | 最后活跃 | Merged to main? | 生产部署? |
|---|------|---------|---------|--------|---------|----------------|----------|
| 1 | `hotfix/aim-intent-csrf` | 116 commits ahead. 安全修复：CSRF、注册 schema、session/tenant 边界、数据库迁移规范、测试分离 | 116 | 480 | 07-16 | ❌ | ❌ |
| 2 | `fix/auth-feedback-history-previews` | 与 #1 共享大量 commit，额外：auth 反馈和历史预览修复 | 116 | 543 | 07-14 | ❌ | ❌ |
| 3 | `chore/repo-evolution-guardrails` | 129 commits ahead. 包含 #1 全部 + 架构守卫、发布门禁 | 129 | 704 | 07-14 | ❌ | ❌ |
| 4 | `refactor/knowledge-base-cleanup` | **10 commits, 23 files** — 知识库类型统一、分类单一来源、健康检查脚本、检索性能优化 | 10 | 23 | 07-17 | ❌ | ❌ |
| 5 | `refactor/wp13-script-routes` | 脚本路由拆分 | 55 | 122 | 07-15 | ❌ | ❌ |
| 6 | `refactor/wp14-competitor-services` | 竞品服务拆分、opening prompt 提取 | 64 | 131 | 07-15 | ❌ | ❌ |
| 7 | `refactor/wp15-topic-ui` | 话题 UI 拆分、markdown 渲染 | 73 | 150 | 07-16 | ❌ | ❌ |
| 8 | `refactor/wp16-aim-ui` | AIM UI 拆分、workbench action controllers | 95 | 196 | 07-16 | ❌ | ❌ |
| 9 | `refactor/wp17-topics-competitor` | 话题竞品拆分、quality gate decisions | 111 | 215 | 07-16 | ❌ | ❌ |
| 10 | `refactor/wp18-admin-knowledge` | 知识库管理拆分、Obsidian sync route | 118 | 234 | 07-16 | ❌ | ❌ |

## v6.0 (planned) — AIM 认知升级 + 双模式

| # | 分支 | 能力摘要 | Commits | 文件数 | 最后活跃 | Merged to main? | 生产部署? |
|---|------|---------|---------|--------|---------|----------------|----------|
| 11 | `feat/aim-cognition-sprint1-2` | AIM 认知编排器 Sprint 1+2 + 竞品病毒视频整合 | 214 | 851 | 07-16 | ❌ | ❌ |
| 12 | `feat/aim-dual-mode-ux` | AIM 快速/项目双工作流 + TaskSpec + ContentOutcome | 244 | 874 | 07-17 | ❌ | ❌ |
| 13 | `feat/aim-model-capability-fallback` | 模型能力感知的 fallback 机制 | 243 | 879 | 07-17 | ❌ | ❌ |
| 14 | `refactor/aim-cleanup-sprint` | AIM 清理 sprint（含 lint 修复） | 241 | 877 | 07-17 | ❌ | ❌ |

## 超范围/合并候选 (needs decision)

| # | 分支 | 能力摘要 | Commits | 文件数 | 最后活跃 | 建议 |
|---|------|---------|---------|--------|---------|------|
| 15 | `chore/final-release-integration` | 212 commits, 846 files. 似乎是多个分支的合集？需确认是否已包含在其他分支中 | 212 | 846 | 07-16 | 🔍 需审计 |
| 16 | `chore/wp19-retire-video-processing` | 208 commits, 846 files. 退役视频处理功能 | 208 | 846 | 07-16 | 🔍 需确认范围 |

---

## 已发布版本

| 版本 | 发布日期 | main commit | 能力摘要 |
|------|---------|-------------|---------|
| v5.0 | 2026-04-05 | `ad20a8e` | 同行对标分析（Phase 13-16） |
| v4.0 | 2026-04-02 | — | IP 档案三维定位升级 |
| v3.0 | 2026-04-02 | — | 4K 视频增强 |
| v2.0 | 2026-03-26 | — | 官网 |
| v1.0 | 2026-03-25 | — | 智能素材匹配 |

---

## 合并策略建议

### 第一步：选择基础集成分支

`chore/repo-evolution-guardrails`（129 commits）和 `chore/final-release-integration`（212 commits）看起来可能是其他分支的"超集"。需要确认哪个分支包含最多的共享 commit，作为 main 的合并基础。

### 第二步：按依赖顺序合并

```
1. hotfix/aim-intent-csrf         ← 安全修复，最优先
2. fix/auth-feedback-history-previews ← 依赖 #1 的 commit
3. refactor/knowledge-base-cleanup ← 独立，10 commits，低风险
4. refactor/wp13-wp18 系列         ← 按编号顺序逐个合并
5. feat/aim-* 系列               ← 最后，依赖上面所有重构
```

### 第三步：每个分支合并后

- `pnpm build` ✅
- `pnpm lint` ✅
- `npx vitest run` ✅
- 更新本 Tracker 对应行 → `Merged: ✅`
