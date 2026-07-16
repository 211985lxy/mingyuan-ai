# K8s Deployment

This directory contains the production web workload for AIM.

## Workload

`mingyuan-web.yaml` defines `Deployment/mingyuan-web`, `Service/mingyuan-web`, and `Ingress/mingyuan-web`.

## Required config

Create these resources before applying the manifest:

- `ConfigMap/mingyuan-web-config` for non-secret runtime configuration such as `NEXT_PUBLIC_APP_URL`
- `Secret/mingyuan-web-secrets` for `DATABASE_URL`, session secrets, OSS credentials, and `REDIS_URL`
- Aliyun ASR credentials when AIM voice-to-text is enabled

## Image build

Build from the repository root:

```bash
docker build --target web-runner -f apps/web/Dockerfile -t ghcr.io/your-org/mingyuan-web:latest .
```

## Apply

```bash
kubectl apply -f k8s/mingyuan-web.yaml
```

Update the ingress host and image reference before applying the manifest. Production releases use immutable commit-SHA image tags; `latest` is promoted only after the live health check passes.
