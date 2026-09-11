# 选题推荐质量升级 · 实施记录与后续设计

> 日期：2026-09-11
> 状态：P0 + P1 **已实现并上线生产**；P2 待样本量达标后立项
> 范围：mingyuan 主仓（apps/web）
> 上游：选题闭环已上线（`51d92d4f`，每日 09:10 推送人工裁决卡）
> 本次实现：`edc01cdd`（P0+P1）、`93d39e3c`（json 前置条件）、`535ca8b4`（悬空引用修复）

---

## 0. 升级前的问题（代码实证）

| 缺陷 | 代码事实 | 后果 |
|---|---|---|
| **模型既出题又打分** | `topic-generation.ts` 单次 LLM 调用同时出 4 张卡并自评分；`topic-daily-report.ts` 的 `getLeadCard()` 取 `card.score` 最高者为「AI 主推」 | 自我认证：高分是"它觉得好"，不是"真的好" |
| **评分权重无数据锚定** | 五维 25/25/20/15/15 为硬编码；且 `noveltyScore`（陌生化）单独打、不参与总分——与提示词"没有陌生化就没有含金量"自相矛盾 | 推荐自嗨，不会越用越准 |
| **缺效果闭环** | `OutcomeAttribution` 能通过 `generationId` 关联「选题→成交」，但无链路把效果回流到评分 | 天花板锁死在拍脑袋的权重上 |

---

## P0 · 评分与出题分离 ✅ 已实现

**新增 `src/lib/topic-editor-review.ts`**：独立主编评审，第二个角色只评审不出题。

- `evaluateTopicCards(cards, context, reviewer)`：可注入 reviewer（单测替身），失败**静默降级返回原卡片**，绝不阻断生成
- 主编 system prompt：严苛口吻、逐张打分、宁严勿松；评审维度含**陌生化含金量**（修正了模型自评分漏掉这一维的口径矛盾）
- `TopicCard.editorReview`（`editorScore` / `editorVerdict` / `editorReason`，zod optional）：**向后兼容**，旧卡片无该字段仍可解析
- **保留模型自评分 `score` 不动**——两个分并置，正是 P2 校准偏差所需的原始数据
- `getLeadCard` 改为「主编评分最高且 `editorVerdict !== "revise"`」优先；无评审时回退自评分（行为不变）
- 飞书卡片标注主编结论 + verdict 标签（建议主推/可用/观察/建议改）

### 生产实测（2026-09-11 19:10，真实数据）

| 选题 | 模型自评 | 主编评分 | 判定 |
|---|---|---|---|
| 老板做IP半年没结果，卡在哪一步 | 88 | 61 | usable |
| 同行的爆款，其实只改了一个开头 | 86 | 55 | revise |
| AI一人公司起盘：三个模块跑通内容系统 | 85 | 64 | usable |
| 从0到第一条咨询，他做对了什么 | 84 | 57 | observe |

**主编评分系统性低于模型自评 20–30 分**，这是升级的预期效果（出题者有滤镜，独立主编没有）。判 `revise` 的那张按新规则不会被主推。

---

## P1 · 对标数据硬锚定 ✅ 已实现

- `selectTopCompetitorEvidence(accounts)`：从 `WatchAccount.viralVideos` / `latestVideos` 提取真实赞/评/转/藏，按总热度排序去重取前 8 条
- `formatCompetitorEvidenceBlock()`：注入评审 prompt，明确"以此为准，不得臆测播放量"；无数据时约束"传播钩子不得给高分"
- 生产实测中主编评语已体现该约束：「**无真实对标数据支撑"半年没结果"母题的传播强度**……含金量中等不能高给」

---

## 联调发现并修复的阻塞级缺陷

1. **`json` 前置条件只修了一半**（`93d39e3c`）：OpenAI 兼容网关 apimart 的 `json_object` 前置条件只检查 **user message**，而此前修复只加在 system prompt → 选题生成 3 次尝试全 400，**降级为 fallback 占位模板**。修复后 `Success on attempt 1, model=deepseek-flash`。
   - 教训：这类网关前置条件要同时覆盖 system 与 user 两条消息。
2. **origin/main 悬空引用**（`535ca8b4`）：`aim-workbench-chrome.tsx` 引用的 `feishu-knowledge-oauth-notice` 组件从未进入版本控制 → origin/main typecheck 失败、所有部署被阻断。按引用契约补入该组件（非删引用），保留原功能。

---

## P2 · 效果回流校准（未开工，设前置门槛）

### 目标

让评分权重从自己的数据里长出来，而非硬编码。

### 前置条件（未满足前不做，防止空转）

1. 样本量：至少数十条「选题 → 发布 → 效果」完整链路
2. 选题特征（`editorReview` / `scoreBreakdown` / `defamiliarization`）↔ 发布效果的关联**目前不存在**，需先埋点

### 分步设计

- **P2a 埋点**：发布时把 `topicSelectionId` 贯穿到 `OutcomeAttribution`（扩展现有 `generationId` 链路），记录「这条选题最终带来多少成交」
- **P2b 回看**：新增选题效果回看视图——按 `editorVerdict` / `score` 区间统计真实转化率
- **P2c 校准**：用转化率反推权重（哪些维度真的预测了效果），把硬编码权重改为数据驱动

**这里才是 `editorReview` 与 `score` 并置的价值所在**：两个分的差值本身是最值钱的校准信号——若用户总选主编高分而模型高分落选，说明模型评分口径需调整。

---

## 遗留与移交

- **陌生化是否进模型自评分五维**：主编评审维度已含它，但模型自评分五维仍无。是否统一两套口径需产品拍板（避免出现"模型 90 分、主编 70 分"的口径混乱来源）。
- **LLM provider 兜底链脆弱**：生产上 zenmux / doubao 常超时（各浪费 50s / 90s），生成实测 2.5–5 分钟。属基础设施问题，建议单独排查。
- **P2 依赖**：发布平台数据回流（抖音官方 API / 飞书总线），依赖 `creator-metrics-feishu-data-bus` 计划推进。
