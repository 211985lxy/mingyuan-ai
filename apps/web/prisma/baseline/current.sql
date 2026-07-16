-- CreateTable
CREATE TABLE `AimGeneration` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `rawInput` MEDIUMTEXT NOT NULL,
    `inputSource` VARCHAR(191) NOT NULL DEFAULT 'text',
    `videoScript` MEDIUMTEXT NULL,
    `wechatArticle` MEDIUMTEXT NULL,
    `momentsPost` MEDIUMTEXT NULL,
    `communityMessage` MEDIUMTEXT NULL,
    `shootingBrief` MEDIUMTEXT NULL,
    `rawCopy` MEDIUMTEXT NULL,
    `formatsRequested` JSON NOT NULL,
    `knowledgeUsed` JSON NOT NULL,
    `ipSnapshotUsed` MEDIUMTEXT NULL,
    `qualityScores` JSON NULL,
    `topicTitle` TEXT NULL,
    `topicSelectionId` VARCHAR(30) NULL,
    `selectedTopicIndex` INTEGER NULL,
    `hotTopic` TEXT NULL,
    `polishInstruction` MEDIUMTEXT NULL,
    `workflowStatus` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `reviewNote` MEDIUMTEXT NULL,
    `publishedAt` DATETIME(3) NULL,
    `publishPlatform` VARCHAR(191) NULL,
    `publishUrl` MEDIUMTEXT NULL,
    `decisionSnapshot` JSON NULL,
    `retroSnapshots` JSON NOT NULL,
    `calibrationRules` JSON NOT NULL,
    `taskSpec` JSON NULL,
    `wechatDraft` JSON NULL,
    `model` VARCHAR(191) NULL,
    `totalTokens` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'completed',
    `errorMessage` MEDIUMTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AimGeneration_userId_createdAt_idx`(`userId`, `createdAt` DESC),
    INDEX `AimGeneration_userId_projectId_createdAt_idx`(`userId`, `projectId`, `createdAt` DESC),
    INDEX `AimGeneration_userId_workflowStatus_idx`(`userId`, `workflowStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IpWikiPage` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `pageType` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `frontmatter` JSON NOT NULL,
    `sources` JSON NOT NULL,
    `links` JSON NOT NULL,
    `sourceGenerationId` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `IpWikiPage_projectId_status_idx`(`projectId`, `status`),
    INDEX `IpWikiPage_projectId_pageType_status_idx`(`projectId`, `pageType`, `status`),
    INDEX `IpWikiPage_userId_createdAt_idx`(`userId`, `createdAt` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentApiKey` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `keyPrefix` VARCHAR(191) NOT NULL,
    `keyHash` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `allowedProjects` JSON NOT NULL,
    `allowedAgents` JSON NOT NULL,
    `dailyLimit` INTEGER NOT NULL DEFAULT 50,
    `lastUsedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AgentApiKey_keyHash_key`(`keyHash`),
    INDEX `AgentApiKey_userId_status_idx`(`userId`, `status`),
    INDEX `AgentApiKey_keyPrefix_idx`(`keyPrefix`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentApiCallLog` (
    `id` VARCHAR(191) NOT NULL,
    `apiKeyId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `agentId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `inputSummary` TEXT NULL,
    `outputFormats` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `errorMessage` TEXT NULL,
    `durationMs` INTEGER NULL,
    `aimGenerationId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AgentApiCallLog_apiKeyId_createdAt_idx`(`apiKeyId`, `createdAt`),
    INDEX `AgentApiCallLog_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `AgentApiCallLog_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AimExecutionTrace` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `agentId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'running',
    `durationMs` INTEGER NULL,
    `model` VARCHAR(191) NULL,
    `totalTokens` INTEGER NULL,
    `inputSummary` TEXT NULL,
    `outputSummary` TEXT NULL,
    `errorMessage` TEXT NULL,
    `steps` JSON NOT NULL,
    `aimGenerationId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `runId` VARCHAR(40) NULL,
    `provider` VARCHAR(64) NULL,
    `fallbackIndex` INTEGER NULL,
    `degraded` BOOLEAN NULL,
    `harnessVersion` VARCHAR(40) NULL,
    `runtimeTask` VARCHAR(32) NULL,
    `conversationMode` VARCHAR(32) NULL,
    `knowledgeStrategy` VARCHAR(32) NULL,
    `promptHash` VARCHAR(64) NULL,
    `contextHash` VARCHAR(64) NULL,
    `qualityStatus` VARCHAR(24) NULL,
    `snapshotId` VARCHAR(40) NULL,

    INDEX `AimExecutionTrace_createdAt_idx`(`createdAt` DESC),
    INDEX `AimExecutionTrace_userId_createdAt_idx`(`userId`, `createdAt` DESC),
    INDEX `AimExecutionTrace_agentId_createdAt_idx`(`agentId`, `createdAt` DESC),
    INDEX `AimExecutionTrace_status_createdAt_idx`(`status`, `createdAt` DESC),
    INDEX `AimExecutionTrace_runId_idx`(`runId`),
    INDEX `AimExecutionTrace_promptHash_idx`(`promptHash`),
    INDEX `AimExecutionTrace_qualityStatus_idx`(`qualityStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AimRunSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(40) NOT NULL,
    `traceId` VARCHAR(40) NULL,
    `userId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `agentId` VARCHAR(191) NULL,
    `action` VARCHAR(32) NULL,
    `runSpec` JSON NOT NULL,
    `contextManifest` JSON NOT NULL,
    `providerAttempts` JSON NOT NULL,
    `fullPrompt` MEDIUMTEXT NULL,
    `promptMessages` JSON NOT NULL,
    `promptHash` VARCHAR(64) NULL,
    `contextHash` VARCHAR(64) NULL,
    `output` MEDIUMTEXT NULL,
    `outputFormats` JSON NOT NULL,
    `qualityResult` JSON NULL,
    `imageHashes` JSON NOT NULL,
    `provider` VARCHAR(64) NULL,
    `model` VARCHAR(64) NULL,
    `fallbackIndex` INTEGER NULL,
    `degraded` BOOLEAN NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AimRunSnapshot_runId_key`(`runId`),
    INDEX `AimRunSnapshot_expiresAt_idx`(`expiresAt`),
    INDEX `AimRunSnapshot_userId_createdAt_idx`(`userId`, `createdAt` DESC),
    INDEX `AimRunSnapshot_agentId_createdAt_idx`(`agentId`, `createdAt` DESC),
    INDEX `AimRunSnapshot_traceId_idx`(`traceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AimRunEvent` (
    `id` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(40) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `event` VARCHAR(24) NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AimRunEvent_runId_createdAt_idx`(`runId`, `createdAt` DESC),
    INDEX `AimRunEvent_userId_createdAt_idx`(`userId`, `createdAt` DESC),
    INDEX `AimRunEvent_event_createdAt_idx`(`event`, `createdAt` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentMethodology` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `filePath` VARCHAR(191) NULL,
    `updatedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AgentMethodology_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContentOutcome` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `generationId` VARCHAR(191) NOT NULL,
    `topicSelectionId` VARCHAR(30) NULL,
    `projectId` VARCHAR(191) NULL,
    `platform` VARCHAR(40) NULL,
    `publishedAt` DATETIME(3) NULL,
    `collectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `collectWindowDay` INTEGER NOT NULL,
    `qualifiedCommentCount` INTEGER NULL,
    `dmCount` INTEGER NULL,
    `qualifiedLeadCount` INTEGER NULL,
    `appointmentCount` INTEGER NULL,
    `dealCount` INTEGER NULL,
    `revenue` DECIMAL(14, 2) NULL,
    `views` INTEGER NULL,
    `likes` INTEGER NULL,
    `comments` INTEGER NULL,
    `saves` INTEGER NULL,
    `shares` INTEGER NULL,
    `audienceFeedback` TEXT NULL,
    `userVerdict` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ContentOutcome_userId_collectedAt_idx`(`userId`, `collectedAt`),
    INDEX `ContentOutcome_generationId_idx`(`generationId`),
    UNIQUE INDEX `ContentOutcome_userId_generationId_collectWindowDay_key`(`userId`, `generationId`, `collectWindowDay`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompetitorAnalysis` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `targetUrl` VARCHAR(500) NOT NULL,
    `platform` VARCHAR(20) NOT NULL,
    `platformUserId` VARCHAR(200) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `currentStep` VARCHAR(20) NULL,
    `errorMessage` TEXT NULL,
    `rawAccountData` JSON NULL,
    `rawVideoData` JSON NULL,
    `rawCommentData` JSON NULL,
    `collectionSource` VARCHAR(40) NULL,
    `fallbackUsed` BOOLEAN NOT NULL DEFAULT false,
    `fallbackReason` TEXT NULL,
    `metricsData` JSON NULL,
    `analysisResult` JSON NULL,
    `overallScore` INTEGER NULL,
    `accountName` VARCHAR(100) NULL,
    `accountAvatar` VARCHAR(500) NULL,
    `followerCount` INTEGER NULL,
    `videoCount` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `apiCostUsd` DOUBLE NULL DEFAULT 0,

    INDEX `CompetitorAnalysis_userId_createdAt_idx`(`userId`, `createdAt` DESC),
    INDEX `CompetitorAnalysis_userId_platform_idx`(`userId`, `platform`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WatchAccount` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `targetUrl` VARCHAR(500) NOT NULL,
    `platform` VARCHAR(20) NOT NULL DEFAULT 'douyin',
    `platformUserId` VARCHAR(200) NULL,
    `nickname` VARCHAR(100) NULL,
    `avatar` VARCHAR(500) NULL,
    `followerCount` INTEGER NULL,
    `latestVideos` JSON NULL,
    `viralVideos` JSON NULL,
    `refreshStatus` VARCHAR(20) NOT NULL DEFAULT 'idle',
    `refreshError` TEXT NULL,
    `lastRefreshedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WatchAccount_userId_createdAt_idx`(`userId`, `createdAt` DESC),
    UNIQUE INDEX `WatchAccount_userId_targetUrl_key`(`userId`, `targetUrl`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VideoCopyExtraction` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sourceUrl` VARCHAR(800) NOT NULL,
    `platform` VARCHAR(40) NOT NULL DEFAULT 'unknown',
    `status` VARCHAR(20) NOT NULL DEFAULT 'queued',
    `errorMessage` TEXT NULL,
    `analysisError` TEXT NULL,
    `providerBatchId` VARCHAR(120) NULL,
    `providerTaskId` VARCHAR(120) NULL,
    `videoTitle` VARCHAR(500) NULL,
    `videoCover` VARCHAR(800) NULL,
    `videoDuration` VARCHAR(40) NULL,
    `transcript` LONGTEXT NULL,
    `analysisResult` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,

    INDEX `VideoCopyExtraction_userId_createdAt_idx`(`userId`, `createdAt` DESC),
    INDEX `VideoCopyExtraction_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BenchmarkProfile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(20) NOT NULL,
    `accountUrl` VARCHAR(500) NULL,
    `platformUserId` VARCHAR(200) NULL,
    `followerCount` INTEGER NULL,
    `personaTags` JSON NOT NULL,
    `positioning` TEXT NULL,
    `differentiator` TEXT NULL,
    `takeaways` TEXT NULL,
    `competitorAnalysisId` VARCHAR(40) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BenchmarkProfile_userId_status_idx`(`userId`, `status`),
    INDEX `BenchmarkProfile_projectId_idx`(`projectId`),
    INDEX `BenchmarkProfile_userId_accountUrl_idx`(`userId`, `accountUrl`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BenchmarkProfileItem` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BenchmarkProfileItem_profileId_idx`(`profileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Script` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `sourceTemplateId` VARCHAR(191) NULL,
    `generationRunId` VARCHAR(191) NULL,
    `ipProfileId` VARCHAR(191) NULL,
    `structureId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `qualityScore` DOUBLE NULL,
    `qualityMetadata` JSON NULL,
    `selectedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `topicSelectionId` VARCHAR(191) NULL,
    `isHotTopicVersion` BOOLEAN NOT NULL DEFAULT false,
    `openingTypeCode` VARCHAR(191) NULL,
    `structureCode` VARCHAR(191) NULL,
    `endingTypeCode` VARCHAR(191) NULL,
    `qualityReport` JSON NULL,
    `rewriteCount` INTEGER NOT NULL DEFAULT 0,

    INDEX `Script_userId_idx`(`userId`),
    INDEX `Script_userId_status_idx`(`userId`, `status`),
    INDEX `Script_generationRunId_idx`(`generationRunId`),
    INDEX `Script_ipProfileId_idx`(`ipProfileId`),
    INDEX `Script_structureId_idx`(`structureId`),
    INDEX `Script_topicSelectionId_idx`(`topicSelectionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContentGenerationRun` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `ipProfileId` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `structureId` VARCHAR(191) NULL,
    `structureSnapshot` JSON NULL,
    `hotTopicId` VARCHAR(191) NULL,
    `hotTopic` VARCHAR(191) NULL,
    `hotTopicInsight` JSON NULL,
    `hotTopicFit` JSON NULL,
    `inputsJson` JSON NOT NULL,
    `promptText` TEXT NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'succeeded',
    `qualityScore` DOUBLE NULL,
    `qualityMetadata` JSON NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `topicSelectionId` VARCHAR(191) NULL,
    `openingTypeCode` VARCHAR(191) NULL,
    `copyStructureCode` VARCHAR(191) NULL,
    `endingTypeCode` VARCHAR(191) NULL,

    INDEX `ContentGenerationRun_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `ContentGenerationRun_templateId_idx`(`templateId`),
    INDEX `ContentGenerationRun_structureId_idx`(`structureId`),
    INDEX `ContentGenerationRun_hotTopicId_idx`(`hotTopicId`),
    INDEX `ContentGenerationRun_topicSelectionId_idx`(`topicSelectionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HotTopicFitCache` (
    `id` VARCHAR(191) NOT NULL,
    `cacheKey` VARCHAR(191) NOT NULL,
    `topicId` VARCHAR(191) NOT NULL,
    `topicTitle` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `structureId` VARCHAR(191) NOT NULL,
    `ipProfileId` VARCHAR(191) NOT NULL,
    `fitJson` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `HotTopicFitCache_cacheKey_key`(`cacheKey`),
    INDEX `HotTopicFitCache_topicId_templateId_structureId_idx`(`topicId`, `templateId`, `structureId`),
    INDEX `HotTopicFitCache_ipProfileId_updatedAt_idx`(`ipProfileId`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VideoStructure` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `subtitle` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `useCase` VARCHAR(191) NULL,
    `blueprint` JSON NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'published',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VideoStructure_name_key`(`name`),
    INDEX `VideoStructure_status_sortOrder_idx`(`status`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TopicElement` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `typeLabel` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `conflictCodes` JSON NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'published',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TopicElement_code_key`(`code`),
    INDEX `TopicElement_status_sortOrder_idx`(`status`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OpeningType` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `formulas` JSON NOT NULL,
    `examples` JSON NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'published',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OpeningType_code_key`(`code`),
    INDEX `OpeningType_status_sortOrder_idx`(`status`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CopyStructure` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `beats` JSON NOT NULL,
    `caseStudy` JSON NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'published',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CopyStructure_code_key`(`code`),
    INDEX `CopyStructure_status_sortOrder_idx`(`status`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EndingType` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `guidance` TEXT NOT NULL,
    `patterns` JSON NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'published',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EndingType_code_key`(`code`),
    INDEX `EndingType_status_sortOrder_idx`(`status`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TopicSelection` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `ipProfileId` VARCHAR(191) NOT NULL,
    `elementCodes` JSON NOT NULL,
    `candidates` JSON NOT NULL,
    `selectedIndex` INTEGER NULL,
    `promptText` TEXT NOT NULL,
    `sourceHighlights` JSON NULL,
    `model` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `recommendationMode` VARCHAR(20) NULL,
    `recommendedDate` VARCHAR(10) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TopicSelection_userId_status_idx`(`userId`, `status`),
    INDEX `TopicSelection_ipProfileId_idx`(`ipProfileId`),
    INDEX `TopicSelection_userId_recommendationMode_recommendedDate_idx`(`userId`, `recommendationMode`, `recommendedDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContentTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `scriptTemplate` TEXT NOT NULL,
    `expressionBlueprint` JSON NULL,
    `variables` JSON NOT NULL,
    `hookType` VARCHAR(191) NULL,
    `shanjianStyleId` VARCHAR(191) NULL,
    `videoType` VARCHAR(191) NOT NULL DEFAULT 'virtualman_broadcast',
    `packRulesJson` JSON NULL,
    `processRulesJson` JSON NULL,
    `industry` JSON NOT NULL,
    `contentType` VARCHAR(191) NOT NULL,
    `tags` JSON NOT NULL,
    `hotTopicKeywords` JSON NOT NULL,
    `seasonalEvents` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `usageCount` INTEGER NOT NULL DEFAULT 0,
    `createdBy` VARCHAR(191) NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ContentTemplate_status_idx`(`status`),
    INDEX `ContentTemplate_status_sortOrder_idx`(`status`, `sortOrder`),
    INDEX `ContentTemplate_featured_status_idx`(`featured`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Inspiration` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `source` VARCHAR(40) NOT NULL DEFAULT 'text',
    `content` TEXT NOT NULL,
    `aiStatus` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `generatedTopics` JSON NULL,
    `generatedContent` JSON NULL,
    `aimGenerationId` VARCHAR(191) NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Inspiration_userId_createdAt_idx`(`userId`, `createdAt` DESC),
    INDEX `Inspiration_userId_aiStatus_idx`(`userId`, `aiStatus`),
    INDEX `Inspiration_source_idx`(`source`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DouyinHotItem` (
    `id` VARCHAR(191) NOT NULL,
    `sentenceId` VARCHAR(191) NOT NULL,
    `word` VARCHAR(191) NOT NULL,
    `hotValue` INTEGER NOT NULL,
    `position` INTEGER NOT NULL,
    `label` INTEGER NOT NULL DEFAULT 0,
    `videoCount` INTEGER NOT NULL DEFAULT 0,
    `discussCount` INTEGER NOT NULL DEFAULT 0,
    `coverUrl` VARCHAR(191) NULL,
    `eventTime` DATETIME(3) NOT NULL,
    `searchSnapshot` JSON NULL,
    `insightStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `insightJson` JSON NULL,
    `insightError` TEXT NULL,
    `insightUpdatedAt` DATETIME(3) NULL,
    `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `batchId` VARCHAR(191) NOT NULL,

    INDEX `DouyinHotItem_fetchedAt_idx`(`fetchedAt`),
    INDEX `DouyinHotItem_position_idx`(`position`),
    INDEX `DouyinHotItem_sentenceId_fetchedAt_idx`(`sentenceId`, `fetchedAt`),
    UNIQUE INDEX `DouyinHotItem_sentenceId_batchId_key`(`sentenceId`, `batchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DouyinHotSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `itemCount` INTEGER NOT NULL,
    `rawJson` JSON NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'success',

    UNIQUE INDEX `DouyinHotSnapshot_batchId_key`(`batchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiHotBriefing` (
    `id` VARCHAR(191) NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `generatedAt` DATETIME(3) NOT NULL,
    `windowStart` DATETIME(3) NOT NULL,
    `windowEnd` DATETIME(3) NOT NULL,
    `markdown` TEXT NOT NULL,
    `items` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AiHotBriefing_date_key`(`date`),
    INDEX `AiHotBriefing_generatedAt_idx`(`generatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MarketHotSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `generatedAt` DATETIME(3) NOT NULL,
    `items` JSON NOT NULL,
    `warnings` JSON NOT NULL,
    `summary` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'success',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MarketHotSnapshot_date_key`(`date`),
    INDEX `MarketHotSnapshot_generatedAt_idx`(`generatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `plan` VARCHAR(191) NOT NULL DEFAULT 'free',
    `authVideoUrl` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminUser` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'editor',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sessionVersion` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AdminUser_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `targetType` VARCHAR(80) NOT NULL,
    `targetId` VARCHAR(191) NULL,
    `requestId` VARCHAR(80) NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AdminAuditLog_adminId_createdAt_idx`(`adminId`, `createdAt`),
    INDEX `AdminAuditLog_targetType_targetId_idx`(`targetType`, `targetId`),
    INDEX `AdminAuditLog_requestId_idx`(`requestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivationCode` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `batchNote` VARCHAR(191) NULL,
    `durationDays` INTEGER NOT NULL DEFAULT 365,
    `status` VARCHAR(191) NOT NULL DEFAULT 'unused',
    `usedBy` VARCHAR(191) NULL,
    `usedAt` DATETIME(3) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ActivationCode_code_key`(`code`),
    INDEX `ActivationCode_batchId_idx`(`batchId`),
    INDEX `ActivationCode_status_idx`(`status`),
    INDEX `ActivationCode_code_idx`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemSetting` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'string',
    `category` VARCHAR(191) NOT NULL DEFAULT 'general',
    `description` VARCHAR(191) NULL,
    `updatedBy` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SystemSetting_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnowledgeEntry` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `tags` JSON NOT NULL,
    `sourceType` VARCHAR(191) NOT NULL DEFAULT 'manual',
    `valueGrade` VARCHAR(2) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `KnowledgeEntry_userId_category_idx`(`userId`, `category`),
    INDEX `KnowledgeEntry_userId_status_idx`(`userId`, `status`),
    INDEX `KnowledgeEntry_userId_valueGrade_idx`(`userId`, `valueGrade`),
    INDEX `KnowledgeEntry_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnowledgeEmbedding` (
    `id` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `embedding` JSON NOT NULL,
    `dimensions` INTEGER NOT NULL DEFAULT 1024,
    `model` VARCHAR(191) NOT NULL,
    `contentHash` VARCHAR(64) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `KnowledgeEmbedding_entryId_key`(`entryId`),
    INDEX `KnowledgeEmbedding_status_idx`(`status`),
    INDEX `KnowledgeEmbedding_contentHash_idx`(`contentHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnowledgeEntity` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `aliases` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `KnowledgeEntity_projectId_status_idx`(`projectId`, `status`),
    INDEX `KnowledgeEntity_userId_name_idx`(`userId`, `name`),
    UNIQUE INDEX `KnowledgeEntity_userId_projectId_name_type_key`(`userId`, `projectId`, `name`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnowledgeRelation` (
    `id` VARCHAR(191) NOT NULL,
    `fromEntityId` VARCHAR(191) NOT NULL,
    `toEntityId` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `weight` DOUBLE NOT NULL DEFAULT 1.0,
    `evidence` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `KnowledgeRelation_fromEntityId_type_idx`(`fromEntityId`, `type`),
    INDEX `KnowledgeRelation_entryId_idx`(`entryId`),
    UNIQUE INDEX `KnowledgeRelation_fromEntityId_toEntityId_entryId_type_key`(`fromEntityId`, `toEntityId`, `entryId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Avatar` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'uploading',
    `coverUrl` VARCHAR(191) NULL,
    `sourceVideoUrl` VARCHAR(191) NULL,
    `externalTaskId` VARCHAR(191) NULL,
    `externalVirtualmanId` VARCHAR(191) NULL,
    `externalSpeakerId` VARCHAR(191) NULL,
    `speakerName` VARCHAR(191) NULL,
    `demoTaskId` VARCHAR(191) NULL,
    `demoVideoUrl` VARCHAR(191) NULL,
    `errorCode` VARCHAR(191) NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Avatar_externalTaskId_key`(`externalTaskId`),
    UNIQUE INDEX `Avatar_demoTaskId_key`(`demoTaskId`),
    INDEX `Avatar_userId_status_idx`(`userId`, `status`),
    INDEX `Avatar_externalTaskId_idx`(`externalTaskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Asset` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sourceAvatarId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `assetType` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `size` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ready',
    `externalTaskId` VARCHAR(191) NULL,
    `externalSpeakerId` VARCHAR(191) NULL,
    `voiceModel` VARCHAR(191) NULL,
    `demoAudioUrl` VARCHAR(191) NULL,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `errorCode` VARCHAR(191) NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Asset_externalTaskId_key`(`externalTaskId`),
    INDEX `Asset_userId_assetType_idx`(`userId`, `assetType`),
    INDEX `Asset_externalTaskId_idx`(`externalTaskId`),
    INDEX `Asset_sourceAvatarId_idx`(`sourceAvatarId`),
    INDEX `Asset_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PublicAvatarPreviewCache` (
    `id` VARCHAR(191) NOT NULL,
    `cacheKey` VARCHAR(191) NOT NULL,
    `virtualmanId` VARCHAR(191) NOT NULL,
    `speakerId` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `textHash` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'processing',
    `externalTaskId` VARCHAR(191) NULL,
    `videoUrl` VARCHAR(191) NULL,
    `coverUrl` VARCHAR(191) NULL,
    `duration` INTEGER NULL,
    `errorCode` VARCHAR(191) NULL,
    `errorMessage` TEXT NULL,
    `lastAccessedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PublicAvatarPreviewCache_cacheKey_key`(`cacheKey`),
    UNIQUE INDEX `PublicAvatarPreviewCache_externalTaskId_key`(`externalTaskId`),
    INDEX `PublicAvatarPreviewCache_virtualmanId_speakerId_idx`(`virtualmanId`, `speakerId`),
    INDEX `PublicAvatarPreviewCache_status_updatedAt_idx`(`status`, `updatedAt`),
    INDEX `PublicAvatarPreviewCache_lastAccessedAt_idx`(`lastAccessedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PublicAvatarPreviewPreference` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `virtualmanId` VARCHAR(191) NOT NULL,
    `speakerId` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `previewCacheId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PublicAvatarPreviewPreference_previewCacheId_idx`(`previewCacheId`),
    INDEX `PublicAvatarPreviewPreference_virtualmanId_updatedAt_idx`(`virtualmanId`, `updatedAt`),
    UNIQUE INDEX `PublicAvatarPreviewPreference_userId_virtualmanId_key`(`userId`, `virtualmanId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PexelsMedia` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL DEFAULT 'pexels',
    `pexelsId` INTEGER NOT NULL,
    `mediaType` VARCHAR(191) NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `photographer` VARCHAR(191) NOT NULL,
    `photographerUrl` VARCHAR(191) NULL,
    `photographerId` BIGINT NULL,
    `avgColor` VARCHAR(191) NULL,
    `alt` TEXT NULL,
    `duration` INTEGER NULL,
    `srcJson` JSON NULL,
    `videoFilesJson` JSON NULL,
    `videoPicturesJson` JSON NULL,
    `imageUrl` VARCHAR(191) NULL,
    `ossUrl` VARCHAR(191) NULL,
    `ossStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `ossTransferredAt` DATETIME(3) NULL,
    `discoveryQuery` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PexelsMedia_mediaType_createdAt_idx`(`mediaType`, `createdAt`),
    INDEX `PexelsMedia_ossStatus_idx`(`ossStatus`),
    INDEX `PexelsMedia_discoveryQuery_idx`(`discoveryQuery`),
    INDEX `PexelsMedia_provider_idx`(`provider`),
    UNIQUE INDEX `PexelsMedia_provider_pexelsId_key`(`provider`, `pexelsId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PexelsQueryCache` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL DEFAULT 'pexels',
    `queryHash` VARCHAR(191) NOT NULL,
    `query` VARCHAR(191) NOT NULL,
    `mediaType` VARCHAR(191) NOT NULL,
    `orientation` VARCHAR(191) NULL,
    `size` VARCHAR(191) NULL,
    `color` VARCHAR(191) NULL,
    `schemaVersion` INTEGER NOT NULL DEFAULT 1,
    `totalResults` INTEGER NOT NULL DEFAULT 0,
    `pexelsIds` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PexelsQueryCache_queryHash_key`(`queryHash`),
    INDEX `PexelsQueryCache_query_mediaType_idx`(`query`, `mediaType`),
    INDEX `PexelsQueryCache_provider_idx`(`provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IpProfile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `nickname` VARCHAR(191) NULL,
    `industry` VARCHAR(191) NULL,
    `primaryOffer` TEXT NULL,
    `targetAudience` TEXT NULL,
    `ipTraits` TEXT NULL,
    `toneOfVoice` VARCHAR(191) NULL,
    `proofPoints` TEXT NULL,
    `callToAction` TEXT NULL,
    `promptSnapshot` TEXT NULL,
    `isComplete` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `profileVersion` INTEGER NULL DEFAULT 1,
    `surveyIndustry` VARCHAR(191) NULL,
    `surveyTargetCustomer` TEXT NULL,
    `surveyMonetization` JSON NULL,
    `surveyPersonalTraits` TEXT NULL,
    `surveyContentGoal` VARCHAR(191) NULL,
    `business` JSON NULL,
    `persona` JSON NULL,
    `content` JSON NULL,

    UNIQUE INDEX `IpProfile_userId_key`(`userId`),
    INDEX `IpProfile_isComplete_idx`(`isComplete`),
    INDEX `IpProfile_profileVersion_idx`(`profileVersion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AimMemory` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `agentId` VARCHAR(40) NOT NULL,
    `kind` VARCHAR(24) NOT NULL,
    `content` TEXT NOT NULL,
    `entityIds` JSON NOT NULL,
    `sourceGenerationId` VARCHAR(191) NULL,
    `relevance` DOUBLE NOT NULL DEFAULT 1.0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AimMemory_userId_projectId_agentId_idx`(`userId`, `projectId`, `agentId`),
    INDEX `AimMemory_userId_projectId_kind_idx`(`userId`, `projectId`, `kind`),
    INDEX `AimMemory_projectId_createdAt_idx`(`projectId`, `createdAt` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientProject` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `companyName` VARCHAR(191) NULL,
    `industry` VARCHAR(191) NULL,
    `targetCustomer` TEXT NULL,
    `offer` TEXT NULL,
    `deliveryGoal` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ClientProject_userId_status_idx`(`userId`, `status`),
    INDEX `ClientProject_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VideoTask` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `avatarId` VARCHAR(191) NULL,
    `scriptId` VARCHAR(191) NULL,
    `productionPlanId` VARCHAR(191) NULL,
    `structureId` VARCHAR(191) NULL,
    `packagingTemplateId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `deliveryStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `deliveryWarning` TEXT NULL,
    `deliveryExpiresAt` DATETIME(3) NULL,
    `videoType` VARCHAR(191) NOT NULL DEFAULT 'virtualman_broadcast',
    `videoUrl` VARCHAR(191) NULL,
    `coverUrl` VARCHAR(191) NULL,
    `scriptContent` TEXT NOT NULL,
    `avatarName` VARCHAR(191) NOT NULL,
    `duration` INTEGER NULL,
    `externalTaskId` VARCHAR(191) NULL,
    `structureSnapshot` JSON NULL,
    `packagingSnapshot` JSON NULL,
    `shanjianPayload` JSON NULL,
    `errorCode` VARCHAR(191) NULL,
    `errorMessage` TEXT NULL,
    `marketingAnalysis` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `enhancementStatus` VARCHAR(191) NULL,
    `enhancementJobId` VARCHAR(191) NULL,
    `enhanced4kUrl` VARCHAR(191) NULL,
    `enhanced4kCoverUrl` VARCHAR(191) NULL,
    `enhanced4kDuration` INTEGER NULL,
    `enhancementErrorCode` VARCHAR(191) NULL,
    `enhancementErrorMessage` TEXT NULL,
    `enhancementStartedAt` DATETIME(3) NULL,
    `enhancementCompletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `VideoTask_externalTaskId_key`(`externalTaskId`),
    UNIQUE INDEX `VideoTask_enhancementJobId_key`(`enhancementJobId`),
    INDEX `VideoTask_userId_status_idx`(`userId`, `status`),
    INDEX `VideoTask_userId_deliveryStatus_idx`(`userId`, `deliveryStatus`),
    INDEX `VideoTask_externalTaskId_idx`(`externalTaskId`),
    INDEX `VideoTask_status_updatedAt_idx`(`status`, `updatedAt`),
    INDEX `VideoTask_productionPlanId_idx`(`productionPlanId`),
    INDEX `VideoTask_enhancementStatus_updatedAt_idx`(`enhancementStatus`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VideoPackagingTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `shanjianId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `coverUrl` VARCHAR(191) NULL,
    `demoUrl` VARCHAR(191) NULL,
    `scene` VARCHAR(191) NOT NULL,
    `capabilities` JSON NOT NULL,
    `description` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'published',
    `lastSyncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VideoPackagingTemplate_shanjianId_key`(`shanjianId`),
    INDEX `VideoPackagingTemplate_scene_status_idx`(`scene`, `status`),
    INDEX `VideoPackagingTemplate_status_sortOrder_idx`(`status`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VideoProductionPlan` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `scriptId` VARCHAR(191) NOT NULL,
    `packagingTemplateId` VARCHAR(191) NULL,
    `structureId` VARCHAR(191) NULL,
    `styleId` VARCHAR(191) NOT NULL,
    `materials` JSON NULL,
    `backgroundMusic` JSON NULL,
    `packRules` JSON NULL,
    `processRules` JSON NULL,
    `recommendationContext` JSON NULL,
    `videoType` VARCHAR(191) NOT NULL DEFAULT 'virtualman_broadcast',
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VideoProductionPlan_userId_status_idx`(`userId`, `status`),
    INDEX `VideoProductionPlan_scriptId_idx`(`scriptId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AimGeneration` ADD CONSTRAINT `AimGeneration_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AimGeneration` ADD CONSTRAINT `AimGeneration_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IpWikiPage` ADD CONSTRAINT `IpWikiPage_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IpWikiPage` ADD CONSTRAINT `IpWikiPage_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentApiKey` ADD CONSTRAINT `AgentApiKey_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentApiCallLog` ADD CONSTRAINT `AgentApiCallLog_apiKeyId_fkey` FOREIGN KEY (`apiKeyId`) REFERENCES `AgentApiKey`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentApiCallLog` ADD CONSTRAINT `AgentApiCallLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AimExecutionTrace` ADD CONSTRAINT `AimExecutionTrace_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AimRunSnapshot` ADD CONSTRAINT `AimRunSnapshot_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AimRunEvent` ADD CONSTRAINT `AimRunEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentOutcome` ADD CONSTRAINT `ContentOutcome_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentOutcome` ADD CONSTRAINT `ContentOutcome_generationId_fkey` FOREIGN KEY (`generationId`) REFERENCES `AimGeneration`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompetitorAnalysis` ADD CONSTRAINT `CompetitorAnalysis_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WatchAccount` ADD CONSTRAINT `WatchAccount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoCopyExtraction` ADD CONSTRAINT `VideoCopyExtraction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BenchmarkProfile` ADD CONSTRAINT `BenchmarkProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BenchmarkProfile` ADD CONSTRAINT `BenchmarkProfile_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BenchmarkProfileItem` ADD CONSTRAINT `BenchmarkProfileItem_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `BenchmarkProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Script` ADD CONSTRAINT `Script_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Script` ADD CONSTRAINT `Script_generationRunId_fkey` FOREIGN KEY (`generationRunId`) REFERENCES `ContentGenerationRun`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Script` ADD CONSTRAINT `Script_ipProfileId_fkey` FOREIGN KEY (`ipProfileId`) REFERENCES `IpProfile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Script` ADD CONSTRAINT `Script_structureId_fkey` FOREIGN KEY (`structureId`) REFERENCES `VideoStructure`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentGenerationRun` ADD CONSTRAINT `ContentGenerationRun_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentGenerationRun` ADD CONSTRAINT `ContentGenerationRun_ipProfileId_fkey` FOREIGN KEY (`ipProfileId`) REFERENCES `IpProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentGenerationRun` ADD CONSTRAINT `ContentGenerationRun_structureId_fkey` FOREIGN KEY (`structureId`) REFERENCES `VideoStructure`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TopicSelection` ADD CONSTRAINT `TopicSelection_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TopicSelection` ADD CONSTRAINT `TopicSelection_ipProfileId_fkey` FOREIGN KEY (`ipProfileId`) REFERENCES `IpProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inspiration` ADD CONSTRAINT `Inspiration_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminAuditLog` ADD CONSTRAINT `AdminAuditLog_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivationCode` ADD CONSTRAINT `ActivationCode_usedBy_fkey` FOREIGN KEY (`usedBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivationCode` ADD CONSTRAINT `ActivationCode_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnowledgeEntry` ADD CONSTRAINT `KnowledgeEntry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnowledgeEntry` ADD CONSTRAINT `KnowledgeEntry_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnowledgeEmbedding` ADD CONSTRAINT `KnowledgeEmbedding_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `KnowledgeEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnowledgeEntity` ADD CONSTRAINT `KnowledgeEntity_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnowledgeEntity` ADD CONSTRAINT `KnowledgeEntity_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnowledgeRelation` ADD CONSTRAINT `KnowledgeRelation_fromEntityId_fkey` FOREIGN KEY (`fromEntityId`) REFERENCES `KnowledgeEntity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnowledgeRelation` ADD CONSTRAINT `KnowledgeRelation_toEntityId_fkey` FOREIGN KEY (`toEntityId`) REFERENCES `KnowledgeEntity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnowledgeRelation` ADD CONSTRAINT `KnowledgeRelation_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `KnowledgeEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Avatar` ADD CONSTRAINT `Avatar_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublicAvatarPreviewPreference` ADD CONSTRAINT `PublicAvatarPreviewPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublicAvatarPreviewPreference` ADD CONSTRAINT `PublicAvatarPreviewPreference_previewCacheId_fkey` FOREIGN KEY (`previewCacheId`) REFERENCES `PublicAvatarPreviewCache`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IpProfile` ADD CONSTRAINT `IpProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AimMemory` ADD CONSTRAINT `AimMemory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AimMemory` ADD CONSTRAINT `AimMemory_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientProject` ADD CONSTRAINT `ClientProject_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoTask` ADD CONSTRAINT `VideoTask_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoTask` ADD CONSTRAINT `VideoTask_avatarId_fkey` FOREIGN KEY (`avatarId`) REFERENCES `Avatar`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoTask` ADD CONSTRAINT `VideoTask_scriptId_fkey` FOREIGN KEY (`scriptId`) REFERENCES `Script`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoTask` ADD CONSTRAINT `VideoTask_productionPlanId_fkey` FOREIGN KEY (`productionPlanId`) REFERENCES `VideoProductionPlan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoTask` ADD CONSTRAINT `VideoTask_structureId_fkey` FOREIGN KEY (`structureId`) REFERENCES `VideoStructure`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoTask` ADD CONSTRAINT `VideoTask_packagingTemplateId_fkey` FOREIGN KEY (`packagingTemplateId`) REFERENCES `VideoPackagingTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoProductionPlan` ADD CONSTRAINT `VideoProductionPlan_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoProductionPlan` ADD CONSTRAINT `VideoProductionPlan_structureId_fkey` FOREIGN KEY (`structureId`) REFERENCES `VideoStructure`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoProductionPlan` ADD CONSTRAINT `VideoProductionPlan_packagingTemplateId_fkey` FOREIGN KEY (`packagingTemplateId`) REFERENCES `VideoPackagingTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
