# WP-1.2 Prompt 主创作链迁注册表

> 状态：代码完成 · 日期：2026-09-12 · 分支：`feat/wp11-outcome-autofetch`（与 WP-1.1 同分支，尚未拆 PR）
> 上游：《明动AIM-AI原生分批升级计划-2026-09-12》批次 1 / WP-1.2
> 红线：迁移只换调用方式，正文必须与迁移前逐字节一致；DB 不可用时回落 seed，不阻塞出稿。

## 1. 改了什么

主创作链还硬编码在 handler 里的系统提示词，收进 prompt 注册表（批 4，共 17 个新 key，全表 58 个）。

迁入的路径：

- 自由撰稿人 chat / generate
- 生意系统体检 chat / generate
- 定位策划官 chat / generate
- 内容创作官 chat
- 分层生成骨架 `composeLayeredAimPrompt`（内容创作官 generate 走这里）
- 内容创作官 generate 的 user 骨架
- 统一生成路径 system / user
- 脚本生成 meta-prompt（静态契约 + `{topicConstraints}` 插槽）、direct、方向落地 user

调用点改成 `promptRegistry.get(key)` + `fillPromptTemplate`。动态块（知识库、任务单、轻改边界、选题节拍）仍在调用点组装。

## 2. 不做

- 不改提示词正文，不做「趁机优化」。
- 不迁 `FORMAT_INSTRUCTIONS`、闭集事实快路径、小红书视觉导演、脚本生成里「顶级口播创作者 / 评分专家」那两段静态 system（下一刀再收）。
- 本次不跑真实模型 eval（aim-eval-daily）；确定性 snapshot 已锁字节。
- 不提交、不发 PR（等你说）。

## 3. 验收（代码层）

- 快照：`prompt-batch3-snapshot.test.ts`（handler）+ `prompt-batch3-builders-snapshot.test.ts`（builder），迁移前后逐字节比对。
- 相关单测：prompt-registry / seeds-probe / free-copywriter / unified / content-production / prompt-contract / batch1+batch2 快照。
- `pnpm --filter web typecheck`、`arch:size` 通过（`aim-generation-prompts.ts` 从 515 行收到 486 行左右）。
- 放量级：注册表覆盖率、确定性 eval 100%、真实模型 rubric 均分下降不超过 2 分，要等合入后的 eval 日跑另记。

## 4. 回滚

seed / 调用点都在 git 里。出问题把 handler 改回字面量，或把 DB 里对应 key 的 active 版本回落 draft，运行时会用 seed v1。
