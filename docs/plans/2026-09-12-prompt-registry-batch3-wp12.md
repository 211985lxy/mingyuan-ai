# WP-1.2 Prompt 主创作链迁注册表（含批 5）

> 状态：代码完成 · 日期：2026-09-13 · 分支：`feat/wp12-prompt-format-registry`
> 上游：《明动AIM-AI原生分批升级计划-2026-09-12》批次 1 / WP-1.2
> 红线：迁移只换调用方式，正文必须与迁移前逐字节一致；DB 不可用时回落 seed，不阻塞出稿。

## 1. 改了什么

主创作链系统提示词已在 PR #54 收进注册表（批 4，当时全表 58 个）。批 5 把上一刀明确留下的静态段也收进去，全表 69 个。

批 5 迁入：

- `FORMAT_INSTRUCTIONS` 七种格式（口播 / 公众号 / 朋友圈 / 社群 / 原始文案 / 拍摄交接单 / 小红书；koubo 复用口播）
- 小红书视觉导演（原 `buildXhsVisualDirectorInstruction` 无参静态正文）
- 脚本生成「顶级口播创作者」两条 system（带 meta-prompt / 直接出稿）
- 脚本评分专家 system
- 闭集事实快路径附加指令

调用点改成 `promptRegistry.get(key)`。快照 `prompt-batch5-snapshot.test.ts` 锁字节。

## 2. 不做

- 不改提示词正文，不做「趁机优化」。
- 动态块（知识库、任务单、轻改边界、选题节拍、`agentPrompt` 前缀）仍在调用点组装。
- 本次不跑真实模型 eval；不装生产 timer、不配 Sentry DSN。

## 3. 验收（代码层）

- 快照：批 3 builder/handler + 批 5 格式/脚本 system。
- `prompt-registry` / `seeds-probe` 计数 69。
- 相关单测：content-production / script-polish / no-hidden-defaults。
