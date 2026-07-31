## Why

爆款文案复刻是内容创作者最直接的增长杠杆之一：找到 10 篇已经跑通的爆款对标文案，提炼它们的共同结构（开头钩子、核心内容段、产品介绍、行动号召等），再结合自己的 IP 人设、产品卖点和品牌调性，批量产出结构一致但表达原创的新文案。

当前内容台只能逐条粘贴逐条生成，缺少「批量输入对标 → 提炼结构 → 批量生成」的闭环。用户要么手动总结结构、要么凭感觉模仿，无法规模化复刻爆款，也无法把"为什么爆"沉淀成可复用资产。

## What Changes

- 新增「批量文案复刻」能力：支持一次性粘贴多份对标文案，系统用 LLM 提炼出通用结构模板（有序段落 + 段落用途说明）
- 新增结构模板持久化：每份提取出的模板保存为可复用资产，记录来源文案数量、段落组成、原文快照
- 改造内容生成链路：生成阶段把结构模板 + 项目知识库（IP 人设 / 产品卖点 / 品牌调性）+ 选题方向一起注入 LLM，按数量参数批量产出结构一致的新文案
- 新增两阶段编排：支持「只提取结构」「只生成文案」分步执行，也支持「一键提取 + 生成」串联
- 新增批量输出生成：用户可指定生成数量（如 10 条），单次返回多条结构一致但表达差异化的文案

## Capabilities

### New Capabilities
- `batch-script-replication`: 批量输入对标文案、结构模板提取与持久化、基于模板 + 知识库的批量文案生成

### Modified Capabilities
- `content-generation-pipeline`: 生成入口接受「结构模板 ID + 数量参数」，生成的每条文案记录所用的模板 ID
- `content-first-journey`: 在内容创作台提供批量工作室入口，从对标爆款起步

## Impact

- **代码**：新增 `lib/aim/script-structure-extractor.ts`（结构提取）、`lib/aim/script-structure-generator.ts`（模板生成）、`lib/aim/script-structure-store.ts`（CRUD）；新增 `components/aim/batch-script-studio.tsx`（前端工作室）
- **API**：新增 `POST /api/aim/script-structures`（提取 + 保存）、`GET /api/aim/script-structures`（列表）、`GET/DELETE /api/aim/script-structures/:id`（详情 / 删除）、`POST /api/aim/script-structures/:id/generate`（按模板生成）、`POST /api/aim/script-structures/pipeline`（一键串联）
- **数据库**：扩展 `VideoStructure` 模型，新增 `origin`（结构来源：extracted/manual）、`sourceScriptsCount`、`sourceScriptText`、`userId`、`projectId` 字段；批量产出的文案落库到草稿箱
- **外部系统**：调用 LLM 进行结构提取（JSON mode）和批量生成；调用 `buildAimKnowledgeContext` 检索项目知识库
- **用户体验**：内容台入口新增「批量文案工作室」技能按钮，弹窗内三 Tab（提取结构 / 生成文案 / 一键串联）

### 假设与待确认

- **输入方式**：假设以多行文本粘贴为主（每行一条对标文案，或多段以空行分隔），暂不支持文件上传解析
- **生成数量上限**：假设单次最大 10 条（受 LLM 单次输出长度限制）
- **业务边界（用户明确表示未明确）**：本规格按"内容创作辅助工具"定位设计，不引入审批 / 发布 / 数据回流环节；后续若需扩展为完整爆款复刻流水线（含数据回读、A/B 测试、效果归因），需另立 change
- **结构通用性**：假设结构模板在本项目内通用，不做跨项目共享
- **原创性**：依赖 LLM temperature 控制差异化，不引入查重 / 原创度检测
- **与现有实现的关系**：当前已有原型实现（`BatchScriptStudio` 三 Tab 弹窗 + 5 个 API 路由），本规格用于固化契约、补全边界场景与验收清单
