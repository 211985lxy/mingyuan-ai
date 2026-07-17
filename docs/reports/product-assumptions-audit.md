# 产品假设审计：七大资产与认知能力的可证伪清单

- 生成时间：2026-07-17（SQL 已对照真实 schema 校准，可直接跑）
- 目的：把 AGENTS.md 里宏大的产品叙事拆成**可证伪的假设**，每个配一条能用现有数据查的验证信号。帮你回答"我们以为用户需要的，用户真的需要吗"。
- 立场：我是你的硅基战略局，任务是指出逻辑漏洞，不是鼓掌。这份清单会扎人。
- 数据来源：`apps/web/prisma/*.prisma` 真实表结构。**字段名已逐个对照 schema 校准。**
- 重要修正：初版误把 `Asset` 表当成"七大 IP 资产"——`Asset` 实际是**媒体文件**（image/video/music）。七大 IP 资产的真实载体是 `IpProfile`（定位/人设）+ `IpWikiPage`（8 类资产页）+ `ContentOutcome`（商业结果回收）。

## 怎么用这份清单

对每条假设，去数据库跑一条 SQL。**如果数字和你以为的差一个数量级，那个假设就是错的，相关投入要停。** 不要用感觉判断，用查询结果。

> 所有 SQL 假设 MySQL（项目用 Prisma + MySQL）。时间窗口默认最近 30 天，可按需调整。

---

## 假设 1：「七大 IP 资产」都被用户在沉淀

**叙事**（AGENTS.md）：我们交付定位、人设、内容、信任、获客、转化、复利七大资产。

**真实载体**：`IpProfile`（定位/人设）+ `IpWikiPage`（按 `pageType` 分 8 类资产页）+ `ContentOutcome`（商业结果）。

**可证伪信号 A——八类资产页的活跃度**：
```sql
-- IpWikiPage.pageType 真实取值：positioning | persona | content_strategy |
--   audience | conversion_path | topic_directions | index | log
SELECT
  pageType,
  COUNT(*) AS total_pages,
  COUNT(DISTINCT projectId) AS projects_touched,
  SUM(CASE WHEN updatedAt > DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS active_30d
FROM IpWikiPage
WHERE status = 'active'
GROUP BY pageType
ORDER BY active_30d DESC;
```

**可证伪信号 B——IP 定位完成度**：
```sql
-- 多少用户真正填完了定位（isComplete=true）
SELECT
  COUNT(*) AS total_profiles,
  SUM(isComplete) AS completed,
  SUM(profileVersion = 2) AS v2_profiles,
  ROUND(SUM(isComplete) / COUNT(*) * 100, 1) AS completion_rate
FROM IpProfile
WHERE isActive = true;
```

**证伪标准**：
- 如果 8 类 `pageType` 里有 ≥4 类 `active_30d` 是个位数或 0 → 大部分资产是幻觉，用户只用其中 2-3 类。
- 如果 `completion_rate < 30%` → 多数用户连定位都没填完，后续六大资产无从谈起。
- 大概率 `index`/`log` 会偏高（系统生成），`conversion_path`/`audience` 偏低（用户不爱填）——差距越大，叙事越虚。

---

## 假设 2：小白企业主能驾驭"认知能力升级"

**叙事**：目标用户是操作能力一般的小企业主，当小白对待；但 sprint 在做 TaskSpec、conversationIntent、内容运营逻辑内化。

**矛盾点**：能力越做越深（给系统用的），交互却不一定越做越简单（给小白用的）。

**可证伪信号 A——用户对生成结果的采纳行为**（`AimRunEvent.event` 真实取值：`copied | revised | accepted`）：
```sql
-- 生成后被复制/采纳 vs 被反复修改 的比例
SELECT
  event,
  COUNT(*) AS events,
  COUNT(DISTINCT userId) AS users
FROM AimRunEvent
WHERE createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY event
ORDER BY events DESC;
```

**可证伪信号 B——生成即抛弃率**（生成了却从未发布）：
```sql
SELECT
  COUNT(*) AS total_generations,
  SUM(CASE WHEN publishedAt IS NULL THEN 1 ELSE 0 END) AS never_published,
  ROUND(SUM(CASE WHEN publishedAt IS NULL THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) AS abandon_pct
FROM AimGeneration
WHERE createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND status = 'completed';
```

**证伪标准**：
- 如果 `revised` 远多于 `accepted`/`copied` → 用户在反复改，一次生成质量不达标，认知能力没解决核心问题。
- 如果 `abandon_pct > 70%` → 生成即抛弃，要么质量不够、要么流程没接上、要么生成本身不是真实需求。

---

## 假设 3：「对标改写 30% 重写」是用户感知的价值

**叙事**：对标护栏要求 30% 可感知重写、不连续沿用 12 字。

**问题**：这是**合规/工程视角**指标，不是用户视角。用户要的是"稿子能用"。

**可证伪信号——对标来源 vs 原创来源的后续采纳/发布率对比**（对标用 `topicSelectionId IS NOT NULL` 追踪）：
```sql
SELECT
  CASE WHEN topicSelectionId IS NOT NULL THEN 'from_topic' ELSE 'original' END AS source,
  COUNT(*) AS generations,
  SUM(CASE WHEN publishedAt IS NOT NULL THEN 1 ELSE 0 END) AS published,
  ROUND(SUM(CASE WHEN publishedAt IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) AS publish_rate
FROM AimGeneration
WHERE createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND status = 'completed'
GROUP BY source;
```
（注：`topicSelectionId` 标记来源选题批次，是对标链路的入口；若需精确到"对标改写"而非"选题生成"，需结合 `taskSpec` JSON 里的 mode 字段进一步过滤。）

**证伪标准**：
- 如果两种来源的 `publish_rate` 没有显著差异 → 30% 重写护栏对用户价值无感知差异，它只降低你的合规风险，不构成卖点。

---

## 假设 4：认知能力（conversationIntent / TaskSpec）提升了生成质量

**叙事**：sprint 投入大量精力做意图识别、任务分类、上下文装配，假设这能提升生成质量。

**可证伪信号 A——真实 eval 的 rubric 趋势**：
- 认知能力接入前后，`aim-eval --daily` 的 rubric mean 是否真的上升？
- 查 CI 历史：`aim-eval-daily.yml` 的运行记录。如果接入后 rubric 没涨甚至反降 → 这套精致化方向错了。

**可证伪信号 B——同用户重复生成率**（生成→不满意→再生成）：
```sql
-- 高频重复生成的用户（最近 30 天生成 >5 次的）
SELECT
  userId,
  COUNT(*) AS gen_count,
  COUNT(DISTINCT agentId) AS agents_used
FROM AimGeneration
WHERE createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND status = 'completed'
GROUP BY userId
HAVING COUNT(*) > 5
ORDER BY gen_count DESC
LIMIT 20;
```

**证伪标准**：
- 如果高频重复生成用户占比大 → 用户在反复试，一次生成不达标，认知能力没解决核心痛点。
- 看 `qualityScores`（JSON）的实际分布——如果大量生成质量分集中在低分段，说明质量本身是问题。

---

## 假设 5：内容真的带来了生意（最该查的一条）

**叙事**：产品帮用户"获客、转化、复利"。

**这是产品价值的最硬证据。** `ContentOutcome` 表回收了真实商业结果，直接查它。

**可证伪信号——生成的内容带来了多少真实线索/成交**：
```sql
-- ContentOutcome 商业结果回收情况
SELECT
  COUNT(*) AS outcomes_collected,
  SUM(CASE WHEN qualifiedLeadCount > 0 THEN 1 ELSE 0 END) AS got_leads,
  SUM(CASE WHEN appointmentCount > 0 THEN 1 ELSE 0 END) AS got_appointments,
  SUM(CASE WHEN dealCount > 0 THEN 1 ELSE 0 END) AS got_deals,
  SUM(CASE WHEN revenue > 0 THEN 1 ELSE 0 END) AS got_revenue,
  COALESCE(SUM(revenue), 0) AS total_revenue_tracked
FROM ContentOutcome
WHERE collectedAt > DATE_SUB(NOW(), INTERVAL 90 DAY);
```

**证伪标准**：
- 如果 `outcomes_collected` 本身就是个位数 → **几乎没人在回收结果**，"获客/转化/复利"无法被证实，产品价值闭环没建立。
- 如果 `got_deals`/`got_revenue` 是 0 → 没有证据表明内容带来了成交，"帮用户赚钱"的叙事缺乏数据支撑。

**这条最扎心**：如果 ContentOutcome 几乎是空的，说明要么用户没在回收（产品没引导好）、要么根本没产生结果（内容没带来生意）。无论哪种，都是战略级信号。

---

## 假设 6（新增）：用户会为"流程"付费，而不只为"结果"

**叙事**（AGENTS.md 核心句）：我们交付的不是视频，而是「天命 IP 资产生产流程」。

**最危险的假设**——流程是供给侧叙事，用户永远为结果买单。

**可证伪信号——用户实际走过多深的流程**：
```sql
-- 每个用户在最近 30 天触碰了多少类资产页/多少个 stage
SELECT
  userId,
  COUNT(DISTINCT pageType) AS asset_types_touched,
  COUNT(DISTINCT projectId) AS projects_active
FROM IpWikiPage
WHERE updatedAt > DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND status = 'active'
GROUP BY userId
ORDER BY asset_types_touched DESC;
```
配合看 ClientProject 的活跃度分布：
```sql
SELECT
  userId,
  COUNT(*) AS projects,
  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_projects
FROM ClientProject
GROUP BY userId
ORDER BY projects DESC;
```

**证伪标准**：
- 如果中位数用户只触碰 1-2 类资产页 → 没人在走"流程"，大家都在用单点工具。"流程产品"定位与实际行为不符。

---

## 汇总：如果证据不支持叙事，怎么办

| 假设被证伪 | 建议动作 |
|---|---|
| 七大资产多数无人用 | 砍掉长尾资产页，控制台从 7 维降到用户真实用的 2-3 维 |
| 小白被复杂度劝退 | 停止加认知能力，转而做"少一步、少填一个框" |
| 30% 重写无感知差异 | 降级为内部合规检查，不作产品卖点 |
| 认知能力没提质量 | 砍掉 conversationIntent/TaskSpec 复杂分支，回到简单生成 |
| ContentOutcome 几乎空 | 这是战略级警报——要么补结果回收引导，要么承认"帮赚钱"尚未被证实 |
| 没人走完整流程 | 放弃"流程产品"叙事，重新定位为"最强单点文案工具" |

## 我最担心的（重申）

你的工程能力（prompt、架构、eval、守卫）是准商业级，**远超大多数个人项目**。但 AGENTS.md 通篇是"七大资产/天命/苏格拉底/高维智者"的宏大叙事，**没有一处提到付费用户数、留存、转化**。

技术外壳越精致，越容易用"我们在变强"的感觉掩盖一个残忍的问题：**这套东西到底有没有被市场真正需要、有没有人愿意持续付钱。**

**优先级建议**：先跑假设 5（ContentOutcome 商业结果）和假设 1B（定位完成度）。这两条最便宜、最扎心。如果假设 5 是空的，其他都不重要——先解决"内容到底带没带来生意"。

---

## 字段速查（已校准）

| 我要查的 | 真实表.字段 | 取值 |
|---|---|---|
| IP 资产页类型 | `IpWikiPage.pageType` | positioning/persona/content_strategy/audience/conversion_path/topic_directions/index/log |
| 定位完成 | `IpProfile.isComplete` | true/false |
| 生成采纳行为 | `AimRunEvent.event` | copied/revised/accepted |
| 是否发布 | `AimGeneration.publishedAt` | NULL=未发布 |
| 对标来源 | `AimGeneration.topicSelectionId` | NULL=原创 |
| 商业结果 | `ContentOutcome.{qualifiedLeadCount,appointmentCount,dealCount,revenue}` | Int/Decimal |
| 内容信号 | `ContentOutcome.{views,likes,comments,saves,shares}` | Int |

> 本报告不改代码。所有 SQL 字段已对照 `apps/web/prisma/*.prisma` 校准。最终判断是你的商业决策。
