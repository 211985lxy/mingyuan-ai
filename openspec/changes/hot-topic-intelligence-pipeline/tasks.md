## 1. Change Artifacts

- [x] 1.1 Review proposal, design, and spec deltas against the current codebase and refine any mismatched requirement wording before implementation

## 2. Data Model & Service Layer

- [x] 2.1 Extend Prisma schema for persisted hot-topic insight on `DouyinHotItem` and per-run topic snapshots on `ContentGenerationRun`, then sync the local database
- [x] 2.2 Implement `lib/hot-topic-intelligence.ts` to fetch real search evidence, parse results, generate structured topic insight, and evaluate topic fit against profile/template/brief/structure
- [x] 2.3 Add typed API contracts for topic insight and fit payloads

## 3. API Integration

- [x] 3.1 Add an authenticated topic insight API that returns cached insight when available and generates it on demand otherwise
- [x] 3.2 Add an authenticated topic-fit API that evaluates the selected hot topic against the active template, brief, IP profile, and structure context
- [x] 3.3 Update `POST /api/scripts/generate` to accept `hotTopicId`, load topic insight, evaluate topic fit, persist snapshots on `ContentGenerationRun`, and generate prompts from structured topic context rather than title injection

## 4. Create Flow UX

- [x] 4.1 Update dashboard hot-topic entry to carry stable topic identity into `/create`
- [x] 4.2 Update `/create` hot-topic selection to load and display the topic insight card
- [x] 4.3 Update `/create` to request and display topic-fit guidance for the active template/brief context, including caution states and generation guidance

## 5. Real End-to-End Validation

- [x] 5.1 Validate the real topic insight API against the latest hot list without mocks
- [x] 5.2 Validate the real script-generation API with a selected hot topic and confirm that the generation run persists topic insight and fit snapshots
- [x] 5.3 Run a real browser end-to-end flow for hot-topic-assisted creation and verify the UI shows insight, fit guidance, and generated scripts without mock data
