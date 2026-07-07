# Stack Research: Aliyun Video Enhancement

**Domain:** Video Super-Resolution / 4K Upscaling (1080p → 4K)
**Researched:** 2026-04-01
**Confidence:** MEDIUM

## Executive Summary

Alibaba Cloud provides video enhancement capabilities through its **Vision Intelligence API (VIAPI)** service, specifically the `videoenhan` API (version 2020-03-20). Two APIs are available for video quality improvement: `SuperResolveVideo` for resolution upscaling and `EnhanceVideoQuality` for comprehensive quality enhancement with resolution control.

**Confidence Level Rationale:** SDK inspection provides HIGH confidence on API structure and implementation. Pricing and processing time estimates are MEDIUM confidence due to lack of accessible official documentation (404 errors on multiple help pages). Real-world verification needed.

## Recommended Stack

### Core API Service

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Alibaba Cloud Vision Intelligence API (videoenhan) | 2020-03-20 | Video super-resolution and quality enhancement | Only Aliyun-native video upscaling service with direct SDK support, designed for automated video processing pipelines |
| `@alicloud/videoenhan20200320` | 4.0.0 (latest) | Official Node.js/TypeScript SDK | Maintained by Alibaba Cloud SDK team, recently updated (Nov 2025), provides type-safe API access |
| `@alicloud/credentials` | 2.4.4+ | Authentication and credential management | Supports multiple auth patterns (AccessKey, STS, RAM roles), automatic credential chain resolution |
| `@alicloud/openapi-core` | 1.0.0+ | Core OpenAPI client (dependency) | Required by videoenhan SDK, handles RPC-style API calls |

### API Operations

| Operation | Purpose | Input | Output | When to Use |
|-----------|---------|-------|--------|-------------|
| `SuperResolveVideo` | Video super-resolution (upscaling) | `videoUrl` (OSS URL), optional `bitRate` | `videoUrl` (processed video URL) | Dedicated upscaling operation, simpler API, likely optimized for resolution increase |
| `EnhanceVideoQuality` | Comprehensive video enhancement | `videoURL`, optional: `outPutWidth`, `outPutHeight`, `bitrate`, `frameRate`, `HDRFormat`, `maxIlluminance` | `videoURL` (processed video URL) | More control over output dimensions and quality parameters, supports HDR conversion |

**Recommendation:** Use `SuperResolveVideo` for initial implementation due to simpler API surface. Migrate to `EnhanceVideoQuality` if fine-grained control over output resolution or HDR support is needed.

## Installation

```bash
# Core dependencies
npm install @alicloud/videoenhan20200320@4.0.0
npm install @alicloud/credentials@^2.4.4

# Already in project (OpenAPI core is transitive dependency)
# @alicloud/openapi-core is auto-installed
```

## Authentication Configuration

### Method 1: AccessKey (Recommended for Server-Side)

```typescript
import Videoenhan from '@alicloud/videoenhan20200320';
import { Config as CredentialConfig } from '@alicloud/credentials';

const client = new Videoenhan({
  accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  endpoint: 'videoenhan.cn-shanghai.aliyuncs.com', // Regional endpoint
  type: 'access_key'
});
```

### Method 2: Environment Variables (Automatic)

Set environment variables and credentials will be auto-detected:

```bash
export ALIBABA_CLOUD_ACCESS_KEY_ID="your_key_id"
export ALIBABA_CLOUD_ACCESS_KEY_SECRET="your_key_secret"
```

```typescript
import Videoenhan from '@alicloud/videoenhan20200320';

// Credentials auto-loaded from environment
const client = new Videoenhan({
  endpoint: 'videoenhan.cn-shanghai.aliyuncs.com'
});
```

### Method 3: STS Token (For Temporary Access)

```typescript
const client = new Videoenhan({
  accessKeyId: process.env.STS_ACCESS_KEY_ID,
  accessKeySecret: process.env.STS_ACCESS_KEY_SECRET,
  securityToken: process.env.STS_SECURITY_TOKEN,
  endpoint: 'videoenhan.cn-shanghai.aliyuncs.com',
  type: 'sts'
});
```

**Recommendation:** Use environment variables for credential management to avoid hardcoding secrets. ClipFlow is deployed on Alibaba Cloud Kubernetes, so consider using ECS RAM role for production.

## API Usage Pattern

### Synchronous Pattern (Current Implementation)

Based on SDK inspection, both `SuperResolveVideo` and `EnhanceVideoQuality` return the processed video URL **directly in the response** (synchronous blocking call):

```typescript
import Videoenhan, {
  SuperResolveVideoRequest,
  EnhanceVideoQualityRequest
} from '@alicloud/videoenhan20200320';

const client = new Videoenhan({ /* config */ });

// Option 1: SuperResolveVideo (simpler)
const superResolveRequest = new SuperResolveVideoRequest({
  videoUrl: 'https://your-oss-bucket.oss-cn-shanghai.aliyuncs.com/input.mp4',
  bitRate: 5 // Optional: output bitrate in Mbps
});

const response = await client.superResolveVideo(superResolveRequest);
const enhancedVideoUrl = response.body.data.videoUrl;
console.log(`Enhanced video: ${enhancedVideoUrl}`);

// Option 2: EnhanceVideoQuality (more control)
const enhanceRequest = new EnhanceVideoQualityRequest({
  videoURL: 'https://your-oss-bucket.oss-cn-shanghai.aliyuncs.com/input.mp4',
  outPutWidth: 3840,  // 4K width
  outPutHeight: 2160, // 4K height
  bitrate: 20,        // Output bitrate in Mbps
  frameRate: 30       // Output frame rate
});

const response2 = await client.enhanceVideoQuality(enhanceRequest);
const enhancedVideoUrl2 = response2.body.data.videoURL;
```

**IMPORTANT:** These APIs appear to be **synchronous blocking calls** that return the processed video URL directly. This means:
- The API call will wait until video processing completes
- Processing time for a 3-minute 1080p video is **estimated 5-15 minutes** (unverified)
- Long-running requests may timeout if processing exceeds HTTP timeout limits
- Consider implementing client-side timeout handling and retry logic

### Async Polling Pattern (If Needed)

The SDK includes `GetAsyncJobResult` API, suggesting some operations support async polling:

```typescript
import { GetAsyncJobResultRequest } from '@alicloud/videoenhan20200320';

// If an operation returns a jobId instead of direct result:
const jobResultRequest = new GetAsyncJobResultRequest({
  jobId: 'E75FE679-0303-4DD1-8252-1143B4FA8A27'
});

const jobResult = await client.getAsyncJobResult(jobResultRequest);
console.log(`Status: ${jobResult.body.data.status}`); // PROCESS_SUCCESS, etc.
console.log(`Result: ${jobResult.body.data.result}`); // JSON string with VideoUrl
```

**Status Values (from SDK types):**
- `PROCESS_SUCCESS` - Job completed successfully
- (Other status codes: requires API testing to verify)

**Note:** SDK inspection shows `SuperResolveVideo` and `EnhanceVideoQuality` return `videoUrl` directly, **not** a `jobId`. The async pattern may be for other operations. Verify behavior with real API calls.

## Service Limits and Constraints

**⚠️ MEDIUM CONFIDENCE:** Official documentation was inaccessible (404 errors). These limits require verification:

| Constraint | Estimated Value | Verification Needed |
|------------|-----------------|---------------------|
| Input video format | MP4, H.264/H.265 codec | Test with Shanjian output (H.264 MP4) |
| Max file size | Unknown, likely 500MB-2GB | Test with typical 3-min 1080p video (~200-300MB) |
| Max video duration | Unknown, likely 10-30 minutes | Verify with API testing |
| Input resolution | 360p to 1080p for upscaling | Test with 1080p input |
| Output resolution | Up to 4K (3840x2160) | Test with 4K output request |
| Processing time | **Est. 5-15 min for 3-min 1080p → 4K** | Measure in real environment |
| Rate limits | Unknown, likely 10-100 requests/min | Monitor API error responses |
| Concurrent jobs | Unknown | Test parallel requests |
| API timeout | Unknown, likely 30-60 sec HTTP timeout | May require polling even if API is "sync" |

**Action Required:** Test with actual Shanjian-generated video (3-minute 1080p MP4) to validate:
1. Processing time for 1080p → 4K upscaling
2. Whether API truly blocks until completion or returns job ID
3. Timeout behavior and retry requirements

## Pricing Model

**⚠️ LOW CONFIDENCE:** Pricing documentation was inaccessible. Estimates based on typical Aliyun VIAPI pricing patterns:

| Service | Estimated Pricing | Billing Unit | Notes |
|---------|-------------------|--------------|-------|
| SuperResolveVideo | **Est. ¥0.5-2.0 per minute** | Per minute of video processed | Unverified, typical VIAPI video pricing range |
| EnhanceVideoQuality | **Est. ¥0.5-2.0 per minute** | Per minute of video processed | May vary based on resolution increase factor |
| OSS bandwidth | ¥0.50/GB outbound | Data transfer | Input/output video transfer via OSS |

**Estimated cost per video (3-minute 1080p → 4K):**
- Processing: ¥1.5 - ¥6.0 (0.5-2.0 per min × 3 min)
- OSS transfer: ¥0.30 (300MB input + 600MB output = ~900MB = ~¥0.30)
- **Total: ¥1.80 - ¥6.30 per video**

**Action Required:**
1. Check Alibaba Cloud console for actual VIAPI pricing
2. Monitor actual costs in first week of production usage
3. Consider implementing usage quotas or per-user limits

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Alibaba Cloud videoenhan API | Alibaba Cloud ICE (Intelligent Cloud Editing) | If full media workflow (editing, transcoding, enhancement) is needed beyond just upscaling. ICE is more complex but offers template-based editing. |
| videoenhan `SuperResolveVideo` | videoenhan `EnhanceVideoQuality` | If you need fine-grained control over output resolution, frame rate, HDR format, or illuminance. EnhanceVideoQuality offers more parameters. |
| Direct API calls via SDK | Aliyun CLI | For one-off testing or manual video processing. CLI not suitable for automated pipeline. |
| Alibaba Cloud videoenhan | Third-party APIs (Topaz, Runway) | If Aliyun pricing is prohibitive or quality is insufficient. Third-party APIs require different integration approach and may have data residency concerns. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| MPS (Media Processing Service) for super-resolution | MPS focuses on transcoding, watermarking, and format conversion. No explicit super-resolution or AI-based upscaling in documented features. | videoenhan API (SuperResolveVideo) |
| ICE for simple upscaling | ICE is overkill for basic upscaling — designed for complex media workflows with editing, templates, effects. Higher complexity and likely higher cost. | videoenhan API (SuperResolveVideo) |
| Polling `GetAsyncJobResult` for SuperResolveVideo | SDK structure shows `SuperResolveVideo` returns video URL directly in response, not a job ID. | Handle sync response with timeout/retry logic |
| Hardcoded AccessKey in code | Security risk, credential leakage in logs/repo history. | Environment variables or RAM role credentials |
| `@alicloud/pop-core` directly | Low-level RPC client, requires manual request signing and parameter handling. | Official `@alicloud/videoenhan20200320` SDK |

## Authorization Setup

### Step 1: Obtain AccessKey

1. Log in to Alibaba Cloud console: https://ram.console.aliyun.com/users
2. Navigate to **RAM (Resource Access Management)** → **Users**
3. Create a new RAM user or select existing user
4. Enable **Programmatic Access** to generate AccessKey ID and AccessKey Secret
5. Store credentials securely (use environment variables, never commit to repo)

### Step 2: Grant VIAPI Permissions

Attach policy to RAM user to allow Vision Intelligence API access:

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "viapi:*"
      ],
      "Resource": "*"
    }
  ]
}
```

**Action Required:** Verify exact policy name and scope for videoenhan API. May require service activation in console first.

### Step 3: Enable VIAPI Service (If Required)

Some Aliyun services require explicit activation:

1. Visit Vision Intelligence console: https://vision.console.aliyun.com
2. Check if service activation/agreement is required
3. Enable "Video Enhancement" or "Video Super-Resolution" if listed separately

**⚠️ Unverified:** Service activation process requires testing with actual Aliyun account.

### Step 4: Configure Credentials in ClipFlow

Add to ClipFlow environment variables (Kubernetes Secret):

```bash
# In .env or Kubernetes Secret
ALIBABA_CLOUD_ACCESS_KEY_ID=LTAI5t...
ALIBABA_CLOUD_ACCESS_KEY_SECRET=...
ALIBABA_CLOUD_REGION=cn-shanghai
VIDEOENHAN_ENDPOINT=videoenhan.cn-shanghai.aliyuncs.com
```

No CLI command equivalent found (Aliyun CLI does not recognize `videoenhan` product). Use SDK-based approach.

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| @alicloud/videoenhan20200320@4.0.0 | @alicloud/credentials@^2.4.2 | Credentials 2.4.2+ required, 2.4.4 is latest stable |
| @alicloud/videoenhan20200320@4.0.0 | @alicloud/openapi-core@^1.0.0 | Auto-installed as peer dependency |
| @alicloud/videoenhan20200320@4.0.0 | @darabonba/typescript@^1.0.0 | Auto-installed, provides runtime utilities |
| @alicloud/videoenhan20200320@4.0.0 | Node.js 16+ | DevDependency uses @types/node@^16.0.0, modern async/await syntax |
| @alicloud/videoenhan20200320@4.0.0 | TypeScript 5+ | Built with TypeScript 5, provides full type definitions |

## Processing Time Estimates

**⚠️ LOW CONFIDENCE - Requires Real-World Testing:**

Based on typical AI video processing patterns (no official data available):

| Input | Output | Estimated Processing Time | Confidence |
|-------|--------|--------------------------|------------|
| 1-min 1080p | 4K | 2-5 minutes | LOW (no official data) |
| 3-min 1080p | 4K | 5-15 minutes | LOW (no official data) |
| 5-min 1080p | 4K | 10-25 minutes | LOW (no official data) |

**Variables affecting processing time:**
- Input video complexity (motion, detail, compression artifacts)
- Output quality parameters (bitrate, frame rate)
- Aliyun service load (may vary by time of day)
- Region (cn-shanghai likely faster than overseas regions)

**Action Required:** Benchmark with actual 3-minute Shanjian-generated video to get accurate baseline.

## Integration Checklist

- [ ] Install `@alicloud/videoenhan20200320@4.0.0` and `@alicloud/credentials@^2.4.4`
- [ ] Obtain Alibaba Cloud AccessKey (RAM user with VIAPI permissions)
- [ ] Store credentials in environment variables (Kubernetes Secret)
- [ ] Verify VIAPI service is enabled in Alibaba Cloud console
- [ ] Test `SuperResolveVideo` API with sample video (measure processing time)
- [ ] Verify output video quality and resolution (3840×2160)
- [ ] Implement timeout handling (estimate 10-15 min for 3-min video)
- [ ] Add retry logic with exponential backoff for transient errors
- [ ] Monitor API costs in Alibaba Cloud billing console
- [ ] Set up alerting for API failures or timeout issues

## Sources

- **SDK Inspection:** `@alicloud/videoenhan20200320@4.0.0` npm package — HIGH confidence on API structure, request/response types, authentication methods
- **GitHub:** https://github.com/aliyun/alibabacloud-typescript-sdk — SDK usage patterns, credential configuration examples — MEDIUM confidence
- **GitHub:** https://github.com/aliyun/credentials-nodejs — Credential types and authentication flow — HIGH confidence
- **npm:** https://www.npmjs.com/package/@alicloud/videoenhan20200320 — Package metadata, version history (last updated Nov 2025) — HIGH confidence
- **Aliyun CLI:** `aliyun help` output — Authentication modes, credential types — HIGH confidence
- **Official Docs:** Multiple Alibaba Cloud help URLs returned 404 errors — LOW confidence on pricing, limits, processing times

**Critical Gap:** Pricing, processing times, and service limits could not be verified from official sources. **Real-world API testing required** before production deployment.

---

*Stack research for: Aliyun Video Enhancement (1080p → 4K Upscaling)*
*Researched: 2026-04-01*
*Next Action: Test SuperResolveVideo API with real 3-min 1080p video to validate processing time, cost, and output quality*
