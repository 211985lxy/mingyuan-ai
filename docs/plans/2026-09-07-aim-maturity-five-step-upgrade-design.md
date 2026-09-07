# AIM「AI 原生成熟度」五步升级 · 设计总纲

> 日期：2026-09-07
> 状态：①-⑤ 已全部实现首版（2026-09-08，feat/aim-workbench-experience-upgrade 分支，待 CI 门禁与合并评审）
> 范围：mingyuan 主仓（apps/web）
> 依据：2026-09-07 代码实证（非臆测，所有论断附文件路径）

---

## 0. 背景与判断修正

本计划源自一次「AI 原生成熟度」评估。评估中的两条论断经代码核实后修正：

| 原论断 | 代码事实 | 修正后的问题定义 |
|---|---|---|
| HITL 节点未在产品固化 | `approval-decision-store.ts` / `review-cycle-store.ts` / `workflow-governance.ts` / 高风险审批路由 / `project-asset-candidate-review.tsx` 均已存在 | HITL 未内联进对话轴——审批在生成流外部页面完成，chat 链路零 approval 钩子 |
| 能力型 API 仅单一对话入口 | `api/aim/` 已有 45 个路由，`docs/architecture/api-inventory.json` 有元数据 | 契约不清、边界发散——无业务域归类、无 zod 输入契约、对话轴与能力路由两套入口并存 |

成立的三条：入口嵌于 dashboard（非首屏对话）；Prompt 散落（60+ 文件、90+ 硬编码字符串，无 registry）；组织协同未显性化。

**五步演进顺序（修正版，先里子后面子）：**
① Prompt 一等资产化 → ② 能力 API 契约收敛 → ③ HITL 内联对话轴 → ④ 首屏即对话 → ⑤ 组织协同显性化

理由：① 是其他四步的公共前置（能力契约引用 prompt 版本、HITL 审批对象是 prompt 产出、评估集挂在 prompt 上）；且它直接违反既有纪律「不让多份 Prompt 同时成规则正本」。④ 是结果不是起点，提前做只会得到换皮 chatbot。

---

## ① Prompt 一等资产化（派工级详细）

### 目标
90+ 硬编码 prompt 字符串 → 可版本化、可评估、可热更的一等资产；运行时按 key+version 加载；任何 prompt 变更可追溯、可评测、可回滚。

### 数据模型：新增 `apps/web/prisma/prompt.prisma`

```prisma
model PromptTemplate {
  key         String          @id
  domain      String
  description String?
  versions    PromptVersion[]
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
}

model PromptVersion {
  id          String         @id @default(cuid())
  templateKey String
  template    PromptTemplate @relation(fields: [templateKey], references: [key])
  version     Int
  content     String
  type        String         // system | function | inline
  status      String         @default("draft") // draft | qualified | active
  fixtureKey  String?        // → operating.prisma EvalFixtureVersion.fixtureKey
  createdAt   DateTime       @default(now())

  @@unique([templateKey, version])
}
```

迁移命名遵循 `YYYYMMDDHHMMSS_add_prompt_registry` 惯例。与 `operating.prisma` 的 `EvalFixtureVersion`（行 162）通过 `fixtureKey` 弱关联。

### 运行时：新增 `apps/web/src/lib/prompt/registry.ts`

```ts
interface PromptRegistry {
  load(): Promise<void>;
  get(key: string, opts?: { version?: number; status?: string }): string;
  getMessages(key: string, userPrompt: string, opts?): CompletionOptions["messages"];
  registerSeed(seed: Record<string, string>): void; // DB 加载失败时的兜底
}
```

- 选版优先级：`active > qualified > draft`；显式 `version` 优先于 status。
- **加载失败必须走 registerSeed 兜底，不阻塞发布**（降级方案，见 §风险）。

### 集成点（不改 LLMClient 签名）

- `src/lib/llm/client.ts` 的 `CompletionOptions.messages` 注入方式不变。
- 替换散落的私有 `complete(systemPrompt, userPrompt)` 封装（`unified-content-execution.ts:10` 等）为 `registry.getMessages(key, userPrompt)`。
- prompt key 命名与 `llm/agent-router.ts` 的 AGENT_ROUTES（行 81）同域：`<domain>.<capability>.<variant>`，如 `aim.agent.work_editor`、`marketing.analysis.transcript_polish`。
- 评估挂接：`PromptVersion.fixtureKey` 指向 EvalFixtureVersion；status 升 `qualified` 的前置是绑定评测通过（判分逻辑复用 `aim-harness/eval-rubric.ts:buildRubricPrompt`）。

### 迁移分批（每批 1 PR + seed 脚本 + 可反转）

| 批次 | 范围 | 代表文件 |
|---|---|---|
| 批0 | 常量型 6 处 | `knowledge-entity-extractor.ts:53`、`marketing-analysis.ts:10`、`comment-radar/analyzer.ts:65`、`transcript-polish.ts:9`、`competitor-analysis/analyzer.ts:14`、`aim/meeting-insight-extract.ts:51` |
| 批1 | 函数拼接型 | `aim-agent-work-editor.ts`、`aim-agent-content-review-prompts.ts`、`aim-agent-content-retro-prompts.ts`、`aim/services/script-polish-prompts.ts`、`aim/semantic-task-understanding.ts`、`quality-gate.ts`（8 个 *_PROMPT） |
| 批2 | API 路由内联 | `app/api/brief/ai-fill/route.ts:54`、`app/api/admin/knowledge/distill/route.ts:38` 等 |

### 验收标准
1. registry 单测：选版优先级、seed 兜底、getMessages 结构正确。
2. 批0 完成后 `grep "你是" apps/web/src/lib/{批0 文件}` 无字面 prompt 残留。
3. 迁移可反转（seed 脚本逆向导出 DB → 字符串）。
4. 回滚演练：每批打 tag，registry 故障时 seed 兜底出稿不退化。

### 改动半径
60+ 文件改 import 调用、1 个 prisma 新文件、1 个迁移、1-2 个 lib 新文件。

---

## ② 能力 API 契约收敛

- 新增 `src/lib/api/contracts.ts`：能力描述格式（domain / input zod schema / output / auth / 是否可编排）。
- 扩展 `scripts/api-inventory.mjs`：生成的 `api-inventory.json` 增加 domain 与契约语义字段。
- 45 个 `api/aim/` 路由分批补 zod input；区分「能力型（可被对话轴编排）」与「管理/CRUD 型」。
- 验收：全路由有 domain 归类 + 契约；inventory 再生成含新字段；zod 拒错单测。
- 半径 3-5 文件 + 路由逐批。依赖①（能力契约引用受治理的 prompt 版本）。

## ③ HITL 内联对话轴

- 改 `app/api/aim/chat/route.ts`（executeAimRun 加 gate）与 `lib/aim-harness/domain-executor.ts`。
- 新增 `lib/aim/hitl-gate.ts`：高风险动作（客户可见内容、写知识库、对外发送）在对话流内返回 `approval_required` 事件。
- 复用 `approval-decision-store.ts` / `approval-completion.ts`（批准 + promote 才写 KB 的既有逻辑不动）。
- 前端 `features/aim/hooks/use-aim-workbench.ts` 处理 `approval_required`，对话内内联「批准 / 驳回 / 修改后再发」。
- env 开关默认 off 灰度；纪律不变：AI 不自动向客户发消息/报价/承诺。
- 验收：高风险动作返回 approval_required；审批后写 KB；模拟链路测试。半径 5-7。依赖①②。

## ④ 首屏即对话

- 改 `app/(dashboard)/aim/page.tsx`：默认渲染 workbench 而非 landing；`use-aim-workbench.ts` 首屏初始化；`AimEntrySwitch` 默认分支切换。
- env flag `AIM_LANDING_DEFAULT` 一键回滚。
- 验收：/aim 直显对话（e2e）；dashboard 其他页面不受影响。半径 3。依赖③（首屏对话必须已含 HITL 内联，否则高风险动作无路可走）。

## ⑤ 组织协同显性化

- `app/(dashboard)/layout.tsx` 加 org provider；`AppSidebar` 显组织/角色（李相宇=业务决策+审核；内容增长负责人=发布/归因/回填；AI 系统负责人=飞书状态+AIM 执行+知识资产）。
- 必要时新增 `org.prisma`（org / team / member）。additive，可回滚。
- 验收：多角色视图渲染 + 权限门。半径 5-8。依赖④。

---

## 分工

| 方 | 工作包 |
|---|---|
| **Z-Code**（边界清晰单包，不决定发布） | ①的各 domain 批量迁移（模式由 Codex 定后逐批派工）、②契约注册表 + inventory 脚本扩展、④ UI flag 切换 |
| **Codex**（架构/审查/门禁/部署） | ①registry + prompt.prisma + migration 主线、③chat 轴 gate 架构、⑤org 架构与部署；每批 PR 的完整门禁与 Git 合并 |

## 风险与降级

| 步骤 | 风险 | 降级方案 |
|---|---|---|
| ① | registry 加载失败阻塞出稿 | registerSeed 兜底，不阻塞发布 |
| ② | zod 强制破坏存量调用 | 降级为仅文档契约，zod 灰度开启 |
| ③ | gate 误判阻断正常链路 | env 默认 off，逐域灰度 |
| ④ | 用户路径突变 | env flag 回滚 |
| ⑤ | 组织建模过度设计 | additive，可延后，先文档化角色分工 |

## 发布纪律（沿用既有）

- 明确 Git SHA + standalone 构建 + 回滚点；`origin/main` 唯一候选正本。
- 每步独立 PR 序列，不跨步混合提交。
- 凭据只存服务器环境文件，不进 Git/文档。

---

## 实现记录（2026-09-08 · Z-Code 全流程开发）

| 步骤 | commit | 交付要点 | 回滚开关 |
|---|---|---|---|
| ① Prompt 资产化 | ffad9ab2 / d773d0a3+30de80ea / 5fa90d05+f5173156 | 批0 六常量 + 批1 廿四函数拼接型 + 批2 七路由内联 + 批3 扫尾 = **41 key 全量入册**；等价性由迁移前快照逐字节比对证明 | seed v1 逐字兜底，DB 不可用零退化 |
| ② 能力 API 契约 | 2c03698a | `lib/api/contracts.ts` 契约注册表（domain/kind/orchestratable/zod）；inventory 266→267 路由全量 domain/kind 归类；4 个 LLM 能力路由 zod 拒错 | 契约注册表 additive |
| ③ HITL 内联对话轴 | 963ebc7e / 1f534103 | `lib/aim/hitl-gate.ts`：对外发送/写知识库工具动作挂起等审批；对话内回复「批准/驳回」即决策；复用审批决策存储幂等落记录 | `AIM_HITL_INLINE_ENABLED` 默认 false（关闭时行为与迁移前一致） |
| ④ 首屏即对话 | 3224c93f | /aim 默认直显对话工作台，显式入口参数不受影响 | `NEXT_PUBLIC_AIM_LANDING_DEFAULT="entry"` 回滚入口页 |
| ⑤ 组织协同显性化 | fe7ca5d5 | 组织角色矩阵（业务决策/内容增长/AI 系统）+ orgRoleCan 权限前向判断 + 侧栏「组织协同」区块；org.prisma 按设计缓后 | additive，纯展示层 |
| 附加：Fish Audio 落库 | f2265fa7 | VoiceSynthesisRecord 表 + 幂等迁移 + TTS 落记录 + GET /api/voice/history；落库失败不阻塞出声 | additive |

### 验收（四层）
- 代码层：全量单测 **3244 passed**（473 文件）；`tsc --noEmit` 零错误；改动文件 ESLint 零新增告警；架构/体积门禁（既有存量未新增超标文件）。
- 构建层：`pnpm build` 生产构建通过（含 /aim 路由与 voice-studio）。
- 集成层：本次为代码层+构建层完成；涉及 LLM/飞书/DB 的真实联调按纪律须另行验证后才能称业务完成。
- 上线层：未部署。分支待推送 → CI 门禁 → 合并评审，发布决策按流程留给业务负责人。

### 留后事项
- 批3 后仍有零散 lib prompt（`buildPolishInstructions` 条件指令片段等，设计文档已注明保留理由）。
- HITL 审批的飞书卡片通知、org 多用户后端建模（org.prisma）为 P1 候选。
