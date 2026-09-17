# ADR-003: 词面召回改为可选能力（不依赖数据库 ngram FULLTEXT）

- 状态: 已接受
- 日期: 2026-09-17
- 决策者: AIM 团队

## 背景

P1 混合检索由两路召回组成：块级向量（语义）+ `KnowledgeChunk.text` 上的 FULLTEXT（词面），
两路用 RRF 融合。做这一路的理由是纯向量对**精确术语**不敏感 —— 客户名、产品型号、地名、
专有名词（「中汝达」「下二闸」「bge-reranker」）在语义空间里常常挤在一起，而词面命中能一击命中。

中文全文检索有个硬前提：MySQL/MariaDB 的内置全文解析器按空格与标点切词，中文没有词边界，
整段文本会落成**一个 token**，中文检索等于不可用。官方为此提供 ngram 解析器（CJK 专用），
建索引时写 `WITH PARSER ngram`。

上线时（2026-09-16）真实发生的情况：

1. 迁移 `20260916160000_add_knowledge_chunk_fulltext` 在生产执行
   `ADD FULLTEXT INDEX ... WITH PARSER ngram` 时失败，P3018 / errno 1128
   （`Function 'ngram' is not defined`）。
2. 根因：**生产库是 MariaDB 10.5，不支持 `WITH PARSER ngram`。**
3. 该差异在合并前没有被任何门禁暴露 —— CI 的数据库是 MySQL 8.4，支持 ngram。
   漂移门禁 `scripts/check-migration-drift.mjs` 的正则只匹配 `CREATE (?:UNIQUE )?INDEX`，
   不匹配 `CREATE FULLTEXT INDEX`，所以「库里少了这个索引」也没被拦。
4. 失败的迁移在生产 `_prisma_migrations` 留下记录，阻塞了后续所有部署。

## 决策

### 1. 不建索引 —— 包括「退而求其次用默认解析器」

默认解析器的 FULLTEXT 索引在 MariaDB 上**建得出来**，`MATCH ... AGAINST` 也**不报错**，
只是中文召回极差。这是比「没有索引」更坏的失败模式：一个看起来在工作、实际不工作的检索路，
且没有任何信号。宁可明确停用。

### 2. 词面召回降级为「可选能力」，而不是删除

- `keyword-retrieval.ts` 在检索前探测 `KnowledgeChunk.text` 上是否存在可用的 FULLTEXT 索引；
- 探测不通过 → 直接短路，**不查库、不刷日志**（探测结果进程级缓存，见 `keyword-capability.ts`）；
- 探测通过 → 词面路照常工作。

保留代码而不是删掉的理由：索引可用与否是**运行期事实**，不是编译期常量。
换 MySQL 8、或手工建好索引后，探测自动通过、词面召回自动启用，**不需要改代码或改配置**。
删掉代码则要在那时重新实现一遍。

### 3. schema 不声明 `@@fulltext([text])`，迁移保留为空操作

- `prisma/knowledge.prisma` 刻意不声明该索引：Prisma 语法表达不了 parser，而声明它会
  让 `migrate deploy` 期望一个在生产上建不出来的索引。
- 迁移 `20260916160000_add_knowledge_chunk_fulltext` 保留文件名、内容改为**有意的空操作**。
  保留而不删除，是为了让本地迁移历史与生产 `_prisma_migrations` 里那条失败记录对齐，
  之后用一次 `migrate resolve --applied` 收敛，不必手工改历史表。
- 运维侧补救语句（ALTER + 核实方法）写在那个迁移的文件头里，一并写清了恢复条件。

### 4. 用单测护栏把这个坑钉死

`__tests__/unit/knowledge-fulltext-capability.test.ts` 断言：

- 没有任何迁移的**可执行 SQL** 里出现 `ADD FULLTEXT` / `WITH PARSER`（注释不算）；
- schema 里不出现 `@@fulltext`；
- 关键词检索必须经过能力探测，且探测早于召回查询。

变异验证已做过：把 ngram SQL 写回迁移、把 `@@fulltext` 写回 schema、删掉探测短路，
三种变异都让对应用例转红。

## 后果

**已知的代价**：

- 生产上混合检索**等价于纯向量召回**（块级向量 + 精排），精确术语召回能力缺失。
- `.env.example` 里 P1 档标注的 `hitRate@12 = 97.0%` 是在**带索引的 MySQL 环境**实测的；
  降级后的生产实际数值会低于它，不要把那个数字当生产现状引用。
- 排序稳定性不受影响：`rank-fusion.ts` 的归一化本来就是按「单路有结果」这一档设计的
  （原始跨度 1.180× 那一档），降级是其设计内场景，不是意外。

**恢复方式（按成本从低到高）**：

1. 数据库换 MySQL 8：直接跑迁移文件头里的 ALTER，零代码改动。
2. 引入支持中文分词的检索组件（Mroonga / 外部搜索引擎）。
3. 应用层方案：自己做倒排或 bigram 打分表，彻底不依赖数据库全文特性。
   —— 这也是唯一能在 MariaDB 上恢复词面召回的路，本次未做。

**仍然有效的长期问题**：迁移门禁与 CI 的数据库方言差异。
`check-migration-drift.mjs` 不识别 FULLTEXT 索引，且 CI 用 MySQL 8.4 而生产是 MariaDB 10.5 ——
任何用到 MySQL 专有语法（parser、窗口函数细节、JSON 函数、DDL 差异）的迁移都可能在
「本地全绿」的情况下在生产失败，本次不是第一例。若要根治，需要让 CI 的库与生产同方言。
