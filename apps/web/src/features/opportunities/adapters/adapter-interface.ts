import type {
  FilterCapability,
  OpportunityItem,
  OpportunityPlatform,
  SearchFilters,
} from "../contracts/types"

// ─── Search Adapter Interface ────────────────────────────

export interface SearchAdapterParams {
  keyword: string
  count: number
  cursor?: string
  filters?: SearchFilters
}

export interface SearchAdapterResult {
  items: OpportunityItem[]
  cursor?: string
  hasMore: boolean
  total?: number
}

export interface SearchAdapter {
  readonly platform: OpportunityPlatform
  searchVideos(params: SearchAdapterParams): Promise<SearchAdapterResult>
  supportedFilters(): FilterCapability[]
}
