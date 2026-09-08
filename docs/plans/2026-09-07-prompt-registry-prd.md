# PRD：Prompt 一等资产化（主线 + 批0）

> 日期：2026-09-07 ｜ 状态：待评审 ｜ 范围：`apps/web`
> 上游：`2026-09-07-aim-maturity-five-step-upgrade-design.md` §0 / §①
> 本次只做第①步的**主线 + 批0**；批1（函数拼接型）、批2（API 内联型）不在本批。

---

## 1. 产品目标

把散落在 `apps/web/src/lib` 的 90+ 处硬编码 prompt，收编为**可版本化、可评估、可热更、可回滚**的一等资产：模板与版本入 DB，运行时按 `key + version` 加载，DB 不可用时自动降级到代码内 seed，**绝不阻塞线上出稿**。本次只解决「规则正本唯一化」与「变更可追溯、可评测、可回滚」。

**不解决**：批1/批2 迁移；AIM 核心文案域已有集中化（`aim-agent-prompts.ts`、`aim/unified-content-prompts.ts` **不动**，避免回归）；管理界面；模型路由调整；评测判分逻辑本身（复用 `eval-rubric.ts`）。

## 2. 用户故事

1. 作为 **AIM 系统负责人**，我希望每个 prompt 有唯一 `key+version` 正本，以便变更可审计、出问题可按版本回滚。
2. 作为 **AIM 系统负责人**，我希望 registry 加载失败自动走 seed，以便 DB 故障不影响客户出稿。
3. 作为 **内容增长负责人**，我希望改一条分析 prompt 无需发版，以便当天试新话术。
4. 作为 **内容增长负责人**，我希望 prompt 版本绑定评测集通过才能转 `qualified/active`，以便上线有效果依据。
5. 作为 **工程师**，我希望新增 prompt 只需 `registerSeed` + 按命名规范取 key，以便迁移模式可复制、可反转。

## 3. 需求池

| P | 需求 | 验收标准（可测） |
|---|---|---|
| P0 | 数据模型 `PromptTemplate` / `PromptVersion`，新建 `prisma/prompt.prisma`，迁移命名 `YYYYMMDDHHMMSS_add_prompt_registry` | 被 14 域自动合并识别；migrate 生成成功；`@@unique([templateKey, version])`；status 默认 `draft` |
| P0 | registry 运行时 `src/lib/prompt/registry.ts`：`load` / `get` / `getMessages` / `registerSeed` | 单测覆盖：选版优先级 `active > qualified > draft`；显式 `version` 优先于 status；DB 抛错时 `get` 返回 seed 值；`getMessages` 返回 `[{role:system},{role:user}]` 结构 |
| P0 | 批0 六文件迁移：`knowledge-entity-extractor.ts:53`、`marketing-analysis.ts:10`、`comment-radar/analyzer.ts:65`、`transcript-polish.ts:9`、`competitor-analysis/analyzer.ts:14`、`aim/meeting-insight-extract.ts:51` | 六文件无中文字面 prompt 残留（grep 校验）；调用改为 `registry.getMessages(key, user)`；既有单测全绿 |
| P0 | seed 兜底与降级 | 模拟 DB 不可用，6 个 key 仍可取到内容，出稿链路不抛错；降级 warn 日志有且仅一次 |
| P0 | key 命名规范 `<domain>.<capability>.<variant>`，与 `agent-router.ts` AGENT_ROUTES 同域 | 六个 key 全部合规；非法 key 抛错并有单测 |
| P0 | 迁移可反转 + 可回滚 | 提供 seed 逆向导出脚本（DB → 字符串）；每批打 tag；文档写明回滚步骤 |
| P1 | 评估挂接：`PromptVersion.fixtureKey` → `EvalFixtureVersion.fixtureKey` | 无 fixtureKey 时禁止升 `qualified`（校验函数 + 单测） |
| P1 | 热更：新版本置 active 后运行时生效 | 改 DB 内容后 `get` 返回新内容（缓存 TTL 或手动 reload 开关） |
| P1 | 可观测：prompt key+version 注入 LLM 调用日志 | `complete` 元数据含 key/version，单测断言 |
| P2 | 管理界面（列表 / 版本对比 / 一键回滚） | 不在本批 |
| P2 | 批1、批2 迁移 | 不在本批 |

## 4. UI 设计稿

**本次无前端 UI。** 交付物为纯底层能力：1 个 prisma 模型文件 + 1 个迁移 + 1 个 registry lib + 六文件迁移 + seed 脚本。管理界面、版本对比、可视化编辑均**不在本批范围**，下游请勿设计页面或路由。

## 5. 待确认问题（括号内为默认建议，不阻塞流程）

1. 缓存策略：每次请求查 DB 还是进程内缓存？（**默认：进程内缓存 + 5min TTL + 手动 reload 开关**，兼顾热更与性能）
2. seed 与 DB 关系：seed 是否作为初始化写入源？（**默认：启动幂等写一条 draft v1（仅当 DB 无此 key），seed 恒为只读兜底**）
3. 是否需要 prompt 变更审计？（**默认：本批不做审计表，靠 git + `createdAt` 追溯，留到管理界面批**）
4. 批0 六个 key 具体命名？（**默认：`knowledge.entity_extract.default`、`marketing.analysis.shortvideo`、`comment.insight.radar`、`marketing.analysis.transcript_polish`、`competitor.analysis.default`、`aim.meeting.insight_extract.default`**）
