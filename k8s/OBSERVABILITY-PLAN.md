# AIM Observability Plan

## Current application signals

- Structured JSON logging with request and user-safe correlation identifiers
- Prometheus metrics exposed at `/api/metrics`
- `/api/healthz` checks database and Redis connectivity
- HTTP request rate, latency, status, database, Redis, and Node.js runtime metrics
- AIM generation run and model-attempt traces without storing secrets

## Production checks

- The web deployment uses resource requests, limits, readiness, and liveness probes.
- The release workflow waits for the web rollout and verifies `/api/healthz` before promoting `web:latest`.
- Logs should be searchable by `requestId`, `component`, `level`, `userId`, path, status, and duration.

## Pending cloud configuration

1. Install managed Prometheus or ARMS scraping for `/api/metrics`.
2. Alert on HTTP 5xx rate, AIM generation failures, model latency, database health, and Redis health.
3. Add an HPA only after metrics-server behavior is verified under a controlled load test.
4. Add OpenTelemetry tracing if request-level metrics and generation traces are insufficient for incident diagnosis.

## Release verification

```bash
kubectl rollout status deployment/mingyuan-web --timeout=180s
kubectl port-forward service/mingyuan-web 18080:80
curl --fail http://127.0.0.1:18080/api/healthz
curl --fail http://127.0.0.1:18080/api/metrics
```

Cloud-console resources and alert rules must be verified in the target account for every environment; this repository does not treat historical setup notes as proof of current production state.
