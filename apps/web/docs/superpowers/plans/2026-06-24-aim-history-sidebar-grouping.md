# AIM History Sidebar Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AIM sidebar history readable by grouping recent records under their owning intelligent agent, matching the Codex-style "section + indented items" layout.

**Architecture:** Keep the change inside the existing Next.js sidebar and API client types. Reuse the existing `/api/aim/history` response and `AIM_AGENT_OPTIONS`; do not add new endpoints, state stores, dependencies, or pagination.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, existing shadcn/sidebar primitives, Zustand AIM workspace store.

## Global Constraints

- No mock, fake, stub, fixture fallback, demo data fallback, or simulated provider in production code, preview flows, admin flows, or acceptance flows.
- UI work in `mingyuan/apps/web` must use the existing shadcn/ui components in `src/components/ui`.
- Touch only files required for the sidebar history grouping.
- Preserve existing dirty worktree changes; do not revert unrelated edits.
- Do not add dependencies.
- Lazy scope: group the already-fetched recent records only; add full pagination later if users need older records.

---

## File Structure

- Modify: `src/lib/api/client.ts`
  - Responsibility: Type the existing `agentId` field already returned by `AimGeneration` records.
- Modify: `src/components/layout/app-sidebar.tsx`
  - Responsibility: Build grouped history from the existing store records and render "agent title -> indented records" in the sidebar.
- Verify only: no new test file for this UI-only display change.
  - Reason: extracting a one-use grouping helper just to unit-test it would add code solely for tests. The smallest useful check is lint plus rendering `/aim`.

---

### Task 1: Type The Existing History Metadata

**Files:**
- Modify: `src/lib/api/client.ts`

**Interfaces:**
- Consumes: Existing `/api/aim/history` records from Prisma `aimGeneration`.
- Produces: `AimGeneration.agentId?: string | null`, used by `src/components/layout/app-sidebar.tsx`.

- [ ] **Step 1: Add the existing `agentId` field to the client type**

Replace the start of `AimGeneration` with:

```ts
export interface AimGeneration {
  id: string
  agentId?: string | null
  projectId?: string | null
  rawInput: string
  videoScript: string | null
  wechatArticle: string | null
  momentsPost: string | null
  communityMessage: string | null
  shootingBrief: string | null
  rawCopy: string | null
  formatsRequested: string[]
  knowledgeUsed: { id: string; title: string; category: string }[]
  createdAt: string
  hotTopic?: string | null
  polishInstruction?: string | null
  qualityScores?: unknown
  topicTitle?: string | null
  workflowStatus?: string
  reviewNote?: string | null
  publishedAt?: string | null
}
```

- [ ] **Step 2: Run targeted lint**

Run:

```bash
pnpm exec eslint src/lib/api/client.ts
```

Expected: exits `0`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api/client.ts
git commit -m "fix: type aim history agent id"
```

---

### Task 2: Render Recent History By Agent

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`

**Interfaces:**
- Consumes: `AimGeneration.agentId?: string | null`, `coreAimAgentIds`, `getAimAgent()`, `isValidAimAgent()`, `DEFAULT_AIM_AGENT`.
- Produces: Grouped sidebar UI with each agent title followed by up to four recent history buttons.

- [ ] **Step 1: Import `getAimAgent`**

Update the AIM UI config import:

```ts
import {
  AIM_AGENT_OPTIONS,
  DEFAULT_AIM_AGENT,
  getAimAgent,
  isValidAimAgent,
  type AimAgentId,
} from "@/lib/aim-ui-config"
```

- [ ] **Step 2: Add the visible-per-agent cap**

Place this below `coreAimAgentIds`:

```ts
const RECENT_ITEMS_PER_AGENT = 4
```

- [ ] **Step 3: Build grouped records inside `AppSidebar`**

Place this after `const closeMobile = () => setOpenMobile(false)`:

```ts
const historyGroups = coreAimAgentIds
  .map((agentId) => {
    const agent = getAimAgent(agentId)
    const items = history.filter((item) => {
      const itemAgentId = isValidAimAgent(item.agentId) ? item.agentId : DEFAULT_AIM_AGENT
      return itemAgentId === agentId
    })
    return { agent, items }
  })
  .filter((group) => group.items.length > 0)
```

- [ ] **Step 4: Replace the flat recent-content list**

Replace the old `history.slice(0, 8).map(...)` list with:

```tsx
<div className="space-y-3 px-1.5">
  {historyGroups.map(({ agent, items }) => (
    <div key={agent.id} className="space-y-0.5">
      <p className="px-1.5 text-[11px] font-medium text-foreground/70">{agent.title}</p>
      {items.slice(0, RECENT_ITEMS_PER_AGENT).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            requestLoad(item.id)
            closeMobile()
          }}
          className="block w-full rounded-md px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          title={item.topicTitle || item.rawInput}
        >
          <span className="block truncate">{item.topicTitle || item.rawInput}</span>
        </button>
      ))}
    </div>
  ))}
</div>
```

- [ ] **Step 5: Run targeted lint**

Run:

```bash
pnpm exec eslint src/components/layout/app-sidebar.tsx src/lib/api/client.ts
```

Expected: exits `0`.

- [ ] **Step 6: Verify the page renders**

Run:

```bash
curl -I http://localhost:3000/aim
```

Expected: response includes:

```text
HTTP/1.1 200 OK
```

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/app-sidebar.tsx src/lib/api/client.ts
git commit -m "fix: group aim sidebar history by agent"
```

---

## Self-Review

**Spec coverage:** The plan fixes the stated issue: multiple intelligent-agent histories are visually separated under agent names, following the Codex-style hierarchy.

**Placeholder scan:** No `TBD`, `TODO`, "similar to", or unspecified implementation steps remain.

**Type consistency:** `AimGeneration.agentId`, `getAimAgent`, `isValidAimAgent`, and `DEFAULT_AIM_AGENT` all match existing project exports.

**Skipped:** full history pagination, expandable folders, persisted collapsed state, and server-side grouping. Add those only when the current recent-list cap becomes insufficient.
