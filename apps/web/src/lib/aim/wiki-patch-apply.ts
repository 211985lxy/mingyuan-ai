/**
 * 维基 patch 候选审核通过后的应用（P3-4）。
 *
 * 与 promoteKnowledgeEntry 并列的第二条升级路径：
 *   wiki_patch 候选 approve → 增量合并进目标 IP 维基页（不升级 KnowledgeEntry）
 *                          → 同时双写本地 Obsidian vault（分客户目录）
 *
 * 设计要点：
 * - updateIpWikiPage 是「替换」语义，这里做「增量合并」：读原 active 页 content，
 *   把候选 content 追加到末尾，再作为 patch.content 写回。保留人工已有内容。
 * - 目标页缺失（该 pageType 还无 active 页）时返回 null（不凭空建页，宁缺毋滥）。
 * - Obsidian 双写按 {vault}/{客户}/会议纪要/ 结构，复用 .obsidian-sync.json 的 vaultPath。
 */
import { promises as fs } from "fs"
import path from "path"
import { listIpWikiPages, updateIpWikiPage } from "@/lib/ip-wiki/repo"
import type { IpWikiPageType } from "@/lib/ip-wiki/types"
import { isIpWikiPageType } from "@/lib/ip-wiki/types"
import type { AssetCandidateRecord } from "@/lib/aim/asset-candidate-store"

/** 应用维基 patch 的结果。 */
export type ApplyWikiPatchResult =
  | { ok: true; applied: boolean; pageId: string | null }
  | { ok: false; error: string }

/**
 * 把一条 wiki_patch 候选增量合并进目标 IP 维基页。
 * 目标页不存在（pageType 尚无 active 页）时 applied=false，不报错。
 */
export async function applyWikiPatchCandidate(input: {
  userId: string
  projectId: string
  record: AssetCandidateRecord
}): Promise<ApplyWikiPatchResult> {
  const pageType = input.record.wikiPageType
  if (!pageType || !isIpWikiPageType(pageType)) {
    return { ok: false, error: `wiki_patch 候选的 wikiPageType 非法：${pageType}` }
  }

  // 查目标 pageType 的 active 页（增量合并的基线）
  const pages = await listIpWikiPages({
    projectId: input.projectId,
    pageTypes: [pageType as IpWikiPageType],
  })
  const target = pages[0]
  if (!target) {
    // 目标页尚未建立：不凭空创建，待维基主编译后再生效。
    return { ok: true, applied: false, pageId: null }
  }

  // 增量合并：候选 content 追加到原 content 末尾（保留人工已有内容）
  const mergedContent = `${target.content}\n\n${input.record.content}`.slice(0, 8000)
  const updated = await updateIpWikiPage({
    userId: input.userId,
    projectId: input.projectId,
    id: target.id,
    patch: { content: mergedContent },
  })

  // Obsidian 双写（失败不阻断主流程，仅记日志；vault 未配置时跳过）
  await writeObsidianDouble(input.record).catch(() => {
    /* 双写为辅助，失败不回滚维基 patch */
  })

  return { ok: true, applied: true, pageId: updated?.id ?? null }
}

/**
 * 双写本地 Obsidian vault：按 {vault}/{客户}/会议纪要/ 结构。
 * 复用 .obsidian-sync.json 的 obsidianVaultPath；未配置则跳过（返回 false，非错误）。
 */
async function writeObsidianDouble(record: AssetCandidateRecord): Promise<boolean> {
  const configPath = path.join(process.cwd(), ".obsidian-sync.json")
  let vaultPath: string | undefined
  try {
    const raw = await fs.readFile(configPath, "utf-8")
    const cfg = JSON.parse(raw) as { obsidianVaultPath?: string }
    vaultPath = cfg.obsidianVaultPath?.trim()
  } catch {
    return false // 配置缺失，跳过双写
  }
  if (!vaultPath) return false

  // 客户名做安全目录名（去路径分隔符，防目录穿越）
  const safeCustomer = (record.content.match(/客户「([^」]+)」/)?.[1] ?? "未指明客户")
    .replace(/[\\/]/g, "")
    .slice(0, 40)
  const folder = path.join(vaultPath, safeCustomer, "会议纪要")
  await fs.mkdir(folder, { recursive: true })

  const ts = new Date().toISOString().slice(0, 10)
  const safeTitle = record.title.replace(/[\\/:*?"<>|]/g, "").slice(0, 50)
  const filePath = path.join(folder, `${ts}-${safeTitle}.md`)

  const frontmatter = [
    "---",
    `title: ${record.title}`,
    `wikiPageType: ${record.wikiPageType}`,
    `source: meeting_insight`,
    `generatedAt: ${new Date().toISOString()}`,
    `candidateId: ${record.id}`,
    "---",
    "",
  ].join("\n")

  await fs.writeFile(filePath, `${frontmatter}${record.content}`, "utf-8")
  return true
}
