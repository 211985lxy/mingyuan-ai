# 候选版本收敛审查（2026-07-17）

## 结论

**生产发布：NO-GO。**

代码候选已经收敛到唯一分支 `chore/release-convergence`，本地工程门禁、隔离数据库 E2E 和私有远程备份全部通过；但生产发布仍被破坏性数据库迁移未获业务批准、生产备份/恢复未演练、目标环境迁移状态未验证三项阻断。

## 本次范围

- 集成基线：`feat/aim-dual-mode-ux` @ `52f9c7968261de3ca0872fdfdb22dec891207f47`
- 已验证实现：`e3db543038cb2a02fc8f013477a2f20db8c7ae34`
- 目标分支：`main`
- 相对 `main`：251 commits，886 个文件发生变化
- 本次新增：知识分类契约修复、智能导入实体抽取、知识分类单一事实源、文档归位、唯一候选分支治理

原工作区 `/Users/xiangyu/Desktop/明动aim智能体/mingyuan` 未被切分支或清理；收敛工作全部在独立 worktree 完成。

## 来源分支处理结果

| 来源改动 | 结论 | 理由 |
|---|---|---|
| Obsidian 同步支持 12 类知识 | 移植并补契约测试 | 原提交只改路由，本次同时修复 Zod 入口，否则 7 类仍会被拒绝 |
| 智能导入后实体抽取 | 移植并补路由测试 | 与知识资产沉淀闭环一致 |
| 分类单一事实源 | 改写后移植 | 保留新版路由鉴权和 feature 拆分，避免旧页面覆盖新版架构 |
| docs 文件归位 | 改写后移植 | 删除了过期的 743 行执行计划，并更新导航引用 |
| KnowledgeEntry 类型统一 | 暂缓 | 新版已形成 feature 类型边界，旧实现会反向依赖兼容 API barrel |
| 检索 365 天默认截断 | 拒绝本次移植 | 会改变长期/常青知识召回，缺少真实评估集证据 |
| 六列组合索引 | 拒绝本次移植 | 缺少正式 migration、生产数据规模和查询计划证据 |
| 周巡检脚本 | 拒绝本次移植 | 无调度入口、输出路径错误、统计有截断，不能假装形成运营能力 |
| 全局 ESLint 分类守卫 | 改写后移植 | 原规则会误伤 AI HOT；本次只约束知识域 |
| Z-Code 分支治理三文件 | 改写后移植 | 保留唯一候选目标；删除过期静态统计、危险 reset 流程和第二份 Agents 正本 |

## 门禁证据

执行 `pnpm release:verify --allow-missing-services`：

| 门禁 | 结果 |
|---|---|
| 冻结依赖安装 | 通过 |
| Prisma validate / generate | 通过 |
| 环境变量契约 | 通过（117 项） |
| API 契约清单 | 通过（152 routes） |
| 依赖安全审计 | 通过；0 critical，1 个已批准的 high 例外，截止 2026-08-31 |
| 应用与测试类型检查 | 通过 |
| ESLint | 通过 |
| 文件体积 / AIM 架构 / 领域边界 / 退役能力 / Prisma 查询边界 | 通过 |
| 全量单测与评估测试 | 190 files / 1125 tests 通过 |
| Deterministic Harness | 4 files / 112 tests 通过 |
| Next.js 生产构建 | 通过；存在 1 个 NFT tracing warning，来源为 Obsidian 导出路由 |
| 隔离数据库 migration + E2E | 通过；MySQL 8.4 / Redis 7，44 个 migration 状态对齐，3 个待执行 migration 成功应用，19 files / 170 tests 通过 |
| 目标环境 Migration status | **未执行：缺少目标数据库连接** |

## 风险块

### Critical：破坏性视频退役迁移未演练

`20260714120000_retire_video_generation` 会删除 8 张表、删除全部 voice 类型 Asset、删除 Asset 6 列、ContentTemplate 4 列和 User 1 列。该迁移不可自动回滚。

- 缓解：生产快照与可恢复备份、执行退役数据预检、在 staging 从生产脱敏快照演练、业务负责人确认视频/数字人/语音数据可放弃或已迁出。
- 责任人：业务负责人 + 数据库/部署负责人。
- 截止：生产部署前，未完成不得放行。

### High：目标数据库证据缺失

隔离数据库已完成 migration 重放、schema contract 和 170 个 E2E 测试，但尚未对生产或 staging 快照执行 retired-media preflight、备份恢复和 `prisma migrate status`，不能据此推断生产数据可安全删除。

- 缓解：在生产脱敏快照上完成预检与恢复演练，再读取目标环境 migration status 和 schema verify。
- 责任人：部署负责人。

### 已解除：无远程备份

已创建私有正本仓库 `https://github.com/211985lxy/mingyuan-ai.git`，绑定为 `origin`，并推送 `chore/release-convergence` 与 `main`。远程回读确认候选 SHA 一致，默认分支为 `chore/release-convergence`。

- 后续：正式发布合入 `main` 后，把 GitHub 默认分支切回 `main`。

### High：真实 AI 与飞书链路未验收

Deterministic Harness 通过不等于真实模型质量达标；飞书经营事项接口通过单测不等于真实 Base 字段、权限和写回闭环已打通。

- 缓解：真实模型 daily eval 达标；用一条测试经营事项完成待处理→处理中→待人工审核→已完成/失败，并回读 Base 结果。
- 责任人：业务负责人 + AIM/飞书集成负责人。

### Medium：Obsidian 导出构建追踪告警

生产构建成功，但 `/api/knowledge/export-obsidian` 的动态文件系统路径触发 Turbopack NFT 全项目追踪告警，可能增加部署产物体积。

- 缓解：发布阻断项解决后单独定位路径范围，不在本次收敛中顺手重构。

## Migration Notes

相对 `main` 新增 7 个 migration，其中 6 个为功能/治理变更，1 个为破坏性退役。执行顺序必须按 migration 目录顺序，不允许跳过破坏性迁移后假装 schema 已一致。

发布前必须保存：备份标识、迁移前 schema 状态、预检报告、迁移日志、迁移后 `migrate status` 与 `schema:verify` 结果。破坏性迁移的恢复方式只能是恢复备份或回到兼容旧 schema 的环境，不能依赖 down migration。

## Rollout Plan

1. **已完成**：配置并验证私有远程备份，固定候选分支。
2. 用生产脱敏快照建立 staging，运行 retired-media preflight、完整 migration 和 schema verify。
3. 执行真实模型 daily eval、飞书单记录端到端联调。
4. 先部署内部账号/小项目 canary，观察生成成功率、模型降级、飞书写回、错误恢复和数据完整性。
5. 业务负责人明确批准视频退役后，按固定 SHA 部署生产；健康检查和十条客户旅程冒烟通过后再扩大流量。

## Rollback Plan

- 应用问题：部署上一已验证 SHA。
- 尚未执行破坏性迁移：停止部署并保留候选分支。
- 已执行破坏性迁移：停止写入，恢复已验证数据库备份，再部署与备份 schema 兼容的上一 SHA。
- 禁止在共享仓库使用 `git reset --hard` 作为发布回滚。

## Stakeholder Communication

当前可对团队表述为：“候选代码已完成工程验收和私有远程备份，尚未获准生产发布。剩余工作不是继续写功能，而是破坏性迁移演练、真实模型和飞书链路验收。”

任何人不得把“计划完成”“单测通过”或“Z-Code 已提交”表述为“已进入 main”“已部署”或“业务闭环完成”。
