---
phase: 01-query-generation
plan: "01"
subsystem: packaging-material-suggestions
tags: [query-generation, llm-prompt, fallback, stock-media, pexels]
dependency_graph:
  requires: []
  provides: [industry-specific-english-queries, visual-archetype-mapping]
  affects: [packaging-material-suggestions-route]
tech_stack:
  added: []
  patterns: [chinese-to-english-visual-archetype-mapping, chain-of-thought-rationale-field, industry-vocabulary-table, few-shot-good-vs-bad]
key_files:
  created: []
  modified:
    - apps/web/src/app/api/packaging-material-suggestions/route.ts
decisions:
  - "resolveVisualArchetype() maps 20 Chinese industry regex patterns to English stock library vocabulary; generic fallback is 'professional service business' not 'small business'"
  - "rationale field added to LLM JSON output schema for chain-of-thought forcing; field is parsed but discarded — no downstream type changes needed"
  - "maxTokens raised from 900 to 1200 to accommodate rationale field overhead (~120-240 extra tokens for 3 entries)"
  - "console.warn added at resolveVisualArchetype generic fallback path for production observability of coverage gaps"
metrics:
  duration: "7 minutes"
  completed_date: "2026-03-25"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 1
---

# Phase 01 Plan 01: Query Generation Prompt Rewrite Summary

**One-liner:** Rewrote `getFallbackQuery` and `buildSearchPlan` system prompt with Chinese-to-English visual archetype mapping, industry vocabulary table, role semantics, and few-shot examples to eliminate vague/Chinese-polluted stock media search queries.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add resolveVisualArchetype and rewrite getFallbackQuery | 5fdc136 | route.ts |
| 2 | Rewrite buildSearchPlan system prompt with industry vocabulary and few-shot examples | a23ee1b | route.ts |

## What Was Built

### Task 1: resolveVisualArchetype + getFallbackQuery rewrite

Added `resolveVisualArchetype(industry, primaryOffer)` function with regex matching on 20 Chinese industry categories, each mapping to English visual archetype strings suitable for stock photo library search. The function covers: HVAC, bakery, postpartum care, custom furniture, medical aesthetics, restaurant, fitness, automotive, education, retail, real estate, legal, dental, hair salon, photography, pets, early childhood, home cleaning, logistics, and florist.

`getFallbackQuery` was rewritten to call `resolveVisualArchetype` instead of concatenating raw Chinese input strings. The old approach (`subject = offer || industry || "small business"`) passed Chinese characters directly into Pexels queries, which either returned zero results (Chinese tokenization failure) or fell back to the literally useless "small business" generic term.

### Task 2: buildSearchPlan system prompt rewrite

The LLM system prompt received four additions:

1. **Industry visual vocabulary table** — 20 Chinese industry categories with their English stock library vocabulary terms (e.g., "空调维修/暖通: HVAC technician, outdoor unit, air conditioning equipment, ductwork, compressor"). The LLM consults this table before generating query keywords.

2. **Role-specific visual semantics** — `product_detail` maps to close-up equipment shots, `store_environment` maps to interior/workspace environment, `process` maps to person-executing-work action shots. Each role has concrete Pexels-vocabulary examples.

3. **Few-shot good-vs-bad examples** — Three examples showing the HVAC/bakery/postpartum care failure modes (vague generic queries) alongside correct industry-specific outputs. Diverse industries prevent few-shot overfitting.

4. **Rationale field** — Chain-of-thought forcing by requiring the LLM to write a rationale before the query keyword. The rationale is parsed from JSON but discarded; its presence forces the model to commit to a specific visual concept before writing the query string.

maxTokens raised from 900 to 1200 to accommodate rationale field overhead without truncation risk.

## Decisions Made

1. **resolveVisualArchetype generic fallback changed to "professional service business"** — This produces more contextually relevant Pexels results than "small business" (coffee mugs, pens) even when the industry is unknown.

2. **rationale field parsed but discarded** — The existing normalization code in `buildSearchPlan()` already only maps `role`, `mediaType`, `query`, and `count` into `SearchPlanEntry`. Adding `rationale?: string` to the parsed type is sufficient; no `SearchPlanEntry` changes needed.

3. **console.warn on generic archetype fallback** — Makes coverage gaps observable in production logs so niche industries that miss the 20-category mapping can be identified and added.

## Deviations from Plan

None — plan executed exactly as written.

The two "small business" occurrences flagged by the verification grep are:
- Line 123: code comment (`// Generic last resort — better than "small business"`)
- Line 255: LLM prohibition instruction (`禁止使用 "small business"...`)

Neither causes "small business" to appear in generated queries. The plan's acceptance criteria for Task 1 (`route.ts does NOT contain 'const subject = offer || industry || "small business"'`) passes with 0 matches.

## Known Stubs

None. No stub patterns in the modified file. `resolveVisualArchetype` produces real English vocabulary for all 20 mapped industries; the generic fallback produces a valid English string, not a placeholder.

## Self-Check: PASSED

- FOUND: apps/web/src/app/api/packaging-material-suggestions/route.ts
- FOUND: .planning/phases/01-query-generation/01-01-SUMMARY.md
- FOUND: commit 5fdc136 (Task 1)
- FOUND: commit a23ee1b (Task 2)
