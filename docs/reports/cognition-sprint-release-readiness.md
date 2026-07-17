# 认知 Sprint 可发布性盘点

- 生成时间：2026-07-17
- 分支：`feat/aim-cognition-sprint1-2`（相对 `main` 领先 214 commit）
- 目的：回答"feat 能不能上线、该怎么上线"，不替你拍板，只给证据和分档建议
- 方法：纯 git/代码/门禁静态分析，未跑真实模型 eval（`--daily` 需 API key，在 CI 定时跑）

## 一、Sprint 全景

| 维度 | 数据 |
|---|---|
| 时间跨度 | 2026-07-11 → 07-16（6 天） |
| commit 总数 | 214 |
| 峰值 | 07-16 单日 58 commit |
| type 分布 | refactor 125 / feat 25 / fix 20 / chore 10 / test 8 / ci 3 / docs 3 / perf 1 |
| scope 分布 | aim 101 / competitor 16 / topics 9 / knowledge 8 / repo 6 / create 6 / feishu 4 / security 3 … |
| aim 代码 TODO/FIXME | 0（完整度高） |

**核心判断**：这不是零散改动，是一次**以 AIM 内核重构为主轴的结构化 sprint**——58% 是 refactor，47% 落在 aim scope，ADR-001 Harness 按 phase 1.1→3.2 逐阶段推进，commit message 里带明确阶段编号。

## 二、五条主线（按 commit 主题聚合）

1. **ADR-001 Harness 执行内核落地**（最大头）
   - phase 1.3 skeleton → 2.1 planner 冻结 context/model policy → 2.2 统一 `prepareAimContext` → 2.4 `executeAimRun` 内化非流式编排 → 2.5 `streamAimRun` 统一流式生命周期
   - 旧 `runAimGenerate`/`runAimChat`/`planAimChatStream` 标 `@deprecated`，保留为兼容适配器（阶段 2.10 迁移后删）
   - **状态**：架构守卫 `arch:check` 全绿、deterministic eval 100% 契约通过

2. **TaskSpec + ContentOutcome 新数据模型**
   - 生成流程接入确定性骨架 TaskSpec（风险/模式分类 + LLM refine + fallback）
   - 新增 `AimGeneration.taskSpec/topicSelectionId` + `ContentOutcome` 模型 + GET/PUT 路由
   - 交付契约按 TaskSpec mode 折叠/展开

3. **视频生成子系统退役**（方向性决策）
   - `refactor(media): retire video generation subsystem` 单 commit 删 **24587 行 / 211 文件**
   - 配套 `retire_video_generation` migration + 规则文档移除 video 边界
   - **含义**：产品从"端到端视频生产"收窄为"文案/资产生产"，视频能力下沉或外移

4. **评论雷达（comment-radar）新功能**
   - 可恢复的评论采集 + LLM 分析 + 采纳建议选题 + CSV 导出
   - 新表：`CommentInsightJob`/`CommentRecord`/`CommentSourceItem`

5. **安全加固 + 数据库治理**
   - `fix(security): close remaining web and admin audit gaps` / `harden sessions and tenant boundaries`
   - `refactor(prisma): split schema into domain files`（schema.prisma 拆成 9 个领域文件，-1268 行）
   - 新表：`AdminAuditLog`/`AdminSessionVersion` + 查询边界索引

## 三、发布风险分级

### 🔴 高风险（必须有发布预案）

- **7 个 Prisma migration**：task_spec/content_outcome、phase14 schema 合并、admin_session_version、admin_audit_log、comment_radar 表、**retire_video_generation（删表/删列）**、query_bound_indexes。
  - 其中 `retire_video_generation` 是**破坏性 schema 变更（不可逆）**，精确影响：
    - `DROP TABLE` 8 张：`VideoTask`、`VideoProductionPlan`、`VideoPackagingTemplate`、`PublicAvatarPreviewPreference`、`PublicAvatarPreviewCache`、`Avatar`、`PexelsQueryCache`、`PexelsMedia`
    - `DELETE FROM Asset WHERE assetType='voice'`（删除全部语音资产数据）
    - `Asset` 表砍 6 列（sourceAvatarId / externalTaskId / externalSpeakerId / voiceModel / demoAudioUrl / retryCount）
    - `ContentTemplate` 砍 4 列（shanjianStyleId / videoType / packRulesJson / processRulesJson）
    - `User.authVideoUrl` 列删除
  - **若线上仍有用户在用视频生成 / 数字人 / 语音合成，跑此 migration 会永久删除其数据和功能。发布前必须由你本人确认线上是否还有这类活跃使用。**
  - 代码层面退役**很干净**：全仓库已无 `runVideoPipeline`/`generateVideo` 等活跃引用，仅 `src/lib/oss.ts` 保留视频文件的 OSS 通用处理（MIME 类型、缩略图快照）——这是用户上传视频文件仍需的，保留正确，不属于被退役的生成子系统。
  - baseline migrations.json 是新引入的迁移基线机制，首次部署需 `prisma migrate resolve --applied` 对齐（STATE.md 有先例）。

### 🟠 中风险（需回归验证）

- API 层动 153 文件（+3009/-8804）。大量删除来自 video 退役，但 aim/competitor/topics 的 client API 也重构过。需 e2e 回归核心路径（选题→生成→交付→发布包）。
- `executeAimRun`/`streamAimRun` 是新统一入口——虽然 deterministic eval 100% 过，但**真实模型 eval（`--daily` 15×2）只在 CI 定时跑**，发布前应确认最近一次 daily eval 的 rubric pass ≥80%。

### 🟢 低风险（纯内部，可安全随发布）

- 125 个 refactor（拆 page、抽 hook、抽 service）——`arch:size` 全绿证明没引入体积违规。
- 安全加固（CSRF、session、audit）——独立成 commit，有测试。

## 四、可发布性结论

**feat 在工程层面已具备发布条件**，但有 2 个硬前提必须先确认：

| 前提 | 验证方式 | 当前状态 |
|---|---|---|
| 视频生成退役不破坏线上用户 | 确认线上是否还在用 video/数字人/语音，数据是否已迁 | ❓ 需你本人确认（代码侧已查：退役干净，但 migration 破坏性且不可逆）|
| 真实模型生成质量达标 | 最近一次 `aim-eval --daily` rubric ≥80% | ❓ 本地查不到（无 remote、gh 未登录）。需你在 GitHub Actions 的 `aim-eval-daily` workflow 历史里看 artifact |

**deterministic eval 100% 契约通过 + 全量门禁绿 + 零 TODO**——代码层面是健康的。

## 五、建议的发布路径（三选一，你定）

1. **整体发布（快但有风险）**：feat 整体回 main，一次性带 video 退役 + 全部新能力。适合"已确认线上不用 video + daily eval 达标"的情况。
2. **分两次发布（稳）**：
   - 第一次：从 feat 挑出**不含 video 退役**的安全/refactor/aim 内核部分，先回 main。
   - 第二次：video 退役 + comment-radar 单独发，配套用户通知和数据迁移。
3. **先跑一次真实 daily eval 再定**：本地或手动触发 `aim-eval --daily`，拿到 rubric 分数后再决定 1 还是 2。

## 六、定义完成 checklist（你之前缺的）

判断"认知 sprint 真正完成"的验收线：

- [ ] 真实模型 `aim-eval --daily`：契约 100%、rubric ≥80%、judge 覆盖完整、零编造事实
- [ ] 视频退役：线上确认无依赖 + 数据已迁（或明确放弃）
- [ ] 7 个 migration 在 staging 跑通，`schema:verify` 绿
- [ ] e2e 回归核心路径（选题→生成→交付→发布包）全绿
- [ ] `@deprecated` 适配器（runAimGenerate 等）有明确的阶段 2.10 删除时间点
- [ ] ADR-001 守卫盲区（handler 落库/调 router 违规已搬到二传手文件）登记进 issue，有收敛计划

---

> 本报告基于静态分析。最终发布决策是你的，特别是视频退役这条产品方向线。
