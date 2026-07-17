# 知识库管理系统升级计划

> 交付目标：z-code 逐步执行
> 创建日期：2026-07-17
> 当前分支：feat/aim-model-capability-fallback
> 工作树状态：clean
> 项目版本：@mingyuan/web v0.1.0（Next.js 16.2.10 / Prisma 7.5.0 / React 19.2.3）

---

## 1. 升级目标与范围

### 1.1 当前系统版本

| 维度 | 当前状态 |
|------|---------|
| 项目版本 | 0.1.0 |
| 知识分类数 | 12 种（boss_experience / product_usp / customer_pain / project_case / customer_qa / daily_inspiration / benchmark_reference / user_insight / hot_topic / positioning_material / private_domain_material / writing_style_profile） |
| 分类定义源 | **散落 6+ 个文件**各自维护副本 |
| Obsidian 同步白名单 | **仅 5 种**（数据丢失 bug） |
| 智能导入实体抽取 | **缺失**（只触发 embedding，未触发实体抽取） |
| KnowledgeEntry 类型 | **3 份手写副本**，其中 1 份缺 valueGrade 字段 |
| 知识卡片组件 | **2 份重复**（topic-planning / topics 各一份） |
| 向量检索 | MySQL JSON 列 + 应用层余弦，候选集上限 200 条 |

### 1.2 目标版本

| 维度 | 目标状态 |
|------|---------|
| 分类定义源 | **1 个文件**（`lib/knowledge-categories.ts`）作为唯一 import 源 |
| Obsidian 同步白名单 | **12 种**，与系统其他位置一致 |
| 智能导入实体抽取 | **已补全**，与 knowledge/route.ts POST 行为一致 |
| KnowledgeEntry 类型 | **只用 Prisma 生成类型**，删除全部手写副本 |
| 知识卡片组件 | **1 份**，统一在 `features/topics/components/` |
| 向量检索 | 预过滤下推 + 组合索引 + 候选集优化 |
| docs 目录 | 根目录零散文件归入子目录 |
| 维护流程 | 周巡检脚本 + ESLint 架构守卫 |

### 1.3 升级模块清单

| # | 模块 | 优先级 | 影响范围 |
|---|------|--------|---------|
| M1 | Obsidian sync 白名单修复 | P0 | `app/api/knowledge/sync/route.ts` + `features/knowledge/contracts/api.ts` |
| M2 | smart-import/confirm 补实体抽取 | P0 | `app/api/admin/knowledge/smart-import/confirm/route.ts` |
| M3 | 统一分类源 `lib/knowledge-categories.ts` | P1 | 新建文件 + 替换 6+ 处引用 |
| M4 | 统一 KnowledgeEntry 类型 | P1 | `lib/api/knowledge.ts` + `features/knowledge/admin-knowledge-shared.ts` |
| M5 | 删除重复知识卡片组件 | P1 | `components/topic-planning/knowledge-entry-card.tsx` |
| M6 | docs 目录归整 | P2 | 5 个文件移动 |
| M7 | 检索预过滤优化 | P2 | `lib/llm/embeddings.ts` |
| M8 | 组合索引补全 | P2 | `prisma/knowledge.prisma` |
| M9 | 周巡检脚本 | P3 | `scripts/knowledge-health-check.ts`（新建） |
| M10 | ESLint 架构守卫 | P3 | ESLint 配置 |

### 1.4 不做项

- **不改 Prisma schema 字段类型**：`category` 保持 `String`，不改为 enum（避免迁移风险）
- **不引入向量数据库**：当前 MySQL JSON 方案在 1000 条以下足够，迁移评估列为 P4 后续任务
- **不改分类值**：12 种 snake_case 分类值保持不变，已有数据库数据不迁移
- **不新增 API 路由**：只修复现有路由，不新增 endpoint
- **不动 chat-context.ts 重构**：WP-3 进行中的重构不干扰

---

## 2. 风险评估

### 2.1 兼容性风险

| 风险 | 等级 | 描述 | 缓解措施 |
|------|------|------|---------|
| Obsidian 客户端传入新分类值被拒 | 中 | 当前 Obsidian 客户端可能已配置只发 5 种分类；扩白名单后客户端不传新值不会报错，但如果客户端传了非 12 种的值，行为从"强制改 boss_experience"变为"Zod 校验拒绝" | 扩白名单时保留 fallback：非 12 种合法值仍归入 boss_experience，与当前行为一致，只是把合法集合从 5 扩到 12 |
| Prisma 生成类型与手写接口字段差异 | 中 | `lib/api/knowledge.ts` 的 `KnowledgeEntry` 缺 `valueGrade`，替换为 Prisma 类型后调用方可能访问到之前不存在的字段 | 替换前 grep 所有 `.valueGrade` 访问点，确认调用方已处理可选场景；Prisma 类型的 `valueGrade` 是 `string \| null`，与手写版本的 `string \| undefined` 不同，需统一处理 |
| 知识卡片组件合并后 props 不一致 | 低 | 两个 `knowledge-entry-card.tsx` 可能有不同的 props 接口 | 先 diff 两个文件，确认 props 差异，以 `features/topics/components/` 版本为准，调整 `components/topic-planning/` 的引用方 |
| ESLint 架构守卫误报 | 低 | `no-restricted-syntax` 规则可能匹配到注释或字符串中的 `CATEGORY_LABELS` | 规则只匹配变量声明（VariableDeclarator），不匹配字符串字面量 |

### 2.2 依赖冲突风险

| 风险 | 等级 | 描述 | 缓解措施 |
|------|------|------|---------|
| M3 新文件 import 循环依赖 | 中 | `lib/knowledge-categories.ts` 被 `features/knowledge/` 和 `lib/aim-knowledge-context.ts` 同时引用，需确认无循环 | 新文件只导出常量和纯函数，不 import 任何项目内模块，只依赖 TypeScript 类型 |
| M8 Prisma 索引迁移锁表 | 中 | 新增组合索引 `@@index([userId, status, projectId, category, valueGrade, updatedAt(sort: Desc)])` 在大表上会锁表 | 在低峰期执行迁移；MySQL 支持 `ALGORITHM=INPLACE, LOCK=NONE` 创建二级索引，Prisma migrate 默认使用在线 DDL |
| M7 预过滤改动影响检索召回 | 中 | 加 `status = "active"` 过滤后，之前可能检索到 archived 条目的场景会丢失结果 | archived 条目本就不应参与检索；如果 AIM 智能体需要历史知识，应通过其他路径获取 |

### 2.3 潜在风险

| 风险 | 等级 | 描述 | 缓解措施 |
|------|------|------|---------|
| 分支冲突 | 中 | 当前在 `feat/aim-model-capability-fallback` 分支，升级工作应在独立分支进行 | 新建 `refactor/knowledge-base-cleanup` 分支，从 main 切出 |
| 测试覆盖不足 | 中 | 知识相关测试可能未覆盖 Obsidian sync 和 smart-import 路径 | 升级前先确认现有测试通过，升级后补充针对修复路径的测试 |
| 飞书 Base 同步依赖 | 低 | lark-base-tool.ts 导入知识时使用 `mapLarkKnowledgeCategory` 函数映射分类，该函数不受本次升级影响 | 确认 `mapLarkKnowledgeCategory` 输出值在 12 种合法分类内 |

---

## 3. 分阶段执行步骤

### 阶段一：准备（Preparation）

> 目标：创建分支、备份、确认基线。不修改任何代码。

| # | 任务 | 命令/操作 | 验收条件 |
|---|------|----------|---------|
| P-1 | 从 main 创建升级分支 | `git checkout main && git pull && git checkout -b refactor/knowledge-base-cleanup` | 分支存在且基于最新 main |
| P-2 | 确认工作树干净 | `git status` | 无未提交改动 |
| P-3 | 运行基线测试 | `cd apps/web && pnpm test:unit` | 全部通过（记录通过数） |
| P-4 | 运行基线类型检查 | `cd apps/web && pnpm typecheck` | 无错误 |
| P-5 | 运行基线 lint | `cd apps/web && pnpm lint` | 无错误 |
| P-6 | 运行架构检查 | `cd apps/web && pnpm arch:check` | 通过 |
| P-7 | 数据库备份 | `cd apps/web && pnpm backup:database` | 备份文件生成且校验通过 |
| P-8 | 记录当前 Prisma 迁移状态 | `cd apps/web && pnpm schema:migration-status` | 记录当前 migration 数量和状态 |
| P-9 | grep 确认所有 CATEGORY_LABELS 引用点 | 搜索 `CATEGORY_LABELS`、`BROWSER_CATEGORY_LABELS`、`KNOWLEDGE_CATEGORY_LABELS`、`validCategories`、`CATEGORY_LIST` | 记录所有文件路径和行号 |
| P-10 | grep 确认所有 KnowledgeEntry 类型引用点 | 搜索 `import.*KnowledgeEntry` 在 `lib/api/knowledge.ts` 和 `features/knowledge/admin-knowledge-shared.ts` 的引用方 | 记录所有 import 路径 |
| P-11 | diff 两个 knowledge-entry-card.tsx | `diff apps/web/src/components/topic-planning/knowledge-entry-card.tsx apps/web/src/features/topics/components/knowledge-entry-card.tsx` | 记录差异 |
| P-12 | 确认 extractAndPersistForEntry 签名 | 读取 `lib/knowledge-entity-extractor.ts` 第 316-323 行 | 确认参数：`(entryId: string, content: string, ctx: PersistContext)` |

### 阶段二：执行（Execution）

> 目标：按模块逐个修改代码。每个模块独立 commit。

#### 模块 M1：修复 Obsidian sync 白名单（P0）

**文件 1：`app/api/knowledge/sync/route.ts`**

当前代码（第 66-76 行）：
```typescript
const validCategories = [
  "boss_experience",
  "product_usp",
  "customer_pain",
  "project_case",
  "customer_qa",
]
const finalCategory = validCategories.includes(entry.category)
  ? entry.category
  : "boss_experience"
```

替换为（暂用内联常量，M3 完成后替换为 import）：
```typescript
const validCategories = [
  "boss_experience",
  "product_usp",
  "customer_pain",
  "project_case",
  "customer_qa",
  "daily_inspiration",
  "benchmark_reference",
  "user_insight",
  "hot_topic",
  "positioning_material",
  "private_domain_material",
  "writing_style_profile",
]
const finalCategory = validCategories.includes(entry.category)
  ? entry.category
  : "boss_experience"
```

**文件 2：`features/knowledge/contracts/api.ts`**

当前代码（第 28-34 行）：
```typescript
category: z.enum([
  "boss_experience",
  "product_usp",
  "customer_pain",
  "project_case",
  "customer_qa",
]),
```

替换为：
```typescript
category: z.enum([
  "boss_experience",
  "product_usp",
  "customer_pain",
  "project_case",
  "customer_qa",
  "daily_inspiration",
  "benchmark_reference",
  "user_insight",
  "hot_topic",
  "positioning_material",
  "private_domain_material",
  "writing_style_profile",
]),
```

**Commit**: `fix(knowledge): expand obsidian sync category whitelist from 5 to 12`

#### 模块 M2：smart-import/confirm 补实体抽取（P0）

**文件：`app/api/admin/knowledge/smart-import/confirm/route.ts`**

第 5 行后新增 import：
```typescript
import { extractAndPersistForEntry } from "@/lib/knowledge-entity-extractor"
```

第 64-66 行，当前：
```typescript
// Fire-and-forget 向量化
for (const entry of created) {
  ensureKnowledgeEmbedding(entry.id).catch(() => {})
}
```

替换为：
```typescript
// Fire-and-forget 向量化 + 实体抽取
for (const entry of created) {
  ensureKnowledgeEmbedding(entry.id).catch(() => {})
  extractAndPersistForEntry(entry.id, entry.content, {
    userId: entry.userId,
    projectId: entry.projectId || null,
  }).catch(() => {})
}
```

**注意**：`entry` 是 Prisma `KnowledgeEntry` 创建返回值，包含 `id`、`content`、`userId`、`projectId` 字段。需确认 `prisma.knowledgeEntry.create` 的返回值包含这些字段（Prisma 默认返回全部标量字段，确认即可）。

**Commit**: `fix(knowledge): add entity extraction to smart-import confirm route`

#### 模块 M3：统一分类源（P1）

**步骤 1：新建 `lib/knowledge-categories.ts`**

```typescript
/**
 * 知识分类唯一事实源。
 * 全项目所有分类值、标签、默认分级、项目绑定规则均从此文件 import。
 * 禁止在其他文件定义 CATEGORY_LABELS / KNOWLEDGE_CATEGORIES 常量（ESLint 守卫强制）。
 */

export const KNOWLEDGE_CATEGORIES = [
  "boss_experience",
  "product_usp",
  "customer_pain",
  "project_case",
  "customer_qa",
  "daily_inspiration",
  "benchmark_reference",
  "user_insight",
  "hot_topic",
  "positioning_material",
  "private_domain_material",
  "writing_style_profile",
] as const

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number]

export const CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  boss_experience: "老板经验",
  product_usp: "产品卖点",
  customer_pain: "客户痛点",
  project_case: "项目案例",
  customer_qa: "客户问答",
  daily_inspiration: "日常灵感",
  benchmark_reference: "竞品/对标参考",
  user_insight: "用户洞察",
  hot_topic: "热点素材",
  positioning_material: "定位素材",
  private_domain_material: "私域素材",
  writing_style_profile: "写作风格档案",
}

export const SOURCE_TYPES = [
  "manual",
  "voice_transcribe",
  "import",
  "obsidian",
  "smart_import",
] as const

export type KnowledgeSourceType = (typeof SOURCE_TYPES)[number]

export const SOURCE_TYPE_LABELS: Record<KnowledgeSourceType, string> = {
  manual: "手动录入",
  voice_transcribe: "语音转写",
  import: "文件导入",
  obsidian: "Obsidian 同步",
  smart_import: "智能导入",
}

export const PROJECT_REQUIRED_CATEGORIES: ReadonlySet<string> = new Set([
  "daily_inspiration",
  "benchmark_reference",
  "user_insight",
  "hot_topic",
  "positioning_material",
  "private_domain_material",
])

export function isKnowledgeCategory(value: string): value is KnowledgeCategory {
  return (KNOWLEDGE_CATEGORIES as readonly string[]).includes(value)
}

export function isKnowledgeSourceType(value: string): value is KnowledgeSourceType {
  return (SOURCE_TYPES as readonly string[]).includes(value)
}

/**
 * 资产层级分组（UI 展示和策略画像用，不改数据库）。
 */
export const CATEGORY_GROUPS = {
  "IP 核心资产": ["boss_experience", "positioning_material", "writing_style_profile"],
  "转化资产": ["product_usp", "customer_pain", "customer_qa", "project_case", "private_domain_material"],
  "流量资产": ["daily_inspiration", "benchmark_reference", "user_insight", "hot_topic"],
} as const
```

**步骤 2：逐文件替换引用**

| 文件 | 当前定义 | 替换为 |
|------|---------|--------|
| `features/knowledge/admin-knowledge-shared.ts` | 第 45-58 行 `CATEGORY_LABELS` + 第 60-66 行 `SOURCE_TYPE_LABELS` | 删除两个常量定义，顶部 `import { CATEGORY_LABELS, SOURCE_TYPE_LABELS } from "@/lib/knowledge-categories"` |
| `lib/aim-knowledge-context.ts` | 本地 `CATEGORY_LABELS` | `import { CATEGORY_LABELS } from "@/lib/knowledge-categories"` |
| `lib/agent-logic-profile.ts` | `KNOWLEDGE_CATEGORY_LABELS` | `import { CATEGORY_LABELS as KNOWLEDGE_CATEGORY_LABELS } from "@/lib/knowledge-categories"` 或直接用 `CATEGORY_LABELS` |
| `lib/aihot-briefing.ts` | 本地 `CATEGORY_LABELS` | `import { CATEGORY_LABELS } from "@/lib/knowledge-categories"` |
| `app/api/admin/knowledge/stats/route.ts` | 函数内局部 `CATEGORY_LABELS` | `import { CATEGORY_LABELS } from "@/lib/knowledge-categories"` |
| `components/admin/knowledge-browser.tsx` | `BROWSER_CATEGORY_LABELS`（第 77 行） | `import { CATEGORY_LABELS as BROWSER_CATEGORY_LABELS } from "@/lib/knowledge-categories"` |
| `app/api/knowledge/sync/route.ts` | M1 中的内联 `validCategories` | `import { KNOWLEDGE_CATEGORIES, isKnowledgeCategory } from "@/lib/knowledge-categories"`，替换为 `const finalCategory = isKnowledgeCategory(entry.category) ? entry.category : "boss_experience"` |
| `lib/knowledge-auto-processor.ts` | `CATEGORY_LIST` | `import { KNOWLEDGE_CATEGORIES } from "@/lib/knowledge-categories"`，替换 `CATEGORY_LIST` 为 `KNOWLEDGE_CATEGORIES` |
| `features/knowledge/contracts/api.ts` | `obsidianSyncEntrySchema` 的 `z.enum([...])` | `import { KNOWLEDGE_CATEGORIES } from "@/lib/knowledge-categories"`，改为 `category: z.enum(KNOWLEDGE_CATEGORIES)` |

**步骤 3：确认前端组件引用**

以下 tsx 文件 import 了 `CATEGORY_LABELS`，确认它们从 `admin-knowledge-shared.ts` 获取的链路仍然有效（因为 `admin-knowledge-shared.ts` 现在是 re-export 而非定义源）：
- `features/knowledge/components/knowledge-list-tab.tsx`
- `features/knowledge/components/knowledge-entry-dialogs.tsx`
- `features/knowledge/components/knowledge-review-dialogs.tsx`
- `features/knowledge/components/smart-import-dialog.tsx`

**Commit**: `refactor(knowledge): unify category definitions to single source`

#### 模块 M4：统一 KnowledgeEntry 类型（P1）

**文件 1：`lib/api/knowledge.ts`**

第 20-33 行的手写 `KnowledgeEntry` 接口删除。

所有 import 了 `KnowledgeEntry` 的文件改用 Prisma 生成类型：
```typescript
import type { KnowledgeEntry } from "@/generated/prisma"
```

**注意**：Prisma 生成类型的 `tags` 是 `JsonValue`（`unknown`），不是 `string[]`。调用方需要做类型断言或运行时检查。这是正确的——之前的 `string[]` 是不安全的假设。

**文件 2：`features/knowledge/admin-knowledge-shared.ts`**

第 3-20 行的手写 `KnowledgeEntry` 接口删除。如果该接口被其他文件 import，改为 re-export Prisma 类型：
```typescript
export type { KnowledgeEntry } from "@/generated/prisma"
```

**注意**：`admin-knowledge-shared.ts` 的 `KnowledgeEntry` 包含 `user` 和 `project` 关联字段以及 `embedding` 关联字段。这些在 Prisma 中是可选的（只有 `include` 时才返回）。如果调用方依赖这些字段，需要用 `Prisma.KnowledgeEntryGetPayload<{ include: { ... } }>` 类型：

```typescript
import type { Prisma } from "@/generated/prisma"

export type KnowledgeEntryWithRelations = Prisma.KnowledgeEntryGetPayload<{
  include: {
    user: { select: { id: true; name: true; email: true } }
    project: { select: { id: true; name: true; companyName: true; industry: true; status: true } } | null
    embedding: { select: { status: true; updatedAt: true; errorMessage: true } } | null
  }
}>
```

**Commit**: `refactor(knowledge): unify KnowledgeEntry type to Prisma generated type`

#### 模块 M5：删除重复知识卡片组件（P1）

**前置确认**：
```bash
diff apps/web/src/components/topic-planning/knowledge-entry-card.tsx \
     apps/web/src/features/topics/components/knowledge-entry-card.tsx
```

如果差异不大（仅 import 路径或 props 名不同）：
1. 以 `features/topics/components/knowledge-entry-card.tsx` 为准
2. grep 找到 `components/topic-planning/knowledge-entry-card.tsx` 的所有引用方
3. 修改引用方的 import 路径
4. 删除 `components/topic-planning/knowledge-entry-card.tsx`

如果差异较大（props 接口完全不同）：
1. 不删除，而是将两者合并为一个带可选 props 的组件
2. 保留在 `features/topics/components/knowledge-entry-card.tsx`
3. 调整 `components/topic-planning/` 的引用方

**Commit**: `refactor(knowledge): deduplicate knowledge-entry-card component`

#### 模块 M6：docs 目录归整（P2）

```bash
mv docs/accounts.md docs/guides/accounts.md
mv docs/competitor-analysis-research.md docs/reports/competitor-analysis-research.md
mv docs/copywriting-polish-and-quality-single-entry.md docs/guides/copywriting-polish-and-quality-single-entry.md
mv docs/表达模板.md docs/guides/表达模板.md
mv docs/FAST_PRODUCTION_LAUNCH.md docs/runbooks/FAST_PRODUCTION_LAUNCH.md
```

**注意**：检查 docs 内是否有交叉引用指向这些文件的原路径。grep `docs/accounts.md` 等在所有 `.md` 文件中的引用，更新路径。

**Commit**: `docs: move root-level files into subdirectories`

#### 模块 M7：检索预过滤优化（P2）

**文件：`lib/llm/embeddings.ts`**

在 `retrieveRelevantKnowledge` 函数中，修改候选集查询的 WHERE 条件：

当前查询（示意）：
```typescript
const candidates = await prisma.knowledgeEntry.findMany({
  where: {
    userId,
    status: "active",
    // 可能有 category 和 valueGrade 过滤
  },
  // ...
})
```

优化为：
```typescript
const candidates = await prisma.knowledgeEntry.findMany({
  where: {
    userId,
    status: "active",                           // 已有
    valueGrade: gradeFilter,                     // 下推 valueGrade 白名单
    // category 过滤已在策略层，可选择性下推
    updatedAt: { gt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },  // 只检索最近 365 天
  },
  orderBy: { updatedAt: "desc" },
  take: 200,                                     // 保持上限
})
```

**注意**：`updatedAt` 过滤是新增行为，可能导致旧条目不参与检索。先加一个环境变量开关 `KNOWLEDGE_RETRIEVAL_MAX_AGE_DAYS`（默认 365，设为 0 表示不过滤），让运维可调。

**Commit**: `perf(knowledge): push status and valueGrade filters to SQL where clause`

#### 模块 M8：组合索引补全（P2）

**文件：`prisma/knowledge.prisma`**

在 `KnowledgeEntry` 模型的现有索引后新增：
```prisma
@@index([userId, status, projectId, category, valueGrade, updatedAt(sort: Desc)])
```

**迁移命令**：
```bash
cd apps/web && npx prisma migrate dev --name add_knowledge_retrieval_index
```

**注意**：
- 在低峰期执行
- 确认 MySQL 版本支持 `ALGORITHM=INPLACE, LOCK=NONE`（MySQL 5.6+ 支持）
- 迁移后验证索引生效：`EXPLAIN SELECT ... WHERE userId = ... AND status = 'active' ...`

**Commit**: `perf(knowledge): add composite index for retrieval query path`

#### 模块 M9：周巡检脚本（P3）

**新建文件：`scripts/knowledge-health-check.ts`**

脚本检查项：
1. `KnowledgeEmbedding` 中 `status = "failed"` 或 `status = "pending"` 超过 24 小时的条目
2. `KnowledgeEntry` 有记录但无 `KnowledgeRelation` 关联的条目（实体抽取缺失）
3. `KnowledgeEntity` 无任何 `KnowledgeRelation` 的孤儿实体
4. `KnowledgeEntry.category` 不在 12 种合法值中的条目
5. 高相似度对：对同 userId + projectId 下的条目做 trigram Jaccard 相似度扫描，标记 > 0.7 的对
6. `KnowledgeEntry.status = "active"` 但 `updatedAt` 超过 180 天的条目

输出：Markdown 报告到 `docs/reports/knowledge-health-YYYY-MM-DD.md`

**Commit**: `feat(knowledge): add weekly health check script`

#### 模块 M10：ESLint 架构守卫（P3）

**文件：`apps/web/eslint.config.mjs`（或对应 ESLint 配置文件）**

新增规则：
```javascript
{
  rule: "no-restricted-syntax",
  options: [
    {
      selector: "VariableDeclarator[id.name='CATEGORY_LABELS']:not(ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name='CATEGORY_LABELS'])",
      message: "CATEGORY_LABELS must only be defined in lib/knowledge-categories.ts. Import from there instead."
    },
    {
      selector: "VariableDeclarator[id.name='KNOWLEDGE_CATEGORY_LABELS']",
      message: "Use CATEGORY_LABELS from lib/knowledge-categories.ts instead of defining KNOWLEDGE_CATEGORY_LABELS."
    },
    {
      selector: "VariableDeclarator[id.name='BROWSER_CATEGORY_LABELS']",
      message: "Use CATEGORY_LABELS from lib/knowledge-categories.ts instead of defining BROWSER_CATEGORY_LABELS."
    },
    {
      selector: "VariableDeclarator[id.name='validCategories']",
      message: "Use KNOWLEDGE_CATEGORIES or isKnowledgeCategory from lib/knowledge-categories.ts instead of defining validCategories."
    },
  ]
}
```

**注意**：`CATEGORY_LABELS` 规则排除 `lib/knowledge-categories.ts` 自身的导出声明。需要确认 selector 语法正确，或改用 `no-restricted-modules` / `eslint-plugin-import` 的 `no-restricted-paths`。

**Commit**: `chore(eslint): add guard preventing category definition outside single source`

### 阶段三：验证（Verification）

> 目标：确保所有修改不破坏现有功能。

| # | 任务 | 命令 | 通过条件 |
|---|------|------|---------|
| V-1 | 类型检查 | `cd apps/web && pnpm typecheck` | 0 errors |
| V-2 | 单元测试 | `cd apps/web && pnpm test:unit` | 全部通过，通过数 ≥ 阶段一记录的基线 |
| V-3 | 类型检查（测试） | `cd apps/web && pnpm typecheck:tests` | 0 errors |
| V-4 | Lint | `cd apps/web && pnpm lint` | 0 errors |
| V-5 | 架构检查 | `cd apps/web && pnpm arch:check` | 通过 |
| V-6 | 架构大小检查 | `cd apps/web && pnpm arch:size` | 无新增超限文件 |
| V-7 | API 契约检查 | `cd apps/web && pnpm api:contracts` | 通过 |
| V-8 | 领域边界检查 | `cd apps/web && pnpm arch:domains` | 通过 |
| V-9 | Prisma Schema 验证 | `cd apps/web && pnpm schema:verify` | 通过 |
| V-10 | Prisma 迁移状态 | `cd apps/web && pnpm schema:migration-status` | 无未应用迁移 |
| V-11 | 生产构建 | `cd apps/web && pnpm build` | 构建成功 |
| V-12 | Obsidian sync 路由测试 | 手动发送含 12 种分类的 sync 请求 | 全部 12 种分类正确写入，不回退到 boss_experience |
| V-13 | smart-import confirm 测试 | 手动触发智能导入，确认后检查 KnowledgeEntity 和 KnowledgeRelation 表 | 有实体和关系数据写入 |
| V-14 | 检索功能测试 | 手动触发 AIM 对话/生成，检查知识检索结果 | 返回正常，无空结果 |
| V-15 | 巡检脚本运行 | `cd apps/web && npx tsx scripts/knowledge-health-check.ts` | 生成 Markdown 报告 |

### 阶段四：回滚（Rollback）

> 回滚不是"如果失败就做"，而是"知道在什么条件下做、怎么做"。

#### 4.1 回滚条件

| 条件 | 触发动作 |
|------|---------|
| V-1（typecheck）失败且无法在 30 分钟内修复 | 回滚 M3 + M4（类型相关改动） |
| V-2（单元测试）有新失败 | 回滚到失败前的最后一个 commit |
| V-11（构建）失败 | 回滚到构建前的最后一个 commit |
| V-12（Obsidian sync 测试）失败 | 回滚 M1 |
| V-13（smart-import 测试）失败 | 回滚 M2 |
| V-14（检索测试）结果异常（空结果或召回率下降） | 回滚 M7 |
| Prisma 迁移失败 | `npx prisma migrate resolve --rolled-back <migration_name>`，删除迁移文件 |

#### 4.2 回滚操作步骤

**整体回滚（放弃整个升级）**：
```bash
git checkout main
git branch -D refactor/knowledge-base-cleanup
# 如果已合并到 main：
git revert <merge_commit_sha>
# Prisma 迁移回滚：
cd apps/web && npx prisma migrate resolve --rolled-back add_knowledge_retrieval_index
```

**单模块回滚**：
```bash
# 找到对应模块的 commit
git log --oneline refactor/knowledge-base-cleanup
# revert 单个 commit
git revert <commit_sha>
```

**数据库回滚**（仅 M8 索引迁移）：
```sql
-- 手动删除索引（如果 Prisma migrate resolve 不适用）
ALTER TABLE KnowledgeEntry DROP INDEX KnowledgeEntry_userId_status_projectId_category_valueGrade_updatedAt_idx;
```

#### 4.3 回滚后验证

```bash
cd apps/web
pnpm typecheck && pnpm test:unit && pnpm build
```

确认回滚后系统恢复到升级前状态。

---

## 4. 测试与验证方案

### 4.1 功能测试

| 测试项 | 测试方法 | 预期结果 |
|--------|---------|---------|
| Obsidian sync — 12 种分类 | 发送 POST `/api/knowledge/sync`，entries 包含 12 种分类各 1 条 | 全部写入成功，`category` 字段保持原值 |
| Obsidian sync — 非法分类 | 发送 category = "invalid_category" | 写入成功，category 回退为 "boss_experience" |
| Obsidian sync — Zod 校验 | 发送缺字段或超长字段的请求 | 返回 400 错误 |
| smart-import confirm — 实体抽取 | 触发智能导入并确认 → 查询 KnowledgeEntity 表 | 有与导入条目关联的实体记录 |
| smart-import confirm — embedding | 同上 → 查询 KnowledgeEmbedding 表 | 有 embedding 记录（status = completed 或 pending） |
| 知识列表 — 分类筛选 | 管理后台按每种分类筛选 | 12 种分类均能正确筛选 |
| AIM 对话 — 知识检索 | 发起 AIM 对话/生成，检查知识上下文 | 返回相关知识条目，无空结果 |
| 知识创建 — 正常 | POST `/api/knowledge` 创建各分类条目 | 全部成功，embedding + 实体抽取均触发 |
| 知识更新 — 重新 embedding | PUT `/api/knowledge/:id` 更新 content | embedding contentHash 变化，重新生成向量 |
| 知识删除 — 软删除 | DELETE `/api/knowledge/:id` | status 变为 "archived"，不再参与检索 |

### 4.2 性能测试

| 测试项 | 测试方法 | 预期结果 |
|--------|---------|---------|
| 检索延迟 — 200 条候选集 | 在 200+ 条知识库上触发检索，记录耗时 | P95 < 500ms |
| 检索延迟 — 预过滤后 | 加 category + valueGrade 预过滤后触发检索 | P95 < 200ms |
| Obsidian sync — 100 条 | 发送 100 条 entries 的 sync 请求 | 完成时间 < 30s（含 embedding fire-and-forget） |
| smart-import confirm — 50 条 | 确认 50 条条目 | 完成时间 < 15s（含 embedding + 实体抽取 fire-and-forget） |
| 索引查询计划 | `EXPLAIN SELECT ... WHERE userId = ? AND status = 'active' AND ...` | 使用新组合索引，type = range 或 ref |

### 4.3 回归测试

| 测试项 | 测试方法 | 预期结果 |
|--------|---------|---------|
| 全量单元测试 | `pnpm test:unit` | 无新增失败 |
| AIM Harness 测试 | `pnpm test:harness` | 全部通过 |
| 架构守卫 | `pnpm arch:check` + `pnpm arch:domains` + `pnpm arch:size` | 全部通过 |
| API 契约 | `pnpm api:contracts` | 无契约变更（除非 M1 扩了白名单） |
| 飞书集成 | 飞书 Base 导入/导出功能正常 | 不受影响（未修改 lark-base-tool.ts） |
| 飞书 IM 事件 | 飞书消息触发选题对话 | 不受影响（未修改 feishu-topic-chat.ts） |

### 4.4 测试数据准备

```sql
-- 准备测试数据：每种分类至少 3 条
-- 可以用以下 SQL 插入测试数据（替换 <user_id> 为真实用户 ID）
INSERT INTO KnowledgeEntry (id, userId, category, title, content, tags, sourceType, status, createdAt, updatedAt)
VALUES
  (UUID(), '<user_id>', 'boss_experience', '测试-老板经验-1', '测试内容', '[]', 'manual', 'active', NOW(), NOW()),
  (UUID(), '<user_id>', 'product_usp', '测试-产品卖点-1', '测试内容', '[]', 'manual', 'active', NOW(), NOW()),
  -- ... 12 种分类各 3 条
;
```

---

## 5. 回滚策略

### 5.1 回滚决策树

```
升级失败
├── 类型检查失败？
│   ├── M3/M4 引起？ → revert M3/M4 commit，其余保留
│   └── 其他模块引起？ → revert 对应 commit
├── 测试失败？
│   ├── 新增测试失败？ → 修复测试或 revert 对应模块
│   └── 原有测试失败？ → revert 到失败前最后一个 commit
├── 构建失败？
│   └── revert 到构建前最后一个 commit
├── 迁移失败？
│   ├── prisma migrate resolve --rolled-back
│   └── 删除迁移文件
├── 功能异常（线上验证）？
│   ├── Obsidian sync 异常 → revert M1
│   ├── smart-import 异常 → revert M2
│   ├── 检索异常 → revert M7
│   └── 其他 → 全量回滚
└── 决定全量回滚？
    ├── git checkout main（或 revert merge commit）
    ├── prisma migrate resolve --rolled-back（如有迁移）
    └── 验证系统恢复正常
```

### 5.2 回滚检查清单

- [ ] 确认回滚条件已满足（对照 4.1 表格）
- [ ] 记录回滚原因和时间
- [ ] 执行 git revert / checkout
- [ ] 如有 Prisma 迁移，执行 `prisma migrate resolve --rolled-back`
- [ ] 如有数据库索引，手动 DROP INDEX
- [ ] 运行 `pnpm typecheck && pnpm test:unit && pnpm build`
- [ ] 确认系统恢复正常
- [ ] 通知团队回滚已完成
- [ ] 记录回滚原因到 `docs/reports/knowledge-upgrade-rollback-YYYY-MM-DD.md`

---

## 附录 A：执行顺序总表

| 顺序 | 模块 | Commit 前缀 | 前置依赖 |
|------|------|------------|---------|
| 1 | M1 | `fix(knowledge)` | 无 |
| 2 | M2 | `fix(knowledge)` | 无 |
| 3 | M3 | `refactor(knowledge)` | M1（sync route 引用替换） |
| 4 | M4 | `refactor(knowledge)` | M3（类型可能引用分类源） |
| 5 | M5 | `refactor(knowledge)` | 无 |
| 6 | M6 | `docs` | 无 |
| 7 | M7 | `perf(knowledge)` | 无 |
| 8 | M8 | `perf(knowledge)` | 无（但迁移需在低峰期） |
| 9 | M9 | `feat(knowledge)` | M3（巡检脚本引用分类源） |
| 10 | M10 | `chore(eslint)` | M3（守卫依赖分类源已建立） |

## 附录 B：文件变更清单

| 操作 | 文件路径 |
|------|---------|
| 新建 | `apps/web/src/lib/knowledge-categories.ts` |
| 新建 | `apps/web/scripts/knowledge-health-check.ts` |
| 修改 | `apps/web/src/app/api/knowledge/sync/route.ts` |
| 修改 | `apps/web/src/features/knowledge/contracts/api.ts` |
| 修改 | `apps/web/src/app/api/admin/knowledge/smart-import/confirm/route.ts` |
| 修改 | `apps/web/src/features/knowledge/admin-knowledge-shared.ts` |
| 修改 | `apps/web/src/lib/aim-knowledge-context.ts` |
| 修改 | `apps/web/src/lib/agent-logic-profile.ts` |
| 修改 | `apps/web/src/lib/aihot-briefing.ts` |
| 修改 | `apps/web/src/app/api/admin/knowledge/stats/route.ts` |
| 修改 | `apps/web/src/components/admin/knowledge-browser.tsx` |
| 修改 | `apps/web/src/lib/knowledge-auto-processor.ts` |
| 修改 | `apps/web/src/lib/api/knowledge.ts` |
| 修改 | `apps/web/src/lib/llm/embeddings.ts` |
| 修改 | `apps/web/prisma/knowledge.prisma` |
| 修改 | `apps/web/eslint.config.mjs`（或对应配置） |
| 删除 | `apps/web/src/components/topic-planning/knowledge-entry-card.tsx`（待确认） |
| 移动 | `docs/accounts.md` → `docs/guides/accounts.md` |
| 移动 | `docs/competitor-analysis-research.md` → `docs/reports/competitor-analysis-research.md` |
| 移动 | `docs/copywriting-polish-and-quality-single-entry.md` → `docs/guides/` |
| 移动 | `docs/表达模板.md` → `docs/guides/` |
| 移动 | `docs/FAST_PRODUCTION_LAUNCH.md` → `docs/runbooks/` |

## 附录 C：验证命令速查

```bash
# 一键验证
cd apps/web && \
  pnpm typecheck && \
  pnpm typecheck:tests && \
  pnpm lint && \
  pnpm test:unit && \
  pnpm test:harness && \
  pnpm arch:check && \
  pnpm arch:domains && \
  pnpm arch:size && \
  pnpm api:contracts && \
  pnpm schema:verify && \
  pnpm schema:migration-status && \
  pnpm build && \
  echo "ALL CHECKS PASSED"
```
