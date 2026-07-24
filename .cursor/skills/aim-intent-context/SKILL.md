---
name: aim-intent-context
description: >-
  修复明动 AIM 内容台「分析问句乱出整篇」「优化这段却扩成长稿」「追问没记忆」类问题。
  当用户提到文案结构、优化这段、没上下文、意图路由、交付物 stub、light_edit、chat 误走 generate 时使用。
---

# AIM 意图与成稿上下文

主战场：`mingyuan/apps/web`（不要在工作区根改产品代码）。

## 症状 → 检查清单

1. **分析问句却「单篇创作」**  
   - [`use-aim-turn-intent-gate.ts`](apps/web/src/features/aim/hooks/use-aim-turn-intent-gate.ts)：`action === "chat"` 必须 `sendText`，禁止 `generateWithInput`。  
   - [`aim-turn-intent.ts`](apps/web/src/lib/aim-turn-intent.ts)：`looksLikeCopyAnalysisQuestion`。

2. **「优化这段话」扩成全新长口播**  
   - 意图应为 `local_edit`（`looksLikePassagePolish`）。  
   - 覆盖：`改顺一点` / `写短一点` / `太啰嗦了` / 短指令 `帮我润色下`；`点评一下这篇` 走 chat。  
   - 运行时任务 `light_edit`；[`LIGHT_EDIT_OUTPUT_BOUNDARY`](apps/web/src/lib/aim-intent-boundaries.ts) + `buildUserPrompt` 的 `【待润色原文与要求】`。

3. **追问像没记忆**  
   - UI stub「交付物已生成」不等于模型可见正文。  
   - 必须走 [`formatAimMessageContentForModel`](apps/web/src/lib/aim/workbench-helpers.ts) 注入成稿；chat 意图挂 `editorContext`。  
   - 指代词见 [`aim-conversation-intent.ts`](apps/web/src/lib/aim-conversation-intent.ts) 的 `REFERENCE_WORDS`（含「这个文案」）。  
   - 压缩摘要保留 `【…正文】`：[`aim-context-compressor.ts`](apps/web/src/lib/aim-context-compressor.ts)。

## 验证

```bash
cd apps/web
npx vitest run __tests__/unit/aim-turn-intent.test.ts \
  __tests__/unit/aim-workbench-helpers.test.ts \
  __tests__/unit/aim-context-compressor.test.ts \
  __tests__/unit/aim-prompt-optimization.test.ts
```

上线：`bash scripts/deploy-ecs-standalone.sh`（健康检查走 ECS 内网 healthz，以 `releaseSha` 为准）。

## 相关治理

见仓库 `AGENTS.md` 第 8.1 节「AIM 意图与上下文」。
