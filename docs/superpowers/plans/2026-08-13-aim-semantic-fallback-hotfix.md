# AIM Semantic Fallback Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** 明确创作指令在内部语义协议连续失败后仍可进入正文生成。

**Architecture:** 在 `semantic-task-understanding.ts` 的协议边界增加纯函数判定；仅在初次解析和修复解析均失败时，以当前用户原话构造 `deliver` 兜底。正常语义模型路径不变。

**Tech Stack:** TypeScript、Vitest、Next.js

## Global Constraints

- 不写老板姓名或行业特例。
- 不把分析问句、局部编辑全部判为生成。
- 不新增数据库字段、接口或依赖。
- 先验证失败测试，再实现最小修复。

### Task 1: 锁定线上回归

**Files:**
- Modify: `apps/web/__tests__/unit/aim-semantic-task-understanding.test.ts`
- Modify: `apps/web/src/lib/aim/semantic-task-understanding.ts`

- [ ] 新增罗老板原话、葛老板线上变体和分析问句三个测试。
- [ ] 运行定向测试，确认两个创作用例因第二次协议错误失败。
- [ ] 实现明确创作请求判定和协议软失败兜底。
- [ ] 重跑定向测试并确认通过。

### Task 2: 验证和发布

**Files:**
- Verify only

- [ ] 运行语义理解、统一执行、统一提示词和工作台命令回归测试。
- [ ] 运行 typecheck、harness、arch:check、arch:size。
- [ ] 提交、快进合并到 main、推送并从精确提交部署。
- [ ] 验证线上 release SHA、健康状态和执行接口鉴权。

