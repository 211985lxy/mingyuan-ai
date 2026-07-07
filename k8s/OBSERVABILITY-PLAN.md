# 明远AIM Observability & Stability Plan

## Status: Phase 1 Complete (Code & K8s) | Phase 2 Pending (Cloud Console)

---

## Phase 1 - Already Implemented (This PR)

### K8s Configuration
- [x] CronJob: SLB IP made configurable via `MINGYUAN_WEB_HOST` env (note: ECI has no CoreDNS, Service DNS unavailable)
- [x] CronJob: kept web image (ECI can't pull DockerHub curlimages/curl, ACR image already cached)
- [x] CronJob: resources limits added (250m/256Mi -> 500m/512Mi, was default 2C/4G in ECI)
- [x] CronJob: staggered schedules to avoid thundering herd
- [x] Worker: 1 replica -> 2 replicas with PDB (minAvailable=1)
- [x] Worker: fixed image reference to ACR (was `ghcr.io/your-org/...`)
- [x] Web: 2 replicas -> 3 replicas with PDB (minAvailable=2)
- [x] Web: resources 250m/512Mi -> 500m/1Gi requests, 2CPU/2Gi limits
- [x] Ingress: rate limiting annotations (50 rps, 20 connections)
- [x] Ingress: proxy timeout 120s for long API calls

### Application Code
- [x] Structured logging: `pino` logger with JSON output, service/component/requestId context
- [x] Prometheus metrics: `prom-client` with `/api/metrics` endpoint
  - HTTP request counters and duration histograms
  - Video task creation metrics
  - External API (Shanjian) latency and error tracking
  - Task recovery pass counters and error counters
  - Webhook processing counters (by type, dedup, error)
  - Redis/DB connection health gauges
  - Node.js default metrics (heap, event loop, GC)
- [x] Enhanced healthz: `/api/healthz` now checks DB + Redis connectivity
- [x] DB connection pool: `connectionLimit: 20, idleTimeout: 30s, connectTimeout: 5s`
- [x] Redis resilience: `maxRetriesPerRequest: 5, connectTimeout: 5s, commandTimeout: 10s, retryStrategy`
- [x] Shanjian API: latency/error metrics on all requests
- [x] Task recovery: structured logging with sessionId, error metrics
- [x] Webhook handler: structured logging with requestId, entity type tracking

---

## Phase 2 - Cloud Configuration (Completed via CLI)

### 2.1 SLS Log Collection - DONE

- [x] Created SLS Project: `mingyuan-logs` (cn-hangzhou)
- [x] Created Logstores: `app-logs` (TTL 30d, 2 shards) and `cron-logs` (TTL 15d, 1 shard)
- [x] Created search indexes on: level, component, requestId, sessionId, taskId, avatarId, videoTaskId, userId, service, path, status, durationSec, msg
- [x] Configured ECI log collection via `aliyun_logs_*` env vars on web and worker pods
- [x] Verified logs flowing into SLS (real user requests visible)

### 2.2 Application Monitoring - PARTIALLY DONE

- [x] `/api/metrics` Prometheus endpoint ready (deploys with next push)
- [ ] TODO: Install ARMS or managed Prometheus addon in ACK to scrape `/api/metrics`
  - ARMS: `aliyun cs InstallClusterAddons --ClusterId c3559a8307c224c9a998e94d993ea47a5 --body '[{"name":"arms-prometheus"}]'`
  - Then create ServiceMonitor targeting `mingyuan-web:80/api/metrics` every 30s

### 2.3 Alert Rules - DONE (via CMS)

Created 5 CMS alert rules (all active, contact group: 明远AIM-Alerts):

| Rule ID | Name | Metric | Threshold |
|---------|------|--------|-----------|
| mingyuan-eci-cpu-high | ECI CPU使用率过高 | instance_cpu_utilization | Warn >70%, Critical >85% |
| mingyuan-eci-memory-high | ECI 内存使用率过高 | instance_memory_utilization | Warn >80%, Critical >90% |
| mingyuan-slb-5xx | SLB 5xx错误率飙升 | InstanceStatusCode5xx | Warn >3/s, Critical >10/s |
| mingyuan-slb-high-rt | SLB 响应时间过长 | InstanceRt | Warn >5s, Critical >10s |
| mingyuan-slb-unhealthy | SLB 后端实例异常 | UnhealthyServerCount | Warn >=1, Critical >=2 |

TODO after Prometheus addon: Add application-level alerts (API error rate, Shanjian timeout, task backlog)

### 2.4 HTTPS/TLS - ALREADY CONFIGURED

- [x] HTTPS works via Let's Encrypt wildcard cert `*.aibao365.com.cn` (expires 2026-06-25)
- [x] TLS 1.3 with CHACHA20-POLY1305 cipher
- [x] Terminated at CDN/proxy layer before SLB (SLB only has TCP:80 listener)
- No action needed

### 2.5 HPA Auto-Scaling (P1)

Requires metrics-server or ARMS. After monitoring is enabled:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: mingyuan-web-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: mingyuan-web
  minReplicas: 3
  maxReplicas: 8
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 2
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Pods
          value: 1
          periodSeconds: 120
```

### 2.6 OpenTelemetry Tracing (P2)

For full end-to-end distributed tracing:

1. Install OpenTelemetry Collector in the cluster
2. Add `@opentelemetry/sdk-node` and `@opentelemetry/exporter-trace-otlp-http` to the app
3. Create `instrumentation.ts` with auto-instrumentation for HTTP and Prisma
4. Configure export to ARMS trace service or Jaeger

---

## Cost Impact Estimate

| Change | Before (Monthly) | After (Monthly) |
|--------|------------------|-----------------|
| CronJob images | ~5 * ECI 2C/4G pods | ~5 * ECI 0.25C/0.5G (curl) |
| Web replicas | 2 * 1CPU/1Gi | 3 * 2CPU/2Gi |
| Worker replicas | 1 * 1CPU/1Gi | 2 * 1CPU/1Gi |
| SLS | 0 | ~50 RMB/month |
| ARMS (if used) | 0 | ~200-500 RMB/month |

The CronJob savings from using curl instead of the full web image will partially offset the cost of additional replicas and monitoring.

---

## Verification Checklist

After deploying Phase 1 changes:

- [ ] `kubectl get pods` shows 3 web + 2 worker pods running
- [ ] `curl http://mingyuan-web/api/healthz` returns DB/Redis status
- [ ] `curl http://mingyuan-web/api/metrics` returns Prometheus metrics
- [ ] CronJob pods use `curlimages/curl` and have resource limits
- [ ] CronJob pods successfully connect via Service DNS (not hardcoded IP)
- [ ] Structured JSON logs appear in pod stdout

After Phase 2 cloud configuration:
- [ ] Logs searchable in SLS by `requestId`, `component`, `level`
- [ ] Prometheus/ARMS dashboards show API latency and error rate
- [ ] Alert fires on test error spike
- [ ] HTTPS works on www.aibao365.com.cn
- [ ] HPA scales up under load test
