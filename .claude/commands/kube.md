---
name: kube
description: "Run kubectl commands against the project's K8s cluster using the KUBECONFIG from PROJECT.md."
category: DevOps
tags: [kubernetes, k8s, k3s, kubectl, devops]
---

Run kubectl commands against the project's Kubernetes cluster.

## Setup

Read `PROJECT.md` in the project root to find the `KUBECONFIG` setting under the `## kube` section. Use that as the KUBECONFIG prefix for all kubectl commands in this session.

For example, if PROJECT.md contains:

```
## kube
KUBECONFIG=~/.kube/config-ecs kubectl
```

Then every kubectl command must be prefixed with `KUBECONFIG=~/.kube/config-ecs`.

## Namespace

The default namespace for this project is `gzhbuddy`. Always use `-n gzhbuddy` unless the user specifies otherwise.

## Common operations

When the user asks to "check pods", "see logs", "restart", etc., map to the appropriate kubectl command:

- **Status**: `kubectl -n gzhbuddy get pods`
- **Logs**: `kubectl -n gzhbuddy logs <pod> [--tail=100]`
- **Describe**: `kubectl -n gzhbuddy describe pod <pod>`
- **Restart**: `kubectl -n gzhbuddy rollout restart deployment gzhbuddy`
- **Rollout status**: `kubectl -n gzhbuddy rollout status deployment gzhbuddy`
- **Secrets**: `kubectl -n gzhbuddy get secret gzhbuddy-secrets`
- **Apply**: `kubectl apply -f k8s/app.yaml` (or other manifest)

## Safety

- Never delete pods/deployments without explicit user confirmation.
- Never expose secret values in output — use `kubectl get secret -o jsonpath` only when the user explicitly asks.
- Always read PROJECT.md first to get the correct KUBECONFIG before running any kubectl command.
