# ADR-002: 命名方法论资产（MethodologyProfile）

- 状态: 已接受
- 日期: 2026-07-22
- 决策者: AIM 团队

## 背景

AIM 当前有三处「方法论」语义，彼此不互通，且用户无法在一次创作中显式指定一份外部方法论（如「徐沪生创作方法论」）作为生成依据：

- `AgentMethodology`（aim.prisma）—— 全局 3-key 系统方法论（ip_copywriting / business_diagnosis / event_storytelling），后台编辑、DB 优先 + 文件兜底加载，无 userId / projectId 维度、无版本历史。
- `IpWikiPage.pageType = viral_methodology` —— 项目级「爆款打法」页，受 6 页上限截断（`ip-wiki/context.ts` 的 `MAX_PAGES_IN_BLOCK`）。
- `KnowledgeEntry.category = writing_style_profile` —— 写作风格档案，复用知识库表，无独立方法论语义。

需求：让用户在创作时显式选择一份命名方法论，稳定注入到所有生成入口、按 ID 直读（不依赖向量召回）、可版本化追溯、未选择时不自动注入，且项目事实优先于方法论中的案例与假设。

## 决策

### 真源划分

| 内容 | 真源 |
|---|---|
| 通用命名方法论（可复用、跨项目的方法与框架） | `MethodologyProfile` + `MethodologyProfileVersion`（新增） |
| AIM 系统内置方法论（3 份固定内容） | `AgentMethodology`（保持现状，不动） |
| 原始书摘、案例、方法论来源素材 | `KnowledgeEntry`（保持现状，不作为方法论载体） |
| 写作风格档案 | `KnowledgeEntry` 的 `writing_style_profile` category（保持现状，与方法论分开建模） |
| 项目级爆款打法 | `IpWikiPage.viral_methodology`（保持现状，不升级为通用方法论库） |
| 「本项目如何使用某方法论」的项目应用说明 | IP Wiki（Phase 7，本次不做） |

`MethodologyProfile` 是通用命名方法论的唯一权威载体。IP Wiki 不保存通用方法论全文。

### 命名契约（后续所有数据库、接口、前端字段以本表为准）

| 角色 | 命名 | 出现位置 |
|---|---|---|
| 请求层（用户/前端显式选择） | `methodologyProfileIds?: string[]` | 三入口请求体、客户端 zod schema |
| 冻结结果（planner/assembly 解析后的策略） | `methodologyPolicy` | `AimRunSpec` |
| 上下文内部块（进 prompt 的编译内容） | `selectedMethodology` / `selectedMethodologyBlock` | `PreparedAimContext.blocks`、预算系统 |

### 版本策略

- 沿用 `IpWikiPage` 的 `version + status(active|archived)` 单 active 不变量范式。
- 已被生成记录引用的版本不允许原地修改；修改方法论即创建新版本（version+1）。
- 只有 `published` 版本可进入生成链路；`draft` 版本不参与。
- `scope = user` 的私有方法论必须校验资产所属用户，跨用户越权读取返回明确错误。
- 每条生成记录的 snapshot 已含 `runSpec`（含 `methodologyPolicy`）+ `contextManifest`（含 methodology source），保证历史版本可复现。

### 路由规则（单一决策源）

```
前端/API 显式 methodologyProfileIds
  > 用户文本精确命中 profile.name / aliases（精确匹配，不用 LLM 猜测）
  > 不选择（none）
```

MVP 限制：最多 1 个主方法论、不支持权重混合、不做模糊语义匹配。误写（如「徐浮生」）不自动绑定，可由人工确认为 alias 后纳入精确匹配集合。

方法论的解析统一在 `prepareAimContext` / `assembleAimChatContext`（即上下文装配阶段）通过共享函数 `resolveMethodologyPolicy` 完成；planner 仍保持纯同步，只冻结入参。三入口（generate / chat / scripts）一律调用共享的 `resolveMethodologyPolicy` + `buildMethodologyProfileBlock`，禁止任何入口自行查 `MethodologyProfileVersion` 或写名称匹配。

### 上下文优先级（方法论不得覆盖客户资料）

```
系统安全及智能体硬规则
  > 用户本次明确要求
  > 项目 IP Wiki 和项目事实
  > 本次指定命名方法论（selectedMethodology）
  > AIM 基础方法论（AgentMethodology）
  > 普通知识召回和灵感
```

`selectedMethodologyBlock` 作为独立预算块，不与系统方法论争预算；过长时按独立预算裁剪，不挤掉项目核心事实。

## 后果

- 正面：用户可显式、稳定、可追溯地应用一份外部方法论；三入口行为一致；方法论编辑后 `contextHash` 真正反映变更（连带修复存量 manifest 缺口）。
- 负面：新增两张表 + 共享领域函数 + 三入口透传链路；预算系统需登记新块。
- 风险：三入口装配链路差异大（scripts 完全不走 harness），统一接入需谨慎不破坏现有 gating。通过功能开关 `AIM_NAMED_METHODOLOGY_ENABLED` 灰度、附加式迁移、共享函数单一入口缓解。
