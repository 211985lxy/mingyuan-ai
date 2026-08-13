# AIM Content Recovery UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 自动恢复语义理解格式异常，并将内容、核验提醒和失败状态清晰分层。

**Architecture:** 在语义理解边界内做一次定向协议修复，避免扩大正文生成重试；在统一错误映射层屏蔽内部错误；在消息组件中用独立失败状态替代正文渲染。安全提醒继续使用已有 METHOD_NOTE 标记提取机制。

**Tech Stack:** Next.js 16、React 19、TypeScript、Vitest、Tailwind CSS

## Global Constraints

- 不新增数据库字段或依赖。
- 不改变 AIM 四步工作流和正常交付协议。
- 原始错误继续写入 trace，终端用户不看到内部术语。
- 所有行为变更先写失败测试，再写最小实现。

---

### Task 1: 语义协议自动恢复

**Files:**
- Modify: `apps/web/src/lib/aim/semantic-task-understanding.ts`
- Test: `apps/web/__tests__/unit/aim-semantic-task-understanding.test.ts`

**Interfaces:**
- Consumes: `CompletePort(systemPrompt, userPrompt)`
- Produces: `understandAimContentTurn()` 在首次解析失败后进行一次协议修复并返回 `AimSemanticTaskUnderstanding`

- [ ] 写测试：首次返回无协议文本、第二次返回有效协议时调用两次并成功。
- [ ] 运行 `pnpm --filter @mingyuan/web test --run __tests__/unit/aim-semantic-task-understanding.test.ts`，确认新增用例失败。
- [ ] 增加一次定向修复请求，修复提示只允许整理协议，不改变用户意图。
- [ ] 重跑定向测试，确认通过。

### Task 2: 屏蔽内部中文错误

**Files:**
- Modify: `apps/web/src/lib/aim-error-message.ts`
- Test: `apps/web/__tests__/unit/aim-error-message.test.ts`

**Interfaces:**
- Consumes: 任意 `unknown` 错误和友好兜底文案
- Produces: `mapAimErrorToUserMessage()` 对内部错误返回用户可理解的恢复说明

- [ ] 写测试：`语义理解协议不完整` 和 `语义理解包含业务动作标签` 不得原样透传。
- [ ] 运行定向测试并确认新增用例失败。
- [ ] 添加内部错误识别和统一用户文案。
- [ ] 重跑定向测试，确认通过。

### Task 3: 失败状态与核验提醒分层

**Files:**
- Modify: `apps/web/src/components/aim/aim-message-stream.tsx`
- Modify: `apps/web/src/components/aim/aim-deliverable-bubble.tsx`
- Test: `apps/web/__tests__/unit/aim-message-stream.test.ts`
- Test: `apps/web/__tests__/unit/aim-deliverable-bubble.test.tsx`

**Interfaces:**
- Consumes: `AimWorkbenchMessage.failure`、METHOD_NOTE 中的 `SAFETY_WARNING_MARKER`
- Produces: 独立失败卡和独立核验提醒

- [ ] 写测试：失败消息显示“这次没有完成”“当前内容已保留”“再试一次”，且不显示内部错误。
- [ ] 写测试：安全提醒明确“不会复制进正文”。
- [ ] 运行两个定向测试并确认新增断言失败。
- [ ] 实现最小展示调整。
- [ ] 重跑两个定向测试，确认通过。

### Task 4: 综合验证

**Files:**
- Verify only

**Interfaces:**
- Consumes: Tasks 1-3 的实现
- Produces: 可合并的验证结果

- [ ] 运行四个相关单元测试文件。
- [ ] 运行 `pnpm --filter @mingyuan/web typecheck`。
- [ ] 运行 `pnpm --filter @mingyuan/web arch:check` 和 `pnpm --filter @mingyuan/web arch:size`。
- [ ] 检查 `git diff --check` 与最终差异，确认未包含主工作区用户文件。

