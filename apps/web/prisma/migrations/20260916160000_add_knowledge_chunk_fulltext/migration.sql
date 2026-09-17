-- P1 混合检索：给 KnowledgeChunk.text 加 ngram FULLTEXT 索引
--
-- 作用：为关键词（词面）召回提供索引，与块级向量召回一起进 RRF 融合。
--       应用侧见 src/lib/llm/keyword-retrieval.ts。
--
-- 为什么必须指定 WITH PARSER ngram：
--   MySQL 内置全文解析器用空格/标点判断词边界。中文没有词边界，整段会被当成一个
--   token，中文检索等于不可用。ngram 解析器是 MySQL 官方为 CJK 提供的解，
--   默认 token_size=2（bigram）。
--
--   ⚠️ 最危险的失败模式（静默、不报错）：
--   如果这个索引被以**默认解析器**建出来（例如后续有人让 Prisma Migrate 自动生成
--   而不带 WITH PARSER），MATCH ... AGAINST 不会报错，只会中文召回极差。
--   发布后务必核实：
--       SHOW CREATE TABLE `KnowledgeChunk`;
--   应看到 `FULLTEXT KEY `KnowledgeChunk_text_idx` (`text`) /*!50100 WITH PARSER `ngram` */`。
--
-- 为什么应用侧用 NATURAL LANGUAGE 而不是 BOOLEAN 模式：
--   1. ngram 在 boolean 模式下把检索词转成「ngram 短语」，要求 n 元组连续命中，
--      对长中文查询过于严格，召回塌陷；
--   2. NL 模式下转成「ngram 词并集」，召回符合检索预期；
--   3. 官方文档所述的「50% 阈值」（出现在半数以上行中的词被当停用词）是 MyISAM 的限制，
--      **InnoDB 不受影响**；本表引擎为 InnoDB，故 NL 模式安全；
--   4. RRF 只消费排名、不比较分数绝对量纲，故 MySQL 相关度分与余弦分不可比无妨。
--
-- 索引命名：
--   `KnowledgeChunk_text_idx` 是 Prisma `@@fulltext([text])` 的默认命名。
--   必须与 prisma/knowledge.prisma 的 `@@fulltext` 声明（见 knowledge.prisma.patch.md）
--   完全一致，否则 `prisma migrate dev` 会把本索引判定为「库里有、schema 里没有」
--   并生成一条 DROP INDEX 迁移。改名前请先跑：
--       npx prisma migrate dev --create-only
--   若生成的迁移里出现 DROP INDEX / ADD FULLTEXT，说明名字对不上，按提示改名或改用 map。
--
-- 执行时机（有讲究）：
--   在 P0 回填（scripts/backfill-knowledge-chunks.ts）**之前**执行这条 ALTER，
--   此时 KnowledgeChunk 基本是空表，建索引是常数开销；
--   反过来先回填 6000 行再建索引，就要多扫一遍全表。
--   回填过程中插入行会增量维护 FTS 索引，这是 InnoDB 的正常开销，无需额外处理。
--
-- 参数依赖：
--   ngram_token_size 是 read-only 服务器变量（默认 2）。**改动它必须重建本索引**
--   才生效：DROP INDEX + 本迁移重跑。否则索引里存的是旧 token 长度，与新查询不一致。
--
-- 回滚：
--   ALTER TABLE `KnowledgeChunk` DROP INDEX `KnowledgeChunk_text_idx`;
--   （不影响任何数据；混合检索会自动降级为纯向量，见 knowledge-retrieval.ts）
--
-- ⚠️ 引擎差异（2026-09-17 生产实测补，务必看完再改）：
--   `WITH PARSER ngram` 是 **MySQL 专有**特性。生产库是 **MariaDB 10.5**，没有 ngram 插件，
--   直接执行会报 `1128 Function 'ngram' is not defined`，**整条迁移失败**。
--   危害不只于本功能：失败的迁移会在 `_prisma_migrations` 里留一条未完成记录，
--   之后每次 `prisma migrate deploy` 都以 `P3009` 直接中止 —— 等于**整个仓库再也发不出去**。
--   （2026-09-17 实测：CI 用 mysql:8.4、本地隔离库用 mysql:8.0，两边都能建 ngram 索引，
--     所以这个问题在合并前完全看不见，只在生产暴露。）
--
--   MariaDB 也没有等价的 CJK 解析器：内置解析器按空白/标点切词，中文整段落成一个 token，
--   建出来等于一个「不报错但中文召回极差」的坏索引（比不建更危险）。
--
--   故本迁移改为**认引擎执行**：
--     · 有 ngram（MySQL）→ 建 ngram FULLTEXT，与原先行为完全一致；
--     · 无 ngram（MariaDB）→ 跳过建索引。
--
--   跳过是安全的、且是应用侧已预期的情况：`keyword-retrieval.ts` 的 `runKeywordQuery`
--   捕获 MySQL 1191「Can't find FULLTEXT index matching the column list」，
--   只记一条 warn 并降级为纯向量召回（等价 P0 行为），不会把「索引没建」变成线上故障。
--   代价：MariaDB 部署上**没有词面召回**，混合检索退化为纯向量。
--
--   为什么用动态 SQL 而不是把 ALTER 拆成两句：Prisma 的迁移文件没有条件语法，
--   而 `ADD FULLTEXT INDEX` 在缺索引时才能成功；用 PREPARE 把「建」与「不建」收敛成一条
--   可执行语句，才能保证同一个文件在两种引擎上都**成功**（迁移记录落 finished）。

SET @ngram_available := (
  SELECT COUNT(*)
  FROM information_schema.PLUGINS
  WHERE PLUGIN_NAME = 'ngram'
    AND PLUGIN_STATUS = 'ACTIVE'
);

SET @knowledge_chunk_fts_ddl := IF(
  @ngram_available > 0,
  'ALTER TABLE `KnowledgeChunk` ADD FULLTEXT INDEX `KnowledgeChunk_text_idx` (`text`) WITH PARSER ngram',
  'SELECT 1'
);

PREPARE knowledge_chunk_fts_stmt FROM @knowledge_chunk_fts_ddl;
EXECUTE knowledge_chunk_fts_stmt;
DEALLOCATE PREPARE knowledge_chunk_fts_stmt;

-- 回填完成后让优化器拿到真实基数
-- ANALYZE TABLE `KnowledgeChunk`;

-- 核实索引类型（应为 FULLTEXT；MariaDB 上应为空集，属预期）：
-- SELECT INDEX_NAME, INDEX_TYPE FROM INFORMATION_SCHEMA.STATISTICS
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'KnowledgeChunk';
