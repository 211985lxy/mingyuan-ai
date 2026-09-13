# AIM 检索质量基线报告（WP-A5）

- 运行时间：2026-09-13T01:56:02Z
- 环境：真实库（明动远见｜相宇个人IP 项目，知识条目 110 条，全库 completed embeddings 129）
- 范围：userId=cmq62x1on0001iz9k1z7zajsb projectId=cmqn850on0000ep9ks3jm1p08（含全局知识）
- topK：12；用例：scripts/aim-retrieval-baseline-cases.json 的 6 条 smoke 用例

| 指标 | 数值 |
| --- | --- |
| 用例数 | 6 |
| hitRate@12 | 83.3% |
| MRR | 0.000 |
| 关键词命中率 | 83.3% |
| 通过率 | 83.3% |

| 用例 | 命中 | 关键词 |
| --- | --- | --- |
| smoke-boss-experience | ✅ | ✅ |
| smoke-product-usp | ✅ | ✅ |
| smoke-customer-pain | ✅ | ✅ |
| smoke-project-case | ✅ | ✅ |
| smoke-customer-qa | ❌ | ❌ |
| smoke-topic-hook | ✅ | ✅ |

## 投入闸门（写死，见增量计划 WP-A5）

知识图谱注入上线后重跑本脚本：**hitRate@12 相对提升 ≥10%（即 ≥91.7%）才继续投入 UI**；
不达则归档为「已验证不值得」，止损。

## 备注

- MRR=0 是因为本批 smoke 用例只标了关键词口径（无 relevantEntryIds）；补租户条目标注后 MRR 才有意义。
- 唯一 miss（价格异议 QA）需人工确认：是知识库缺该主题条目（内容问题），还是检索未召回（排序问题）——两种结论对应不同改进路径。
- 后续每次跑完把本文件按日期追加归档，形成水位曲线。
