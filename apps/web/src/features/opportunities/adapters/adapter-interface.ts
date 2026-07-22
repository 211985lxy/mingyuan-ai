import type { OpportunityItem, OpportunityPlatform, SearchFilters } from "../contracts/types"

export interface PlatformSearchInput {
  keyword: string
  count: number
  filters?: SearchFilters
}

export interface PlatformSearchOutput {
  platform: OpportunityPlatform
  status: "ok" | "error" | "timeout"
  items: OpportunityItem[]
  error?: string
  durationMs: number
}

export interface SearchAdapter {
  readonly platform: OpportunityPlatform
  search(input: PlatformSearchInput): Promise<PlatformSearchOutput>
}
