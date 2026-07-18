-- Prevent version timelines for different output formats from sharing a counter.
CREATE INDEX `AimContentVersion_generationId_format_versionNo_idx`
  ON `AimContentVersion`(`generationId`, `format`, `versionNo`);
CREATE INDEX `AimContentVersion_conversationId_format_versionNo_idx`
  ON `AimContentVersion`(`conversationId`, `format`, `versionNo`);
