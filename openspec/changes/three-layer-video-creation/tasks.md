## 1. Core Domain Modeling

- [x] 1.1 Define the canonical three-layer vocabulary in the backend and frontend domain models: `VideoStructure`, `VideoCreativeBrief`, `VideoPackagingTemplate`, and `VideoProductionPlan`
- [x] 1.2 Add persistence and DTO contracts for structure lineage on `ContentGenerationRun`, `Script`, and `VideoTask`
- [x] 1.3 Decide how curated Shanjian packaging templates are stored or cached, including capability labels and upstream template metadata

## 2. Create Workbench Contract

- [x] 2.1 Define the `/create` SPA as a resumable three-layer workbench with explicit readiness, dependency invalidation, and final production-summary states
- [x] 2.2 Replace create-flow runtime dependencies on `@/lib/mock/services` with real APIs for structures, templates, scripts, packaging, avatars, and task submission
- [x] 2.3 Decide where in-progress creation drafts live and how saved server-owned artifacts are restored when a user resumes work

## 3. Script Generation Contract

- [x] 3.1 Extend `POST /api/scripts/generate` to require `structureId` alongside `templateId` and `inputs`
- [x] 3.2 Update prompt assembly so script generation uses IP profile, structure blueprint, content template blueprint, and current brief together
- [x] 3.3 Define and implement candidate scoring metadata plus degraded-run handling for under-quality script outputs

## 4. Packaging and Task Planning

- [x] 4.1 Add backend contracts for packaging template discovery, packaging brief submission, and production-plan persistence
- [x] 4.2 Update video task creation to require a saved production plan instead of relying on a hardcoded `styleId`
- [x] 4.3 Implement backend routing rules that choose between `virtualman_broadcast` and `custom_virtualman_broadcast` based on production plan complexity

## 5. Create Flow Reconstruction

- [x] 5.1 Redesign `/create` around the three-layer journey: structure, expression, packaging, and final generation
- [x] 5.2 Add brief forms for content templates and packaging templates, including material-role collection and optional BGM selection
- [x] 5.3 Add dependency invalidation UX, resumable draft restoration, and final production-summary review before task creation
- [x] 5.4 Update UI guidance so each step explicitly teaches the user what the director, scriptwriter, and packaging layers contribute

## 6. Validation and Rollout

- [x] 6.1 Add end-to-end coverage for the full three-layer flow: select structure, generate scripts, choose packaging, select avatar, and create a video task
- [x] 6.2 Add tests that verify structure lineage and packaging lineage survive through script generation and task creation
- [x] 6.3 Add tests that verify create-workbench draft restoration and dependency invalidation behavior
- [x] 6.4 Prepare launch rules for curated structure templates, curated packaging templates, and minimum acceptable script quality before exposing the flow broadly
