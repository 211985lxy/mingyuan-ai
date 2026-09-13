# WP-A5 知识原子图谱（先基线，后注入，UI 最后）

> 状态：代码完成，图谱 UI 未立项 · 日期：2026-09-12 · 分支：`feat/wp-a2-a6-batch1`
> 上游：《明动AIM-竞品借鉴增量升级计划-2026-09-12》WP-A5
> 投入闸门：图谱相对纯向量的检索命中率提升 **≥10%** 才做可视化；不达则止损。

## 1. 改了什么

- 检索质量三个口径做成纯函数：命中率、引用准确率、信噪比。见 `knowledge-atoms.ts`。
- 知识条目蒸馏成原子（观点/金句/事实/方法），幂等去重，表 `KnowledgeAtom`。新写入知识时顺带切原子；存量走 `POST /api/admin/knowledge/atoms/backfill`。
- 向量 topK 之后加图扩展一跳：复用已有 `KnowledgeEntity` / `KnowledgeRelation`，不新建图数据库。注入仍走原来的上下文压缩。
- 开关：`AIM_KNOWLEDGE_GRAPH_HOP_ENABLED`。

## 2. 不做

- 不做关系图/观点地图 UI。闸门没过，画图是浪费。
- 不新建图数据库。
- 不把竞品空库当「我们也不该做」——这是修自己修了一半的路。

## 3. 验收

- 单测：`knowledge-atoms-retrieval`（切原子、三口径可算、一跳只补漏）。
- 基线报告：`docs/reports/2026-09-12-knowledge-retrieval-baseline.md`。
- 放量级：真实知识库原子化覆盖率 ≥80%；图谱组 vs 纯向量组对比落档。目前只有夹具级基线，生产对比未跑，UI 不得开工。
