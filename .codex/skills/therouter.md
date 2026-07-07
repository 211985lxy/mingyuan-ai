---
name: therouter
description: "Guide for integrating TheRouter.ai — a unified LLM gateway with OpenAI-compatible API, multi-provider routing, fallbacks, and billing consolidation."
category: AI Integration
tags: [therouter, llm, gateway, ai, routing, openai, anthropic]
---

Integrate or work with TheRouter.ai — a unified LLM gateway that routes requests across 75+ models from Anthropic, OpenAI, Google, and xAI through a single OpenAI-compatible API.

## What TheRouter Is

TheRouter is a **Unified LLM Gateway & Control Plane** that sits between your app and multiple LLM providers. One API key, one base URL, access to all providers. It handles failover, load balancing, billing consolidation, and usage governance.

**Base URL:** `https://api.therouter.ai/v1`

## Authentication

All requests use Bearer token auth:

```
Authorization: Bearer sk-...
```

Key types:

- **Routing keys** (`sk-...`) — for inference requests
- **Management keys** (`sk-mgmt-...`) — for tenant dashboard APIs (credits, key management)

Every response includes `x-request-id` header for tracing.

## Core Endpoints

| Method | Path                     | Description                                 |
| ------ | ------------------------ | ------------------------------------------- |
| `POST` | `/v1/chat/completions`   | Main inference endpoint (OpenAI-compatible) |
| `POST` | `/v1/anthropic/messages` | Anthropic Messages API (native format)      |
| `POST` | `/v1/embeddings`         | Text embeddings                             |
| `GET`  | `/v1/models`             | List all available models with metadata     |
| `GET`  | `/v1/providers`          | List providers (with optional health data)  |
| `GET`  | `/v1/customer/analytics` | Usage analytics with timeseries             |
| `GET`  | `/api/v1/credits`        | Credit balance (requires `sk-mgmt-...` key) |
| `GET`  | `/v1/customer/credits`   | Expanded billing details                    |
| `POST` | `/v1/keys`               | Create API keys (requires management key)   |

## Integration Patterns

### 1. OpenAI SDK (Drop-in Replacement) — Preferred

**TypeScript:**

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.therouter.ai/v1",
  apiKey: process.env.THEROUTER_API_KEY,
});

const completion = await client.chat.completions.create({
  model: "anthropic/claude-sonnet-4.5",
  messages: [{ role: "user", content: "Hello" }],
});
```

**Python:**

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://api.therouter.ai/v1",
    api_key="<THEROUTER_API_KEY>",
)
```

### 2. TheRouter Native SDK

```bash
npm install @therouter/sdk
```

```typescript
import { TheRouter } from "@therouter/sdk";

const client = new TheRouter({
  apiKey: process.env.THEROUTER_API_KEY!,
  baseURL: "https://api.therouter.ai/v1",
  timeout: 30000,
});

const completion = await client.chat.completions.create({
  model: "anthropic/claude-sonnet-4.5",
  messages: [{ role: "user", content: "Hello" }],
});
```

### 3. Anthropic SDK

Set base URL to `https://api.therouter.ai/v1/anthropic` and use `x-api-key` header.

### 4. Direct REST API

```bash
curl https://api.therouter.ai/v1/chat/completions \
  -H "Authorization: Bearer sk-..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-sonnet-4.5",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## Chat Completions Parameters

### Core

- `model` (string) — Model alias: `provider/model-name` (e.g., `anthropic/claude-sonnet-4.5`)
- `models` (string[]) — Fallback model list; tried in order until one succeeds
- `messages` (array) — Conversation messages with `role`/`content`

### Sampling

- `temperature` (0-2), `top_p` (0-1), `max_tokens`, `max_completion_tokens`
- `frequency_penalty` (-2 to 2), `presence_penalty` (-2 to 2)
- `stop` (string|string[]), `seed` (integer)

### Advanced

- `stream` (boolean) — Enable SSE streaming
- `stream_options` — `{ include_usage: true }` for token counts in stream
- `tools` (array) — Tool/function definitions
- `tool_choice` — `"auto"`, `"none"`, or named function
- `parallel_tool_calls` (boolean)
- `response_format` — `{ type: "json_object" }` or `{ type: "json_schema", json_schema: {...} }`
- `reasoning` — `{ max_tokens: 2000, exclude: false, effort: "high" }`
- `transforms` — `["middle-out"]` for message compression

### Router Extensions (TheRouter-specific)

- `provider.order` (string[]) — Strict provider priority
- `provider.allow_fallbacks` (boolean)
- `provider.only` (string[]) — Restrict to these providers
- `provider.ignore` (string[]) — Exclude these providers
- `provider.sort` — `"price"`, `"throughput"`, or `"latency"`
- `provider.zdr` (boolean) — Enforce Zero Data Retention
- `route` — `"fallback"` or `"sort"`
- `preset` — Preset configuration ID (or use `model: "@preset/my-preset-id"`)

## Model Fallbacks

```typescript
const completion = await client.chat.completions.create({
  models: [
    "anthropic/claude-sonnet-4.5",
    "openai/gpt-4o",
    "google/gemini-2.5-flash",
  ],
  messages: [{ role: "user", content: "Hello" }],
});
// Response `model` field shows which model actually served the request
```

## Provider Routing

```typescript
const completion = await client.chat.completions.create({
  model: "anthropic/claude-sonnet-4.5",
  messages: [...],
  provider: {
    sort: "price",            // route by cheapest
    only: ["anthropic"],      // restrict to provider
    allow_fallbacks: true,    // allow fallback on failure
    zdr: true,                // zero data retention
  },
});
```

## Structured Output

```typescript
const completion = await client.chat.completions.create({
  model: "openai/gpt-4o",
  messages: [...],
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "my_schema",
      strict: true,
      schema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
  },
});
```

## Embeddings

```typescript
const embedding = await client.embeddings.create({
  model: "openai/text-embedding-3-large",
  input: "Your text here",
  encoding_format: "float",
  dimensions: 1024,
});
```

Supported models: `openai/text-embedding-3-large`, `cohere/embed-english-v3`, `cohere/embed-multilingual-v3`.

## Error Handling

| Code | Meaning                                                             |
| ---- | ------------------------------------------------------------------- |
| 400  | Invalid schema or parameters                                        |
| 401  | Missing/invalid API key                                             |
| 402  | Insufficient credits (response includes `balance` and `top_up_url`) |
| 429  | Rate limited (`Retry-After` header included)                        |
| 502  | Upstream provider failure                                           |

Error response shape:

```json
{
  "error": {
    "message": "descriptive text",
    "type": "error_type",
    "code": 429,
    "param": null
  }
}
```

## Rate Limits

- Default: 1,000 requests/minute
- Max request body: 1 MB
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## Prompt Caching

```typescript
messages: [
  {
    role: "system",
    content: [
      {
        type: "text",
        text: "Long system prompt...",
        cache_control: { type: "ephemeral", ttl: "1h" },
      },
    ],
  },
],
```

## Popular Model IDs

**Anthropic:** `anthropic/claude-opus-4.5`, `anthropic/claude-sonnet-4.5`, `anthropic/claude-haiku-4.5`
**OpenAI:** `openai/gpt-4o`, `openai/gpt-4o-mini`, `openai/o3`, `openai/o4-mini`
**Google:** `google/gemini-2.5-pro`, `google/gemini-2.5-flash`
**xAI:** `xai/grok-3`, `xai/grok-3-mini`

## When Working With TheRouter In This Project

1. Always store the API key in environment variables (`THEROUTER_API_KEY`), never hardcode.
2. Use the OpenAI SDK drop-in pattern unless native Anthropic format is specifically needed.
3. Implement model fallback arrays for production reliability.
4. Use `provider.sort: "price"` for cost optimization on non-critical paths.
5. Set `provider.zdr: true` when handling sensitive user data.
6. Handle 402 errors gracefully — check credit balance and surface the top-up URL.
7. Use `stream: true` for any user-facing chat completions to improve perceived latency.

## Reference

- Docs: https://www.therouter.ai/docs/api/reference/overview/
- Dashboard: https://www.therouter.ai/dashboard
