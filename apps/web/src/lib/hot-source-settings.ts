import {
  BUILT_IN_ACCOUNT_SOURCE_BINDINGS,
  loadAccountSourceBindings,
  type AccountIndustrySource,
  type AccountSourceBinding,
} from "@/lib/account-industry-sources"
import { prisma } from "@/lib/prisma"

export const HOT_SOURCE_CATEGORY = "hot-sources"

export type HotSourceInput = {
  email: string
  sourceName: string
  sourceUrl: string
  sourceType?: string
  enabled?: boolean
  note?: string
}

export function buildHotSourceBinding(input: HotSourceInput): AccountSourceBinding {
  return {
    email: input.email.trim().toLowerCase(),
    sources: [
      {
        source_name: input.sourceName.trim(),
        source_url: input.sourceUrl.trim(),
        source_type: input.sourceType?.trim() || "static",
        status: input.enabled === false ? "inactive" : "active",
        note: input.note?.trim() || undefined,
      },
    ],
  }
}

export function hotSourceSettingKey(email: string) {
  const slug = email
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return `hot-source-${slug}`
}

export async function loadSystemAccountSourceBindings(): Promise<AccountSourceBinding[]> {
  const settings = await prisma.systemSetting.findMany({
    where: { category: HOT_SOURCE_CATEGORY },
    orderBy: { updatedAt: "desc" },
    take: 500,
  })

  return settings
    .map((setting) => parseAccountSourceBinding(setting.value))
    .filter((binding): binding is AccountSourceBinding => Boolean(binding))
}

export async function loadEffectiveAccountSourceBindings(): Promise<AccountSourceBinding[]> {
  const systemBindings = await loadSystemAccountSourceBindings()
  return mergeAccountSourceBindings(systemBindings, await loadAccountSourceBindings())
}

export function mergeAccountSourceBindings(
  systemBindings: AccountSourceBinding[],
  localBindings: AccountSourceBinding[] = []
): AccountSourceBinding[] {
  const systemEmails = new Set(systemBindings.map((entry) => entry.email.toLowerCase()))
  const builtInBindings = BUILT_IN_ACCOUNT_SOURCE_BINDINGS.filter(
    (entry) => !systemEmails.has(entry.email.toLowerCase())
  )
  return [
    ...systemBindings,
    ...builtInBindings,
    ...localBindings,
  ]
}

export function parseAccountSourceBinding(value: string): AccountSourceBinding | null {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== "object") return null
    const candidate = parsed as Record<string, unknown>
    const email = typeof candidate.email === "string" ? candidate.email.trim().toLowerCase() : ""
    const rawSources = Array.isArray(candidate.sources) ? candidate.sources : []
    const sources: AccountIndustrySource[] = []

    for (const source of rawSources) {
      if (source && typeof source === "object") {
        const row = source as Record<string, unknown>
        const sourceName = typeof row.source_name === "string" ? row.source_name.trim() : ""
        const sourceUrl = typeof row.source_url === "string" ? row.source_url.trim() : ""
        if (!sourceName || !sourceUrl) continue
        sources.push({
          source_name: sourceName,
          source_url: sourceUrl,
          source_type: typeof row.source_type === "string" ? row.source_type : undefined,
          status: typeof row.status === "string" ? row.status : undefined,
          note: typeof row.note === "string" ? row.note : undefined,
        })
      }
    }

    if (!email || sources.length === 0) return null
    return { email, sources }
  } catch {
    return null
  }
}
