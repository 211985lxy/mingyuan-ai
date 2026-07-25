# AIM 上下文工程铁律清单（2026-07-25）

审计对象：`aim-agent-prompts.ts`（chat）与 `aim-generation-prompts.ts`（generate）。
分工：Always-on 铁律常驻；Progressive 按意图/格式注入；Verify 交给 GoalVerifier / METHOD_NOTE。

## Always-on（永远在场）

| 规则 | 位置 | 备注 |
|------|------|------|
| 身份 + 北极星 | chat / generate role | 短契约 |
| 分析/建议 → 不交付整篇 | chat 原则 #2 | 明确改写才成稿 |
| 事实边界：禁伪造案例、缺依据标「未提供」 | chat #3 / generate redlines | 不可砍 |
| 知识策略短规则 | `buildContentProducerKnowledgeRule` | 按 runtimeTask 分支，仍属 always-on |
| 选题优先级 / 会话优先级一句 | `AIM_SESSION_PRIORITY_RULES` | 用户选题 > 方法论结构 > 知识库 |
| 文风品味一句 | chat #4 / generate redlines | 像该 IP 真人说话 |
| 输出上限 | `AIM_OUTPUT_MAX_CHARS` | 总闸 |
| 方法论前言（有卡片时） | `METHODOLOGY_INJECTION_PREFACE` | 单源；无卡片则不注入正文 |

## Progressive（按需加载）

| 规则 | 触发 | 备注 |
|------|------|------|
| `PUBLISH_PACKAGE_CHAT_RULE` | 发布包关键词 / contentAction publish | chat 默认不注入 |
| `AIM_HIGH_RISK_LOOP_RULE` | generate 正式交付；chat 仅质检/点名验证 | 与规则文案对齐 |
| `CONTENT_PRODUCER_OPERATING_LOGIC_RULE` | 仅 generate | chat 改为一句短线 |
| `BENCHMARK_REWRITE_GUARDRAIL` | rewrite / 对标原文 | 非改写路径不注入 |
| 口播/公号等 `FORMAT_INSTRUCTIONS` | targetFormats | 已在 format 块 |
| 方法论卡片正文 | 已选卡 / 动态匹配 | 卡片继续短结构 |

## Delete / 下沉（品味句 + 后验）

| 原状 | 处理 |
|------|------|
| chat 17 条原则大量重复 | 压到 ~8 条语义 |
| chat/generate 各写一段方法论前言 | 抽 `METHODOLOGY_INJECTION_PREFACE` |
| 口播连环禁令堆在 system | 保留 3 条硬工艺；其余迁 GoalVerifier |
| 互斥「禁止注释式」叠床架屋 | 改品味句 + `verifyOralScriptCraft` |

相关实现：`.cursor/skills/aim-intent-context`；进度方案见 `docs/plans/aim-context-engineering-plan.md`（本文件是审计产物，不替代方案全文）。
