-- 作品编辑内部 id：deep_copywriter → work_editor（与 ip_video → content_producer 同风格）
UPDATE `AimGeneration` SET `agentId` = 'work_editor' WHERE `agentId` = 'deep_copywriter';

UPDATE `AimExecutionTrace` SET `agentId` = 'work_editor' WHERE `agentId` = 'deep_copywriter';

UPDATE `AimRunSnapshot` SET `agentId` = 'work_editor' WHERE `agentId` = 'deep_copywriter';
