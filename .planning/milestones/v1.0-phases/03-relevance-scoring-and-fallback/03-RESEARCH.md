# Phase 3: Relevance Scoring and Fallback — Research

**Researched:** 2026-03-25
**Domain:** Post-search LLM relevance scoring, deterministic pre-filter, abstract fallback for stock media pipeline
**Confidence:** HIGH

---

## Summary

Phase 3 is the final quality gate in the Smart Material Matching milestone. Phases 1 and 2 are complete: industry-specific LLM queries are now generated, OSS transfers are async, and the cache carries a `schemaVersion` field waiting to be bumped. This phase installs the scoring layer that was always planned — a two-tier gate that runs a deterministic keyword pre-filter first (zero LLM cost), then invokes a single batched LLM call per query-entry only when deterministic yield falls short, and fills remaining slots with contextually appropriate abstract visuals when scored candidates are still insufficient.

The implementation surface is narrow. The primary deliverable is a new file `apps/web/src/lib/material-relevance.ts` exporting `scoreAndFilterMedia()`. The route.ts changes are surgical: wrap the existing per-entry candidate loop with the scorer, add abstract fallback generation after each entry's loop exits with fewer than `entry.count` accepted results, extend the `planSource` enum in `types/api.ts` to three values, and bump `CACHE_SCHEMA_VERSION` from 1 to 2. No new npm packages. No schema migrations. No changes to `lib/packaging-materials.ts`, provider clients, or DB models beyond the constant bump.

The single highest-risk decision is the threshold: at what deterministic keyword overlap percentage does LLM scoring trigger? The prior research proposes 50% as the starting constant. This is an informed estimate, not an empirically validated number. It must be treated as a tuneable constant from day one and adjusted after the first week of real usage data.

**Primary recommendation:** Build the scorer as a pure function in `material-relevance.ts` that accepts `CachedPhotoRow[]` + business context and returns `ScoredMediaRow[]`. Keep thresholds as named constants so they can be changed with a one-line edit. Integrate into route.ts by wrapping the existing candidate acceptance loop — no rewrite of the loop structure needed.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for Phase 3. All design choices are at Claude's discretion within the requirements and decisions accumulated in STATE.md and the prior phase summaries.

### Locked Decisions (from STATE.md accumulated decisions)

- Batched LLM scoring (one call per query entry) is mandatory — per-item scoring adds 10+ seconds of latency
- FBACK-01/FBACK-02 grouped with Phase 3 scoring because abstract fallback triggers when scoring produces insufficient results
- schemaVersion baked into queryHash — bumping CACHE_SCHEMA_VERSION from 1 to 2 auto-invalidates pre-scoring cache entries
- Phase 3 scoring thresholds (deterministic: 50%, LLM pass score: 5/10) are informed estimates — treat as starting points, tune after first week of real usage data
- INDUSTRY_ABSTRACT_QUERY_MAP will have coverage gaps for niche industries — extend as gaps are reported, don't try to pre-populate exhaustively
- The scoring module should be a new file: `apps/web/src/lib/material-relevance.ts`

### Claude's Discretion

- Exact deterministic keyword blocklist content (which nature/off-domain terms to reject by default)
- Exact abstract fallback query strings per industry category and tone
- Whether abstract fallback uses the existing `resolveVisualArchetype` output as input or maintains its own independent map (`INDUSTRY_ABSTRACT_QUERY_MAP`)
- LLM prompt wording for batch scoring
- How `quality: "generic"` is surfaced in `MaterialAssignment` (new field vs extended `source` value vs `planSource` only)
- Test file naming and structure

### Deferred Ideas (OUT OF SCOPE)

- Multi-query fallback chain (MQRY-01, MQRY-02) — deferred to future requirements
- Relevance score persistence to DB (SANA-01, SANA-02) — explicitly out of scope
- Vision model image scoring — explicitly out of scope
- Hardcoded industry vocabulary table beyond what already exists — universal LLM approach preferred
- Third fallback tier — abstract fallback is the terminal tier for v1
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RSCO-01 | Deterministic pre-filter rejects results whose alt text/tags have zero overlap with the business context (Tier 1, no LLM cost) | Confirmed viable: PexelsMedia.alt and discoveryQuery fields are already stored; keyword intersection is pure string matching with no external calls |
| RSCO-02 | LLM batch relevance scoring evaluates remaining candidates in a single call per query-entry, scoring relevance to the user's business (Tier 2) | Confirmed via SIGIR 2025 batching research: one call per entry with JSON array output achieves 6-17x latency improvement vs per-item calls; LLMClient.shared().complete() with json_object format supports this |
| RSCO-03 | Results below relevance threshold are filtered out before being presented as suggestions | Implementation: filter ScoredMediaRow[] where score < LLM_PASS_THRESHOLD or rejected === true before the existing `suggestions.push()` call |
| FBACK-01 | When scoring produces fewer results than needed, system falls back to abstract/generic visuals (patterns, textures, business-themed graphics) instead of accepting irrelevant concrete images | Implementation: after per-entry collection loop exits with collected < entry.count, call generateAbstractFallback(role, context) to fill remaining slots |
| FBACK-02 | Abstract fallback queries are contextually appropriate to the business tone (professional services get clean/minimal abstracts, food businesses get warm/textured abstracts) | Implementation: INDUSTRY_ABSTRACT_QUERY_MAP maps resolveVisualArchetype output categories to tone-appropriate abstract search terms; two tone buckets sufficient for v1 |
</phase_requirements>

---

## Standard Stack

### Core (all already present — no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `LLMClient.shared()` | existing | Batch scoring LLM call (Tier 2) | Already in production, handles OpenRouter provider chain, `json_object` responseFormat confirmed |
| `PACKAGING_MATERIAL_PLAN_MODEL` env | `openai/gpt-5.4-mini` | Model for scoring prompt | Same model as query generation — adequate for relevance classification, no upgrade needed |
| Prisma `PexelsMedia` | existing | Source of `alt`, `discoveryQuery` fields for Tier 1 keyword matching | Already queried by `loadMediaFromAllProviders()`; no new columns needed |
| `CACHE_SCHEMA_VERSION` constant | currently `1` | Bump to `2` at Phase 3 deploy to invalidate pre-scoring cache entries | Already in route.ts with JSDoc comment noting v2 is reserved for Phase 3 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `resolveVisualArchetype()` | existing in route.ts | Maps Chinese industry strings to English visual archetypes | Used as input to INDUSTRY_ABSTRACT_QUERY_MAP lookup |
| `loadMediaFromAllProviders()` | existing in route.ts | Stock API query (abstract fallback also calls this) | Abstract fallback queries go through the normal provider path — they benefit from caching |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Batched single LLM call per query-entry | Per-item LLM calls | Per-item is 6-17x slower (SIGIR 2025); rejected |
| Text metadata scoring (alt + tags) | Vision model pixel scoring | Vision is prohibitive at scale and adds image download latency; text metadata is sufficient for coarse relevance |
| Ephemeral per-request scores | Persisting scores to DB | Persistence adds write volume and cache invalidation complexity; scores are request-scoped and IP-profile-dependent |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

The new file fits into the existing `lib/` pattern:

```
apps/web/src/lib/
├── material-relevance.ts    # NEW — scoreAndFilterMedia(), generateAbstractFallback()
├── packaging-materials.ts   # UNCHANGED — role/count/durability helpers
├── pexels.ts                # UNCHANGED
├── pixabay.ts               # UNCHANGED
└── pexels-oss.ts            # UNCHANGED

apps/web/src/app/api/packaging-material-suggestions/
└── route.ts                 # MODIFY — wire scorer + abstract fallback into per-entry loop
                             #          bump CACHE_SCHEMA_VERSION to 2
                             #          extend SearchPlanResult.source to include "abstract_fallback"

apps/web/src/types/
└── api.ts                   # MODIFY — planSource union: add "abstract_fallback"
                             #          MaterialAssignment: add quality?: "generic" | "matched"

apps/web/__tests__/e2e/
└── material-relevance.test.ts  # NEW — unit + static analysis tests for RSCO-01/02/03/FBACK-01/02
```

### Pattern 1: Two-Tier Scoring Gate

**What:** Deterministic keyword intersection always runs first. LLM scoring runs only when deterministic acceptance rate is below `DETERMINISTIC_YIELD_THRESHOLD` (50%).

**When to use:** When scoring quality matters but LLM latency must be bounded. Tier 1 is free; Tier 2 triggers only when absolutely needed.

**Example (lib/material-relevance.ts):**
```typescript
// Source: Architecture research + SIGIR 2025 batching confirmation
export interface ScoredMediaRow {
  row: CachedPhotoRow;
  score: number;       // 0-100
  rejected: boolean;
  tier: "deterministic" | "llm";
  rejectionReason?: string;
}

const DETERMINISTIC_YIELD_THRESHOLD = 0.5; // if < 50% pass Tier 1, invoke LLM
const LLM_PASS_SCORE = 5;                  // out of 10; below this = rejected

export async function scoreAndFilterMedia(
  rows: CachedPhotoRow[],
  context: { industry: string | null; primaryOffer: string | null; targetAudience: string | null },
  entry: { role: SafeRole; query: string }
): Promise<ScoredMediaRow[]>
```

**Integration into route.ts:**
```typescript
// Source: Architecture research — wrap existing candidate acceptance loop
for (const entry of searchPlan.queries) {
  const candidates = await loadMediaFromAllProviders(
    entry.query,
    entry.mediaType,
    Math.max(4, entry.count * 3), // fetch 3x to ensure enough pass scoring
  );
  const scored = await scoreAndFilterMedia(candidates, context, entry);
  const accepted = scored.filter((s) => !s.rejected);

  for (const { row } of accepted) {
    // ... existing push logic
    if (collected >= entry.count) break;
  }

  // Abstract fallback when scored candidates are still insufficient
  if (collected < entry.count) {
    const abstractRows = await generateAbstractFallbackMedia(entry, context, entry.count - collected);
    // push abstractRows with quality: "generic"
  }
}
```

### Pattern 2: Deterministic Keyword Intersection (Tier 1)

**What:** Compute the ratio of business-context keywords present in `row.alt + row.discoveryQuery`. A result is a "Tier 1 pass" if the ratio exceeds `DETERMINISTIC_KEYWORD_PASS_RATIO`.

**Business keywords are derived from:**
1. The `resolveVisualArchetype()` output (already English vocabulary)
2. The `entry.query` string itself (already English keywords the LLM chose)
3. Negation list: if `row.alt` contains nature/landscape terms unrelated to any business context, score 0 immediately

**Rejection terms (confirmed failure modes from project docs):**
"mountain", "lake", "reflection", "bird", "sky", "forest", "ocean", "beach", "sunset", "flower bouquet" (when industry is not florist), "generic office" (when industry has specific visual vocabulary)

**The key design choice:** Keep the blocklist short and business-agnostic. "lake" is a rejection signal for an HVAC business but NOT for a tourism business. The blocklist check must be gated on whether the business context has specific visual vocabulary. Implementation: if `resolveVisualArchetype()` returns "professional service business" (generic fallback), skip the blocklist check.

**Example:**
```typescript
// Source: Codebase inspection — alt and discoveryQuery are the right metadata fields
function scoreDeterministic(
  row: CachedPhotoRow,
  businessKeywords: string[],
  offDomainTerms: string[],
): { score: number; rejected: boolean; reason?: string } {
  const text = [row.alt ?? "", row.discoveryQuery ?? ""].join(" ").toLowerCase();

  // Hard rejection: off-domain nature terms present AND no business keyword overlap
  const hasOffDomain = offDomainTerms.some((term) => text.includes(term));
  const businessOverlap = businessKeywords.filter((kw) => text.includes(kw.toLowerCase())).length;
  if (hasOffDomain && businessOverlap === 0) {
    return { score: 0, rejected: true, reason: "off-domain nature term, no business keyword overlap" };
  }

  const overlapRatio = businessKeywords.length > 0
    ? businessOverlap / businessKeywords.length
    : 0.5; // if no keywords, neutral pass
  return { score: Math.round(overlapRatio * 100), rejected: false };
}
```

### Pattern 3: LLM Batch Scoring (Tier 2)

**What:** Send all remaining Tier 1 survivors (or all candidates if Tier 1 yield was >= threshold) to a single LLM call. Ask for a JSON array of `{ id, score, reject }` where `score` is 0-10.

**Prompt structure:**
- System: describe the scoring task — evaluate how relevant each stock photo is to the user's specific business
- User: IP profile context (industry, primaryOffer, targetAudience) + array of candidates with their alt text
- Output schema: `[{"id":"pexels:123","score":8,"reject":false}, ...]`

**Critical constraint:** Keep the system prompt short and the candidate list concise. Send `alt` text only (not full srcJson). Cap at 20 candidates per call. With gpt-5.4-mini at ~500ms/call, one call per query-entry adds ~500ms total — acceptable.

```typescript
// Source: LLM-as-judge pattern confirmed by softwaredoug.com + SIGIR batching research
const scoringSystemPrompt = `你是一名图库素材相关性评估专家。
给定用户的业务背景和一批图库素材的描述，为每条素材评分（0-10），判断是否与用户的具体行业相关。

评分标准：
- 9-10：高度相关，直接展示用户行业的典型场景
- 6-8：相关，展示的内容符合用户业务方向
- 3-5：边缘相关，通用商业场景，非行业特定
- 0-2：不相关，展示了与用户行业无关的场景（如自然风景、其他行业）

输出 JSON 数组：[{"id":"pexels:123","score":7,"reject":false}]
reject=true 当 score <= ${LLM_PASS_SCORE}。`;
```

### Pattern 4: Abstract Fallback Generation

**What:** When scored candidates (across both tiers) are fewer than `entry.count`, fill remaining slots by querying abstract visual terms contextually appropriate to the business tone.

**Two tone buckets (sufficient for v1):**
- "warm/textured": food, bakery, florist, postpartum care, early childhood — abstract queries like "warm texture background soft", "natural linen texture close-up"
- "clean/minimal": legal, medical aesthetic, dental, real estate, professional services — abstract queries like "minimal white office surface clean", "professional abstract geometric"

**INDUSTRY_ABSTRACT_QUERY_MAP** maps `resolveVisualArchetype()` output to tone and fallback query strings:

```typescript
// lib/material-relevance.ts
const INDUSTRY_ABSTRACT_QUERY_MAP: Record<string, {
  tone: "warm" | "clean";
  abstractQueries: Record<SafeRole, string>;
}> = {
  "HVAC technician air conditioning":     { tone: "clean", abstractQueries: { product_detail: "technical equipment close-up clean", store_environment: "professional workspace interior minimal", process: "technician working professional clean" }},
  "baker pastry bakery":                  { tone: "warm",  abstractQueries: { product_detail: "warm texture food background soft", store_environment: "cozy warm interior bakery cafe", process: "handcraft artisan warm light" }},
  "medical aesthetic beauty treatment":   { tone: "clean", abstractQueries: { product_detail: "clean white medical equipment", store_environment: "minimal clinic interior white", process: "professional beauty treatment calm" }},
  "carpenter woodwork furniture":         { tone: "warm",  abstractQueries: { product_detail: "wood grain texture natural close-up", store_environment: "workshop interior warm wood", process: "craftsman hands working wood" }},
  "postnatal care newborn":               { tone: "warm",  abstractQueries: { product_detail: "soft pastel fabric texture gentle", store_environment: "warm nursery interior soft", process: "gentle care hands soft warm" }},
  "restaurant kitchen food":              { tone: "warm",  abstractQueries: { product_detail: "food ingredient texture warm", store_environment: "restaurant interior warm dining", process: "cooking preparation warm light" }},
  "fitness gym workout":                  { tone: "clean", abstractQueries: { product_detail: "sport equipment close-up clean", store_environment: "gym interior modern clean", process: "athlete motion dynamic clean" }},
  "auto mechanic car service":            { tone: "clean", abstractQueries: { product_detail: "metal tool close-up industrial", store_environment: "garage workshop industrial", process: "mechanic hands professional work" }},
  "education classroom training":         { tone: "clean", abstractQueries: { product_detail: "books stationery clean minimal", store_environment: "classroom interior bright clean", process: "student learning focused" }},
  "retail store merchandise":             { tone: "warm",  abstractQueries: { product_detail: "product display close-up warm", store_environment: "retail interior warm display", process: "customer shopping lifestyle" }},
  "real estate property home":            { tone: "clean", abstractQueries: { product_detail: "interior detail clean minimal", store_environment: "modern home interior clean", process: "professional consultation clean" }},
  "lawyer legal office consultation":     { tone: "clean", abstractQueries: { product_detail: "document paper professional", store_environment: "office interior professional clean", process: "consultation meeting formal" }},
  "dentist dental clinic":                { tone: "clean", abstractQueries: { product_detail: "medical equipment close-up white", store_environment: "clinic interior bright white", process: "professional care gentle" }},
  "hair salon stylist":                   { tone: "warm",  abstractQueries: { product_detail: "hair styling tool close-up warm", store_environment: "salon interior warm mirror", process: "beauty service caring hands" }},
  "photography studio portrait":          { tone: "clean", abstractQueries: { product_detail: "camera equipment minimal", store_environment: "photography studio minimal light", process: "creative professional work" }},
  "pet care veterinary":                  { tone: "warm",  abstractQueries: { product_detail: "soft toy pet supply warm", store_environment: "pet care environment warm", process: "gentle animal care warm" }},
  "early childhood daycare":              { tone: "warm",  abstractQueries: { product_detail: "colorful toy close-up soft", store_environment: "children room bright colorful", process: "children playing soft warm" }},
  "home cleaning housekeeping":           { tone: "clean", abstractQueries: { product_detail: "cleaning supply close-up fresh", store_environment: "clean home interior bright", process: "cleaning professional tidy" }},
  "logistics delivery warehouse":         { tone: "clean", abstractQueries: { product_detail: "package box close-up clean", store_environment: "warehouse interior organized", process: "delivery professional work" }},
  "florist flower arrangement":           { tone: "warm",  abstractQueries: { product_detail: "flower petal texture close-up", store_environment: "flower shop warm colorful", process: "florist hands arrangement" }},
  "professional service business":        { tone: "clean", abstractQueries: { product_detail: "professional tool minimal clean", store_environment: "modern office interior clean", process: "professional work clean" }},
};
```

**FBACK-02 distinctness in API response:**
Abstract fallback results must carry `quality: "generic"` in the `MaterialAssignment`. Two options:
1. Extend `MaterialAssignment` interface with `quality?: "generic" | "matched"` — preferred, explicit
2. Use `planSource: "abstract_fallback"` in meta only — tells the consumer about the session but not the individual item

**Decision (Claude's discretion):** Both. `quality: "generic"` on individual items + `planSource: "abstract_fallback"` on meta when any abstract fallback was used. The planner should implement both for maximum frontend utility.

### Anti-Patterns to Avoid

- **Scoring cache hits with no scoring:** Cache hits return the same `CachedPhotoRow[]`; scoring MUST run on cache-hit results just as on fresh API results. The cache stores raw media IDs, not scored subsets. Skipping scoring for cache hits defeats the entire purpose.
- **Adding `if (planSource === 'llm') { score } else { skip }`:** The scoring tier is orthogonal to query source. Deterministic plan queries need scoring too.
- **Modifying `loadMediaFromAllProviders()` to accept scoring context:** Keep provider functions as pure query-in/rows-out. Scoring is a post-retrieval layer in the orchestrator.
- **LLM scoring with full script content in prompt:** Pass only the first 300 characters of the script summary (or omit if IP profile is sufficient). Full script pushes gpt-5.4-mini over context limits and slows the call.
- **Making abstract fallback queries bypass the cache:** Abstract fallback queries go through `loadMediaFromAllProviders()` which checks `PexelsQueryCache` automatically. Do not add a special fast-path that bypasses caching.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Business-context relevance scoring | Custom ML classifier or embedding similarity | LLM batch scoring via existing `LLMClient` | Text metadata (alt/tags) is sufficient for coarse relevance; LLM as judge is production-validated pattern |
| Keyword intersection | Regex or fuzzy matching | Simple `.includes()` on lowercased concatenated text | alt + discoveryQuery are already English prose; word boundary matching is sufficient at this signal level |
| Abstract query generation | Dynamic LLM generation of abstract queries at runtime | Static `INDUSTRY_ABSTRACT_QUERY_MAP` lookup | Deterministic is faster, cheaper, testable, and covers the 20 industry categories already mapped; LLM generation adds unnecessary latency on a fallback path |
| Cache invalidation of pre-scoring results | Manual table flush or WHERE clause additions | Bump `CACHE_SCHEMA_VERSION` from 1 to 2 | Infrastructure is already built in Phase 2 specifically for this moment |

---

## Common Pitfalls

### Pitfall 1: Scoring applied only to fresh API results, not cache hits

**What goes wrong:** `loadMediaFromAllProviders()` returns the same type whether from cache or API. If the route checks for cache origin before deciding to score, all cached entries from before Phase 3 deploy bypass scoring silently.

**Why it happens:** Developer writes `if (!wasCacheHit) { score(rows) }` to "save LLM calls." But the cache stores pre-scoring result sets. Phase 2's `CACHE_SCHEMA_VERSION` bump is the correct mechanism — after bumping to 2, old entries become cache misses, so the first call is a fresh API fetch that gets scored and written back. After that, subsequent requests get the Phase 2 cache entries which also need scoring because the cache stores raw IDs, not scored subsets.

**How to avoid:** Apply `scoreAndFilterMedia()` unconditionally to all rows returned by `loadMediaFromAllProviders()`, regardless of cache origin. The scoring step is cheap for Tier 1 (pure string matching) and Tier 2 only triggers when needed.

**Warning signs:** RSCO-01/RSCO-02 tests pass on fresh runs but fail after warm cache runs.

---

### Pitfall 2: Abstract fallback fills slots regardless of abstract content relevance

**What goes wrong:** Abstract queries like "warm texture food background soft" also return zero results for niche Pexels terms. The fallback fires `loadMediaFromAllProviders()` but gets back an empty array, and the route returns fewer suggestions than requested with no indication of why.

**Why it happens:** Abstract fallback is assumed to always produce results because queries are generic. But Pexels free tier returns zero for some texture/pattern terms.

**How to avoid:** After calling `loadMediaFromAllProviders()` for abstract fallback, check that results are non-empty before accepting. If empty, log a warning and skip that abstract slot rather than throwing. The success criteria requires "abstract fallback fills remaining slots" but also requires them to be "contextually appropriate" — zero results is better surfaced as a gap than silently omitted. The vitest test for FBACK-01 should assert `quality: "generic"` is present on at least some items, not that all slots are filled.

**Warning signs:** Abstract fallback test passes locally but `totalSuggested < maxCount` in integration tests for niche industries.

---

### Pitfall 3: `planSource: "abstract_fallback"` assigned even when only one of three entries needed abstract fill

**What goes wrong:** If one role (e.g., `process`) gets abstract fallback items but the other two roles (`product_detail`, `store_environment`) got good scored results, setting `planSource: "abstract_fallback"` in the session meta misleads the frontend into showing a "no industry-specific matches found" banner for the whole session.

**How to avoid:** Set `planSource: "abstract_fallback"` only when the majority of suggestions (> 50%) came from abstract fallback. Alternatively, track fallback at the item level via `quality: "generic"` and let the frontend decide whether to show a banner based on the count of generic items. This is why per-item `quality` is the primary signal and `planSource` is secondary.

---

### Pitfall 4: `CACHE_SCHEMA_VERSION` bump breaks existing tests

**What goes wrong:** Phase 1 and Phase 2 tests (`packaging-material-query.test.ts`, `cache-schema-version.test.ts`) have static analysis assertions like `route.ts defines CACHE_SCHEMA_VERSION = 1`. When Phase 3 bumps to 2, those assertions fail.

**How to avoid:** Update the static analysis assertion in `cache-schema-version.test.ts` to accept version 2. The test currently checks `route.ts defines CACHE_SCHEMA_VERSION = 1` — change this to `CACHE_SCHEMA_VERSION = 2`. Also update the JSDoc in route.ts to document v2 as "Phase 3 scoring deployed."

---

### Pitfall 5: LLM scoring prompt returns malformed JSON

**What goes wrong:** gpt-5.4-mini with `json_object` format may return a JSON object wrapper (`{"results": [...]}`) rather than a bare array. If the scorer expects a bare array and gets an object, `JSON.parse` succeeds but the array iteration fails silently, returning all candidates as un-scored.

**How to avoid:** Wrap the LLM output parse defensively:
```typescript
const parsed = JSON.parse(raw);
const items: Array<{id: string; score: number; reject: boolean}> =
  Array.isArray(parsed) ? parsed :
  Array.isArray(parsed.results) ? parsed.results :
  Array.isArray(parsed.scores) ? parsed.scores : [];
```
Fall back to returning all candidates as un-scored (score=5, rejected=false) rather than throwing.

---

## Code Examples

Verified patterns from codebase inspection:

### Current candidate selection loop (route.ts, lines 1002-1043)

```typescript
// Source: direct read of route.ts lines 1002-1043
// This is what Phase 3 wraps — the scorer sits between loadMediaFromAllProviders and the push
for (const entry of searchPlan.queries) {
  const rows = await loadMediaFromAllProviders(
    entry.query,
    entry.mediaType,
    Math.max(4, entry.count * 2),
  );

  for (const row of rows) {
    const uniqueKey = `${row.provider}:${row.pexelsId}`;
    if (seenIds.has(uniqueKey)) continue;
    seenIds.add(uniqueKey);
    // ... push to suggestions
    if (suggestions.filter((item) => item.role === entry.role).length >= entry.count) break;
  }
}
```

### LLMClient.shared().complete() with json_object (confirmed usage pattern)

```typescript
// Source: direct read of route.ts lines 286-296
const result = await llm.complete({
  model: MATERIAL_PLAN_MODEL,
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ],
  temperature: 0.3,
  maxTokens: 1200,
  responseFormat: { type: "json_object" },
});
```

### Phase 2 fire-and-forget pattern (confirmed, do not break)

```typescript
// Source: route.ts lines 1055-1109 — scoring must NOT be added inside this block
// The OSS fire-and-forget block runs AFTER signedSuggestions is assembled.
// Scoring must run BEFORE assembly, on the raw rows.
prisma.pexelsMedia.findMany({ ... })
  .then((mediaRows) => {
    const transfers = mediaRows.filter(m => m.ossStatus === "pending").map(m => transferPexelsMediaToOss(...));
    return Promise.allSettled(transfers);
  })
  .catch(...);
```

### CachedPhotoRow type (confirmed from route.ts lines 63-76)

```typescript
// Source: route.ts lines 63-76 — these are the fields available for scoring
type CachedPhotoRow = {
  id: string;
  pexelsId: number;
  provider: "pexels" | "pixabay";
  mediaType: "photo" | "video";
  url: string;
  alt: string | null;         // PRIMARY scoring input: photographer alt text or Pixabay tags
  imageUrl: string | null;
  srcJson: unknown;
  videoFilesJson: unknown;
  videoPicturesJson: unknown;
  ossUrl: string | null;
  ossStatus: string;
  // NOTE: discoveryQuery is NOT in this type — it is stored on PexelsMedia but not selected here
  // The scorer must use only `alt` for Tier 1. discoveryQuery can be obtained from `entry.query`
  // (the query that produced this result, passed as context to the scorer).
};
```

**Critical finding:** `discoveryQuery` is NOT in `CachedPhotoRow`. The type only selects specific columns. The scorer's Tier 1 keyword check must use `row.alt` as the primary text signal. `entry.query` (the query that produced the row) serves as a proxy for what the image is about. The planner must either (a) add `discoveryQuery` to the DB select in the three load functions, or (b) use `row.alt` + `entry.query` only. Option (b) is simpler and sufficient.

---

## Type Changes Required

### `types/api.ts`

```typescript
// Current:
export interface PackagingMaterialSuggestionsResponse {
  suggestions: MaterialAssignment[];
  meta: {
    scriptEstimatedDuration: number;
    targetMaterialDuration: number;
    totalSuggested: number;
    planSource: "llm" | "deterministic";  // <-- extend to three values
  };
}

// Phase 3 target:
    planSource: "llm" | "deterministic" | "abstract_fallback";

// Current MaterialAssignment — no quality field:
export interface MaterialAssignment {
  role: string;
  fileUrl: string;
  type: "image" | "video";
  source?: PackagingMaterialSource;
  // ... existing fields
}

// Phase 3 addition:
  quality?: "generic" | "matched";  // "generic" = abstract fallback, "matched" = scored match
```

### `SearchPlanResult` in route.ts (local type)

```typescript
// Current:
interface SearchPlanResult {
  source: "llm" | "deterministic";
  queries: SearchPlanEntry[];
}

// Phase 3 target:
  source: "llm" | "deterministic" | "abstract_fallback";
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Accept first-N stock results | Two-tier scoring gate (this phase) | Phase 3 | Rejects off-domain results before display |
| `planSource: "llm" \| "deterministic"` | Three-value enum with `"abstract_fallback"` | Phase 3 | Frontend can distinguish quality levels |
| `CACHE_SCHEMA_VERSION = 1` | `CACHE_SCHEMA_VERSION = 2` | Phase 3 deploy | Auto-invalidates pre-scoring cache entries |
| `entry.count * 2` fetch multiplier | `entry.count * 3` fetch multiplier | Phase 3 | More candidates needed because some will be rejected by scorer |

---

## Validation Architecture

`workflow.nyquist_validation` is absent from `.planning/config.json` (only `_auto_chain_active` is present). Treating as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `cd apps/web && npx vitest run __tests__/e2e/material-relevance.test.ts` |
| Full suite command | `cd apps/web && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RSCO-01 | Deterministic pre-filter: "mountain lake reflection" rejected for HVAC business | unit | `npx vitest run __tests__/e2e/material-relevance.test.ts` | No — Wave 0 |
| RSCO-01 | Generic business ("professional service business") skips blocklist check | unit | `npx vitest run __tests__/e2e/material-relevance.test.ts` | No — Wave 0 |
| RSCO-02 | LLM batch scoring: single LLM call per query-entry (static analysis) | static analysis | `npx vitest run __tests__/e2e/material-relevance.test.ts` | No — Wave 0 |
| RSCO-03 | Results below LLM_PASS_SCORE are filtered before push | unit | `npx vitest run __tests__/e2e/material-relevance.test.ts` | No — Wave 0 |
| FBACK-01 | Abstract fallback fires when scored < entry.count | integration | `npx vitest run __tests__/e2e/material-relevance.test.ts` | No — Wave 0 |
| FBACK-02 | Abstract results carry `quality: "generic"` | unit | `npx vitest run __tests__/e2e/material-relevance.test.ts` | No — Wave 0 |
| FBACK-02 | HVAC gets clean-tone abstract queries; bakery gets warm-tone | unit | `npx vitest run __tests__/e2e/material-relevance.test.ts` | No — Wave 0 |
| Cache invalidation | CACHE_SCHEMA_VERSION = 2 in route.ts (static analysis) | static analysis | `npx vitest run __tests__/e2e/cache-schema-version.test.ts` | Update existing |

**Note on existing test update:** `apps/web/__tests__/e2e/cache-schema-version.test.ts` currently asserts `CACHE_SCHEMA_VERSION = 1`. Phase 3 must update this assertion to `= 2` as part of the version bump task.

### Sampling Rate

- **Per task commit:** `cd apps/web && npx vitest run __tests__/e2e/material-relevance.test.ts`
- **Per wave merge:** `cd apps/web && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `apps/web/__tests__/e2e/material-relevance.test.ts` — covers RSCO-01, RSCO-02, RSCO-03, FBACK-01, FBACK-02

*(No new framework or config needed — vitest infrastructure exists)*

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies beyond existing LLM + DB services, which are already validated by prior phase tests).

---

## Open Questions

1. **`discoveryQuery` omitted from `CachedPhotoRow` select**
   - What we know: The Tier 1 scorer needs text metadata. `row.alt` is present. `discoveryQuery` is stored on `PexelsMedia` but NOT selected in any of the three load functions.
   - What's unclear: Should the planner add `discoveryQuery` to the select statements in `loadPhotosForQuery`, `loadPixabayImagesForQuery`, and `loadVideosForQuery`? Or use `entry.query` as the proxy?
   - Recommendation: Use `entry.query` as the proxy (it is the query that produced the row — semantically equivalent to `discoveryQuery` for the current batch). This avoids touching the three load functions and is architecturally cleaner. Add `discoveryQuery?: string` to `CachedPhotoRow` only if a future phase needs it for scoring historical data.

2. **Fetch multiplier change from `entry.count * 2` to `entry.count * 3`**
   - What we know: Current code fetches `Math.max(4, entry.count * 2)`. With scoring rejecting some fraction, more candidates are needed.
   - What's unclear: What fraction of candidates will be rejected on average? Depends on Tier 1 threshold calibration.
   - Recommendation: Raise to `entry.count * 3` as a starting value. This means a role needing 3 items fetches 9 candidates before scoring. Rate limit impact is negligible because `PexelsQueryCache` absorbs repeated requests.

3. **Does the `quality` field belong on `MaterialAssignment` in `types/api.ts`?**
   - What we know: The frontend needs to distinguish generic from matched items to show a distinct visual state.
   - What's unclear: Is the frontend ready to consume a `quality` field? Will adding it break existing callers?
   - Recommendation: Add `quality?: "generic" | "matched"` as an optional field with `?`. All existing callers treat missing fields as matched. No breaking change.

---

## Project Constraints (from CLAUDE.md)

- **Zero Mock Rule:** Tests must use real APIs, real database, real LLM calls. The `material-relevance.test.ts` unit tests for Tier 1 (deterministic scoring) can use inline `CachedPhotoRow` objects because no external call is involved — the scorer is a pure function. Tier 2 (LLM scoring) integration tests must use a real LLM call via `LLMClient`. Static analysis tests (checking route.ts source for `CACHE_SCHEMA_VERSION = 2`) are always allowed.
- **UI Rules:** No UI changes in this phase. No shadcn/ui concern.
- **`quality: "generic"` field:** Must not be populated with hard-coded demo data. The field is set based on the actual outcome of the scoring + fallback process.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `apps/web/src/app/api/packaging-material-suggestions/route.ts` (full read, lines 1-1122) — confirmed `CachedPhotoRow` type, `CACHE_SCHEMA_VERSION = 1` constant, `SearchPlanResult.source` type, per-entry candidate loop, fire-and-forget OSS block
- `apps/web/src/types/api.ts` (lines 372-413) — confirmed `MaterialAssignment` interface lacks `quality` field; `planSource: "llm" | "deterministic"` confirmed
- `apps/web/src/lib/packaging-materials.ts` (full read) — confirmed UNCHANGED for Phase 3; no role or count helpers need modification
- `apps/web/__tests__/e2e/cache-schema-version.test.ts` — confirmed assertion on `CACHE_SCHEMA_VERSION = 1` that will need updating
- `.planning/phases/02-infrastructure-prerequisites/02-02-SUMMARY.md` — confirmed `CACHE_SCHEMA_VERSION = 1` in route.ts; confirmed schemaVersion baked into hash
- `.planning/phases/01-query-generation/01-01-SUMMARY.md` — confirmed `resolveVisualArchetype()` exports 20 industry categories with English vocabulary strings
- `.planning/STATE.md` — confirmed locked decisions: batched LLM scoring, threshold starting points, INDUSTRY_ABSTRACT_QUERY_MAP approach
- `.planning/research/ARCHITECTURE.md` — confirmed `scoreMediaRelevance()` design, `ScoredMediaRow` interface, two-tier pattern
- `.planning/research/PITFALLS.md` — confirmed pitfall details: per-item scoring latency, cache hit bypass, abstract fallback quality flag

### Secondary (MEDIUM confidence — prior project research with cited sources)

- arXiv:2505.12570 (SIGIR 2025) — "Batched Self-Consistency Improves LLM Relevance Assessment" — 6-17x speedup from batching vs sequential scoring; validates single-call-per-entry design
- softwaredoug.com/blog/2025/01/13/llm-for-judgment-lists — LLM-as-judge production patterns; confidence gating approach confirmed
- `.planning/research/FEATURES.md` — abstract fallback tone bucketing (warm vs clean) approach documented

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all integration points confirmed by direct code read
- Architecture: HIGH — `CachedPhotoRow` type confirmed; `scoreAndFilterMedia()` integration point confirmed; only `discoveryQuery` availability was an unresolved question (resolved: use `entry.query`)
- Pitfalls: HIGH — all five pitfalls derived from direct code inspection + accumulated prior phase learnings
- Thresholds: MEDIUM — `DETERMINISTIC_YIELD_THRESHOLD = 0.5` and `LLM_PASS_SCORE = 5` are informed estimates, not empirically validated

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable domain; no external API changes expected)
