-- Additive: AssetCandidate.wikiPageType（wiki_patch 候选的目标 IP 维基页类型；
-- 非 wiki_patch 候选为 NULL。历史数据不受影响，不回填。）
ALTER TABLE `AssetCandidate`
  ADD COLUMN `wikiPageType` VARCHAR(32) NULL;
