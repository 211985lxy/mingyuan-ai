## 1. Contracts And Domain Boundaries

- [ ] 1.1 Define the packaging draft item model that supports `manual_upload`, `manual_library`, and `ai_pexels`, including `assetId`, `pexelsId`, `searchQuery`, `thumbnailUrl`, and `ossStatus`
- [ ] 1.2 Define the packaging material suggestion request/response contract around a selected script, packaging template, and existing draft items without relying on a client-supplied profile snapshot
- [ ] 1.3 Define the manual asset upload/selection contract for image, video, and music inputs so packaging no longer depends on freeform URL entry
- [ ] 1.4 Document the authenticity-safe role allowlist and the manual-only roles that AI stock suggestions must never auto-fill

## 2. Manual Asset Acquisition

- [ ] 2.1 Integrate real `/api/assets/upload-url` and `/api/assets` flows into the packaging step so users can upload image, video, and music assets in place
- [ ] 2.2 Add asset-library selection flows for existing managed image, video, and music assets without leaving `/create`
- [ ] 2.3 Preserve managed asset lineage for manual packaging materials and BGM so downstream production uses asset-backed inputs rather than anonymous URLs

## 3. Suggestion Orchestration

- [ ] 3.1 Add a server-owned suggestion endpoint that loads the selected script, active IP profile, and packaging template capabilities instead of trusting a client-supplied profile snapshot
- [ ] 3.2 Implement script-length sizing, safe-role search planning, English photo-only Pexels search, deduplication, and reuse of cached query results
- [ ] 3.3 Add explicit timeout/error semantics plus a deterministic rescue path for unusable LLM planning without introducing mock data

## 4. Workbench Packaging UX

- [ ] 4.1 Replace raw URL text inputs with dual-mode packaging controls: AI assist plus upload/select controls for manual image, video, and BGM assets
- [ ] 4.2 Add transparent suggestion cards, upload progress, asset-picking states, and “regenerate AI only” behavior that preserves manual materials
- [ ] 4.3 Persist packaging draft state so AI/manual material items, selected music assets, and transfer status survive draft restore and resume flows
- [ ] 4.4 Extend dependency invalidation so structure/template/brief/hot-topic/script changes clear or mark AI suggestions stale before final submission

## 5. Durable Production Integration

- [ ] 5.1 Ensure suggested third-party stock assets are mirrored into managed OSS before they can be persisted into a production plan or submitted as part of a video task
- [ ] 5.2 Surface per-item transfer progress and failure states through real APIs or polling endpoints, and block final submission while any AI item is `pending`, `transferring`, or `failed`
- [ ] 5.3 Update production-plan and task contracts so manual packaging assets retain managed lineage and reviewed AI items use durable managed URLs only

## 6. Verification

- [ ] 6.1 Add backend tests for safe-role exclusion, cached-query reuse, deterministic rescue behavior, and regenerate semantics that preserve manual items
- [ ] 6.2 Add packaging-flow tests for upload/select asset flows, draft restoration, upstream invalidation, and submit blocking on non-durable AI suggestion items
- [ ] 6.3 Validate the change against the zero-mock rule by exercising the real asset upload path, real Pexels search, real OSS transfer path, and real production-plan/task rejection semantics
