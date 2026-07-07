---
name: aws-cloudwatch-incident-investigation
description: Investigate AWS CloudWatch alarms and production incidents. Use when analyzing 5XX errors, high CPU, traffic spikes, or any CloudWatch alarm. Systematically diagnoses root cause through metrics, logs, and service health checks.
allowed-tools: Bash(aws *)
context: fork
agent: Explore
---

# AWS CloudWatch Incident Investigation

Systematically investigate AWS CloudWatch alarms to identify root cause.

## Investigation Framework

Follow this sequence to diagnose production incidents:

### 1. Alarm Analysis
```bash
# Get alarm details
aws cloudwatch describe-alarms --alarm-names "$ARGUMENTS" --region $REGION

# Check alarm history
aws cloudwatch describe-alarm-history --alarm-name "$ARGUMENTS" --max-records 20 --region $REGION
```

**Extract:**
- Current state (OK/ALARM/INSUFFICIENT_DATA)
- Threshold and actual value
- Metric name and namespace
- Dimensions (LoadBalancer, TargetGroup, Service, etc.)
- When alarm triggered

### 2. Error Timeline
```bash
# Get metric statistics for the incident window
aws cloudwatch get-metric-statistics \
  --metric-name <MetricName> \
  --namespace <Namespace> \
  --dimensions <from alarm> \
  --start-time <incident_start - 1h> \
  --end-time <incident_end + 30m> \
  --period 60 \
  --statistics Sum,Average,Maximum \
  --region $REGION
```

**Analyze:**
- When did errors start?
- Peak error rate
- Duration of incident
- Recovery time

### 3. Resource Utilization
For ECS/EC2 services, check:

```bash
# CPU utilization
aws cloudwatch get-metric-statistics \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --dimensions Name=ServiceName,Value=<service> Name=ClusterName,Value=<cluster> \
  --start-time <incident_window> \
  --end-time <incident_window> \
  --period 60 \
  --statistics Average,Maximum

# Memory utilization
aws cloudwatch get-metric-statistics \
  --metric-name MemoryUtilization \
  --namespace AWS/ECS \
  --dimensions Name=ServiceName,Value=<service> Name=ClusterName,Value=<cluster> \
  --start-time <incident_window> \
  --end-time <incident_window> \
  --period 60 \
  --statistics Average,Maximum
```

**Look for:**
- CPU/Memory saturation (>90%)
- Sudden spikes
- Correlation with error timeline

### 4. Traffic Analysis
```bash
# Request count
aws cloudwatch get-metric-statistics \
  --metric-name RequestCount \
  --namespace AWS/ApplicationELB \
  --dimensions Name=LoadBalancer,Value=<lb> Name=TargetGroup,Value=<tg> \
  --start-time <incident_window> \
  --end-time <incident_window> \
  --period 60 \
  --statistics Sum

# Response time
aws cloudwatch get-metric-statistics \
  --metric-name TargetResponseTime \
  --namespace AWS/ApplicationELB \
  --dimensions Name=LoadBalancer,Value=<lb> Name=TargetGroup,Value=<tg> \
  --start-time <incident_window> \
  --end-time <incident_window> \
  --period 60 \
  --statistics Average,Maximum
```

**Compare:**
- Normal vs incident traffic levels
- Response time degradation
- Traffic patterns (sudden spike vs gradual)

### 5. Service Health
```bash
# For ALB targets
aws elbv2 describe-target-health \
  --target-group-arn <arn> \
  --region $REGION

# For ECS services
aws ecs describe-services \
  --cluster <cluster> \
  --services <service> \
  --region $REGION
```

**Check:**
- Unhealthy targets
- Draining connections
- Recent deployments
- Task replacement events
- Health check failures

### 6. Security & Attack Analysis
```bash
# Check WAF status
aws wafv2 get-web-acl-for-resource \
  --resource-arn <alb-arn> \
  --region $REGION

# List ALB access logs
aws s3 ls s3://<log-bucket>/AWSLogs/<account>/elasticloadbalancing/<region>/<date>/ --region $REGION
```

**If traffic spike detected:**
```bash
# Download and analyze access logs
aws s3 cp s3://<log-bucket>/<largest-log-during-incident> /tmp/incident-log.gz
gunzip -c /tmp/incident-log.gz | awk -F'"' '{print $2}' | awk '{print $1}' | sort | uniq -c | sort -rn
gunzip -c /tmp/incident-log.gz | awk '{print $4}' | awk -F':' '{print $1}' | sort | uniq -c | sort -rn | head -20
```

**Look for:**
- Cloudflare/CDN IPs (legitimate traffic)
- Distributed attack sources
- OPTIONS flood (CORS abuse)
- Specific endpoint targeting

## Root Cause Patterns

### Pattern 1: CPU Saturation
- **Symptoms**: 95%+ CPU, slow response times, health check timeouts
- **Cause**: Traffic spike overwhelming capacity
- **Fix**: Auto-scaling, increase resources, rate limiting

### Pattern 2: Memory Leak
- **Symptoms**: Gradual memory increase, eventual OOM kills
- **Cause**: Application memory leak
- **Fix**: Restart tasks, fix memory leak, add memory monitoring

### Pattern 3: Deployment Issues
- **Symptoms**: Errors start after deployment, draining targets
- **Cause**: Bad deployment, insufficient capacity during rollout
- **Fix**: Rollback, increase minimumHealthyPercent

### Pattern 4: Dependency Failure
- **Symptoms**: Sudden errors, timeouts to external services
- **Cause**: Database, API, or service dependency down
- **Fix**: Check dependency health, implement circuit breakers

### Pattern 5: Traffic Attack
- **Symptoms**: 4x+ traffic spike, OPTIONS flood, distributed sources
- **Cause**: DDoS, bot abuse, or viral traffic
- **Fix**: WAF rules, rate limiting, Cloudflare protection

## Output Format

Provide a structured report:

### Incident Summary
- **Alarm**: [name]
- **Time**: [start] to [end] ([duration])
- **Impact**: [error count, affected users]
- **Status**: [resolved/ongoing]

### Timeline
| Time | Event | Metrics |
|------|-------|---------|
| ... | ... | ... |

### Root Cause
[Clear explanation of what caused the incident]

### Evidence
- [Key metric 1]: [value]
- [Key metric 2]: [value]
- [Supporting data]

### Recommendations
#### Immediate
1. [Action 1]
2. [Action 2]

#### Short-term
1. [Action 1]
2. [Action 2]

#### Long-term
1. [Action 1]
2. [Action 2]

## Usage Examples

```bash
# Investigate a specific alarm
/aws-cloudwatch-incident-investigation "PWA Backend 5XX 告警"

# With AWS profile
AWS_PROFILE=production /aws-cloudwatch-incident-investigation "High CPU Alert"
```

## Prerequisites

- AWS CLI configured with appropriate credentials
- Access to CloudWatch, ECS, ALB, and S3 (for logs)
- Region set via AWS_REGION or --region flag
