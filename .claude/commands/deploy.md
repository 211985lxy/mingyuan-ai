---
name: deploy
description: "Commit, push to main, and monitor the CI/CD GitHub Action until deployment completes."
category: DevOps
tags: [deploy, ci, cd, github-actions]
---

Deploy the current changes to production via GitHub Actions CI/CD pipeline.

## Steps

1. **Check working tree status**
   - Run `git status` to see uncommitted changes.
   - If the tree is clean, skip to step 3.

2. **Commit and push**
   - Stage all changed files (be careful not to stage secrets like `.env`).
   - Create a concise commit message describing the changes.
   - Push to `main`.

3. **Monitor GitHub Action**
   - Use `gh run list --branch main --limit 1` to find the latest workflow run.
   - Use `gh run watch <run-id>` to stream the CI/CD progress in real-time.
   - If the run fails, read the logs with `gh run view <run-id> --log-failed` and report the failure.

4. **Report result**
   - On success: confirm deployment is live.
   - On failure: show the failing step and relevant logs.

## Notes

- The CI/CD workflow is defined in `.github/workflows/test.yml`.
- Pipeline: lint → build → Docker push to Aliyun ACR → k8s deploy → rollout wait.
- Only pushes to `main` trigger the deploy job.
