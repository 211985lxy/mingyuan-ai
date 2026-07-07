## 1. Structure Model

- [x] 1.1 Define the new generic `VideoStructure` seed set and remove industry-framed structure guidance from the create flow
- [x] 1.2 Extend structure contracts to include both script-facing blueprint fields and packaging-intent fields
- [x] 1.3 Persist structure lineage and any required snapshots for generation runs and production plans
- [ ] 1.4 Define a generic expression template seed set and retire industry-first template cards from `/create`
- [ ] 1.5 Extend content-template contracts into reusable expression blueprints with brief schema, evidence mode, CTA style, and structure pairing metadata

## 2. Recommendation Engine

- [x] 2.1 Normalize packaging template capability tags from Shanjian metadata into backend-readable traits
- [x] 2.2 Implement structure/script/template scoring that produces `recommended`, `acceptable`, and `weak-fit` template states with human-readable reasons
- [x] 2.3 Generate compatible `packRules` and `processRules` presets from the selected structure and recommended template

## 3. Packaging Pipeline

- [x] 3.1 Enforce dual-mode packaging inputs: AI Pexels support materials plus manual upload/library assets
- [x] 3.2 Restrict AI-generated material suggestions to safe support roles and block manual-only roles from AI fill
- [x] 3.3 Keep BGM manual-only in both API contracts and UI states until a real BGM provider exists
- [x] 3.4 Persist recommendation context, packaging materials, and BGM lineage into production plans and downstream video tasks

## 4. Create Workbench

- [x] 4.1 Rework `/create` into a four-stage virtualman-only workbench with explicit stage readiness and recommendation UX
- [x] 4.2 Add stale-state invalidation and recomputation rules for structure, script, template, and AI material changes
- [x] 4.3 Show recommendation reasons, required material roles, and final production summary before submission
- [x] 4.4 Hide or honestly block out-of-domain content templates and packaging templates before the user enters unsupported paths
- [ ] 4.5 Rework stage 2 card taxonomy, copywriting, and brief rendering around generic expression templates instead of industry labels

## 5. Verification

- [x] 5.1 Add integration coverage for structure-driven script generation, template recommendation, and packaging plan persistence
- [ ] 5.2 Add end-to-end coverage for AI Pexels support materials, manual-only BGM, and stale-state behavior in `/create`
- [x] 5.3 Validate the OpenSpec change and regression-test the virtualman create flow against real database schemas and APIs
- [ ] 5.4 Add regression coverage for generic expression-template selection and brief-driven cross-industry reuse
