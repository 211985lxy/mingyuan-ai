# Branch Cleanup — 分支清理操作手册

> 本文件是 Z-Code 或人工执行分支清理时的操作清单。
> 每一步都是机械操作，不需要主观判断。

---

## 当前状态（2026-07-17 审计）

- **main** 停留在 `ad20a8e`（v5.0 shipped 2026-04-05），之后无新 commit
- **17 个分支**均从 main 分出，无任何分支合并回 main
- **11 个 worktree** 分布在项目内外
- 所有分支 ahead of main，没有 behind（说明 main 从未前进）

## 合并操作（按顺序执行）

### 阶段 0：备份

```bash
# 在任何操作前，创建标签作为安全网
cd /Users/xiangyu/Desktop/明动aim智能体/mingyuan
git tag pre-merge-cleanup-20260717 main
```

### 阶段 1：确认"超集"分支

在合并前，需要确认 `chore/final-release-integration`（212 commits, 846 files）
和 `chore/wp19-retire-video-processing`（208 commits, 846 files）是否包含其他分支的全部 commit。

```bash
# 检查 final-release-integration 是否包含 hotfix 的 commit
git log --oneline hotfix/aim-intent-csrf | while read sha msg; do
  if git branch --contains "$sha" | grep -q "final-release-integration"; then
    echo "YES: $sha $msg"
  else
    echo "NO:  $sha $msg"
  fi
done | grep "NO:" | head -20
```

如果 `chore/final-release-integration` 包含了大部分其他分支的 commit，
则优先合并它，然后只处理它不包含的差异部分。

### 阶段 2：逐个合并（推荐顺序）

```bash
# 切到 main
git checkout main

# 合并安全修复（最优先）
git merge hotfix/aim-intent-csrf --no-edit
# 验证
pnpm build && pnpm lint && npx vitest run
# 更新 RELEASE-TRACKER.md

# 合并 auth 修复（可能与 hotfix 有冲突，需解决）
git merge fix/auth-feedback-history-previews --no-edit
pnpm build && pnpm lint && npx vitest run

# 合并知识库清理（独立，10 commits，低风险）
git merge refactor/knowledge-base-cleanup --no-edit
pnpm build && pnpm lint && npx vitest run

# 按编号顺序合并 wp 系列
git merge refactor/wp13-script-routes --no-edit && pnpm build && pnpm lint
git merge refactor/wp14-competitor-services --no-edit && pnpm build && pnpm lint
git merge refactor/wp15-topic-ui --no-edit && pnpm build && pnpm lint
git merge refactor/wp16-aim-ui --no-edit && pnpm build && pnpm lint
git merge refactor/wp17-topics-competitor --no-edit && pnpm build && pnpm lint
git merge refactor/wp18-admin-knowledge --no-edit && pnpm build && pnpm lint

# 最后合并大功能分支
git merge feat/aim-cognition-sprint1-2 --no-edit && pnpm build && pnpm lint && npx vitest run
git merge feat/aim-dual-mode-ux --no-edit && pnpm build && pnpm lint && npx vitest run
git merge feat/aim-model-capability-fallback --no-edit && pnpm build && pnpm lint && npx vitest run
git merge refactor/aim-cleanup-sprint --no-edit && pnpm build && pnpm lint && npx vitest run

# 处理超范围分支（需先确认范围）
# git merge chore/final-release-integration --no-edit
# git merge chore/wp19-retire-video-processing --no-edit
# git merge chore/repo-evolution-guardrails --no-edit
```

### 阶段 3：合并后清理

```bash
# 删除已合并的分支（本地）
git branch -d hotfix/aim-intent-csrf
git branch -d fix/auth-feedback-history-previews
# ... 依次删除

# 清理 worktree
git worktree list  # 列出所有 worktree
# 对已合并分支的 worktree：
git worktree remove /path/to/worktree
```

## 冲突处理规则

如果合并出现冲突：
1. **STOP** — 不要盲目解决冲突
2. 列出冲突文件
3. 如果冲突文件 ≤ 3 个，尝试自动解决（保留 incoming change）
4. 如果冲突文件 > 3 个，停止合并，记录状态，交给用户决策
5. 任何自动解决的冲突，合并后必须 `pnpm build` 验证

## 回滚方案

如果合并后出现严重问题：
```bash
git checkout main
git reset --hard pre-merge-cleanup-20260717  # 回到合并前的 main
```

---

## 定期维护（每周执行）

```bash
# 查看已合并但未删除的分支
git branch --merged main | grep -v '^\*\|main$'

# 查看超过 30 天无新 commit 的分支
for branch in $(git branch --list | sed 's/^[*+ ]*//' | grep -v '^main$'); do
  last_date=$(git log -1 --format="%cs" "$branch")
  age_days=$(( ($(date +%s) - $(date -j -f "%Y-%m-%d" "$last_date" +%s)) / 86400 ))
  if [ "$age_days" -gt 30 ]; then
    echo "STALE ($age_days days): $branch (last: $last_date)"
  fi
done
```
