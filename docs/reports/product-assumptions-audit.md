# 产品假设审计：七大资产与认知能力的可证伪清单

- 生成时间：2026-07-17
- 目的：把 AGENTS.md 里宏大的产品叙事拆成**可证伪的假设**，每个配一条能用现有数据查的验证信号。帮你回答"我们以为用户需要的，用户真的需要吗"。
- 立场：我是你的硅基战略局，任务是指出逻辑漏洞，不是鼓掌。这份清单会扎人。
- 数据来源：`apps/web/prisma/*.prisma` 的真实表结构（Asset / IpProfile / ContentOutcome / AimRunEvent / AimGeneration / ClientProject / KnowledgeEntry 等）

## 怎么用这份清单

对每条假设，去数据库跑一条 SQL（或看埋点）。**如果数字和你以为的差一个数量级，那个假设就是错的，相关投入要停。** 不要用感觉判断，用查询结果。

---

## 假设 1：「七大 IP 资产」都被用户在沉淀

**叙事**（AGENTS.md）：我们交付定位、人设、内容、信任、获客、转化、复利七大资产。

**可证伪信号**：
```sql
-- 七类资产各自的活跃用户数（最近 30 天有过写入）
SELECT asset_type, COUNT(DISTINCT project_id) AS active_projects
FROM Asset
WHERE updatedAt > DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY asset_type
ORDER BY active_projects DESC;
```

**证伪标准**：
- 如果 7 类里有 ≥3 类 `active_projects` 是个位数或 0 → 大部分资产是幻觉，用户只用其中 2-3 类。
- 如果某一类（大概率是"内容"）占 80% 以上流量 → 你卖的是"七大资产"，用户买的是"文案生成器"。

**我的预判**：内容资产会一骑绝尘，定位/复利/信任大概率是长尾甚至零。如果是这样，**产品复杂度（七维度控制台）远超用户实际使用的维度**，这是小白流失的根源。

---

## 假设 2：小白企业主能驾驭"认知能力升级"

**叙事**：目标用户是操作能力一般的小企业主，当小白对待；但 sprint 在做 TaskSpec 风险分类、conversationIntent 模式识别、内容运营逻辑内化。

**矛盾点**：能力越做越深（给系统用的），交互却不一定越做越简单（给小白用的）。

**可证伪信号**：
```sql
-- 用户从进入到第一次成功生成文案的转化率 + 中途流失点
-- 用 AimRunEvent 看用户旅程的断点
SELECT
  eventType,
  COUNT(*) AS events,
  COUNT(DISTINCT userId) AS users
FROM AimRunEvent
WHERE createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY eventType;
```
配合：生成成功但**从未被使用**（ContentOutcome 创建了却没进发布）的比例：
```sql
SELECT
  COUNT(*) AS total_outcomes,
  SUM(CASE WHEN publishedAt IS NULL THEN 1 ELSE 0 END) AS never_published
FROM ContentOutcome
WHERE createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY);
```

**证伪标准**：
- 如果 `never_published / total_outcomes > 70%` → 用户生成了但不发布，说明要么质量不够、要么流程没接上、要么生成本身不是他们的真实需求。
- 如果 `AimRunEvent` 显示大量"开了头没生成完" → 交互复杂度劝退了小白。

---

## 假设 3：「对标改写 30% 重写」是用户感知的价值

**叙事**：对标护栏要求 30% 可感知重写、不连续沿用 12 字。

**问题**：这是**工程师/合规视角**的指标，不是用户视角。用户要的是"这稿子能用"，不是"重写率达标"。

**可证伪信号**：
```sql
-- 对标类生成 vs 非对标类生成的后续使用率对比
SELECT
  CASE WHEN benchmarkSourceId IS NOT NULL THEN 'benchmark' ELSE 'original' END AS source,
  COUNT(*) AS generations,
  COUNT(DISTINCT resultId) AS used_results
FROM AimGeneration
WHERE createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY source;
```
（字段名需按实际 schema 校对，`benchmarkSourceId` 是示意）

**证伪标准**：
- 如果对标类和非对标类的后续使用率**没有显著差异** → 30% 重写护栏对用户价值无感知差异，它只是降低了你的合规风险，不构成卖点。

---

## 假设 4：认知能力（conversationIntent / TaskSpec）提升了生成质量

**叙事**：sprint 投入大量精力做意图识别、任务分类、上下文装配，假设这能提升生成质量。

**可证伪信号**：
- 真实 eval 的 rubric 分数趋势（`aim-eval --daily` 的历史结果）：
  - 认知能力接入前后的 rubric mean 是否真的上升？
  - 如果接入前后 rubric 没明显提升 → 认知能力是工程精致化，对用户无感。
- 用户侧信号：
```sql
-- 同一用户重复生成率（生成 → 不满意 → 再生成）
SELECT userId, COUNT(*) AS gen_count
FROM AimGeneration
WHERE createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY userId
HAVING COUNT(*) > 3
ORDER BY gen_count DESC;
```

**证伪标准**：
- 如果高重复生成率用户占比大 → 用户在反复试，说明一次生成质量不达标，认知能力没解决核心问题。
- 如果 daily eval rubric 在认知能力上线后**没涨或反降** → 这套精致化方向错了。

---

## 假设 5：用户会为"流程"付费，而不只是为"结果"付费

**叙事**（AGENTS.md 核心句）：我们交付的不是视频，而是「天命 IP 资产生产流程」。

**这是最危险的假设。** 流程是供给侧叙事，用户买单永远为结果。

**可证伪信号**：
```sql
-- 付费/激活用户里，真正走完"多步骤流程"的有多少
-- vs 只用了单点功能（只生成文案）的有多少
SELECT
  userId,
  COUNT(DISTINCT asset_type) AS asset_types_used,
  COUNT(DISTINCT stage) AS stages_touched
FROM Asset  -- 或 ClientProject 的活动记录
WHERE updatedAt > DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY userId;
```
看分布：用户平均触碰几个 stage / asset_type。

**证伪标准**：
- 如果中位数用户只触碰 1-2 个 stage → 没人在走"流程"，大家都在用单点工具。"流程产品"的定位和用户实际行为不符。
- 如果付费用户和免费用户在"触碰 stage 数"上没差异 → 流程不是付费驱动因素。

---

## 汇总：如果证据不支持叙事，怎么办

| 假设被证伪 | 建议动作 |
|---|---|
| 七大资产多数无人用 | 砍掉长尾资产，把控制台从 7 维降到用户真实用的 2-3 维 |
| 小白被复杂度劝退 | 停止加认知能力，转而做"少一步、少填一个框" |
| 30% 重写无感知差异 | 把它降级为内部合规检查，不作为产品卖点 |
| 认知能力没提质量 | 砍掉 conversationIntent/TaskSpec 的复杂分支，回到简单生成 |
| 没人走完整流程 | 放弃"流程产品"叙事，重新定位为"最强的单点文案工具" |

## 我最担心的（重申）

你的工程能力（prompt、架构、eval、守卫）是准商业级，**远超大多数个人项目**。但 AGENTS.md 通篇是"七大资产/天命/苏格拉底/高维智者"的宏大叙事，**没有一处提到付费用户数、留存、转化**。

技术外壳越精致，越容易用"我们在变强"的感觉掩盖一个残忍的问题：**这套东西到底有没有被市场真正需要、有没有人愿意持续付钱。**

跑上面那几条 SQL。数字会替你回答。

---

> 本报告不改代码。每个假设的 SQL 字段名需对照真实 schema 校对后再跑（schema 刚拆分成领域文件，字段以 `apps/web/prisma/*.prisma` 为准）。最终判断是你的商业决策。
