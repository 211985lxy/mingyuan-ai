-- 内容生产官的 agent id 统一为 "content_producer"。
-- 历史上 AimGeneration.agentId 曾写入 "ip_video"（来自旧 URL / 旧外部 API），
-- 这里把存量数据归一化，保证历史记录查询（按 agentId 精确匹配）不再分裂。
--
-- 注意：AgentApiKey.allowedAgents（JSON 数组）不在本迁移处理——代码层
-- (agent-api-auth.ts) 读取时已通过 normalizeAimAgentId 兼容旧 "ip_video" scope，
-- 旧 API key 无需迁移即可继续使用。新增 key 默认 scope 为 content_producer。
UPDATE `AimGeneration` SET `agentId` = 'content_producer' WHERE `agentId` = 'ip_video';
