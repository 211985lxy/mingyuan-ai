# AIM 智能体上下文工程升级计划

> 历史设计文档。曾误粘进 `ip-copywriting-methodology-core.md` 末尾，2026-06-27 抽离到本文件归档。对应实现见 `aim-knowledge-context.ts`、`aim-agent-handlers.ts`、`/api/aim/chat`、`/api/aim/generate`。

## Summary
当前 AIM 已有知识库、Embedding 和生成链路 RAG，但上下文工程还不完整：`生成交付物` 已走 `retrieveRelevantKnowledge()`，普通 `AIM 对话` 仍直接塞最多 50 条知识；不同智能体也没有独立的知识优先级和上下文预算。第一版升级目标是：不新增数据库、不重做知识库，只把 AIM chat/generate 统一成“项目知识检索 + 智能体优先级 + 字符预算”的稳定上下文链路。

## Key Changes
- 统一 AIM 知识检索入口：
  - 新增轻量函数 `buildAimKnowledgeContext()`，内部复用现有 `retrieveRelevantKnowledge()`。
  - `/api/aim/chat` 不再直接 `findMany(take: 50)` 拼知识，改为按当前用户、项目、用户最后一条消息检索相关知识。
  - `buildAimGeneration()` 也改用同一个上下文函数，避免 chat 和 generate 两套逻辑漂移。
  - 保留现有 fallback：Embedding 不可用时仍按项目取少量 active 知识。

- 增加智能体知识优先级：
  - `deep_copywriter`：优先 `boss_experience`、`product_usp`、`user_insight`、`benchmark_reference`、`positioning_material`。
  - `business_system_diagnosis`：优先 `product_usp`、`customer_pain`、`project_case`、`customer_qa`、`user_insight`。
  - `business_diagnosis`：优先 `positioning_material`、`boss_experience`、`product_usp`、`customer_pain`。
  - `content_producer`：优先 `product_usp`、`project_case`、`private_domain_material`、`hot_topic`、`benchmark_reference`。
  - `content_review`：优先 `project_case`、`benchmark_reference`、`user_insight`、`hot_topic`。
  - 实现方式保持简单：先按语义相关度取结果，再按 agent 分类优先级做轻量重排，不新增复杂评分系统。

- 增加上下文预算：
  - 默认最多 12 条知识。
  - 默认知识块总长度控制在 8000 字以内。
  - 单条知识最长截断到 1200 字。
  - 超出预算直接跳过后续知识，不做复杂摘要。
  - `buildKnowledgeBlock()` 统一移动到共享位置，避免 `aim-tool-actions` 和 `aim-generator` 重复实现。

- 增加可观测信息：
  - AIM 生成记录继续保存 `knowledgeUsed`。
  - chat 响应暂不改前端展示，只在服务端日志或返回内部字段前保守处理，不展示向量、分数、token 等技术信息。
  - 前台保持“已用知识库 X 条”的用户表达，不暴露 Context Engineering 细节。

- 不做的事：
  - 不新增数据库表。
  - 不做长对话自动摘要。
  - 不做向量库替换。
  - 不做每个智能体独立知识库。
  - 不把所有聊天自动入库。

## Public Interfaces / Types
- 新增内部类型：
  - `AimKnowledgeContextInput`
  - `AimKnowledgeContextResult`
- 新增内部函数：
  - `buildAimKnowledgeContext({ userId, projectId, agentId, query, topicTitle?, topicRationale? })`
  - 返回：`knowledgeBlock`、`entries`、`source`
- 扩展 `retrieveRelevantKnowledge()` 入参：
  - 可选 `preferredCategories?: string[]`
  - 可选 `maxContentChars?: number`
  - 或者在新 wrapper 中完成分类重排和截断，不改变原函数签名；推荐 wrapper 方案，改动更小。
- `/api/aim/chat` 外部响应结构不变。
- `/api/aim/generate` 外部响应结构不变。

## Test Plan
- 单元测试：
  - `buildAimKnowledgeContext()` 能按 agent 分类优先级重排知识。
  - 知识块总长度不会超过预算。
  - 单条超长知识会被截断。
  - Embedding 不可用时仍返回项目内 fallback 知识。
  - 不同 `projectId` 不会互相读取知识。
- 接口测试：
  - `/api/aim/chat` 使用相关知识，不再直接加载 50 条。
  - `/api/aim/generate` 行为不退化，仍返回 `knowledgeUsed`。
  - 无项目或项目无知识时不报错，智能体正常回答，但不编造客户资料。
- 回归验证：
  - 深度文案官、商业诊断官、定位策划官、内容生产官、数据复盘官都能正常对话。
  - 飞书工具动作不受影响。
  - 知识库后台项目绑定不受影响。
  - `pnpm --dir mingyuan/apps/web lint -- src/app/api/aim/chat/route.ts src/lib/aim-agent-handlers.ts src/lib/llm/embeddings.ts`
  - `pnpm --dir mingyuan/apps/web build`

## Assumptions
- 第一版只做上下文检索、分类优先级和预算控制。
- 智能体上下文策略写死在代码里，不做后台配置。
- 预算先用字符数控制，不引入 token 计算依赖。
- 知识优先级只影响排序，不过滤掉其他类别，避免信息缺失。
- 长对话摘要放到下一阶段，因为现在最急的是防止知识库变多后上下文失控。
