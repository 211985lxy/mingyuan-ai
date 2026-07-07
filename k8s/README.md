# K8s Deployment

This directory contains the minimum production manifests to run 明远AIM on Kubernetes with minute-level task recovery.

## Workloads

- `mingyuan-web.yaml`
  - `Deployment/mingyuan-web`
  - `Service/mingyuan-web`
  - `Ingress/mingyuan-web`
- `mingyuan-worker.yaml`
  - `Deployment/mingyuan-worker`
  - Runs the task recovery loop as a dedicated worker process
- `mingyuan-recovery-cronjob.yaml`
  - `CronJob/mingyuan-task-recovery`
  - Calls `GET /api/cron/poll-tasks` every minute inside the cluster as the final safety net

## Required config

Create these before applying the manifests:

- `ConfigMap/mingyuan-web-config`
  - non-secret runtime env such as `NEXT_PUBLIC_APP_URL`, `SHANJIAN_WEBHOOK_URL`
- `Secret/mingyuan-web-secrets`
  - `DATABASE_URL`
  - `CRON_SECRET`
  - `JWT_SECRET`
  - `ADMIN_JWT_SECRET`
  - `SHANJIAN_APP_KEY`
  - `OSS_REGION`
  - `OSS_ACCESS_KEY_ID`
  - `OSS_ACCESS_KEY_SECRET`
  - `OSS_BUCKET`
  - `REDIS_URL` if used in your cluster

## Image build

Build from the repository root:

```bash
docker build --target web-runner -f apps/web/Dockerfile -t ghcr.io/your-org/mingyuan-web:latest .
docker build --target worker-runner -f apps/web/Dockerfile -t ghcr.io/your-org/mingyuan-worker:latest .
```

## Apply order

```bash
kubectl apply -f k8s/mingyuan-web.yaml
kubectl apply -f k8s/mingyuan-worker.yaml
kubectl apply -f k8s/mingyuan-recovery-cronjob.yaml
```

## Notes

- Update the ingress host in `mingyuan-web.yaml`
- Keep `CRON_SECRET` identical between the web app and the CronJob
- The worker is the primary active compensator after webhook callbacks
- The CronJob is the last safety net; if the worker is unhealthy or misses a pass, recovery still runs every minute through HTTP
- Both the worker and the CronJob share the same Redis lock semantics, so overlapping runs will no-op safely
