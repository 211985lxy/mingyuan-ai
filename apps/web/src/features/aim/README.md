# AIM Domain

- Entry: `/aim`, AIM API routes, Agent API generation, and the components/hooks in this directory.
- Public surfaces: workflow contracts, editor actions, workflow task helpers, and UI composition components.
- Data ownership: AIM generations, versions, task specifications, outcomes, run snapshots, traces, and IP Wiki state.
- Events: generate, copy, revise, adopt, publish, review, and workflow-stage transitions.
- Dependencies: shared auth, project access, knowledge, LLM runtime, and observability infrastructure in `src/lib`.
- Boundary: pages compose this domain; they do not reimplement routing or access Prisma. AIM may consume topic and competitor evidence through contracts, but those domains must not depend on AIM UI or runtime internals.
