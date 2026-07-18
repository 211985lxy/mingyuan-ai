# 升级计划：Harness v2 收敛 + 数据迭代飞轮闭环

> 交付目标：交给 z-code 逐步执行。每个阶段含依赖关系、具体任务清单、预期产出物、验收标准。

---

## 一、升级目标与范围

### 1.1 当前系统版本

| 维度 | 当前状态 | 证据 |
|------|---------|------|
| Harness 版本 | **Thin Harness v1**（薄遥测包装层） | `aim-harness/` 仅 11 文件，核心靠 `adapters.ts` 内联 handler |
| 执行入口 | `runAimGenerate` / `runAimChat` / `planAimChatStream`（3 个分散适配器） | `adapters.ts` 是唯一入口，已被 v2 标记 `@deprecated` |
| 数据飞轮 | **完全断裂** | `ContentOutcome` 是幽灵模型（generated 有定义、schema 无表）；Script 止于 `selected`、VideoTask 止于 `completed`，无 `published` 状态 |
| 效果数据采集 | **不存在** | 8 个 cron 任务无一收集自身内容发布后效果 |
| 效果→知识回写 | **不存在** | `knowledge-auto-processor` 不消费效果数据 |
| 效果→脚本反馈 | **不存在** | `script-generator.ts` 的 `buildContextBlock` 不含历史效果数据 |

### 1.2 目标系统版本

| 维度 | 目标状态 |
|------|---------|
| Harness 版本 | **Harness v2 执行内核**（ADR-001 落地）——`executeAimRun` / `streamAimRun` 唯一入口 |
| 数据飞轮 | **完整闭环**：发布 → 效果采集 → 知识回写 → 脚本变体生成 |
| 采集管道 | cron 定时采集 + 手动录入双通道 |
| 回写路径 | 优秀文案特征 → `KnowledgeEntry`（`benchmark_reference` 类目） |
| 反馈路径 | 历史最佳表现文案 → 注入 `script-generator` 上下文 |

### 1.3 升级模块清单（14 个模块）

**Part A — Harness v2 收敛（7 个模块，从 release-convergence 移植）**

| 编号 | 模块 | 类型 | 来源 |
|------|------|------|------|
| H1 | `contracts.ts` | 新建 | release-convergence |
| H2 | `runtime.ts` | 新建 | release-convergence |
| H3 | `domain-executor.ts` | 新建 | release-convergence |
| H4 | `quality.ts` + `persistence.ts` | 新建 | release-convergence |
| H5 | `context-assembly.ts` + `manifest.ts` + `request-context.ts` | 新建 | release-convergence |
| H6 | `types.ts` + `planner.ts` v2 增强 | 修改 | release-convergence |
| H7 | `adapters.ts` 废弃 + 架构护栏脚本 | 删除+新建 | release-convergence |

**Part B — 数据迭代飞轮（7 个模块，新建）**

| 编号 | 模块 | 类型 |
|------|------|------|
| D1 | `ContentOutcome` 模型 + Prisma 迁移 | 数据层 |
| D2 | Script/VideoTask `published` 状态扩展 | 数据层 |
| D3 | 效果数据采集管道（cron + 手动 API） | 服务层 |
| D4 | 效果数据 → 知识库回写 | 服务层 |
| D5 | 效果数据 → 脚本生成反馈注入 | 服务层 |
| D6 | 变体性能追踪 | 服务层 |
| D7 | 数据飞轮前端可视化 | 前端 |

---

## 二、数据迭代框架逻辑

### 2.1 目标数据流转链路

```
┌─────────────────────────────────────────────────────────────────────┐
│                        数据迭代飞轮                                  │
│                                                                     │
│  ① 内容生产                ② 发布标记          ③ 效果数据采集         │
│  ┌──────────┐            ┌──────────┐         ┌──────────────┐     │
│  │ 选题生成  │──→ 文案 ──→│ 标记已发布│──┬─────→│ cron 拉取平台 │     │
│  │ 脚本生成  │            │ publishedAt│  │      │ + 手动录入   │     │
│  │ 视频生成  │            └──────────┘  │      └──────┬───────┘     │
│  └──────────┘                          │             │             │
│         ↑                              │             ↓             │
│         │                              │      ④ ContentOutcome       │
│         │                              │      落库（views/likes/     │
│         │                              │      dealCount/revenue）   │
│         │                              │             │             │
│         │                              │             ↓             │
│  ⑦ 脚本变体生成           ⑥ 知识库回写  │      ⑤ 优秀文案特征提取    │
│  ┌──────────────┐       ┌──────────┐  │      ┌──────────────┐     │
│  │ 注入历史最佳  │←──────│Knowledge-│←─┴─────│ LLM 提炼：开场 │     │
│  │ 表现文案 +    │       │ Entry    │       │ 类型/结构/结尾/│     │
│  │ 变体策略      │       │benchmark │       │ 选题元素/CTA  │     │
│  └──────────────┘       │ _reference│      └──────────────┘     │
│         ↑                └──────────┘                          │
│         │                      ↑                                │
│  ⑥ 反馈注入：buildContextBlock 中加入"历史表现"权重              │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 各环节输入/输出/处理规则

#### 环节 ① — 内容生产

| 项 | 说明 |
|----|------|
| **输入** | 选题卡片（`TopicSelection`）+ IP 档案 + 知识库上下文 |
| **处理** | `script-generator.ts` 生成 3 条候选文案 → AI 评分 → 用户选中 |
| **输出** | `Script` 记录（status=`selected`，含 `openingTypeCode`/`structureCode`/`endingTypeCode`） |
| **当前状态** | ✅ 已实现 |

#### 环节 ② — 发布标记（新增）

| 项 | 说明 |
|----|------|
| **输入** | 用户确认已发布的 Script / VideoTask |
| **处理** | 状态机扩展：`selected` → `published`；记录 `publishedAt` / `publishPlatform` / `publishUrl` |
| **输出** | Script.status=`published`；VideoTask.status=`published`；关联的 `AimGeneration.publishedAt` 填充 |
| **实现** | D2 模块 |

#### 环节 ③ — 效果数据采集（新增）

| 项 | 说明 |
|----|------|
| **输入** | 已发布内容（status=`published`）的平台 URL |
| **处理** | cron 每日拉取抖音/小红书互动数据 + 用户手动录入商业转化数据（私信/线索/预约/成交） |
| **输出** | `ContentOutcome` 记录（含 views/likes/comments/saves/shares + dmCount/qualifiedLeadCount/appointmentCount/dealCount/revenue） |
| **实现** | D3 模块 |

#### 环节 ④ — ContentOutcome 落库（新增）

| 项 | 说明 |
|----|------|
| **输入** | 采集到的效果数据 |
| **处理** | 按 `(generationId, platform, collectWindowDay)` 幂等 upsert；支持多时间窗口快照（如 3 天 / 7 天 / 30 天） |
| **输出** | `ContentOutcome` 表记录 |
| **实现** | D1 + D3 模块 |

#### 环节 ⑤ — 优秀文案特征提取（新增）

| 项 | 说明 |
|----|------|
| **输入** | 效果数据达标的 ContentOutcome（用户标记 `userVerdict="excellent"` 或互动率/转化率超阈值） |
| **处理** | LLM 提取文案的 5 维特征：开场类型、结构类型、结尾类型、选题元素标签、CTA 策略 |
| **输出** | 新的 `KnowledgeEntry`（category=`benchmark_reference`，tags 含 `performance:excellent` + 特征标签） |
| **实现** | D4 模块 |

#### 环节 ⑥ — 知识库回写（新增）

| 项 | 说明 |
|----|------|
| **输入** | ⑤ 产出的知识条目 |
| **处理** | 走现有 `ensureKnowledgeEmbedding` + `extractAndPersistForEntry` 管道，入库 + 向量化 + 实体抽取 |
| **输出** | 知识库新增"表现验证过的文案模式"条目 |
| **实现** | D4 模块（复用现有管道） |

#### 环节 ⑦ — 脚本变体生成（新增）

| 项 | 说明 |
|----|------|
| **输入** | 选题 + 知识库（含 ⑥ 回写的优秀模式）+ 历史效果数据 |
| **处理** | `script-generator.ts` 的 `buildContextBlock` 新增"历史最佳表现文案"block；AI 评分加入"历史表现"维度；变体策略基于历史表现选择最优开场/结构组合 |
| **输出** | 新文案变体（标注参考的历史优秀模式） |
| **实现** | D5 + D6 模块 |

### 2.3 当前断裂点诊断

| 断裂点 | 现状 | 影响环节 |
|--------|------|---------|
| **断裂 1** | Script 止于 `selected`，无 `published` | ① → ② 断裂 |
| **断裂 2** | `ContentOutcome` 表不存在 | ② → ③ → ④ 断裂 |
| **断裂 3** | 无效果数据采集 cron | ③ 完全缺失 |
| **断裂 4** | 知识库不消费效果数据 | ④ → ⑤ → ⑥ 断裂 |
| **断裂 5** | `script-generator` 上下文不含历史效果 | ⑥ → ⑦ 断裂 |
| **断裂 6** | 无变体性能追踪 | ⑦ 无法迭代优化 |

---

## 三、Harness 缺失功能补全（差距分析）

### 3.1 模块对照表

来源参考：`/Users/xiangyu/Desktop/明动aim智能体/mingyuan-release-convergence/apps/web/src/lib/aim-harness/`

| 抽象 | mingyuan（当前） | release-convergence（参考） | 差距 |
|------|---------|---------|------|
| Contracts | ❌ 混在 `types.ts` | ✅ `contracts.ts`（186 行） | 缺独立契约源 |
| Runtime | ❌ 用 `adapters.ts` 代替 | ✅ `runtime.ts`（353 行） | 缺唯一执行入口 |
| DomainExecutor | ❌ 内联在 adapter | ✅ `domain-executor.ts`（47 行） | 缺领域端口 |
| Quality | ⚠️ 内联在 `adapters.ts` | ✅ `quality.ts`（102 行） | 未独立 |
| Persistence | ⚠️ 仅 `snapshot.ts` | ✅ `persistence.ts`（127 行） | 缺 degraded 回标 |
| ContextAssembly | ❌ handler 自行装配 | ✅ `context-assembly.ts`（402 行） | 缺统一装配 |
| Manifest | ⚠️ 内联在 adapter | ✅ `manifest.ts`（54 行） | 缺隔离 |
| RequestContext | ❌ route 直接注入 | ✅ `request-context.ts`（146 行） | 缺注入链 |
| ArchGuard | ❌ 无 | ✅ `check-aim-architecture.ts`（257 行） | 无边界守护 |
| Agent 抽象 | ❌ 仅字符串字面量 | ✅ `agent-types.ts` + `aim/prompts/` + `aim/services/` | 缺整个服务层 |
| 前端拆分 | ❌ 单文件 `aim/page.tsx` | ✅ `features/aim/`（35 文件） | 缺前端模块化 |

### 3.2 八个核心模块移植清单

#### H1 — `contracts.ts`（身份契约 + v2 运行时契约唯一源）

- **来源**：`release-convergence/apps/web/src/lib/aim-harness/contracts.ts`
- **作用**：`AimAgentId` / `AimEntrypoint` 唯一定义源，消除 mingyuan 中 4 处重复定义；新增 v2 契约类型 `AimRunRequest` / `PreparedAimContext` / `AimAgentOutput` / `AimRunResult<T>` / `AimChatTurn`
- **替换点**：
  - `types.ts` 中的 `AimAgentId` / `AimEntrypoint` → 改为从 `contracts.ts` re-export
  - `aim-agent-handlers.ts` 中的 agentId 字面量 → 改为引用 `AIM_AGENT_IDS`
  - 新增 `LEGACY_AGENT_ID_ALIASES`（`ip_video → content_producer` 旧 id 归一化）

#### H2 — `runtime.ts`（ADR-001 唯一执行入口）

- **来源**：`release-convergence/.../aim-harness/runtime.ts`
- **作用**：`executeAimRun(request, execute)` 非流式 + `streamAimRun(request)` 流式，统一 plan/runId/telemetry/快照 lifecycle；修复 degraded 语义裂缝（provider fallback 时回标 `AimGeneration.status="degraded"`）
- **替换点**：所有调用 `runAimGenerate` / `runAimChat` / `planAimChatStream` 的路由改为调用 `executeAimRun` / `streamAimRun`

#### H3 — `domain-executor.ts`（领域执行端口）

- **来源**：`release-convergence/.../aim-harness/domain-executor.ts`
- **作用**：`executeAimGenerationDomain` / `executeAimChatDomain` / `streamAimChatDomain` 三个端口；Route 不再直接调 generator/handler

#### H4 — `quality.ts` + `persistence.ts`

- **来源**：`release-convergence/.../aim-harness/quality.ts` + `persistence.ts`
- **作用**：
  - `quality.ts`：`assessAimGeneration` 确定性校验 + LLM 质检的唯一实现（从 `adapters.ts` 内联抽出）
  - `persistence.ts`：`saveAimGenerationRecord` + `flagAimGenerationDegraded`（消除 handler 与 adapter 各自写入点）

#### H5 — `context-assembly.ts` + `manifest.ts` + `request-context.ts`

- **来源**：release-convergence 三个文件
- **作用**：
  - `context-assembly.ts`：`prepareAimContext(input)` 把此前散落在 `buildAimGeneration` 内部的上下文装配集中（项目校验 → 知识策略 → 并行加载 6 类背景 block → TaskSpec → 压缩 → 预算）
  - `manifest.ts`：`buildAimContextManifest` 声明式清单，带 userId/projectId 隔离
  - `request-context.ts`：`prepareAimGenerateInput` + `applyAuxiliaryContext`（爆款拆解 → 市场爆款 → 热榜 → 对标热评注入链）

#### H6 — `types.ts` + `planner.ts` v2 增强

- **来源**：release-convergence 对应文件
- **types.ts 新增字段**：
  - `AimRunSpec`：`draftOnly?: boolean`、`runLlmQuality?: boolean`
  - `AimModelPolicy`：`targetCapability` / `minimumCapability` / `maxProviderAttempts`
  - 新增 `AimModelCapability` 类型
- **planner.ts 新增**：
  - `buildModelPolicy()`：temperature/maxTokens 从 handler 硬编码上移到 planner（chat: 0.7；generate: 0.8/4000）
  - `buildContextPolicy()` 真正使用 agentId（当前 `void agentId`）

#### H7 — `adapters.ts` 废弃 + 架构护栏脚本

- **删除**：`adapters.ts`（3 个废弃适配器）
- **新增**：`scripts/check-aim-architecture.ts`（257 行），CI 强制 5 条规则：
  - R1：四入口必须调 `executeAimRun`/`streamAimRun`，不得直接 import handler/prisma/llm
  - R2：Agent 模块不得 import runner/prisma/model-router（反向依赖）
  - R3：`AimAgentId` 的 `export type` 全仓只允许在 `contracts.ts`
  - R4：废弃 adapter 不得有新增调用者
  - R5：`aim-agent-handlers.ts` 不得超过 1700 行

### 3.3 aim/ 服务目录移植（可选但推荐）

release-convergence 把 AIM 逻辑从 `lib/` 根平铺重组为 `lib/aim/` 子目录（35 文件）。mingyuan 当前所有 AIM 逻辑平铺在 `lib/` 根（`aim-agent-handlers.ts`、`aim-generator.ts`、`aim-knowledge-strategy.ts` 等）。

**建议**：Part A 完成后，作为独立重构阶段移植 `aim/` 目录。与 Part B（数据飞轮）无依赖，可并行。

---

## 四、分阶段执行步骤

### 阶段 0 — 准备（所有阶段的前置）

| 任务 | 命令/操作 | 产出物 | 验收标准 |
|------|----------|--------|---------|
| 0.1 创建升级分支 | `git checkout -b upgrade/harness-v2-data-flywheel` | 新分支 | 分支存在 |
| 0.2 数据库备份 | `cp mingyuan/apps/web/prisma/dev.db mingyuan/apps/web/prisma/dev.db.pre-upgrade`（SQLite）或 `mysqldump`（MySQL） | 备份文件 | 文件可读 |
| 0.3 记录当前 git HEAD | `git rev-parse HEAD > .upgrade-baseline-sha` | baseline 文件 | SHA 记录 |
| 0.4 确认 release-convergence 可读 | `ls mingyuan-release-convergence/apps/web/src/lib/aim-harness/contracts.ts` | 文件存在 | 18 文件在列 |

### 阶段 1 — Harness v2 内核移植（Part A）

**依赖**：阶段 0 完成
**预期产出物**：`aim-harness/` 从 11 文件扩展到 18 文件；`adapters.ts` 废弃；架构护栏脚本就位

| 步骤 | 任务 | 具体操作 | 产出物 | 验收标准 |
|------|------|---------|--------|---------|
| 1.1 | 移植 contracts.ts | 从 release-convergence 复制 `contracts.ts` → mingyuan `aim-harness/contracts.ts`；修改 `index.ts` re-export | contracts.ts | `tsc` 无报错；`AimAgentId` 全仓只在 contracts.ts 定义 |
| 1.2 | 移植 runtime.ts | 复制 `runtime.ts`；修改 `executeAimRun`/`streamAimRun` 的 domain executor 引用指向 mingyuan 现有 handler | runtime.ts | 入口函数可调用 |
| 1.3 | 移植 domain-executor.ts | 复制 `domain-executor.ts`；调整 import 路径指向 mingyuan 的 `aim-generator.ts` / `aim-agent-handlers.ts` | domain-executor.ts | 三个端口函数可调用 |
| 1.4 | 移植 quality.ts + persistence.ts | 复制两个文件；从 `adapters.ts` 的 `runAimGenerate` 中抽出质检逻辑迁入 `quality.ts`；抽出落库逻辑迁入 `persistence.ts` | quality.ts, persistence.ts | `adapters.ts` 的对应代码段可删除 |
| 1.5 | 移植 context-assembly + manifest + request-context | 复制三个文件；调整 import 指向 mingyuan 现有 `aim-knowledge-context.ts` / `style-profile.ts` 等 | 三个 .ts | `prepareAimContext` 可调用 |
| 1.6 | 增强 types.ts + planner.ts | 按 release-convergence 版本增量合并：加 `draftOnly`/`runLlmQuality`/`AimModelCapability`/`buildModelPolicy` | types.ts, planner.ts | 新字段可编译 |
| 1.7 | 迁移四入口调用 | 修改 4 个 API route（`aim/generate`、`aim/chat`、`agent/v1/aim/generate`、`inspiration`）改调 `executeAimRun`/`streamAimRun` | 4 个 route.ts | route 不再 import handler/prisma/llm |
| 1.8 | 废弃 adapters.ts | 在 `adapters.ts` 顶部加 `@deprecated` 注释；确认无新增调用者 | adapters.ts | grep 无新调用 |
| 1.9 | 移植架构护栏脚本 | 复制 `scripts/check-aim-architecture.ts`；加入 `package.json` 的 `lint:arch` 脚本 | check-aim-architecture.ts | `npm run lint:arch` 通过 |

**阶段 1 验收**：
- `npx tsc --noEmit` 零报错
- `npm run lint:arch` 通过（5 条规则全部绿）
- 手动触发一次 `/api/aim/generate`，返回正常生成结果
- `AimRunSnapshot` 正常落库，`AimExecutionTrace` 有记录

### 阶段 2 — 数据模型扩展（Part B 数据层）

**依赖**：阶段 0 完成（与阶段 1 无依赖，可并行）
**预期产出物**：`ContentOutcome` 表创建；Script/VideoTask 新增 `published` 状态

| 步骤 | 任务 | 具体操作 | 产出物 | 验收标准 |
|------|------|---------|--------|---------|
| 2.1 | 定义 ContentOutcome 模型 | 在 `schema.prisma` 新增 `model ContentOutcome`，字段参考 generated/payload 定义（见下方） | schema.prisma | `npx prisma format` 无报错 |
| 2.2 | 扩展 Script 状态 | 修改 `Script.status` 注释为 `draft \| candidate \| selected \| published \| discarded`；新增 `publishedAt DateTime?` `publishPlatform String?` `publishUrl String?` | schema.prisma | 状态枚举更新 |
| 2.3 | 扩展 VideoTask 状态 | 修改 `VideoTask.status` 注释加 `published`；新增 `publishedAt DateTime?` `publishPlatform String?` | schema.prisma | 状态枚举更新 |
| 2.4 | 关联 ContentOutcome ↔ Script/Generation | `ContentOutcome` 的 `generationId` 关联 `AimGeneration`；新增 `scriptId String?` 关联 `Script` | schema.prisma | 关系定义完整 |
| 2.5 | 创建迁移 | `npx prisma migrate dev --name add_content_outcome_and_published_states` | SQL 迁移文件 | 迁移成功，表存在 |
| 2.6 | 重新生成 Prisma Client | `npx prisma generate` | generated/ 更新 | `prisma.contentOutcome` 可调用 |

**ContentOutcome 模型定义**（基于 generated payload 反推）：

```prisma
model ContentOutcome {
  id                     String   @id @default(cuid())
  userId                 String
  generationId           String
  scriptId              String?
  topicSelectionId      String?
  projectId             String?

  // 发布信息
  platform              String?  // douyin | xhs | wechat | video_account
  publishedAt           DateTime?

  // 数据采集
  collectedAt           DateTime  @default(now())
  collectWindowDay      Int       @default(7)  // 采集窗口（发布后第几天）

  // 平台互动数据
  views                 Int?
  likes                 Int?
  comments              Int?
  saves                 Int?
  shares                Int?
  qualifiedCommentCount Int?  // 优质评论数

  // 商业转化数据
  dmCount               Int?  // 私信数
  qualifiedLeadCount    Int?  // 合格线索数
  appointmentCount     Int?  // 预约数
  dealCount             Int?  // 成交数
  revenue               Decimal? @db.Decimal(12, 2)

  // 人工标注
  audienceFeedback      String?  @db.Text  // 受众反馈文本
  userVerdict           String?  // excellent | good | average | poor

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  user                  User           @relation(fields: [userId], references: [id])
  generation            AimGeneration  @relation(fields: [generationId], references: [id])

  @@unique([generationId, platform, collectWindowDay])
  @@index([userId, publishedAt(sort: Desc)])
  @@index([userId, userVerdict])
  @@index([projectId, platform])
}
```

**阶段 2 验收**：
- `npx prisma migrate status` 无 pending
- 数据库中 `ContentOutcome` 表存在
- `Script.status="published"` 可写入
- 现有数据不受影响（纯增量迁移）

### 阶段 3 — 效果数据采集管道（D3）

**依赖**：阶段 2 完成
**预期产出物**：cron 采集路由 + 手动录入 API + 发布标记 API

| 步骤 | 任务 | 具体操作 | 产出物 | 验收标准 |
|------|------|---------|--------|---------|
| 3.1 | 发布标记 API | 新建 `app/api/scripts/[id]/publish/route.ts`（PATCH：status→published，写 publishedAt/platform/url）；同步更新关联 `AimGeneration.publishedAt` | route.ts | 可标记发布 |
| 3.2 | 手动录入效果 API | 新建 `app/api/content-outcomes/route.ts`（POST：手动录入 ContentOutcome；GET：查询列表） | route.ts | 可录入/查询 |
| 3.3 | 平台数据采集器 | 新建 `lib/outcome-collector.ts`：`collectOutcomeForGeneration(generationId, platform)` —— 调用平台 API（抖音开放平台 / 小红书）拉取互动数据；无 API 时走手动录入 | outcome-collector.ts | 函数可调用 |
| 3.4 | cron 采集路由 | 新建 `app/api/cron/collect-outcomes/route.ts`：每日扫描 `status=published` 且 `publishedAt` 在 30 天内的内容，调 `collectOutcomeForGeneration`；按 3 天/7 天/30 天三个窗口分别采集 | route.ts | 手动触发可采集 |
| 3.5 | 前端发布标记按钮 | 在 `videos/[id]/page.tsx` 和 create 页面加"标记已发布"按钮 + 平台/URL 输入 | page.tsx | UI 可操作 |

**阶段 3 验收**：
- 手动标记一条 Script 为 published，`publishedAt` 正确写入
- 手动录入一条 ContentOutcome，可查询
- 触发 cron，对已发布内容采集到数据（或正确降级为"无平台 API，等待手动录入"）

### 阶段 4 — 效果数据 → 知识库回写（D4）

**依赖**：阶段 3 完成
**预期产出物**：优秀文案特征提取 + KnowledgeEntry 回写

| 步骤 | 任务 | 具体操作 | 产出物 | 验收标准 |
|------|------|---------|--------|---------|
| 4.1 | 优秀判定逻辑 | 新建 `lib/outcome-evaluator.ts`：`evaluateOutcomes(userId)` —— 查询 `userVerdict="excellent"` 或互动率超阈值的 ContentOutcome，关联 Script 提取文案 | outcome-evaluator.ts | 可筛选出优秀内容 |
| 4.2 | 特征提取 prompt | 新建 `lib/outcome-feature-extractor.ts`：LLM 提取 5 维特征（开场类型/结构类型/结尾类型/选题元素/CTA 策略），输出结构化 JSON | outcome-feature-extractor.ts | LLM 可输出结构化结果 |
| 4.3 | 知识回写管道 | 在 `outcome-feature-extractor.ts` 中：提取后创建 `KnowledgeEntry`（category=`benchmark_reference`，tags 含 `performance:excellent` + 特征标签，sourceType=`outcome_feedback`），调 `ensureKnowledgeEmbedding` + `extractAndPersistForEntry` | 同上 | 知识库新增条目，embedding + 实体抽取完成 |
| 4.4 | cron 回写路由 | 新建 `app/api/cron/outcome-feedback/route.ts`：每日调 `evaluateOutcomes` → 特征提取 → 知识回写 | route.ts | 手动触发可回写 |

**阶段 4 验收**：
- 标记一条 ContentOutcome 为 excellent，触发 cron
- 知识库新增一条 `benchmark_reference` 条目，tags 含特征标签
- `KnowledgeEntity` 表有对应实体抽取记录

### 阶段 5 — 效果数据 → 脚本生成反馈（D5 + D6）

**依赖**：阶段 4 完成
**预期产出物**：脚本生成上下文注入历史最佳表现 + 变体性能追踪

| 步骤 | 任务 | 具体操作 | 产出物 | 验收标准 |
|------|------|---------|--------|---------|
| 5.1 | 历史表现查询 | 新建 `lib/outcome-history.ts`：`getTopPerformingScripts(userId, projectId?, limit=3)` —— 查询 ContentOutcome 关联 Script，按互动率/转化率排序，返回文案 + 特征 | outcome-history.ts | 可返回历史最佳文案 |
| 5.2 | 注入 script-generator | 修改 `lib/script-generator.ts` 的 `buildContextBlock`（约 line 303-419）：新增"历史最佳表现文案"block，注入 top 3 表现文案的标题 + 开场类型 + 结构 + 效果数据 | script-generator.ts | 生成上下文含历史表现 |
| 5.3 | 评分加历史维度 | 修改 `script-generator.ts` 的 `scoreWithAI`：评分维度从 8 个扩展到 9 个，新增"历史表现匹配度"维度（新文案的开场/结构与历史最佳的相似度） | script-generator.ts | 评分含历史维度 |
| 5.4 | 变体策略优化 | 修改 `lib/aim-agent-guides.ts` 的 `AIM_COPY_VARIANTS`：基于历史表现数据标注每种变体的平均效果，生成时优先推荐高表现变体 | aim-agent-guides.ts | 变体含表现标注 |
| 5.5 | 变体性能记录 | 在 `ContentOutcome` 新增 `variantId String?` 字段（记录该内容用了哪种变体）；查询时按 variantId 聚合统计平均效果 | schema.prisma + 查询 | 可按变体统计表现 |

**阶段 5 验收**：
- 生成新文案时，上下文包含"历史最佳表现文案"block
- AI 评分含"历史表现匹配度"维度
- 同一变体类型的历史平均效果可查询

### 阶段 6 — 验证与收尾

**依赖**：阶段 1-5 全部完成
**预期产出物**：端到端测试通过、文档更新

| 步骤 | 任务 | 具体操作 | 产出物 | 验收标准 |
|------|------|---------|--------|---------|
| 6.1 | 端到端飞轮测试 | 选题 → 生成文案 → 标记发布 → 录入效果 → 标记优秀 → 触发回写 cron → 生成新文案验证上下文含历史表现 | 测试报告 | 飞轮完整转一圈 |
| 6.2 | 架构护栏验证 | `npm run lint:arch` 通过 | 无报错 | 5 条规则全绿 |
| 6.3 | 类型检查 | `npx tsc --noEmit` | 零报错 | 通过 |
| 6.4 | 更新文档 | 更新 `AGENTS.md`（新增 ContentOutcome / 发布状态 / 效果回写相关说明）；更新 `PROJECT.md` 架构图 | 文档 | 与代码一致 |

---

## 五、测试与验证方案

### 5.1 功能测试范围

| 测试项 | 测试内容 | 预期结果 |
|--------|---------|---------|
| Harness v2 入口 | 四个 API route 调 `executeAimRun`/`streamAimRun` | 返回正常生成结果，AimRunSnapshot 落库 |
| 架构护栏 | `npm run lint:arch` | 5 条规则全绿 |
| 状态机扩展 | Script: selected → published | publishedAt 正确写入 |
| ContentOutcome CRUD | 手动录入 + 查询 | 记录可创建/查询 |
| cron 采集 | 触发 collect-outcomes cron | 对已发布内容采集数据（或正确降级） |
| 知识回写 | 触发 outcome-feedback cron | KnowledgeEntry 新增 benchmark_reference 条目 |
| 脚本反馈 | 生成新文案 | 上下文含历史最佳表现 block |
| 变体统计 | 按 variantId 聚合 | 可查询各变体平均效果 |

### 5.2 性能测试

| 测试项 | 基准 | 目标 |
|--------|------|------|
| AIM 生成延迟 | v1 基准 | v2 不超过 v1 + 10%（因多一层 runtime 封装） |
| 知识检索延迟 | 无历史表现 block | 加入历史表现 block 后 +50ms 以内 |
| cron 采集耗时 | — | 单次 < 30s（maxDuration 限制） |

### 5.3 回归测试

| 回归项 | 验证方式 |
|--------|---------|
| 现有 AIM 生成功能 | 跑 `eval-runner.ts` 的 eval suite（已有） |
| 现有知识库检索 | `retrieveRelevantKnowledge` 结果不变 |
| 现有飞书集成 | 触发一次飞书事件，正常响应 |
| 现有视频生成流程 | create 页面完整走一遍选题→文案→视频 |

---

## 六、回滚策略

### 6.1 回滚条件

触发以下任一条件立即回滚：
- 阶段 1 后 `tsc --noEmit` 有无法修复的报错
- 阶段 2 后 Prisma 迁移导致现有数据损坏
- 阶段 1 后 AIM 生成功能完全不可用且 30 分钟内无法修复
- 端到端飞轮测试失败且无法定位原因

### 6.2 单阶段回滚

| 阶段 | 回滚操作 | 数据处理 |
|------|---------|---------|
| 阶段 1 | `git revert` 阶段 1 的 commit；恢复 `adapters.ts` | 无数据变更，无需处理 |
| 阶段 2 | `npx prisma migrate reset` 到阶段 2 前的迁移；或手动 `DROP TABLE ContentOutcome`；恢复 Script/VideoTask 状态注释 | ContentOutcome 表删除（无生产数据）；Script 已有数据不受影响（published 是新增值） |
| 阶段 3 | `git revert` 阶段 3 commit | 已标记 published 的 Script 需手动改回 selected |
| 阶段 4 | `git revert` 阶段 4 commit；删除回写产生的 KnowledgeEntry（`sourceType="outcome_feedback"`） | 知识库清理：`DELETE FROM KnowledgeEntry WHERE sourceType = "outcome_feedback"` |
| 阶段 5 | `git revert` 阶段 5 commit | 无数据变更 |

### 6.3 整体回滚

```bash
# 1. 回到升级前分支
git checkout main  # 或升级前的分支
# 2. 恢复数据库
cp mingyuan/apps/web/prisma/dev.db.pre-upgrade mingyuan/apps/web/prisma/dev.db
# 或 MySQL: mysql < backup.sql
# 3. 重新生成 Prisma Client
cd mingyuan/apps/web && npx prisma generate
# 4. 重启服务
npm run dev
```

### 6.4 回滚验证

回滚后执行：
- `npx tsc --noEmit` 零报错
- 手动触发一次 AIM 生成，正常返回
- 知识库检索正常
- 飞书事件响应正常

---

## 附录 A — 阶段依赖关系图

```
阶段 0 (准备)
   ├──→ 阶段 1 (Harness v2 移植) ──→ 阶段 6 (验证)
   └──→ 阶段 2 (数据模型扩展)
            └──→ 阶段 3 (效果采集)
                     └──→ 阶段 4 (知识回写)
                              └──→ 阶段 5 (脚本反馈)
                                       └──→ 阶段 6 (验证)
```

- 阶段 1 和阶段 2 **可并行**（无依赖）
- 阶段 2-5 **串行**（每阶段依赖前一阶段的数据模型）
- 阶段 6 依赖全部完成

## 附录 B — 关键文件索引

**当前 mingyuan 关键文件**：
- `apps/web/src/lib/aim-harness/` — 当前 11 文件（薄 harness v1）
- `apps/web/src/lib/aim-agent-handlers.ts` — AIM 智能体处理（待重构）
- `apps/web/src/lib/script-generator.ts` — 脚本生成器（需加历史表现注入）
- `apps/web/src/lib/aim-agent-guides.ts` — 变体预设（需加表现标注）
- `apps/web/src/lib/knowledge-auto-processor.ts` — 知识自动处理
- `apps/web/src/lib/knowledge-entity-extractor.ts` — 实体抽取
- `apps/web/prisma/schema.prisma` — 数据模型（需加 ContentOutcome）
- `apps/web/src/generated/prisma/models/ContentOutcome.ts` — 幽灵模型（字段参考）

**release-convergence 参考文件**：
- `mingyuan-release-convergence/apps/web/src/lib/aim-harness/` — 18 文件（v2 完整实现）
- `mingyuan-release-convergence/apps/web/src/lib/aim/` — 35 文件（服务目录）
- `mingyuan-release-convergence/apps/web/scripts/check-aim-architecture.ts` — 架构护栏
- `mingyuan-release-convergence/docs/architecture/adr-001-aim-harness-execution-kernel.md` — ADR-001

## 附录 C — Git commit 规范

每个步骤一个 commit，格式：
```
[H/D编号] 步骤描述

- 具体改动点
- 验收项
```

示例：
```
[H1] 移植 contracts.ts 作为身份契约唯一源

- 从 release-convergence 复制 contracts.ts
- types.ts 的 AimAgentId/AimEntrypoint 改为 re-export
- index.ts 新增 re-export
- 验收：tsc 无报错，AimAgentId 全仓只在 contracts.ts 定义
```
