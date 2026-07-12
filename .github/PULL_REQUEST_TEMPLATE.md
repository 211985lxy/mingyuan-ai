## Summary

<!-- What changed and why? -->

## Release Checks

- [ ] No database migration, or migration files are included and the rollout order is documented.
- [ ] Tests were added or updated for behavior changes.
- [ ] `pnpm --dir apps/web run lint`, `typecheck`, `arch:size`, and relevant tests pass.
- [ ] No new module exceeds 400 significant lines; no non-legacy module exceeds 800 lines.
- [ ] API, deep links, and external callers remain compatible, or the breaking change is documented.
