## Summary

<!-- What changed and why? -->

## Release Checks

- [ ] No database migration, or migration files are included and the rollout order is documented.
- [ ] Tests were added or updated for behavior changes.
- [ ] `lint`, `typecheck`, `arch:size`, `arch:check`, `arch:domains`, `arch:retired`, `db:bounds`, and relevant tests pass.
- [ ] `pnpm security:audit` has no new or expired high/critical advisory.
- [ ] No new module exceeds 400 significant lines; no non-legacy module exceeds 800 lines.
- [ ] API, deep links, and external callers remain compatible, or the breaking change is documented.
