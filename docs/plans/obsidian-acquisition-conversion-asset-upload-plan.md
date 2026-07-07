# Obsidian 获客/转化资产上传方案

> 状态：方案待评审（2026-07-04）。本文档不动代码，只梳理现状、阻断点和修复路径，供评审后决定如何实施。
>
> 关联：核心产品原则见根 `AGENTS.md` 的「核心产品原则」一节。本方案解决其中「⑤获客 / ⑥转化资产进不去数据库、AIM 智能体检索不到」的已知缺口。

## 一、目标

把 Obsidian vault「灵感库」里的**获客 + 转化资产**（线索获客方法论、引流 SOP、私信关键词、承接路径、成交话术、复购机制）同步进数据库，让 AIM 智能体在生成内容时能检索用到——补上产品原则里「精准获客 → 完成转化」这条漏斗最薄弱的资产环。

**核心结论（先说结论）：这不是「传上去」那么简单。** 调查发现 3 大类、7 个断点。即便资产成功写进数据库，当前检索链路也几乎读不到它们（`projectId` 硬过滤，详见第三节）。必须先打通阻断，否则传了也白传。

## 二、vault 资产盘点（要传什么）

vault 路径：`/Users/xiangyu/Library/Mobile Documents/iCloud~md~obsidian/Documents/灵感库`

按复用性分三级（决定要不要进库）：

### A 级——通用可复用，应进库（推荐先传这批）

| 文件 | 性质 | 备注 |
|---|---|---|
| `00-操盘手方法论/02-线索获客打法/` 全部 21 个 .md（含 diagram 6 个、代运营30-50万全套） | 纯通用方法论 | frontmatter 已带 `reuse_scene`，去客户化，跨行业可复用 |
| `00-操盘手方法论/01-定位诊断/` 全部 3 个 | 通用诊断方法论 | 诊断入口是获客前置环节 |
| `03-成交与销售/一对一成交链路｜29800 IP商业链路设计.md` | 29800 成交 SOP | ⚠️ 与 `成交客户的流程.md` 内容**完全相同（MD5 一致）**，需去重 |
| `03-成交与销售/39,800三个月商业IP共建方案合作说明.md` | 通用合作方案模板 | |
| `03-成交与销售/39,800三个月共建方案成交推进话术.md` | 通用异议处理话术 | |
| `03-成交与销售/账号陪跑服务介绍.md` | 通用报价表（三档定价） | 无 frontmatter，需兜底 |

### B 级——特定客户一次性资料，默认不进库（或单独隔离）

| 文件 | 问题 |
|---|---|
| `03-成交与销售/2026-06-14-制造业外贸-...客户成交分析.md` | 特定客户成交分析，不可复用 |
| `03-成交与销售/合作协议/29800-...杭州宇米.md`（+同名 .docx） | 特定客户协议，含法人/统一社会信用代码 |
| `02-客户IP项目/洞见未来-财神静/` 下 5 个话术文件 | 绑定财神静（大健康/美业连锁），行业强绑定，复用度有限 |

### C 级——质量存疑，需人工清理（不建议直接进库）

| 文件 | 问题 |
|---|---|
| `05-交付方法论/引流SOP/` 全部 3 个 | 内容是外部促销文案复制粘贴（剪辑课/培训），不是自有 SOP；其中 1 个几乎空文件（58B）。疑似误放 |

### frontmatter 现状（决定同步脚本怎么读）

- **`type` 字段最稳定**，几乎每个有 frontmatter 的文件都有（值如 `成交话术`/`客户成交SOP`/`合作方案`/`excerpt`）——**建议作为分类主依据**。
- **`tags` 是主分类载体**，有两种写法都要兼容：YAML 列表式（`- tag`）和行内数组式（`tags: [a, b]`）。
- **没有 `category` 字段**（全局 0 处），也没有价值分级字段。
- **约一半文件没有 frontmatter**（引流SOP×3、定位诊断×3、财神静话术×5 等），同步脚本要能从目录/标题兜底推断 type。
- **`reuse_scene`/`subtype`/`excerpt_type`** 这三个利于复用判断的字段，只在「代运营30-50万项目/语料摘录/」7 个文件里完整存在——可作为推广的「理想 frontmatter 模板」。
- **`#Aim/知识库` 标签覆盖率约 0%**——获客/转化文件没有一个打了此标。不能靠标签筛选，要靠**目录 + type** 判断。

## 三、三大阻断 + 七个断点

### 阻断 ❶ 环境变量：`OBSIDIAN_SYNC_TOKEN` 未配置

`apps/web/src/app/api/knowledge/sync/route.ts:14-16`：同步接口靠 `OBSIDIAN_SYNC_TOKEN` 鉴权，未配置直接拒绝请求。当前 `.env.local` 里**未配置**（`.obsidian-sync.json` 里有 `syncToken` 值，但环境变量缺失）。

**断点 0**：未配 token → 接口 401/拒绝，同步根本起不来。

### 阻断 ❷ 标签闸门 + category 白名单（写不进去）

**断点 1（标签闸门）**：`scripts/obsidian-sync.ts:355` 只同步含 `#Aim/知识库` 标签的笔记。获客/转化文件没有一个打标 → 全部被 `continue` 跳过。

**断点 2（category 白名单-CLI）**：`scripts/obsidian-sync.ts:364` 只允许 5 类 `boss_experience | product_usp | customer_pain | project_case | customer_qa`，不在则强制改成 `boss_experience`。

**断点 3（category 白名单-接口）**：`sync/route.ts:82` 同样 5 类白名单，不在则归 `boss_experience`。新分类（获客/转化专用）会被改写，分类全乱。

### 阻断 ❸ 检索链路（写进去也读不到）—— 最致命

**断点 4（projectId 硬过滤，致命）**：`apps/web/src/lib/llm/embeddings.ts:247` 检索时 `projectId: input.projectId` 精确相等。但 obsidian 同步写入的 `projectId=null`（CLI 根本不传 projectId）。null ≠ 真实项目ID → SQL 层直接排除。**这个缺陷 `src/lib/style-profile.ts:31-38` 的开发者注释已明确承认。**

**断点 5（生成链路无 projectId 直接跳过）**：`src/lib/aim-agent-handlers.ts:1227` 有 `params.projectId && ...` 前置闸，生成请求没选项目时连检索都不发起。

**断点 6（向量静默失败）**：`embeddings.ts:151-160` 全新 entry 向量生成失败时静默跳过（不创建 KnowledgeEmbedding 行、不报错），而检索要求 `status:"completed"` 的向量行。`sync/route.ts:120-122` 的 `ensureKnowledgeEmbedding` 还是 fire-and-forget 吞异常。SiliconFlow 抽风时新知识会静默缺失向量。

**断点 7（新 category 被检索预过滤排除）**：`aim-knowledge-context.ts:124-128` 在非 deep 策略下，只取 `categoryBoost` 里权重>1 的 category 做 SQL 白名单。新 category 不在 boost 列表 → 被 SQL 排除（仅当全库候选全空才回退全量）。

## 四、修复方案

### 4.1 分类体系设计（新增获客/转化专用 category）

现有 5 类装不下，新增（命名遵循现有 snake_case 风格）：

| 新 category | 中文 | 覆盖资产 | 典型来源文件 |
|---|---|---|---|
| `acquisition_playbook` | 获客打法 | 线索获客方法论、引流路径、5A人群 | `00-操盘手方法论/02-线索获客打法/` |
| `lead_magnet` | 获客诱饵 | 资料包、诊断入口、私信关键词 | 定位诊断、引流SOP（清理后） |
| `deal_script` | 成交话术 | 成交推进话术、异议处理、招商话术 | `03-成交与销售/` 话术类 |
| `conversion_path` | 转化路径 | 成交SOP、产品阶梯、报价、合作方案 | `03-成交与销售/` SOP/方案类 |
| `retention_asset` | 复购资产 | 复购机制、转介绍、陪跑交付 | 成交链路里的复购部分 |

> 注：`conversion_path` 与 `IpWikiPage` 的 pageType 同名但不同模型（一个是 KnowledgeEntry.category，一个是 IpWikiPage.pageType），不冲突。

### 4.2 打通阻断（按断点）

**断点 0（token）**：在 `apps/web/.env.local` 配 `OBSIDIAN_SYNC_TOKEN`（值取自 `.obsidian-sync.json` 的 `syncToken`）。纯配置，不改代码。

**断点 1（标签闸门）**：给 A 级文件批量补 `tags: [Aim/知识库]`；或改 `obsidian-sync.ts:355` 增加「按目录/type 白名单」的第二筛选条件（不依赖标签）。

**断点 2、3（category 白名单）**：`scripts/obsidian-sync.ts:364` 和 `sync/route.ts:82` 两处的 `allowedCategories` 都加上 4.1 的 5 个新类。

**断点 4（projectId 硬过滤，致命，推荐改检索侧）**：`embeddings.ts:247` 改成「匹配传入 projectId **或** projectId IS NULL（全局知识）」：
```ts
projectId: { in: [input.projectId, null] }
```
这与 `style-profile.ts` 已有的旁路思路一致——让全局知识（obsidian 同步的、projectId=null 的）对所有项目可见。改写入侧（CLI 带 projectId）也可行，但会让通用方法论绑定到某个具体项目，不符合「方法论是全局资产」的定位，不推荐。

**断点 5（生成链路 projectId 闸）**：`aim-agent-handlers.ts:1227` 评估是否在无 projectId 时也允许检索全局知识（projectId=null 的）。需谨慎，可能引入噪音。

**断点 6（向量静默失败）**：`embeddings.ts:151-160` 改为失败时记录 `failed` 行并告警；`sync/route.ts:120-122` 不要吞异常。

**断点 7（category 预过滤）**：在 `aim-knowledge-context.ts` 的 `AGENT_PRIORITY_CATEGORIES`（content_producer/deep_copywriter）和 `aim-knowledge-strategy.ts` 的 `categoryBoost`（conversion 档）里登记新 category，否则它们在非 deep 策略下被排除。

### 4.3 去重与清理（同步前必做）

- **去重**：`成交客户的流程.md` 与 `一对一成交链路｜29800...md` 内容字节相同，按内容哈希去重，只入一条。
- **清理**：`05-交付方法论/引流SOP/` 3 个文件（外部促销文案/空文件）人工清理后再决定是否进库。
- **隔离**：B 级客户资料（财神静话术、特定客户协议）默认不进库，若要进需单独标记 `sourceType` 或加标签区分。

## 五、分阶段执行步骤

### 阶段 0：最小验证（打通后端，不动 vault）
目标：验证「写进去能被检索到」这条链路通。
1. 配 `OBSIDIAN_SYNC_TOKEN` 环境变量（断点 0）。
2. 改 `embeddings.ts:247` 的 projectId 兼容 null（断点 4）。
3. 手动造 1 条 `projectId=null`、`sourceType=obsidian` 的测试知识，确认 content_producer 能检索到。
4. **只有这一步验证通过，后续才有意义**——否则后面全白做。

### 阶段 1：打通同步管线
5. 扩 `obsidian-sync.ts:364` + `sync/route.ts:82` 的 category 白名单（断点 2、3），加 4.1 的 5 个新类。
6. 在 `obsidian-sync.ts` 加「目录/type 白名单」第二筛选（断点 1），让获客/转化目录不依赖 `Aim/知识库` 标签也能进。
7. 登记新 category 到检索优先级配置（断点 7）。
8. 修向量静默失败（断点 6）。

### 阶段 2：上传 A 级资产
9. 清理去重（4.3）。
10. 跑 `pnpm tsx scripts/obsidian-sync.ts --force`，上传 A 级获客/转化方法论。
11. 验证：随机抽 3 个场景（写成交文案 / 写引流钩子 / 写私信承接），确认 AIM 能引用到刚传的方法论/话术。

### 阶段 3：完善（可选）
12. 推广 `reuse_scene` 等 frontmatter 模板，提升资产复用元数据质量。
13. 决定 B 级客户资料是否进库及隔离策略。
14. 评估断点 5（无 projectId 时是否检索全局知识）。

## 六、风险与注意事项

- **断点 4 的修复是全局性的**：让所有 `projectId=null` 的知识对全部项目可见。需确认库里现有 null 知识（obsidian 同步的 25 条）不会引入跨项目噪音——它们本就是通用方法论，应可接受，但要 review。
- **不要为图快跳过阶段 0**：核心矛盾是「检索链路读不到」，不是「传不上去」。先验证检索通，再传。
- **分类命名**：4.1 的新 category 命名需你确认（尤其 `conversion_path` 与 IpWikiPage pageType 同名是否介意）。
- **vault 是 iCloud 同步的**：批量改 frontmatter 打标签时，注意 iCloud 同步延迟和冲突。

## 七、相关文件清单

- 同步脚本：`mingyuan/scripts/obsidian-sync.ts`（断点 1、2）
- 同步接口：`mingyuan/apps/web/src/app/api/knowledge/sync/route.ts`（断点 0、3、6）
- 检索核心：`mingyuan/apps/web/src/lib/llm/embeddings.ts`（断点 4、6）
- 检索上下文：`mingyuan/apps/web/src/lib/aim-knowledge-context.ts`（断点 7）
- 知识策略：`mingyuan/apps/web/src/lib/aim-knowledge-strategy.ts`（categoryBoost）
- 生成链路闸门：`mingyuan/apps/web/src/lib/aim-agent-handlers.ts:1227`（断点 5）
- 已有旁路先例：`mingyuan/apps/web/src/lib/style-profile.ts:31-38`
- 第二大脑设计：`mingyuan/docs/second-brain-and-aihot-integration.md`
- 数据模型：`mingyuan/apps/web/prisma/schema.prisma`（KnowledgeEntry:278, projectId 可空）
