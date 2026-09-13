# A5 知识图谱扩展检索：实现、实测与闸门结论（2026-09-13）

## 一句话结论

**图谱扩展检索已实现并接线（灰度默认关），但实测零增益，按计划闸门纪律归档为「已验证不值得」继续投入，开关保持关闭。**

## 背景：图谱在"建"但从不被"用"

- `extractAndPersistForEntry` 已挂在知识新增链路上，图谱持续产出
- `retrieveEntityContext`（图谱检索）**此前没有任何调用方**——图谱建了不用
- 本次把它接进检索：向量 topK 之后，按查询命中的实体做一跳邻域扩展，补充召回

## 顺带修掉的两个既有缺陷

1. **中文分词缺陷（致命）**：原实现对查询 `split(/\s+/)`，中文无空格，整句被当成一个词，再拿它去 `name contains 整句` ——**对中文查询几乎永远匹配不到实体**。已改为反查包含（实体名/别名是否出现在查询文本中），这也是中文场景的正确做法。
2. **租户隔离缺口**：原实现 `projectId` 为空时不加任何租户条件，会**跨项目命中全部实体**。已改为必须传 userId 或 projectId：绑定项目按 projectId 检索，未绑定项目只查本人物化知识。

## 实测数据（生产库，经 SSH 隧道直连 mingyuan 库）

| 指标 | BEFORE（纯向量） | AFTER（图谱一跳扩展） |
| --- | --- | --- |
| hitRate@12 | **66.7%** | **66.7%** |
| 关键词命中率 | 66.7% | 66.7% |

用例：`scripts/aim-retrieval-baseline-cases.json` 的 6 条 smoke 用例；项目 `cmqn850on0000ep9ks3jm1p08`。

**⚠️ 更正此前记录**：计划文档曾记录基线为 83.3%——那是**本地开发副本（clipflow 库）**测出的值，非生产。生产真实基线为 **66.7%**。教训：本地 `.env.local` 指向本地库，任何"真实库"结论都必须核对连接目标。

## 为什么零增益

生产图谱写实：**127 实体 / 104 关系 / 171 条知识中仅 28 条有关系（覆盖 16%）**；本次测试项目 43 条活跃知识中仅约 1–2 条有关系。

即：图谱扩展只能补进"有关系且被查询命中实体"的条目，而测试用例与这些条目几乎无交集，故无增量。**这不是"图谱概念无效"的证明，而是"当前关系覆盖下测不出增益"**。

## 按闸门纪律的处置

计划事先写死：图谱注入后 hitRate 相对提升 ≥10% 才继续投入 UI/原子化。实测 0% → **归档，不再投入**（不做图谱可视化、不做原子化改造）。

代码保留但**灰度默认关**（`AIM_KNOWLEDGE_GRAPH_ENABLED=false`），零生产行为变化；若将来关系覆盖显著提升（例如全量补课后），可加 `--graph` 重测后再决定。

## 附带的可用工具

`scripts/backfill-knowledge-relations.ts`：给存量知识补跑关系抽取（默认 dry-run，`--apply` 才调用模型写库）。用于将来若要提升图谱覆盖时批量补课。**注意：该脚本必须在目标库的环境变量下运行**（生产需在服务器或经隧道指向 mingyuan 库）。

## 变更清单

| 文件 | 变更 |
| --- | --- |
| `src/lib/aim/knowledge-graph-retrieval.ts` | 新增：图谱扩展合并（预算 4 条、追加在后不抢排序、失败不影响主检索） |
| `src/lib/knowledge-entity-extractor.ts` | 修中文匹配 + 修租户隔离；`retrieveEntityContext` 增加 userId 作用域 |
| `src/lib/aim-knowledge-context.ts` | 改调图谱感知检索（受灰度开关控制） |
| `src/env.ts` / `.env.example` | 登记 `AIM_KNOWLEDGE_GRAPH_ENABLED`（默认 false） |
| `scripts/aim-retrieval-baseline.ts` | 新增 `--graph`，报告标注图谱开关状态 |
| `scripts/backfill-knowledge-relations.ts` | 新增：存量关系补课（dry-run / apply） |
| `config/architecture-size-policy.json` | env.ts legacy 上限按惯例 585 → 590 |

单测：新增 5 例（合并语义：顺序、分数、去重、预算、空向量）。
