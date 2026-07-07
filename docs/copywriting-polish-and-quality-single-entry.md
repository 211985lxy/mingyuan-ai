# 文案润色与质检：唯一入口说明

> 本文档记录 2026-07-03 的死代码清理与同类项合并结论，防止「两套系统同时跑导致跑偏」。
> 修改润色 / 质检相关功能前，先读这篇，确认改的是唯一活路径。

## 背景：曾经的双系统问题

历史上润色（polish）和质检（quality check）各有两套实现，一套活、一套死，
但死代码仍在仓库里被维护，导致：

- 新功能（如 imitate 跨行业仿写）被加到了**死代码**上，界面根本触达不到，等于没上线；
- 维护者每次改动都要先猜「到底改哪一套」；
- 两套设计哲学不同（重写型 vs 精修型），输出不一致。

## 清理结论：唯一入口

### 润色 —— 唯一入口 `/api/scripts/polish`

涉及文件：

- `src/app/api/scripts/polish/route.ts` —— **唯一活路径**，三种模式
- `src/lib/api/client.ts` 里的 `polishScript()` —— 前端唯一调用方
- `src/lib/style-profile.ts` 里的 `getStyleProfileBlock()` —— 用户级写作风格档案（这个 IP 的真实文风），做润色底色
- `src/lib/style-guide-config.ts` 里的 `getStylePromptBlock()` —— 12 种内置风格，供仿写模式做本次腔调覆盖

**三种模式**（请求里的 `mode` 字段）：

1. **校对**（`proofread`）—— 轻量校对（错别字、标点、语病），生成后自动跑，不改结构和意思。
2. **精修**（`polish`）—— 按四维弱点（AI味 / 编辑质量 / 吸引力 / 逻辑）精修，保持原意和结构。
3. **仿写**（`imitate`）—— **跨行业爆款仿写**：拿一条对标爆款的钩子、节奏、结尾结构逻辑，用当前 IP 的知识库和写作风格档案，重写成同结构、本行业内容的新稿。可选 12 风格覆盖。
   - 界面入口：`/aim` 对标编辑面板（BenchmarkEditorPanel）头部的「仿写」按钮。
   - 必须提供对标爆款原文（`viralSourceText`）和草稿（`content`）。

> ⚠️ 不要再新增润色路径。已删除的废弃实现见下方「已删除」一节。

### 质检 —— 唯一入口 `quality-gate.ts`

涉及文件：

- `src/lib/quality-gate.ts` 里的 `runQualityCheck()` —— **唯一活路径**，四维 + 自动重写最多 3 次
- `src/lib/ai-taste-detector.ts` —— AI 味独立检测引擎（93 个禁词 + 句式评分）
- `src/app/api/scripts/quality-check/route.ts` —— 网络请求入口

四个维度：编辑质量、AI 味、吸引力、逻辑。
不及格时触发自动重写（最多 3 次）。

## 已删除（不要再复活）

- `src/lib/aim-agents/`（整个目录）—— 废弃的 `polishCopy`（改文案）、`writeScript`（写脚本）、`runQualityCheck`（质检）、`repurposeContent`（多平台派生）。其中 `polishCopy` 的仿写逻辑已迁移到活路径 `/api/scripts/polish`，质检逻辑无保留价值（活路径更强）。
- `src/lib/aim-agents/script-agent.ts` 里的 `loadProjectKnowledge`（读取项目知识库）已迁移到 `/api/scripts/polish/route.ts`，供仿写模式注入项目知识库。
- 三个孤立测试已删除（`polish-copy-styles` / `polish-copy-imitate-mode` / `script-structure-switch`），其中风格配置的测试保留为 `style-guide-config.test.ts`。

## 内容生产官的智能体 ID 统一

内容生产官曾有两套 ID（界面层用 `ip_video`、后台处理层用 `content_producer`），现已统一为 `content_producer`。旧的 `ip_video` 作为向后兼容别名保留，三层兜底：

- `src/lib/aim-ui-config.ts` 里的 `normalizeAimAgentId()` 把 `ip_video` 归一化成 `content_producer`；
- `src/lib/aim-agent-handlers.ts` 里的 `AGENT_ID_ALIASES` 在调度层兜底；
- `src/lib/agent-api-auth.ts` 读取 API 密钥权限和校验访问时做归一化。

这样旧的书签链接、旧的外部接口调用、旧的数据库历史记录都能正常工作。
数据库迁移 `20260703120000_normalize_agent_id_content_producer` 把存量的 `ip_video` 记录归一化。
