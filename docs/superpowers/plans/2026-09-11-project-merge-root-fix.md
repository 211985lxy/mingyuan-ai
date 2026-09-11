# Safe Account Project Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-off merge script with a transactional, policy-complete, audited project merge service that safely supports multiple accounts sharing one project.

**Architecture:** Put business decisions in a testable project-merge service, keep database locking and raw table movement in a Prisma store adapter, and reduce the CLI to validated argument parsing plus orchestration. A reviewed move/retain policy covers every Prisma model with `projectId`; unknown deployed tables fail closed.

**Tech Stack:** TypeScript, Prisma 7, MariaDB/MySQL, Vitest, existing `AdminAuditLog` and account-project authorization.

## Global Constraints

- One login account still selects exactly one `boundProjectId`; several authorized accounts may select the same project.
- Source projects are archived, never deleted; source `ProjectMember` history and append-only audit records stay unchanged.
- `AuditEvent` and `AgentApiCallLog` remain attached to the original project; customer content and live execution lineage move to the target.
- Apply requires source ID, target ID, expected source owner, expected target owner, active admin ID, reason, request ID, and exact `source->target` confirmation.
- Project/account/member checks must be repeated under transaction locks; any third-project binding or active source task aborts with zero committed writes.
- Never print credentials, API key hashes/tokens, customer content, environment variables, or database URLs.
- Follow TDD for every behavior change and commit each independently reviewable task.
- Design source: `docs/superpowers/specs/2026-09-11-project-merge-root-fix-design.md`.

---

## File Map

- Create `apps/web/src/features/projects/services/project-merge-policy.ts`: reviewed move/retain table policy and deployed-schema classification.
- Create `apps/web/src/features/projects/services/project-merge-service.ts`: business validation, apply ordering, API-key remap, and result types.
- Create `apps/web/src/features/projects/services/project-merge-prisma-store.ts`: Prisma transaction, row locks, database reads/writes, content movement, and audit persistence.
- Create `apps/web/src/features/projects/services/project-row-lock.ts`: shared deterministic `ClientProject` row lock used by merge and binding flows.
- Replace `apps/web/scripts/merge-account-projects.ts`: thin executable CLI.
- Create/replace tests under `apps/web/__tests__/unit/` and `apps/web/__tests__/e2e/project-merge.e2e.test.ts`.
- Modify `apps/web/src/lib/account-project-context.ts`: coordinate bind/repair operations with the same project row lock.

---

### Task 1: Complete project-table policy

**Files:**
- Create: `apps/web/src/features/projects/services/project-merge-policy.ts`
- Create: `apps/web/__tests__/unit/project-merge-policy.test.ts`

**Interfaces:**
- Produces: `MOVE_PROJECT_TABLES`, `RETAIN_PROJECT_TABLES`, `classifyProjectTables(deployedTables)`.
- Consumes: Prisma schema files under `apps/web/prisma/*.prisma` in the completeness test only.

- [ ] **Step 1: Write the failing policy-completeness tests**

Create tests that import the policy and independently parse every Prisma model containing a `projectId` field:

```ts
const expectedMove = [
  "AgentInvocation", "AimConversation", "AimExecutionTrace", "AimGeneration",
  "AimMemory", "AimRunSnapshot", "ApprovalDecision", "AssetCandidate",
  "BenchmarkProfile", "ChannelBinding", "CompetitorAnalysis", "ContentGenerationRun",
  "ContentOutcome", "CustomerOutcomeProjection", "Inspiration", "IpWikiPage",
  "KnowledgeEntity", "KnowledgeEntry", "LearningCandidate", "OpportunityCollection",
  "Script", "TopicSelection", "UserQuestionCard", "VideoCopyExtraction",
  "VideoStructure", "WatchAccount",
]
const expectedRetain = ["AgentApiCallLog", "AuditEvent", "ProjectMember"]

expect([...MOVE_PROJECT_TABLES].sort()).toEqual(expectedMove.sort())
expect([...RETAIN_PROJECT_TABLES].sort()).toEqual(expectedRetain.sort())
expect([...modelsWithProjectIdFromPrisma()].sort())
  .toEqual([...expectedMove, ...expectedRetain].sort())
expect(classifyProjectTables(["AimGeneration", "AuditEvent", "BrandNewProjectTable"]))
  .toEqual({
    move: ["AimGeneration"],
    retain: ["AuditEvent"],
    missing: expect.arrayContaining(["KnowledgeEntry"]),
    unknown: ["BrandNewProjectTable"],
  })
```

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
cd apps/web
pnpm exec vitest run __tests__/unit/project-merge-policy.test.ts
```

Expected: FAIL because `project-merge-policy.ts` does not exist.

- [ ] **Step 3: Implement the immutable policy and classifier**

```ts
export const MOVE_PROJECT_TABLES = [
  "AgentInvocation", "AimConversation", "AimExecutionTrace", "AimGeneration",
  "AimMemory", "AimRunSnapshot", "ApprovalDecision", "AssetCandidate",
  "BenchmarkProfile", "ChannelBinding", "CompetitorAnalysis", "ContentGenerationRun",
  "ContentOutcome", "CustomerOutcomeProjection", "Inspiration", "IpWikiPage",
  "KnowledgeEntity", "KnowledgeEntry", "LearningCandidate", "OpportunityCollection",
  "Script", "TopicSelection", "UserQuestionCard", "VideoCopyExtraction",
  "VideoStructure", "WatchAccount",
] as const

export const RETAIN_PROJECT_TABLES = [
  "AgentApiCallLog", "AuditEvent", "ProjectMember",
] as const

export function classifyProjectTables(deployedTables: readonly string[]) {
  const deployed = new Set(deployedTables)
  const known = new Set<string>([...MOVE_PROJECT_TABLES, ...RETAIN_PROJECT_TABLES])
  return {
    move: MOVE_PROJECT_TABLES.filter((table) => deployed.has(table)),
    retain: RETAIN_PROJECT_TABLES.filter((table) => deployed.has(table)),
    missing: [...known].filter((table) => !deployed.has(table)).sort(),
    unknown: [...deployed].filter((table) => !known.has(table)).sort(),
  }
}
```

- [ ] **Step 4: Verify GREEN and commit**

Run the Task 1 test again; expect all tests PASS. Then:

```bash
git add apps/web/src/features/projects/services/project-merge-policy.ts apps/web/__tests__/unit/project-merge-policy.test.ts
git commit -m "test(projects): enforce complete merge table policy"
```

---

### Task 2: Testable merge service and API-key remapping

**Files:**
- Create: `apps/web/src/features/projects/services/project-merge-service.ts`
- Create: `apps/web/__tests__/unit/project-merge-service.test.ts`

**Interfaces:**
- Consumes: `classifyProjectTables()` from Task 1.
- Produces: `ProjectMergeInput`, `ProjectMergeSnapshot`, `ProjectMergeStore`, `previewProjectMerge()`, `applyProjectMerge()`, `remapAllowedProjects()`.

- [ ] **Step 1: Write failing tests for business behavior**

Use an in-memory `ProjectMergeStore` fake that records method order and only commits its draft state after the callback returns. Cover these exact cases:

```ts
it("includes both projects' owners, members, and bound accounts exactly once", async () => {
  const store = makeStore({
    source: project("source", "source-owner", ["source-member"], ["source-bound"]),
    target: project("target", "target-owner", ["target-member"], ["target-bound"]),
  })
  const result = await applyProjectMerge(validInput, store)
  expect(result.participantIds).toEqual([
    "source-bound", "source-member", "source-owner",
    "target-bound", "target-member", "target-owner",
  ])
})

it("rolls back before mutation when a participant is bound to a third project", async () => {
  const store = makeStore({ bindings: { "target-member": "third-project" } })
  await expect(applyProjectMerge(validInput, store)).rejects.toThrow("third project")
  expect(store.committedWrites).toEqual([])
})

it("rejects unknown deployed project tables", async () => {
  const store = makeStore({ deployedTables: ["AimGeneration", "UnreviewedTable"] })
  await expect(applyProjectMerge(validInput, store)).rejects.toThrow("UnreviewedTable")
})

it("blocks active source work", async () => {
  const store = makeStore({ activeWork: { invocations: 1, traces: 0 } })
  await expect(applyProjectMerge(validInput, store)).rejects.toThrow("active work")
})

it("remaps API key grants without broadening unrelated access", () => {
  expect(remapAllowedProjects(["source", "other", "target"], "source", "target"))
    .toEqual(["target", "other"])
  expect(remapAllowedProjects([], "source", "target")).toEqual([])
})

it("writes audit last and rolls back if audit creation fails", async () => {
  const store = makeStore({ failAt: "writeAudit" })
  await expect(applyProjectMerge(validInput, store)).rejects.toThrow("audit")
  expect(store.committedWrites).toEqual([])
})
```

Also cover wrong direction confirmation, owner mismatch, inactive target, archived source, inactive admin, and exact rebind-count mismatch.

- [ ] **Step 2: Run the service test and confirm RED**

Run:

```bash
cd apps/web
pnpm exec vitest run __tests__/unit/project-merge-service.test.ts
```

Expected: FAIL because the service exports do not exist.

- [ ] **Step 3: Implement service contracts and deterministic apply ordering**

Define the store boundary so business tests do not depend on Prisma mocks:

```ts
export interface ProjectMergeStore {
  inspect(input: ProjectMergeIdentity): Promise<ProjectMergeSnapshot>
  transaction<T>(run: (tx: ProjectMergeTransaction) => Promise<T>): Promise<T>
  writeFailedAudit(input: ProjectMergeFailureAudit): Promise<void>
}

export interface ProjectMergeTransaction {
  lockAndInspect(input: ProjectMergeIdentity): Promise<ProjectMergeSnapshot>
  upsertTargetMembers(targetProjectId: string, targetOwnerId: string, userIds: string[]): Promise<void>
  rebindParticipants(sourceProjectId: string, targetProjectId: string, participants: ProjectMergeParticipant[]): Promise<number>
  remapApiKeys(sourceProjectId: string, targetProjectId: string, userIds: string[]): Promise<number>
  moveRows(table: MoveProjectTable, sourceProjectId: string, targetProjectId: string): Promise<number>
  archiveSource(sourceProjectId: string): Promise<number>
  writeSuccessAudit(input: ProjectMergeSuccessAudit): Promise<string>
}
```

`applyProjectMerge()` must validate confirmation and non-empty reason before opening the transaction, then use only `lockAndInspect()` data inside the transaction. Sort participant IDs, process move tables sequentially, assert the exact account-update and archive counts, write success audit last, and call `writeFailedAudit()` outside the rolled-back transaction without replacing the original error.

- [ ] **Step 4: Verify GREEN and commit**

Run the Task 2 tests; expect all PASS. Then:

```bash
git add apps/web/src/features/projects/services/project-merge-service.ts apps/web/__tests__/unit/project-merge-service.test.ts
git commit -m "feat(projects): add transactional merge service"
```

---

### Task 3: Prisma store, deterministic row locks, and binding coordination

**Files:**
- Create: `apps/web/src/features/projects/services/project-row-lock.ts`
- Create: `apps/web/src/features/projects/services/project-merge-prisma-store.ts`
- Modify: `apps/web/src/lib/account-project-context.ts`
- Create: `apps/web/__tests__/unit/project-row-lock.test.ts`
- Modify: `apps/web/__tests__/unit/account-project-admin-binding.test.ts`
- Modify: `apps/web/__tests__/unit/account-project-context.test.ts`
- Create: `apps/web/__tests__/e2e/project-merge.e2e.test.ts`

**Interfaces:**
- Consumes: service interfaces and table policy from Tasks 1–2.
- Produces: `lockClientProjects(tx, projectIds)` and `prismaProjectMergeStore`.

- [ ] **Step 1: Write failing lock and coordination tests**

Verify IDs are sorted and locked with one parameterized statement, and that bind/repair acquire the project lock before reading status or updating `User`:

```ts
await lockClientProjects(tx, ["project-z", "project-a", "project-z"])
expect(queryRawUnsafe).toHaveBeenCalledWith(
  "SELECT `id` FROM `ClientProject` WHERE `id` IN (?, ?) ORDER BY `id` FOR UPDATE",
  "project-a",
  "project-z",
)

expect(callOrder).toEqual([
  "lockClientProjects",
  "clientProject.findUnique",
  "user.findUnique",
  "user.updateMany",
  "projectMember.upsert",
])
```

Add a bind test where the source project becomes archived while waiting for the lock; expect `BOUND_PROJECT_UNAVAILABLE` and no user update.

In `project-merge.e2e.test.ts`, seed isolated IDs prefixed `merge-e2e-` for two projects, both sides' members/bound accounts, a target API Key, `AimGeneration`, `VideoStructure`, `AimExecutionTrace`, `AimRunSnapshot`, `AuditEvent`, and an active administrator. Write the success and rollback assertions before creating the Prisma adapter:

```ts
expect(await prisma.aimGeneration.count({ where: { projectId: SOURCE_ID } })).toBe(0)
expect(await prisma.videoStructure.count({ where: { projectId: SOURCE_ID } })).toBe(0)
expect(await prisma.aimExecutionTrace.count({ where: { projectId: SOURCE_ID } })).toBe(0)
expect(await prisma.auditEvent.count({ where: { projectId: SOURCE_ID } })).toBe(1)
expect(await prisma.projectMember.count({ where: { projectId: SOURCE_ID } })).toBeGreaterThan(0)
expect(await prisma.adminAuditLog.count({
  where: { action: "account.project_merge", targetId: TARGET_ID, status: "success" },
})).toBe(1)
```

Add separate fixtures for third-project conflict and active source invocation. Snapshot users, projects, members, content, keys, and audits before each rejected apply; compare the snapshots afterward to prove zero committed writes.

- [ ] **Step 2: Run the targeted tests and confirm RED**

```bash
cd apps/web
pnpm exec vitest run __tests__/unit/project-row-lock.test.ts __tests__/unit/account-project-admin-binding.test.ts __tests__/unit/account-project-context.test.ts
pnpm test:e2e:prepare
pnpm exec vitest run --config vitest.e2e.config.ts __tests__/e2e/project-merge.e2e.test.ts
```

Expected: unit tests FAIL because the shared lock does not exist; E2E import FAIL because the Prisma adapter does not exist.

- [ ] **Step 3: Implement the Prisma adapter**

`lockClientProjects()` must dedupe/sort IDs and use placeholders, never interpolate project IDs:

```ts
export async function lockClientProjects(tx: Prisma.TransactionClient, projectIds: string[]) {
  const ids = [...new Set(projectIds)].sort()
  if (ids.length === 0) return
  const placeholders = ids.map(() => "?").join(", ")
  await tx.$queryRawUnsafe(
    `SELECT \`id\` FROM \`ClientProject\` WHERE \`id\` IN (${placeholders}) ORDER BY \`id\` FOR UPDATE`,
    ...ids,
  )
}
```

The Prisma store must:

- call `lockClientProjects()` before project reads;
- lock existing `ProjectMember` and bound `User` rows for both projects;
- re-read both projects with `members` and `boundAccounts` inside the transaction;
- validate the admin using `AdminUser.id`, `isActive=true`, and `role="admin"`;
- list all deployed `projectId` columns from `information_schema.columns`;
- count active source `AgentInvocation` (`queued|running`) and `AimExecutionTrace` (`running`);
- use sequential `$executeRawUnsafe` only for table names returned by the reviewed move policy, with source/target IDs as parameters;
- parse `AgentApiKey.allowedProjects` as string arrays and update only keys containing source;
- create `AdminAuditLog` in the same transaction with action `account.project_merge`, severity `warning`, and safe aggregate metadata;
- create a separate failed `AdminAuditLog` after rollback when possible.

Wrap the transaction with explicit options:

```ts
return prisma.$transaction(run, {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 60_000,
})
```

Modify both `bindAccountProject()` and `repairAccountProjectBinding()` to lock sorted project IDs before reading the target state, so a bind cannot commit against a project that the merge just archived.

- [ ] **Step 4: Verify targeted tests and commit**

Run the Task 3 unit tests, the new E2E file, and `pnpm typecheck`; expect PASS. Then:

```bash
git add apps/web/src/features/projects/services/project-row-lock.ts apps/web/src/features/projects/services/project-merge-prisma-store.ts apps/web/src/lib/account-project-context.ts apps/web/__tests__/unit/project-row-lock.test.ts apps/web/__tests__/unit/account-project-admin-binding.test.ts apps/web/__tests__/unit/account-project-context.test.ts apps/web/__tests__/e2e/project-merge.e2e.test.ts
git commit -m "fix(projects): serialize bindings with project merges"
```

---

### Task 4: Replace the one-off script with a thin, behavior-tested CLI

**Files:**
- Replace: `apps/web/scripts/merge-account-projects.ts`
- Replace: `apps/web/__tests__/unit/project-merge-script.test.ts`

**Interfaces:**
- Consumes: `previewProjectMerge()`, `applyProjectMerge()`, `prismaProjectMergeStore`.
- Produces: `parseProjectMergeArgs(argv)` and executable `main()`.

- [ ] **Step 1: Write failing CLI behavior tests**

Import the parser without running `main()` and cover:

```ts
expect(parseProjectMergeArgs([
  "--source-project", "source",
  "--target-project", "target",
])).toMatchObject({ apply: false, sourceProjectId: "source", targetProjectId: "target" })

expect(() => parseProjectMergeArgs([
  "--source-project", "source", "--target-project", "target", "--apply",
])).toThrow("--confirm source->target")

expect(parseProjectMergeArgs([
  "--source-project", "source", "--target-project", "target",
  "--source-owner", "source-owner", "--target-owner", "target-owner",
  "--admin-id", "admin-1", "--reason", "consolidate duplicate projects",
  "--request-id", "project-merge-20260911-001",
  "--apply", "--confirm", "source->target",
])).toMatchObject({ apply: true, confirmation: "source->target" })
```

Verify dry-run calls only `previewProjectMerge`, apply calls only `applyProjectMerge`, and failures set a non-zero exit code without logging a database URL or stack containing credentials.

- [ ] **Step 2: Run the CLI test and confirm RED**

```bash
cd apps/web
pnpm exec vitest run __tests__/unit/project-merge-script.test.ts
```

Expected: FAIL because the current script executes on import and lacks the required arguments.

- [ ] **Step 3: Implement the thin CLI**

Use an ESM main guard and keep all database operations in the service/store:

```ts
export async function main(argv = process.argv.slice(2)) {
  const args = parseProjectMergeArgs(argv)
  const result = args.apply
    ? await applyProjectMerge(args, prismaProjectMergeStore)
    : await previewProjectMerge(args, prismaProjectMergeStore)
  console.log(JSON.stringify(result))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error) => {
    console.error("project merge failed:", safeErrorMessage(error))
    process.exitCode = 1
  })
}
```

- [ ] **Step 4: Verify GREEN and commit**

Run the Task 4 tests; expect PASS. Then:

```bash
git add apps/web/scripts/merge-account-projects.ts apps/web/__tests__/unit/project-merge-script.test.ts
git commit -m "refactor(projects): route merge CLI through domain service"
```

---

### Task 5: Complete regression and database verification

**Files:**
- No planned file changes. Fixes are allowed only through a new failing test in the owning Task 1–4 test file.

**Interfaces:**
- Consumes: `applyProjectMerge()` with `prismaProjectMergeStore`.
- Produces: fresh verification evidence for the complete implementation.

- [ ] **Step 1: Run the successful merge E2E scenario**

Run:

```bash
cd apps/web
pnpm test:e2e:prepare
pnpm exec vitest run --config vitest.e2e.config.ts __tests__/e2e/project-merge.e2e.test.ts
```

Expected: all success, conflict, active-work, API Key, retained-audit, and rollback scenarios PASS.

- [ ] **Step 2: Run the complete project-merge unit suite**

```bash
cd apps/web
pnpm exec vitest run __tests__/unit/project-merge-policy.test.ts __tests__/unit/project-merge-service.test.ts __tests__/unit/project-row-lock.test.ts __tests__/unit/project-merge-script.test.ts __tests__/unit/account-project-membership.test.ts __tests__/unit/account-project-admin-binding.test.ts __tests__/unit/account-project-context.test.ts
```

Expected: every test PASS with zero skipped safety scenarios.

- [ ] **Step 3: Run static and schema gates**

```bash
cd apps/web
pnpm typecheck
pnpm typecheck:tests
pnpm exec prisma validate
pnpm arch:size
pnpm api:contracts
```

Expected: every command exits 0. If any command fails, add a focused failing regression test to the owning Task 1–4 test file, implement the minimum correction, rerun this task from Step 1, and commit the correction separately.

- [ ] **Step 4: Confirm the worktree contains no uncommitted implementation files**

Run `git status --short`. Expected: only the implementation-plan document is uncommitted before its own documentation commit; no source or test changes remain outside Tasks 1–4 commits.

---

### Task 6: Independent review, release, and current lineage repair

**Files:**
- No planned product-code additions.
- Review all files changed by Tasks 1–5.

**Interfaces:**
- Consumes: completed branch and verified merge service.
- Produces: reviewed main commit, production verification, and audited repair of the one known stale trace.

- [ ] **Step 1: Run independent code review**

Review from `bce662fe` to branch HEAD. Reject Critical/Important findings involving transaction boundaries, table policy, tenant isolation, API Key scope, audit data, or test realism. Apply fixes through new RED→GREEN cycles and commit them separately.

- [ ] **Step 2: Run full release gates**

```bash
pnpm release:context
cd apps/web
pnpm test
pnpm typecheck
pnpm typecheck:tests
pnpm exec prisma validate
pnpm arch:size
pnpm api:contracts
pnpm build
```

Expected: candidate branch accepted, all tests pass, both typechecks return zero errors, Schema is valid, gates pass, and production build exits 0.

- [ ] **Step 3: Merge and push through the repository release workflow**

Return to the configured candidate branch, merge `codex/project-merge-root-fix` without mixing unrelated work, re-run `pnpm release:context`, and push the resulting explicit commit. Wait for Architecture Guard, Harness Eval, Security/Supply Chain, and Repository Guardrails to complete successfully.

- [ ] **Step 4: Run production dry-run**

Resolve the single active administrator deterministically; if there is not exactly one active `role=admin` record, stop and ask the product owner to choose the exact admin. Run the new CLI in dry-run mode against:

```text
sourceProjectId=cmqurukyk0001mb9kye8a5qs2
targetProjectId=cmqn850on0000ep9ks3jm1p08
expectedSourceOwnerId=cmqtesoya0001hz9ke52h36zw
expectedTargetOwnerId=cmq62x1on0001iz9k1z7zajsb
requestId=project-merge-lineage-repair-20260911
reason=repair execution lineage after verified shared-project merge
```

Because the source is already archived, do not rerun the full merge. Confirm the only remaining movable row is the known `AimExecutionTrace`, and that `AuditEvent` plus source `ProjectMember` are retained.

- [ ] **Step 5: Repair the known trace in one audited transaction**

Inside one database transaction: lock source/target projects and the trace; verify its `aimGenerationId` now belongs to the target; update only that trace's `projectId`; create one `AdminAuditLog` with action `account.project_merge.lineage_repair`, warning severity, the fixed request ID, and safe IDs/counts; commit. If any precondition differs, rollback and stop.

- [ ] **Step 6: Final production verification**

Read back and verify:

- both account emails bind to `cmqn850on0000ep9ks3jm1p08`;
- target has owner/member roles for both users;
- source remains archived and target active;
- every move-policy table has zero source rows;
- `AuditEvent`, source `ProjectMember`, and historical `AgentApiCallLog` remain unchanged;
- the success/repair `AdminAuditLog` exists;
- no API key contains the source project ID;
- `/api/healthz` returns `ok=true` with database and Redis checks true.

Only after these reads succeed report the root fix complete.
