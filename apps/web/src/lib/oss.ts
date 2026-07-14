import { env } from "@/env"
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import OSS from "ali-oss";

/**
 * SSRF 防护:阻止服务端去 fetch 内网/回环地址。
 * sourceUrl 在多个 webhook 回调里来自外部(山见/阿里云返回值,理论上是 CDN),
 * 但攻击者可伪造回调把这些字段改成内网元数据服务地址,必须拦截。
 * 仅做 IP 字面量与已知内网域名校验,不做 DNS 解析(留待后续加固)。
 */
function assertPublicSourceUrl(sourceUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error(`transferFromUrl: invalid url`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`transferFromUrl: disallowed protocol ${parsed.protocol}`);
  }
  const host = parsed.hostname.toLowerCase();
  const blocked = [
    "localhost",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
  ];
  if (blocked.includes(host)) {
    throw new Error(`transferFromUrl: blocked host ${host}`);
  }
  // IPv4 字面量内网段
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    const isLoopback = a === 127;
    const isPrivate10 = a === 10;
    const isPrivate172 = a === 172 && b >= 16 && b <= 31;
    const isPrivate192 = a === 192 && b === 168;
    const isLinkLocal = a === 169 && b === 254;
    const isCarrierGradeNat = a === 100 && b >= 64 && b <= 127;
    if (isLoopback || isPrivate10 || isPrivate172 || isPrivate192 || isLinkLocal || isCarrierGradeNat) {
      throw new Error(`transferFromUrl: blocked internal ip ${host}`);
    }
  }
}

const OSS_REGION = env.OSS_REGION;
const OSS_ACCESS_KEY_ID = env.OSS_ACCESS_KEY_ID;
const OSS_ACCESS_KEY_SECRET = env.OSS_ACCESS_KEY_SECRET;
const OSS_BUCKET = env.OSS_BUCKET;

// Legacy bucket for URL migration (杭州 → 上海)
const OSS_LEGACY_HOSTNAMES = [
  "aibao365-assets.oss-cn-hangzhou.aliyuncs.com",
];

function isConfigured(): boolean {
  return !!(
    OSS_REGION &&
    OSS_ACCESS_KEY_ID &&
    OSS_ACCESS_KEY_SECRET &&
    OSS_BUCKET
  );
}

export function isOssConfigured(): boolean {
  return isConfigured();
}

export function isManagedOssUrl(assetUrl: string): boolean {
  if (!isConfigured()) return false;

  try {
    const urlObj = new URL(assetUrl);
    const currentHostname = `${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com`;
    return urlObj.hostname === currentHostname || OSS_LEGACY_HOSTNAMES.includes(urlObj.hostname);
  } catch {
    return false;
  }
}

function getClient(opts?: { timeout?: number }): OSS {
  return new OSS({
    region: OSS_REGION!,
    accessKeyId: OSS_ACCESS_KEY_ID!,
    accessKeySecret: OSS_ACCESS_KEY_SECRET!,
    bucket: OSS_BUCKET!,
    secure: true,
    timeout: opts?.timeout ?? 60_000,
  });
}

function inferContentTypeFromKey(key: string): string | null {
  const lowerKey = key.toLowerCase();

  if (lowerKey.endsWith(".mp4")) return "video/mp4";
  if (lowerKey.endsWith(".mov")) return "video/quicktime";
  if (lowerKey.endsWith(".webm")) return "video/webm";
  if (lowerKey.endsWith(".jpg") || lowerKey.endsWith(".jpeg"))
    return "image/jpeg";
  if (lowerKey.endsWith(".png")) return "image/png";
  if (lowerKey.endsWith(".webp")) return "image/webp";

  return null;
}

function inferUrlExpiry(sourceUrl: string): Date | null {
  try {
    const url = new URL(sourceUrl);
    const rawExpiry =
      url.searchParams.get("Expires")
      ?? url.searchParams.get("expires")
      ?? url.searchParams.get("x-oss-expires");

    if (!rawExpiry) return null;

    const asNumber = Number(rawExpiry);
    if (Number.isFinite(asNumber)) {
      if (rawExpiry.length >= 13) {
        return new Date(asNumber);
      }
      return new Date(asNumber * 1000);
    }

    const parsed = new Date(rawExpiry);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

function buildDegradedTransferResult(
  sourceUrl: string,
  warning: string,
): TransferFromUrlResult {
  return {
    url: sourceUrl,
    durable: false,
    warning,
    expiresAt: inferUrlExpiry(sourceUrl),
  };
}

export type TransferFromUrlResult = {
  url: string;
  durable: boolean;
  warning: string | null;
  expiresAt: Date | null;
};

/**
 * Generate a presigned upload URL for client-side direct upload.
 */
export async function generateUploadUrl(
  fileName: string,
  contentType: string,
): Promise<{ uploadUrl: string; assetUrl: string; readUrl: string; expiresAt: string } | null> {
  if (!isConfigured()) return null;

  const client = getClient();
  // Use UUID for the key to avoid non-ASCII characters in object keys.
  const ext = fileName.includes(".") ? "." + fileName.split(".").pop() : "";
  const key = `uploads/${Date.now()}-${randomUUID()}${ext}`;
  const url = client.signatureUrl(key, {
    method: "PUT",
    "Content-Type": contentType,
    expires: 3600,
  });

  // Properly encode each path segment so the stored URL round-trips correctly
  // through new URL() → extractOssKey() without double-encoding issues.
  const encodedPath = key
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  const assetUrl = `https://${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com/${encodedPath}`;
  const readUrl = client.signatureUrl(key, { method: "GET", expires: 7200 });
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

  return { uploadUrl: url, assetUrl, readUrl, expiresAt };
}

/**
 * Extract the raw OSS object key from a managed asset URL.
 *
 * Asset URLs may contain percent-encoded characters (e.g. Chinese filenames,
 * spaces). Some URLs were stored with double-encoding (e.g. `%2520` instead of
 * `%20`). This helper fully decodes the pathname so the resulting key matches
 * the actual OSS object key that was used at upload time.
 */
function extractOssKey(assetUrl: string): string {
  const urlObj = new URL(assetUrl);
  let key = urlObj.pathname.slice(1); // remove leading /
  // Iteratively decode until stable to handle double/triple encoding
  try {
    let decoded = decodeURIComponent(key);
    while (decoded !== key) {
      key = decoded;
      decoded = decodeURIComponent(key);
    }
  } catch {
    // If decoding fails (malformed %), use the last successful value
  }
  return key;
}

/**
 * Generate a presigned download URL for a private OSS object.
 * Used to give authorized callers temporary read access.
 */
export function generateSignedUrl(assetUrl: string, expires = 7200): string {
  if (!isConfigured() || !isManagedOssUrl(assetUrl)) return assetUrl;

  const key = extractOssKey(assetUrl);
  const client = getClient();
  return client.signatureUrl(key, { method: "GET", expires });
}

/**
 * Generate a signed thumbnail URL from a private OSS video.
 * Uses Aliyun OSS video snapshot processing.
 */
export function generateVideoThumbnailUrl(
  assetUrl: string,
  expires = 7200,
): string {
  if (!isConfigured() || !isManagedOssUrl(assetUrl)) return assetUrl;

  const key = extractOssKey(assetUrl);
  const client = getClient();
  return client.signatureUrl(key, {
    method: "GET",
    expires,
    process: "video/snapshot,t_1000,f_jpg,m_fast,ar_auto",
  });
}

/**
 * Persist a generated thumbnail image for a managed OSS video.
 * Returns the permanent OSS image URL, or null when generation/upload fails.
 */
export async function persistVideoThumbnail(
  assetUrl: string,
  destKey: string,
): Promise<string | null> {
  if (!isConfigured() || !isManagedOssUrl(assetUrl)) return null;

  try {
    const snapshotUrl = generateVideoThumbnailUrl(assetUrl, 300);
    const response = await fetch(snapshotUrl);
    if (!response.ok) {
      throw new Error(`Failed to snapshot video: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType =
      response.headers.get("content-type") ||
      inferContentTypeFromKey(destKey) ||
      "image/jpeg";

    return await uploadBufferToOss(destKey, buffer, contentType);
  } catch (error) {
    console.error("[oss] Failed to persist video thumbnail:", error);
    return null;
  }
}

/**
 * Stream download from source URL and upload to OSS.
 * Returns the OSS URL, or the original URL if OSS is not configured (degraded mode).
 */
export async function transferFromUrl(
  sourceUrl: string,
  destKey: string,
): Promise<string> {
  const result = await transferFromUrlDetailed(sourceUrl, destKey);
  return result.url;
}

export async function transferFromUrlDetailed(
  sourceUrl: string,
  destKey: string,
): Promise<TransferFromUrlResult> {
  // SSRF 防护:在 fetch 之前校验 sourceUrl 不是内网地址
  assertPublicSourceUrl(sourceUrl);

  if (!isConfigured()) {
    console.warn(
      "[oss] OSS not configured, returning original URL (24h expiry risk)",
    );
    return buildDegradedTransferResult(
      sourceUrl,
      "结果已生成，但系统未配置持久存储，当前链接可能会过期。",
    );
  }

  const MAX_RETRIES = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Use longer timeout for retries (video files can be large)
      const client = getClient({ timeout: 300_000 });
      const response = await fetch(sourceUrl, {
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status}`);
      }
      if (!response.body) {
        throw new Error("Response body is empty");
      }

      const contentType =
        response.headers.get("content-type") ||
        inferContentTypeFromKey(destKey) ||
        "application/octet-stream";

      await client.putStream(
        destKey,
        Readable.fromWeb(response.body as unknown as NodeReadableStream),
        {
          headers: {
            "Content-Type": contentType,
          },
        } as Parameters<typeof client.putStream>[2],
      );

      if (attempt > 1) {
        console.log(`[oss] Transfer succeeded on attempt ${attempt}/${MAX_RETRIES}`);
      }

      return {
        url: `https://${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com/${destKey}`,
        durable: true,
        warning: null,
        expiresAt: null,
      };
    } catch (error) {
      lastError = error;
      console.warn(
        `[oss] Transfer attempt ${attempt}/${MAX_RETRIES} failed:`,
        error instanceof Error ? error.message : error,
      );
      if (attempt < MAX_RETRIES) {
        const delay = 1000 * 2 ** (attempt - 1); // 1s, 2s
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  console.error(
    "[oss] Transfer failed after all retries, falling back to original URL:",
    lastError,
  );
  return buildDegradedTransferResult(
    sourceUrl,
    "结果已生成，但转存到持久存储失败，当前链接可能会过期。",
  );
}

/**
 * Download a file to buffer, then upload to OSS via `put()`.
 * More reliable than `putStream()` for large files (50-100MB 4K videos)
 * that cause "premature close" errors with stream uploads.
 */
export async function transferLargeFileToOss(
  sourceUrl: string,
  destKey: string,
): Promise<TransferFromUrlResult> {
  if (!isConfigured()) {
    return buildDegradedTransferResult(
      sourceUrl,
      "结果已生成，但系统未配置持久存储，当前链接可能会过期。",
    );
  }

  const MAX_RETRIES = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const client = getClient({ timeout: 600_000 });

      console.log(`[oss] Downloading large file (attempt ${attempt}/${MAX_RETRIES}): ${sourceUrl.substring(0, 80)}...`);
      const response = await fetch(sourceUrl, {
        signal: AbortSignal.timeout(300_000),
      });
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      if (!response.body) throw new Error("Response body is empty");

      const buffer = Buffer.from(await response.arrayBuffer());
      console.log(`[oss] Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)}MB, uploading to OSS...`);

      const contentType = inferContentTypeFromKey(destKey) || "application/octet-stream";
      await client.put(destKey, buffer, {
        headers: { "Content-Type": contentType },
      });

      console.log(`[oss] Large file transfer complete: ${destKey}`);
      return {
        url: `https://${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com/${destKey}`,
        durable: true,
        warning: null,
        expiresAt: null,
      };
    } catch (error) {
      lastError = error;
      console.warn(
        `[oss] Large file transfer attempt ${attempt}/${MAX_RETRIES} failed:`,
        error instanceof Error ? error.message : error,
      );
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }

  console.error("[oss] Large file transfer failed after all retries:", lastError);
  return buildDegradedTransferResult(
    sourceUrl,
    "结果已生成，但转存到持久存储失败，当前链接可能会过期。",
  );
}

function isAlreadySigned(url: string): boolean {
  try {
    return new URL(url).searchParams.has("Signature");
  } catch {
    return false;
  }
}

/**
 * Recursively walk a JSON-serializable value and sign every string that
 * matches the managed OSS bucket.  Non-OSS strings and already-signed
 * URLs are left untouched.
 * Safe for any shape — primitives, arrays, nested objects, nulls.
 */
export function signOssUrls<T>(obj: T): T {
  if (!isConfigured()) return obj;
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    if (isManagedOssUrl(obj) && !isAlreadySigned(obj)) {
      return generateSignedUrl(obj) as T;
    }
    return obj as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => signOssUrls(item)) as T;
  }

  if (typeof obj === "object") {
    // Date, Buffer, etc. — skip
    if (obj.constructor !== Object) return obj;

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      out[key] = signOssUrls(value);
    }
    return out as T;
  }

  return obj;
}

export async function uploadBufferToOss(
  destKey: string,
  buffer: Buffer,
  contentType = "application/octet-stream",
): Promise<string> {
  if (!isConfigured()) {
    throw new Error("OSS not configured");
  }

  const client = getClient();
  await client.put(destKey, buffer, {
    headers: {
      "Content-Type": contentType,
    },
  });

  return `https://${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com/${destKey}`;
}
