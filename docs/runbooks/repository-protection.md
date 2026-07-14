# Repository Protection

## Required branch settings

Configure these settings for `main` in the GitHub repository. Files in this repository cannot prove that the remote settings are enabled.

- Require pull requests and at least one approval.
- Dismiss stale approvals after new commits.
- Require review from CODEOWNERS.
- Require conversations to be resolved.
- Require branches to be up to date before merge.
- Block force pushes and branch deletion.
- Restrict direct pushes to the release owner.

## Required checks

- `Repository Guardrails / Lint, types, tests, architecture, and harness`
- `AIM Architecture Guard / Layer dependency guard`
- `AIM Harness Eval (deterministic) / Deterministic eval (no model)`
- `Security and Supply Chain / Dependencies, secrets, and CodeQL`
- `Security and Supply Chain / Container and SBOM`

The real-model daily and full evaluations remain operational release evidence; they are not deterministic PR gates.

## Ownership and dependency maintenance

- `.github/CODEOWNERS` owns all files and calls out schema, API, workflow, and security paths.
- Dependabot opens weekly npm, GitHub Actions, and Docker updates.
- `pnpm security:audit` fails on every new high or critical advisory. A temporary exception requires an owner, reason, compensating control, and expiry date.
- Review and either remove or renew each exception before expiry. Renewal requires current evidence that no patched compatible dependency exists.

## Release boundary

The deploy workflow applies production migrations only after quality gates pass. Destructive retired-media cleanup runs its data-count preflight before `prisma migrate deploy`; a non-empty production result requires both `ACK_RETIRE_MEDIA_DATA=DELETE_RETIRED_MEDIA_DATA` and a `RETIRED_MEDIA_BACKUP_REFERENCE` identifying the verified backup and restore drill.
