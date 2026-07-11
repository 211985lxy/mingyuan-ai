# AIM 认知编排器 + 高客单信任型升级 — 设计方案（Sprint 1 + Sprint 2）

> 状态：草案，待评审
> 范围：本次只实现 **Sprint 1（认知层最小版）+ Sprint 2（业务结果链）**
> 依据：`pasted-text-20260711-084422-76dfaaba.txt`（高客单升级任务书）+ 后续《AIM 同步升级补充指令》
> 原则约束：零 Mock 铁律（禁止硬编码假数据）、不得新建平行系统、不得覆盖未提交改动（当前 `main` 工作区干净）

---

## 1. 背景与问题

明动 AIM 当前存在两层断裂，两份需求文档实际指向同一套修复：

1. **认知断裂**：所有 AIM 生成都按「正式交付」一视同仁，没有区分任务风险。改标题这种低风险任务和高客单商业诊断这种高风险任务，用同一套交付壳子。高风险任务在关键资料缺失时仍可能输出「看起来很确定」的方案。
2. **结果断裂**：`TopicSelection`（选题批次）与 `AimGeneration`（成片记录）之间**没有任何结构化关联**——从选题进入 AIM 时只传 `topicTitle`，选了哪个选题、是第几号、最终有没有发布、发布了带来什么结果，全链路丢失。复盘数据只塞在 `retroSnapshots.actualData` 自由文本里，且未填写被默认成 0。

### 现状代码基线（已核对，复用而非重建）

| 能力 | 现有实现 | 位置 |
|---|---|---|
| 选题生成（4 卡片 + scoreBreakdown + sourceHighlights） | `generateTopicCards` + `topic-source-builders` | `lib/topic-generation.ts`, `lib/topic-source-builders.ts` |
| 选题选用（原子 CAS 写 selectedIndex） | `POST /api/topics/[id]/select` | `app/api/topics/[id]/select/route.ts:29` |
| 选题 → AIM 跳转（**只传 title/rationale，不传 id**） | `jumpToAim` | `app/(dashboard)/topic-planning/page.tsx:587` |
| AIM 成片记录创建 | `saveAimGenerationRecord` | `lib/aim-agent-handlers.ts:1916-1936` |
| 发布前判断 / 发布 / 复盘写入 | `PATCH /api/aim/history/[id]` | `app/api/aim/history/[id]/route.ts:113-131` |
| 交付状态栏「任务/依据/状态/下一步」 | `DeliveryContractStrip` + `buildAimDeliveryContract` | `app/(dashboard)/aim/page.tsx:912`, `lib/aim-delivery-contract.ts` |
| 鉴权 / 用户隔离 | `withUserAuth` / `authenticateRequest`，所有 where 带 `userId` | `lib/user-auth.ts` |

**伪精确评分源头**（必须在本设计内消除）：
- `lib/topic-generation.ts:391` `normalizeScoreBreakdown`：缺分时默认填 `80/80/70/75/80`
- `lib/topic-generation.ts:350` `fallbackTopicCards`：硬编码 `76/78/82/74/84` 且 `success:true`
- `lib/topic-daily-report.ts:37` `scoreOf`：缺分当 0

---

## 2. 总体架构（五层，本次实现前两层 + 第五层的最小入口）

```
┌─ 协作认知层 (Sprint 1 新增) ─ TaskSpec：判断风险/模式/事实/缺口/假设
│   ↓ 产物挂在 AimGeneration.taskSpec
├─ 业务判断层 (本次：选题 + 成片的字段收窄) ─ 目标客户/信任类型/老板证据/客户动作
├─ 执行层 (复用，不改) ─ 现有 content_producer / business_diagnosis 等智能体
├─ 结果学习层 (Sprint 2 新增) ─ ContentOutcome 结构化结果 + 反馈事件扩展
└─ 治理层 (本次：前端只读展示，不建知识库) ─ 事实/推断/假设的可见标签
```

**Sprint 3（统一反馈学习）、Sprint 4（探索模式）本次不做**，仅在数据模型上预留不阻断的扩展点。

---

## 3. 数据模型

### 3.1 统一 TaskSpec（满足两份文档字段重叠区）

新增 `AimGeneration.taskSpec Json?`。**一个 JSON 装下**原任务书的「内容任务类型 + 老板专属资产 + 发布前判断」与补充指令的「TaskSpec 业务字段（§8）」。结构：

```prisma
model AimGeneration {
  // ... 现有字段全部保留 ...
  taskSpec        Json?     // 新增：协作认知 + 业务判断统一结构（见下）
  topicSelectionId String?  // 新增：关联 TopicSelection.id（来源选题批次）
  selectedTopicIndex Int?   // 新增：采用的第几号候选（0-3）
}
```

> 注意：`topicSelectionId` 作为 String 列名已存在于其它模型（指代「选题批次 id」），此处语义一致，不设外键约束（Prisma mysql，跨表无强约束符合现状），靠 `userId` 隔离 + 查询时校验归属。

`taskSpec` 的运行时类型（`lib/task-spec.ts`）：

```ts
type CollaborationMode =
  | "direct_delivery"      // 低风险：直接交付
  | "assumption_delivery"  // 中风险：带假设交付
  | "feedback_iteration"   // 反馈迭代（本次只占位，不在 UI 走通完整流程）
  | "discovery_exploration"// 高风险：探索（本次只占位）

interface TaskSpec {
  goal: string
  mode: CollaborationMode
  riskLevel: "low" | "medium" | "high"
  // —— 业务判断层（原任务书 §3/§4 + 补充 §8 的合并字段）——
  targetCustomer?: string        // 目标客户
  realProblem?: string           // 击中的真实业务问题
  contentTask?: ContentTask      // 内容任务类型（单选）
  trustAssetType?: TrustAsset    // 信任资产类型
  exclusiveEvidence?: string     // 老板专属证据（案例/原话/经历）
  desiredAction?: DesiredAction  // 希望产生的客户动作
  dealPath?: string              // 当前成交路径（来源：ClientProject.offer + deliveryGoal 拼接，无则 undefined）
  // —— 认知层：事实/缺口/假设（补充 §2/§3）——
  knownFacts: Array<{ statement: string; source?: string }>  // 仅来自真实上下文，不臆造
  unknowns: string[]
  assumptions: Array<{ statement: string; impact: "low" | "medium" | "high" }>
  // —— 元信息 ——
  rationale?: string             // 选题依据（原 topicRationale 归位）
  nextAction: string
  classifiedBy: "rule" | "llm" | "rule_fallback"  // 分类来源标签
  classifiedAt: string
}
```

枚举（`lib/task-spec.ts` 导出常量数组，与 `topic-validation.ts` 风格一致）：
- `ContentTask = 吸引目标客户 | 建立专业信任 | 展示真实案例 | 筛选不适合客户 | 解释问题与方法 | 推动咨询行动`
- `TrustAsset = 案例 | 资历 | 过程 | 观点 | 客户反馈 | 交付方法`
- `DesiredAction = 评论 | 私信 | 领取资料 | 预约诊断 | 进一步咨询`

**铁律**：`knownFacts` 必须可追溯到上下文（知识库标题、项目字段、选题 sourceHighlights、用户输入），由**确定性代码**抽取，不得由 LLM 编造。LLM 只产出 `mode/riskLevel/unknowns/assumptions` 这类「判断」类字段。

### 3.2 ContentOutcome（结构化发布结果，Sprint 2）

新模型 `ContentOutcome`，与 `AimGeneration` 1:N（同一内容允许 7/14/30 天多次更新，但**业务结果最新值只取一条语义**——见下「去重」）。

```prisma
model ContentOutcome {
  id                  String   @id @default(cuid())
  userId              String
  generationId        String   // → AimGeneration.id
  topicSelectionId    String?  // 透传，便于按选题聚合
  projectId           String?
  platform            String?  // douyin | wechat | ...
  publishedAt         DateTime?
  collectedAt         DateTime @default(now())  // 本次采集的时间点
  collectWindowDay    Int      // 7 | 14 | 30（采集窗口标签）

  // 第一组：商业结果（全部 nullable，未填写不得为 0）
  qualifiedCommentCount Int?
  dmCount               Int?  // 有效私信
  qualifiedLeadCount    Int?  // 合格线索
  appointmentCount      Int?  // 预约咨询
  dealCount             Int?
  revenue               Decimal? @db.Decimal(14, 2)

  // 第二组：内容信号（全部 nullable）
  views       Int?
  likes       Int?
  comments    Int?   // 全部评论数（区别于合格评论）
  saves       Int?
  shares      Int?

  // 第三组：用户反馈（自由文本）
  audienceFeedback String? @db.Text  // 哪类人在问/问了什么/是否出现目标客户原话/是否带来错误人群
  userVerdict      String? @db.Text  // 用户对这条的判定

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user       User          @relation(fields: [userId], references: [id])
  generation AimGeneration @relation(fields: [generationId], references: [id], onDelete: Cascade)

  @@unique([userId, generationId, collectWindowDay])  // 同一内容同一窗口只一条
  @@index([userId, collectedAt])
  @@index([generationId])
}
```

**去重保证**：`@@unique([userId, generationId, collectWindowDay])` + upsert，使「保存可重复执行，不产生重复记录」（原任务书 §二.2 要求）。

### 3.3 迁移

单一迁移 `20260711100000_add_task_spec_and_content_outcome`：
- `AimGeneration` 加 `taskSpec Json?`、`topicSelectionId String?`、`selectedTopicIndex Int?`（均 nullable，向后兼容）。
- 新建 `ContentOutcome` 表 + 索引 + unique。
- 不动任何现有列，不改现有迁移。

---

## 4. Sprint 1：认知层最小版

### 4.1 TaskSpec 分类函数（`lib/task-spec.ts`，新建，纯函数 + 可选 LLM）

**两阶段**，确保 LLM 失败可降级（验收 §10）：

**阶段 A — 确定性骨架（绝不失败）**：`buildTaskSpecSkeleton(input)`
- 输入：`{ agentId, taskType, rawInput, project?, topicSelection?, knowledgeTitles[] }`
- 确定性产出：
  - `goal`：从 rawInput / topicTitle 推导的简述。
  - `riskLevel`：规则映射——
    - 低：`taskType ∈ {polish_copy, repurpose}` 或 `agentId = free_copywriter` 或局部改写关键词。
    - 高：`agentId ∈ {business_system_diagnosis, business_diagnosis, persona}` 或 IP 定位/商业诊断/成交路径关键词。
    - 中：其余（write_script / content_producer / content_review / deep_copywriter）。
  - `mode`：低→`direct_delivery`；中→`assumption_delivery`；高→项目资料完整→`assumption_delivery`，否则→`discovery_exploration`。
    - 注：`feedback_iteration` 在枚举中**保留**，但本次规则不主动赋值（它是「用户已给反馈、需迭代」的态，本质由反馈事件驱动，属 Sprint 3）。本次测试仅断言它不会被错误地塞给全新生成任务。
  - `knownFacts`：**只从真实上下文抽取**——项目字段（目标客户/offer/行业）、知识库标题、选题 sourceHighlights、用户 rawInput。每条带 `source`。**缺失字段不填、不编造**。
  - 业务判断层字段：能从项目/选题确定性回填的回填，否则 `undefined`（前端显示「未填写」，不当 0/默认值）。
  - `classifiedBy: "rule"`。

**阶段 B — 可选 LLM 精化（用户已选「LLM 辅助分类」）**：`refineTaskSpecWithLLM(skeleton, input)`
- 仅在「LLM 可用 + 非 low 风险」时调用，复用现有 `getAgentLLM`（与选题生成同源，零 Mock：真实服务调用）。
- LLM **只允许**：调整 `mode`（在规则给出的候选内二选一）、补充 `unknowns`、补充 `assumptions`、给 `riskLevel` 一个建议（最终以规则为准，LLM 仅参考）。
- LLM **严禁**：新增 `knownFacts`、产出客户反馈/互动数据/任何数字指标。Prompt 明确写死约束。
- 成功 → `classifiedBy: "llm"`；失败/超时/校验不过 → 退回骨架，`classifiedBy: "rule_fallback"`，**任务照常执行**。

**关键不变量**（写在函数文档与单测里）：
- `knownFacts` 永远 ⊆ 真实输入；LLM 路径不写 `knownFacts`。
- 缺失证据 → `unknowns` 非空 + `mode` 不退化为 `direct_delivery`。
- 高风险 + 关键资料缺失 → `mode = discovery_exploration`，绝不输出伪确定结论。

### 4.2 交付契约扩展（`lib/aim-delivery-contract.ts`，改，不新建组件）

`buildAimDeliveryContract` 输入加可选 `taskSpec?`，输出在现有 4 列基础上**按模式折叠/展开**（补充指令 §四）：

- **低风险 / `direct_delivery`**：4 列保持现状，状态列附一行「已按现有资料直接完成。」不强制追问。
- **中风险 / `assumption_delivery`**：4 列 + 一个**默认折叠**的「本次假设」块，只显示最重要的 1-2 条假设 + 「缺少 X 会影响结果」。
- **高风险 / `discovery_exploration`**：完整展开「已知事实 / 待确认项 / 本次假设 / 下一步」。Sprint 1 的交付物**不是**走完探索流程（那是 Sprint 4），而是：**不输出伪确定结论**——即在缺关键资料时，主交付区显示「当前信息不足，无法给出确定方案」+ 已知事实 + 缺口清单 + 「进入探索」按钮占位（点击后提示「探索模式将在后续版本接入定位/诊断智能体」）。本次确保的是「不假装确定」，不是「完成探索」。

前端 `DeliveryContractStrip`（`aim/page.tsx:912`）扩展为可展开详情，默认折叠，**不占据主交付空间**。

### 4.3 接入 AIM 生成流（不改动智能体主体）

- `aim-generate-validate.ts`：`parseGenerateBody` 增解析 `topicSelectionId`、`selectedTopicIndex`（透传，不强制）。
- `lib/aim-generator.ts`：`AimInput` 增上述字段；`generateAimContent` 不改主体逻辑，只在生成前后调用 `buildTaskSpec` / `refineTaskSpecWithLLM`，把结果塞进 `saveAimGenerationRecord` 的 `data` payload。
- `lib/aim-agent-handlers.ts:1916`：`data` 加 `taskSpec`、`topicSelectionId`、`selectedTopicIndex`（`degradedData` 同步加，保证降级路径也留痕）。
- 智能体路由 / HANDLERS 注册（`aim-agent-handlers.ts:1286`）**不动**。

### 4.4 选题 → AIM 跳转补全关联

- `topic-planning/page.tsx:587` `jumpToAim`：URL 参数增加 `topicSelectionId` + `selectedTopicIndex`。
- `aim/page.tsx:948`：读取这两个参数 → 存入 `sourceTopicSelectionId` 等 state → 在 `generateAimContent` 调用（`aim/page.tsx:2094`）传入。

至此「从选题进入 AIM 后可追溯原始 TopicSelection」打通。

---

## 5. Sprint 2：业务结果链

### 5.1 选题三档判断（替换伪精确分数的前台表达）

`lib/topic-validation.ts` / `lib/topic-generation.ts`：
- 新增 `TopicVerdict = 值得主推 | 补证据再发 | 暂不建议`（五问驱动，见原任务书 §一.2）。
- `normalizeScoreBreakdown`（`:391`）**删除默认 80/75 填充**：缺分时 `scoreBreakdown` 留空 / 对应维度标 `null`，前台不再渲染精确总分。`score`/`scoreBreakdown` 字段**保留以兼容**现有数据，但不再作为「市场预测」展示。
- `fallbackTopicCards`（`:350`）：移除硬编码分数，改为「证据不足」标记，仍返回卡片骨架（不阻断生成），卡片上明确标 `verdict: 暂不建议 / 缺证据`。
- `topic-daily-report.ts:37` `scoreOf`：缺分时不再当 0 参与排序，改为「无分数卡片排末位 + 标注证据不足」。

### 5.2 ContentOutcome API（新建，复用现有鉴权）

- `GET /api/aim/history/[id]/outcome`：取该 generationId 下按 `collectWindowDay` 的结果（多条，对应 7/14/30 天）。
- `PUT /api/aim/history/[id]/outcome`：upsert（靠 unique 约束去重）。body 含 `collectWindowDay`、各 nullable 指标、`platform`、`publishedAt`、`audienceFeedback`、`userVerdict`。
  - **未填写 ≠ 0**：服务端只接受显式数字；缺失字段存 `null`。`null` 入库前显式校验，不因「空字符串/undefined」误转 0。
  - 鉴权：`authenticateRequest` + `findFirst AimGeneration by {id, userId}` 校验归属；`ContentOutcome` 查询/写入均带 `userId`。
- 客户端 `lib/api/client.ts`：加 `getContentOutcome(id)`、`upsertContentOutcome(id, body)`。

### 5.3 复盘界面简化录入（扩展现有复盘，不另建工作台）

复用 `aim/page.tsx` 现有「登记发布 / 复盘」对话框（`page.tsx:2791` Dialog），重组为三组（原任务书 §二.3）：
1. 商业结果（有效私信 / 合格线索 / 预约 / 成交 / 营收）
2. 内容信号（播放 / 收藏 / 评论 / 转发）
3. 用户反馈（自由文本：哪类人在问 / 是否目标客户原话 / 是否错误人群）

录入调用 `upsertContentOutcome`。登记发布仍走现有 `workflowStatus:"published"` 通路（`page.tsx:2847`），并在发布时把 `platform` / `publishUrl` 写入 `AimGeneration`（现有逻辑）。

### 5.4 发布前判断的归位

现有「发布前判断」对话框字段（`summary/targetUser/expectedSignal/confidence`）与 TaskSpec 业务字段语义重叠。Sprint 1 生成时已自动产出待确认的 TaskSpec（含目标客户/信任证据/预期动作/最薄弱证据 + 事实/推断/假设标签）。复盘/发布对话框改为：
- 打开时**从 `generation.taskSpec` 预填**（不再每次空白，原任务书 §二.4「自动带入发布前假设」），用户可改。
- 用户**可修改关键假设**（验收 §10）。
- **不静默把假设当事实**：保存时若用户改了 `mode` 或假设，写回 `taskSpec` 并标 `classifiedBy` 增加 `user_confirmed` 标记。

---

## 6. 反馈事件扩展（Sprint 2 最小入口，为 Sprint 3 铺路）

现有 `recordAimRunEvent(runId, event)` 已支持 `copied | revised | accepted`。Sprint 2 仅：
- 服务端 `/api/aim/runs/[runId]/events/route.ts` 扩展合法 `event` 枚举到补充指令 §五 的全集（`accepted | partially_satisfied | rewrite_requested | rejected | copied | edited | published | retrospected`）+ 可选 `reason`（`fact_inaccurate | tone_mismatch | ...`）。
- **不建独立的 FeedbackEvent 表**（那是 Sprint 3），本次只让事件可带 reason 落库到现有 `AimRunEvent`。
- 前端在复制/编辑/发布/复盘动作处，附带发送对应事件 + reason（最小改动）。

---

## 7. 测试策略（第五阶段最小评测集的 V1 子集）

新建测试文件，放 `apps/web/__tests__/unit/`：
1. `task-spec.test.ts`：
   - 低风险任务（polish_copy）→ `direct_delivery`，不产生追问。
   - 高风险任务（business_diagnosis）+ 项目资料缺失 → `discovery_exploration`，`unknowns` 非空。
   - 高风险任务 + 资料完整 → `assumption_delivery`。
   - **错误分类/降级**：LLM 失败 → `rule_fallback`，任务仍执行；LLM 试图塞 `knownFacts` → 被丢弃。
   - `knownFacts` 永远可追溯（断言每条 source ∈ 输入集合）。
2. `content-outcome.test.ts`：upsert 去重（同 window 多次 PUT 只一条）；缺失字段为 `null` 不为 0；跨用户隔离（403/404）。
3. `topic-verdict.test.ts`：缺证据 → 「证据不足」而非默认高分；旧数据 score 字段仍可读（兼容）。
4. `feedback-events.test.ts`：新事件枚举 + reason 合法/非法校验。

测试命令：`pnpm --filter web test`（vitest）、`pnpm --filter web typecheck`、`pnpm --filter web build`。本地 MySQL（已确认 127.0.0.1:3306 可达）执行迁移。

---

## 8. 验收清单（本次 Sprint 1+2 完成判定）

合并两份文档的验收项，本次必须全绿：

**Sprint 1（认知层）**
- [ ] 低风险任务不因认知编排器增加无意义追问。
- [ ] 高风险任务在关键资料缺失时不输出伪确定结论（`mode=discovery_exploration`，展示缺口）。
- [ ] TaskSpec 生成失败时，现有 AIM 任务降级执行（`classifiedBy=rule_fallback`）。
- [ ] 用户可看见并修改关键假设（发布前判断对话框从 taskSpec 预填 + 可改）。
- [ ] 所有事实可追溯来源（`knownFacts` 带 source）；推断/假设有明确标签。
- [ ] 三种活跃模式（`direct_delivery`/`assumption_delivery`/`discovery_exploration`）均有测试场景，覆盖错误分类、降级（`rule_fallback`）和 `knownFacts` 防注入。`feedback_iteration` 枚举保留但不被错误赋值（断言）。

**Sprint 2（业务结果链）**
- [ ] 从选题进入 AIM 后可追溯原始 `TopicSelection`（`topicSelectionId`/`selectedTopicIndex` 落库）。
- [ ] 发布前能看到目标客户、信任证据、预期动作（TaskSpec 业务字段）。
- [ ] 可登记发布平台和链接（现有通路，保留）。
- [ ] 可结构化填写播放/私信/合格线索/预约/成交（ContentOutcome）。
- [ ] 未填写数据不显示为 0（`null` 保留）。
- [ ] 新选题不再把模型主观分数包装成市场预测（删除默认分填充）。
- [ ] 所有新接口有用户权限隔离（鉴权 + userId scope）。

**工程底线**
- [ ] Prisma 迁移、typecheck、相关单测、生产构建全部通过。
- [ ] 不破坏现有选题缓存、AIM 历史记录、内容创作流程。
- [ ] 不覆盖工作区现有未提交改动（本次基于干净 `main` 分支开发）。
- [ ] 零 Mock：所有 LLM 调用走真实 `getAgentLLM`，无硬编码假数据。

**明确本次不做**：Sprint 3 偏好/经验候选库、Sprint 4 探索模式智能体接入、市场雷达重做、平台自动数据采集、多智能体架构、独立平行工作台。

---

## 9. 实施顺序（落到提交粒度）

1. 数据层：Prisma schema + 迁移 + `lib/task-spec.ts` 类型骨架（可独立 typecheck）。
2. TaskSpec 分类函数 + 单测（先于 UI，纯逻辑可测）。
3. AIM 生成流接入 TaskSpec（validate → generator → handlers）。
4. 交付契约 + 前端状态栏扩展。
5. 选题→AIM 关联打通（URL 参数 + 落库）。
6. 选题伪精确分消除 + 三档判断 + 单测。
7. ContentOutcome 模型已建（步骤1）→ API + 客户端 + 复盘对话框录入。
8. 发布前判断从 TaskSpec 预填。
9. 反馈事件枚举扩展。
10. 全量 typecheck + test + build + 迁移验证 → 提交。

每步独立可提交、可验证，符合 Agents.md「小改完即验证后 commit」。
