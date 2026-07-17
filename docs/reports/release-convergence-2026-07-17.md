# 候选版本收敛审查（2026-07-17）

## 结论

**生产发布：已部署，基础冒烟通过。**

代码候选已经收敛到唯一分支 `chore/release-convergence`。本地工程门禁、隔离数据库 E2E、真实模型质量门禁、私有远程备份、生产恢复演练、目标环境标准迁移、飞书经营事项真实闭环和应用部署均已通过。生产运行的应用候选为 `5ee25429fb187f26129d0a946f97981081fb4336`。

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
| 全量单测与评估测试 | 191 files / 1138 tests 通过 |
| Deterministic Harness | 4 files / 112 tests 通过 |
| Next.js 生产构建 | 通过；存在 1 个 NFT tracing warning，来源为 Obsidian 导出路由 |
| 隔离数据库 migration + E2E | 通过；MySQL 8.4 / Redis 7，45 个 migration 完整重放成功，19 files / 170 tests 通过 |
| 目标环境 Migration status | 通过；45 个 migration 全部记账，数据库 schema up to date |

## 风险块

### 已解除：视频、数字人与历史语音数据退役

`20260714120000_retire_video_generation` 会删除 8 张表、删除全部 voice 类型 Asset、删除 Asset 6 列、ContentTemplate 4 列和 User 1 列。该迁移不可自动回滚。

- 业务决策：2026-07-17，业务负责人李相宇明确确认退役视频生成、数字人和历史语音数据，不再保留这些业务数据与能力。
- 生产只读核对：8 张退役表已不存在，`Asset(assetType='voice')` 为 0，Asset 6 个退役字段和 ContentTemplate 4 个退役字段已不存在；仅 `User.authVideoUrl` 仍存在，且非空记录为 0。`20260714120000_retire_video_generation` 在 `_prisma_migrations` 中已完成、未回滚，校验值与候选仓库一致。
- 处理：不重放旧的破坏性迁移；新增可重放的前向修复迁移，只在字段存在时删除空的 `User.authVideoUrl`。生产执行前仍必须有可恢复备份与恢复演练记录。
- 备份与恢复证据：已创建 `mingyuan-2026-07-17T15-48-37-025Z.sql.gz`，SHA-256 为 `fcc23c20c8fc9448c71805742bfa66637270c8fe4ef105ccd0687e9e58e7aaca`；服务器原件与本机异地副本校验一致。已在与生产一致的 MariaDB 10.5 隔离数据库完成全量恢复，随后执行前向修复迁移，回读 `User.authVideoUrl` 字段数量为 0，演练库已删除。
- 生产修复结果：执行前 `User` 共 29 条，`authVideoUrl` 非空值为 0；执行可重放前向修复后，回读该字段数量为 0。2026-07-17 再通过标准 `prisma migrate deploy` 应用并记账 `20260717160000_finish_retired_auth_video_column`，迁移以安全空操作完成。
- 责任人：业务负责人 + 数据库/部署负责人。

### 已解除：目标数据库迁移状态

2026-07-17 使用短时、仅限 `mingyuan` 数据库的迁移账户，通过 SSH 隧道执行标准 `prisma migrate deploy`。生产正式应用并记账 `20260714120000_add_comment_radar_tables` 与 `20260717160000_finish_retired_auth_video_column`；随后 `prisma migrate status` 返回 45 个 migration、schema up to date。回读确认评论雷达三张表存在、`User.authVideoUrl` 不存在，临时迁移账户残留为 0。

### 已解除：无远程备份

已创建私有正本仓库 `https://github.com/211985lxy/mingyuan-ai.git`，绑定为 `origin`，并推送 `chore/release-convergence` 与 `main`。发布后通过严格快进把候选历史推进到 `main`，远程回读确认两条分支指向同一发布线，GitHub 默认分支已恢复为 `main`。

### 已解除：真实模型质量门禁

2026-07-17 首次真实模型 daily eval 完成 15 个场景×2 次：契约通过率 100%，原始 rubric 通过率 56.7%，均分 50.8。修正“信息不足时应拒绝编造”的评分口径并保留评分理由后，同规模复跑达到 90%、均分 82.3，但评分器尚未获得冻结上下文，导致唯一失败用例 `cp_imitate_xhs_09` 被误判为缺少资料。补全评分器上下文后，该用例定向复测 2 次均为 85 分、无事实编造、定向 daily gate 通过。

- 最终结果：在补充第一人称经历风险检测、生成后最多三次自动质检重试、信息缺口自然语言识别后，完整重跑 15 个场景×2 次。契约通过率 100%，rubric 通过率 100%，均分 84.3，无事实编造、无质量失败项。

### 已解除：飞书经营事项真实闭环

2026-07-16 已由飞书机器人身份经 AIM API 完成一条真实 Base 记录的状态闭环，并在「AIM经营事项」表回读确认为「已完成」。本轮不再重复测试飞书。

### 已解除：APIMart 备用模型接入

APIMart 已作为 OpenAI-compatible 备用供应商接入全部文本智能体，默认模型为官方文档明确支持的 `gpt-5`。本机国内网络直连会在 TLS 阶段被重置，因此新增可选 `APIMART_PROXY_URL`，仅作用于该 provider。经 `http://127.0.0.1:10808` 实测，AIM 成功获得 `gpt-5-2025-08-07` 响应和 token 用量；密钥仅保存在本机 `.env.local`，未进入 Git。

生产部署后的出口实测显示，阿里云服务器直连 APIMart 超时。2026-07-18 已在生产机安装官方 Xray `v26.3.27`，使用独立海外 VLESS 节点提供只监听 `127.0.0.1:10809` 的 HTTP 代理，并配置 `APIMART_PROXY_URL=http://127.0.0.1:10809`。订阅地址、节点 UUID 和 API 密钥均只保存在服务器受限配置中，未进入 Git。

代理上线后，生产真实请求返回 HTTP 200，实际模型为 `gpt-5-2025-08-07`，`finish_reason=stop`，输出长度 2、总计 83 tokens。`mingyuan-web` 已增加对 `xray.service` 的启动顺序依赖；两项服务均为 active，健康检查中的数据库和 Redis 均正常。曾尝试的 sing-box 因与该节点的 AI API TLS 链路不兼容，已停止、卸载并清除配置，避免维护两套代理。

### 已完成：固定 SHA 部署与基础冒烟

- GitHub 私有远程分支 `chore/release-convergence` 已回读到 `5ee25429fb187f26129d0a946f97981081fb4336`。
- 部署脚本再次通过 typecheck、115 项 Harness、架构门禁、生产构建、standalone 依赖校验和生产 schema contract，并完成原子目录切换。
- `https://mingyuan-ai.cn/api/healthz` 返回 `ok=true`，数据库与 Redis 均正常；`mingyuan-web` 为 active。
- `/login` 与 `/aim` 返回 200；匿名访问 `/api/comment-insights` 与 `/api/agent/v1/capabilities` 返回 401，认证边界符合预期。
- 启动日志无应用异常；systemd 的 143 记录来自部署时正常停止旧进程，随后新进程立即 Ready。

### Medium：Obsidian 导出构建追踪告警

生产构建成功，但 `/api/knowledge/export-obsidian` 的动态文件系统路径触发 Turbopack NFT 全项目追踪告警，可能增加部署产物体积。

- 缓解：发布阻断项解决后单独定位路径范围，不在本次收敛中顺手重构。

## Migration Notes

相对 `main` 新增 7 个 migration，其中 6 个为功能/治理变更，1 个为破坏性退役。执行顺序必须按 migration 目录顺序，不允许跳过破坏性迁移后假装 schema 已一致。

发布前必须保存：备份标识、迁移前 schema 状态、预检报告、迁移日志、迁移后 `migrate status` 与 `schema:verify` 结果。破坏性迁移的恢复方式只能是恢复备份或回到兼容旧 schema 的环境，不能依赖 down migration。

## Rollout Plan

1. **已完成**：配置并验证私有远程备份，固定候选分支。
2. **已完成**：在生产同版本 MariaDB 隔离库完成全量恢复与迁移演练，并在生产执行标准 migration deploy/status。
3. **已完成**：真实模型 15×2 daily eval 契约与质量通过率均为 100%；飞书单记录端到端已完成。
4. **已完成基础项**：固定候选 SHA、部署应用、健康检查和匿名认证边界已通过。真实模型 15×2 eval 已通过；评论雷达的生产登录态操作由内部账号后续按正常业务使用验证，不再为发布额外制造数据。
5. **已完成**：业务负责人明确批准视频、数字人和历史语音数据退役；备份恢复演练、生产修复和标准迁移记账均已完成。

## Rollback Plan

- 应用问题：部署上一已验证 SHA。
- 尚未执行破坏性迁移：停止部署并保留候选分支。
- 已执行破坏性迁移：停止写入，恢复已验证数据库备份，再部署与备份 schema 兼容的上一 SHA。
- 禁止在共享仓库使用 `git reset --hard` 作为发布回滚。

## Stakeholder Communication

当前可对团队表述为：“候选代码、真实模型质量、飞书闭环、生产数据库迁移和固定 SHA 应用部署均已完成，基础生产冒烟通过。APIMart 已通过生产机本地 Xray 代理启用并完成真实 GPT-5 请求验证，国内客户端仍只访问明远服务端。”

任何人不得把“计划完成”“单测通过”或“Z-Code 已提交”表述为“已进入 main”“已部署”或“业务闭环完成”。
