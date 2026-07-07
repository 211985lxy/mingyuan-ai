# Phase 1: Query Generation - Research

**Researched:** 2026-03-25
**Domain:** LLM prompt engineering for stock media search query generation, deterministic fallback query construction
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QGEN-01 | LLM prompt forces extraction of specific visual subjects from IP profile (industry, primaryOffer, targetAudience) rather than vague generic keywords | System prompt rewrite with industry visual vocabulary table; chain-of-thought `rationale` field forcing; validated pattern from SIGIR 2025 research |
| QGEN-02 | Each material role (product_detail, store_environment, process) has role-specific visual semantics guidance in the prompt | Role-specific query semantics injected into system prompt with explicit visual archetype per role; zero new infrastructure |
| QGEN-03 | LLM prompt includes few-shot examples demonstrating good vs bad query generation across diverse industries | Few-shot block added to system prompt; examples drawn from confirmed failure mode (HVAC) and diverse industries (bakery, aesthetic clinic) |
| QGEN-04 | Deterministic fallback (`getFallbackQuery`) generates business-specific keywords from IP profile fields instead of falling back to "small business" | `getFallbackQuery` rewritten to extract specific visual terms from `industry` and `primaryOffer`; Chinese-to-English visual archetype mapping |
</phase_requirements>

---

## Summary

Phase 1 is a pure prompt engineering change to `buildSearchPlan()` in `route.ts`, plus a rewrite of `getFallbackQuery()` in the same file. No new files, no new npm packages, no schema migrations, no infrastructure changes. Every change is confined to the two text strings passed to `LLMClient.shared().complete()` and the deterministic fallback function.

The root cause of the documented failure ("HVAC business gets birds and lakes") is fully traceable to the current system prompt: it asks for "通用支持型画面素材" (general support material) without anchoring the LLM to concrete domain vocabulary. The LLM produces vague English keywords, and vague keywords return off-domain stock photos. Fixing the prompt upstream reduces the number of irrelevant candidates that would otherwise reach later scoring phases — the highest-leverage change in the entire milestone.

QGEN-04 (deterministic fallback rewrite) is grouped here because it is the safety net for the improved prompt. When the LLM path produces better queries, the deterministic fallback must match that quality level — otherwise users whose LLM call fails still get "small business" catch-all queries that produce irrelevant results.

**Primary recommendation:** Rewrite the `buildSearchPlan()` system prompt with four additions: industry visual vocabulary table, role-specific query semantics, few-shot good-vs-bad examples, and a `rationale` field to force chain-of-thought. Rewrite `getFallbackQuery()` to derive specific visual terms from `industry` and `primaryOffer` using a Chinese-industry-to-English-visual-archetype mapping. Keep all other code unchanged.

---

## Project Constraints (from CLAUDE.md)

### Mandatory Rules

- **Zero Mock Rule**: No mock services, hard-coded response payloads, local JSON fallbacks, or simulated providers in any code path — including test acceptance flows. Tests must call real API routes against real DB state.
- **UI Rule**: Not applicable to this phase (no UI changes).
- **shadcn/ui only**: Not applicable to this phase.

### Implications for Phase 1

- The success criterion "testing against 5 industry archetypes returns totalResults >= 10" must use real Pexels API calls, not mocked responses.
- Test fixtures must use real IP profile data inserted into the actual test database, not in-memory stubs.
- Validation of query quality must be observable from real API responses.

---

## Standard Stack

### Core (all already present — no new packages needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `LLMClient` (internal) | — | Provider chain for LLM calls | Already used in `buildSearchPlan()`; supports `json_object` responseFormat |
| `openai` | ^6.32.0 | LLM SDK beneath `LLMClient` | Already in production; handles OpenRouter endpoint |
| `PACKAGING_MATERIAL_PLAN_MODEL` env | `openai/gpt-5.4-mini` (default) | Correct model for query generation | Research confirmed quality gap is in prompt, not model |
| `buildIpProfilePromptSnapshot()` | — | Produces the IP profile text block passed to LLM | Already called in `buildSearchPlan()` user prompt |
| `vitest` | (existing) | Integration test runner | Already configured in `apps/web/vitest.config.ts` |

### No New Installations Required

```bash
# No new packages for Phase 1
```

The entire phase ships as text changes inside `route.ts` only.

---

## Architecture Patterns

### Recommended Scope of Change

```
apps/web/src/app/api/packaging-material-suggestions/
└── route.ts          # MODIFY: systemPrompt + userPrompt in buildSearchPlan()
                      # MODIFY: getFallbackQuery() → rewritten fallback logic
                      # NO CHANGE: SearchPlanEntry type (no new fields needed for Phase 1)
                      # NO CHANGE: main handler loop
                      # NO CHANGE: loadMediaFromAllProviders()

apps/web/__tests__/e2e/
└── packaging-material-suggestions.test.ts  # NEW: 5-archetype query quality test
```

### What is NOT in Phase 1 scope

- `SearchPlanEntry.fallbackQueries: string[]` — this field is introduced in a later phase when the multi-query loop consumes it
- `scoreMediaRelevance()` — Phase 3
- OSS decoupling — Phase 2
- `schemaVersion` on `PexelsQueryCache` — Phase 2

### Pattern 1: Chain-of-Thought Forcing via Rationale Field

**What:** Require the LLM to write a `rationale` field per query entry before writing the `query` field. The rationale is parsed from the JSON but discarded — it is never returned to the client. The act of writing the rationale forces the LLM to commit to a specific visual before producing the keyword string.

**When to use:** When LLM output quality is low because the model takes the path of least resistance (producing vague queries). Confirmed technique — chain-of-thought via intermediate reasoning field.

**Concrete impact:** Without rationale, the LLM produces `"repair work"`. With rationale forcing `"这是空调维修上门服务，视觉主体应是技术员在户外机旁作业"`, it then produces `"HVAC technician outdoor air conditioning unit"`.

**Output schema change:**

```typescript
// LLM returns this shape (rationale discarded after parse)
interface LlmQueryEntry {
  role: string;
  mediaType: "image" | "video";
  query: string;
  rationale: string;  // parsed but not stored
  count: number;
}
```

The existing normalization code that maps LLM output to `SearchPlanEntry[]` simply ignores `rationale`. No downstream type changes.

**Token budget:** Each rationale adds approximately 30–60 Chinese characters = ~40–80 tokens per entry. With 3 entries, total overhead is ~120–240 tokens. `maxTokens` should be raised from 900 to 1200 to accommodate.

### Pattern 2: Industry Visual Vocabulary Table in System Prompt

**What:** A static table embedded in the system prompt that maps Chinese small-business industry categories to the English visual archetypes used by stock photo libraries. The LLM consults this table before generating queries.

**Why necessary:** The LLM does not inherently know what visual vocabulary exists in Pexels/Pixabay corpus. It knows what the industry does but not what images stock libraries use to represent it. The vocabulary table bridges this gap. Research (SIGIR 2025, arXiv:2505.12694) confirms LLM query expansion degrades for unfamiliar niche topics — the table is the remediation.

**Coverage for Phase 1 (confirmed 10 Chinese small-business categories):**

| Chinese Industry | English Visual Archetype for Pexels |
|-----------------|--------------------------------------|
| 空调维修/暖通 (HVAC repair) | HVAC technician, outdoor unit, air conditioning equipment, ductwork |
| 烘焙/面包店 (bakery) | baker, bread dough, oven, pastry, flour, croissant |
| 医疗美容/整形 (aesthetic clinic) | medical aesthetic, beauty treatment, facial treatment, clinic interior |
| 定制家具/衣柜 (custom furniture) | carpenter, woodwork, furniture installation, cabinet |
| 月子中心/产后护理 (postpartum care) | newborn care, nurse, postnatal, mother infant |
| 餐饮/火锅 (restaurant/hotpot) | restaurant kitchen, food plating, chef, dining table |
| 健身/瑜伽 (fitness/yoga) | fitness trainer, yoga pose, gym equipment, workout |
| 教育/培训 (education) | classroom, teacher, student, learning, study |
| 汽车美容/维修 (auto detailing) | car detailing, mechanic, auto repair, garage |
| 零售/服装 (retail/apparel) | retail store, clothing rack, fashion display, shopping |

Extend to ~20 categories in the implementation by adding: real estate, legal, dental, beauty salon, photography studio, pet care, early childhood education, home cleaning, logistics.

### Pattern 3: Role-Specific Visual Semantics Guidance

**What:** Each of the three roles gets explicit visual semantics instructions in the system prompt telling the LLM what type of imagery to generate a query for.

**Current behavior:** Roles influence `mediaType` (image vs video) but not query content. The LLM uses the same visual logic for all roles.

**New instructions per role:**

```
角色语义规范（必须遵守）：
- product_detail: 聚焦产品/服务工具的特写镜头。query 应描述实物物体、设备细节、材质纹理。
  示例: "air conditioning unit close-up", "woodworking chisel detail"
- store_environment: 聚焦经营场所的空间感。query 应描述室内或工作场地的整体环境。
  示例: "bakery shop interior", "auto repair garage workshop"
- process: 聚焦人物正在执行专业操作的动态画面。query 应描述具体工作过程。
  示例: "HVAC technician installing outdoor unit", "baker kneading bread dough"
```

### Pattern 4: Few-Shot Good-vs-Bad Examples

**What:** Two to three examples in the system prompt demonstrating what a BAD query looks like (vague, generic, wrong visual vocabulary) and what a GOOD query looks like (specific, industry-grounded, stock-library vocabulary).

**Why necessary:** The LLM currently produces bad queries because the instruction alone ("generate image search keywords") does not communicate the failure mode. Showing the failure mode explicitly prevents it.

**Example block for system prompt:**

```
【正确示例 vs 错误示例】

错误：行业=空调维修，role=product_detail → query="repair work detail" （太泛，Pexels 结果不相关）
正确：行业=空调维修，role=product_detail → query="air conditioning unit outdoor compressor close-up"

错误：行业=烘焙，role=process → query="food making process" （太泛）
正确：行业=烘焙，role=process → query="baker kneading bread dough hands"

错误：行业=月子中心，role=store_environment → query="health center interior" （太泛）
正确：行业=月子中心，role=store_environment → query="postnatal care room newborn nursery"
```

### Pattern 5: getFallbackQuery Rewrite

**Current implementation (lines 98–116 of route.ts):**

```typescript
// Current — produces "small business detail close up" for unknown industries
const subject = offer || industry || "small business";
```

**Problem:** The `subject = offer || industry || "small business"` pattern produces `"空调维修上门服务 detail close up"` — Chinese text in an English query that Pexels cannot parse. And if both are empty, it falls back to the literally useless `"small business detail close up"`.

**New approach — Chinese-to-English visual archetype mapping:**

```typescript
// New getFallbackQuery — produces English visual terms, not Chinese strings
function getFallbackQuery(role: SafeRole, input: {
  industry?: string | null;
  primaryOffer?: string | null;
  targetAudience?: string | null;
}): string {
  const englishArchetype = resolveVisualArchetype(input.industry, input.primaryOffer);
  switch (role) {
    case "product_detail":
      return `${englishArchetype} detail close-up`;
    case "store_environment":
      return `${englishArchetype} workplace interior`;
    case "process":
      return `${englishArchetype} professional work`;
  }
}

// resolveVisualArchetype maps Chinese industry labels to English stock photo vocabulary
function resolveVisualArchetype(
  industry?: string | null,
  primaryOffer?: string | null,
): string {
  // Check known Chinese industry keywords
  const combined = `${industry ?? ""} ${primaryOffer ?? ""}`.toLowerCase();
  if (/空调|暖通|hvac/i.test(combined)) return "HVAC technician air conditioning";
  if (/烘焙|面包|蛋糕/i.test(combined)) return "baker pastry bakery";
  if (/月子|产后|母婴/i.test(combined)) return "postnatal care newborn";
  if (/家具|衣柜|木工/i.test(combined)) return "carpenter woodwork furniture";
  if (/美容|整形|医美/i.test(combined)) return "medical aesthetic beauty treatment";
  if (/餐饮|火锅|餐厅/i.test(combined)) return "restaurant kitchen food";
  if (/健身|瑜伽|体育/i.test(combined)) return "fitness gym workout";
  if (/汽车|车/i.test(combined)) return "auto mechanic car service";
  if (/教育|培训|辅导/i.test(combined)) return "education classroom training";
  if (/零售|服装|时装/i.test(combined)) return "retail store merchandise";
  // Generic last resort — better than "small business"
  return "professional service business";
}
```

**Key improvement:** Even the generic fallback changes from `"small business detail close up"` (produces coffee mugs, pens) to `"professional service business detail close-up"` (produces more contextually relevant results).

### Anti-Patterns to Avoid

- **Anti-pattern: Translating Chinese IP fields verbatim into the query string.** The current `getFallbackQuery` concatenates `offer || industry` directly into English query strings. Chinese characters in Pexels queries return no results. The fix is the visual archetype mapping layer — translate industry categories to English stock library vocabulary, never pass Chinese strings through.
- **Anti-pattern: Removing the deterministic fallback entirely in favor of LLM.** The `llm.available` check is real — LLM can be unavailable. The deterministic path must remain a fully functioning fallback, not a stub.
- **Anti-pattern: Increasing maxTokens beyond 1200.** The model is `gpt-5.4-mini`; increasing tokens beyond what the rationale and entries need adds cost with no quality benefit.
- **Anti-pattern: Adding `fallbackQueries[]` to `SearchPlanEntry` in this phase.** Phase 1 only rewrites the prompt and the deterministic function. The `SearchPlanEntry` type extension and multi-query loop belong in a later phase. Adding them now adds scope without enabling new behavior.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM JSON output parsing | Custom parser | Existing normalization block in `buildSearchPlan()` already handles fence stripping, type validation, and fallback | Already battle-tested in production |
| Chinese text detection | Unicode range checks | Simple regex on `industry + primaryOffer` combined string (already shown in pattern above) | No library needed for this use case |
| Stock vocabulary knowledge | Industry taxonomy database | Static lookup function with regex matching (see Pattern 5 above) | ~20 industries; not worth a DB table |

**Key insight:** Phase 1 has zero new infrastructure. The entire implementation is prompt text and one rewritten function. Any temptation to add infrastructure (new files, new tables, new helpers) is over-engineering.

---

## Common Pitfalls

### Pitfall 1: Chinese Text Leaking into LLM-Generated Query Strings

**What goes wrong:** The LLM receives Chinese IP profile fields and may produce queries with Chinese characters embedded in English strings (e.g., `"空调维修 technician outdoor"`). Pexels tokenizes queries as English; Chinese characters either return zero results or are silently ignored.

**Why it happens:** The system prompt says "query 必须是适合图片搜索的英文关键词" but this instruction is generic. Without an explicit vocabulary table, the LLM translates Chinese concepts literally rather than mapping to stock library vocabulary.

**How to avoid:** The industry vocabulary table in the system prompt gives the LLM English vocabulary to use before generating the query. Additionally, add an explicit instruction: "query 字段只允许英文单词，不得包含任何中文字符。"

**Warning signs:** Pexels `totalResults < 5` in response logs; queries in DB `discoveryQuery` field contain Chinese characters.

### Pitfall 2: Rationale Field Bloating JSON Output

**What goes wrong:** LLM produces very long rationale strings (500+ tokens per entry), causing the response to exceed `maxTokens` and get truncated, producing invalid JSON.

**Why it happens:** Without a length constraint, the LLM treats rationale as an opportunity for verbose explanation.

**How to avoid:** Add explicit instruction: "rationale 字段不超过 30 字". Set `maxTokens: 1200` (up from 900) to provide headroom without permitting unbounded output.

**Warning signs:** JSON parse errors in the `try/catch` in `buildSearchPlan()`; the fallback returns `source: "deterministic"` at unexpectedly high rates in logs.

### Pitfall 3: Few-Shot Examples Training Toward Specific Industries Only

**What goes wrong:** If the few-shot examples only cover HVAC, bakery, and postpartum care, the LLM may pattern-match to those industries for all inputs — producing queries that vaguely resemble those archetypes even for completely different industries (e.g., a legal services firm gets "technician equipment" queries).

**Why it happens:** Few-shot examples anchor the LLM's output distribution. Too-similar examples cause overfitting to the demonstrated industries.

**How to avoid:** Use maximally diverse examples (one industrial/repair, one food, one health/care). The vocabulary table is the primary specificity mechanism — few-shot examples only demonstrate the formatting pattern, not the industry-specific vocabulary.

### Pitfall 4: totalResults Check Not Wired in This Phase

**What goes wrong:** The improved prompt may still produce sparse queries for very niche industries. Without a `totalResults < 10` check triggering early fallback, the handler accepts whatever few results the API returns.

**Why it happens:** The `loadPhotosForQuery` function stores `totalResults` in `PexelsQueryCache` but the main handler loop does not read it. The current code accepts first-N from whatever comes back.

**How to avoid:** This is out of scope for Phase 1 (no loop changes). The success criterion ("totalResults >= 10 for 4 out of 5 archetypes") is a validation check at test time to confirm prompt quality, not a runtime guard. The runtime guard belongs in Phase 2/3.

**Warning signs (at test time):** If fewer than 4 of 5 industry archetypes return `totalResults >= 10`, the prompt needs further refinement before Phase 1 is marked complete.

---

## Code Examples

### Current system prompt (lines 170–189 of route.ts) — TO BE REPLACED

```typescript
// Source: apps/web/src/app/api/packaging-material-suggestions/route.ts:170
const systemPrompt = `你是包装层素材规划助手。目标是为一条营销短视频补充通用支持型画面素材。

只能使用这些角色：
- product_detail
- store_environment
- process

输出要求：
1. 仅返回 JSON
2. JSON 结构必须是 {"queries":[{"role":"product_detail","mediaType":"image","query":"english keywords","count":3}]}
3. query 必须是适合图片搜索的英文关键词
3.5 mediaType 只能是 image 或 video，process 优先 video，其它角色默认 image
4. 每个 count 必须是正整数
5. 所有 count 总和尽量接近 ${input.maxCount}
6. 不要输出人脸特写，不要输出品牌名，不要输出假资质或假案例`;
```

### Current getFallbackQuery (lines 98–117) — TO BE REWRITTEN

```typescript
// Source: apps/web/src/app/api/packaging-material-suggestions/route.ts:98
function getFallbackQuery(role: SafeRole, input: { ... }): string {
  const subject = offer || industry || "small business";  // PROBLEM: passes Chinese strings
  switch (role) {
    case "product_detail": return `${subject} detail close up`;
    // ...
  }
}
```

### Current maxTokens — TO BE INCREASED

```typescript
// Source: apps/web/src/app/api/packaging-material-suggestions/route.ts:217
maxTokens: 900,  // CHANGE TO: 1200
```

### New LLM output schema (rationale field added)

```typescript
// Updated parse target — rationale field present in JSON, discarded after parse
const parsed = JSON.parse(raw) as {
  queries?: Array<{
    role?: string;
    mediaType?: string;
    query?: string;
    rationale?: string;  // parsed, not stored
    count?: number;
  }>;
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Generic "generate keywords" prompt | Industry vocabulary table + role semantics + few-shot + rationale | Phase 1 (this phase) | HVAC-specific queries instead of "repair work" |
| `subject = offer || industry || "small business"` | Chinese-to-English visual archetype mapping | Phase 1 (this phase) | Fallback queries produce Pexels results, not Chinese-text no-ops |
| maxTokens 900 | maxTokens 1200 | Phase 1 (this phase) | Headroom for rationale fields without truncation |

**No deprecated approaches to track** — this is the first substantive change to the query generation path.

---

## Open Questions

1. **Coverage of industry vocabulary table at 20 categories vs. actual user distribution**
   - What we know: The platform targets Chinese small businesses; 10 confirmed categories cover the documented failure mode and most common archetypes
   - What's unclear: What percentage of actual users fall outside the 20 mapped categories
   - Recommendation: Implement 20 categories, add a `console.warn` when `resolveVisualArchetype` hits the generic fallback so coverage gaps are visible in logs

2. **Rationale field character limit effectiveness**
   - What we know: Instructed "rationale 不超过30字" but LLMs sometimes ignore length constraints
   - What's unclear: Whether the 30-character limit is reliably respected by `gpt-5.4-mini`
   - Recommendation: Add a post-parse truncation guard (`rationale.slice(0, 100)`) to bound impact if the model ignores the instruction; this doesn't affect query quality

3. **Video query quality for `process` role**
   - What we know: `process` prefers `mediaType: "video"`, and Pexels video search uses the same query string
   - What's unclear: Whether the same English vocabulary that works for photo search also works for Pexels video search (video corpus is smaller)
   - Recommendation: Include one video-specific few-shot example ("HVAC technician working outdoor video") in the system prompt; test video `totalResults` explicitly for the `process` role in the 5-archetype validation test

---

## Environment Availability

No external dependencies beyond those already operational in production. This phase touches only text strings in an existing file.

| Dependency | Required By | Available | Notes |
|------------|-------------|-----------|-------|
| `PACKAGING_MATERIAL_PLAN_MODEL` env | `buildSearchPlan()` | Already in production | `openai/gpt-5.4-mini` via OpenRouter |
| `THEROUTER_API_KEY` env | LLM calls in test | Required for 5-archetype test | Must be present in test environment `.env` |
| Pexels API key(s) | `totalResults` check in test | Required | Already configured for existing tests |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (existing) |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `cd apps/web && npx vitest run __tests__/e2e/packaging-material-suggestions.test.ts` |
| Full suite command | `cd apps/web && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QGEN-01 | LLM returns queries with industry-specific terms (HVAC → "HVAC technician", not "repair work") | integration | `npx vitest run __tests__/e2e/packaging-material-suggestions.test.ts` | ❌ Wave 0 |
| QGEN-02 | `product_detail` query describes objects; `store_environment` describes spaces; `process` describes work | integration | same file | ❌ Wave 0 |
| QGEN-03 | Few-shot examples: LLM does NOT produce queries like "small business process" for HVAC input | integration | same file | ❌ Wave 0 |
| QGEN-04 | `getFallbackQuery` for HVAC input returns English visual archetype string, not "小业务" or "small business" | unit | `npx vitest run __tests__/e2e/packaging-material-suggestions.test.ts` | ❌ Wave 0 |

**Important note on QGEN-04:** The deterministic `getFallbackQuery` function is pure (no I/O). It can be tested as a unit test within the same test file without calling the actual API. QGEN-01/02/03 require a real LLM call and real Pexels response.

### Sampling Rate

- **Per task commit:** `npx vitest run __tests__/e2e/packaging-material-suggestions.test.ts`
- **Per wave merge:** `cd apps/web && npx vitest run`
- **Phase gate:** All 5 industry archetypes tested; 4/5 must have `totalResults >= 10` from real Pexels API

### Success Criterion for "Pass"

Per ROADMAP.md success criterion 4, the test must call `POST /api/packaging-material-suggestions` (or the underlying `buildSearchPlan()` function) with real IP profile data for each of 5 archetypes and observe that the primary query returns `totalResults >= 10` from Pexels for at least 4 out of 5.

**The `totalResults` value is stored in `PexelsQueryCache.totalResults`** — the test can read it from the DB after calling the endpoint, rather than intercepting the Pexels response directly.

### Wave 0 Gaps

- [ ] `apps/web/__tests__/e2e/packaging-material-suggestions.test.ts` — covers QGEN-01, QGEN-02, QGEN-03, QGEN-04
  - Must create 5 IP profile fixtures (HVAC, bakery, aesthetic clinic, custom furniture, postpartum care)
  - Must call real `buildSearchPlan()` with each fixture and assert query content
  - Must check `PexelsQueryCache.totalResults` after query execution (requires real Pexels API key in test env)
  - `getFallbackQuery` unit assertions: assert English output for Chinese industry inputs

*(Existing test infrastructure in `__tests__/e2e/helpers.ts` covers DB setup, user creation, and cleanup — no new helpers needed)*

---

## Sources

### Primary (HIGH confidence — direct source code inspection)

- `apps/web/src/app/api/packaging-material-suggestions/route.ts` — full read; confirmed exact function signatures, current prompt text, current `getFallbackQuery` logic, `maxTokens: 900`, LLM call pattern
- `apps/web/src/lib/packaging-materials.ts` — confirmed `SAFE_AI_MATERIAL_ROLES`, role constants, no changes needed
- `apps/web/src/lib/ip-profile.ts` — confirmed `buildIpProfilePromptSnapshot()` output format; all IP fields available; snapshot passed as string to LLM
- `.planning/research/SUMMARY.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md` — project-level research; HIGH confidence on all findings

### Secondary (MEDIUM confidence — established research referenced in project docs)

- arXiv:2505.12694 (SIGIR 2025) — "LLM-based Query Expansion Fails for Unfamiliar and Ambiguous Queries" — validates necessity of vocabulary table for niche domains
- Yelp Engineering (Feb 2025): "Search Query Understanding with LLMs" — validates profession-to-visual mapping pattern

### Tertiary (not needed for this phase)

- arXiv:2505.12570 (SIGIR 2025) — "Batched Self-Consistency Improves LLM Relevance Assessment" — relevant to Phase 3 scoring, not Phase 1

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all components confirmed present in production code; no new packages
- Architecture: HIGH — change scope fully traced to specific lines in route.ts; no downstream effects
- Pitfalls: HIGH — three pitfalls confirmed by direct code inspection (Chinese leakage, maxTokens, totalResults gap); one confirmed by SIGIR 2025 research

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable domain — prompt engineering patterns; Pexels API stable)
