import { env } from "@/env"
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import OSS from "ali-oss";
import { assertPublicSourceUrl, inferContentTypeFromKey, inferUrlExpiry } from "./url-utils";

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

/**
 * @description 检查 OSS 对象存储服务是否已正确配置（区域、密钥、桶均存在）
 * @returns 配置完整返回 true，否则返回 false
 */
export function isOssConfigured(): boolean {
  return isConfigured();
}

/**
 * @description 判断给定 URL 是否属于当前托管的 OSS 存储桶（含历史迁移桶）
 * @param assetUrl - 待检测的资源 URL
 * @returns 属于托管 OSS 返回 true，否则返回 false
 */
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

export {
  createAssetUploadReservation,
  completeAssetUploadReservation,
  headManagedObject,
  cleanupExpiredUploadReservations,
  assertCompletedReservationForManagedUrl,
  UploadReservationError,
  UPLOAD_SIZE_LIMITS,
  POLICY_TTL_MS,
} from "./upload-reservation"

/**
 * @deprecated 无界 PUT 预签名已下线。请改用 createAssetUploadReservation（POST Policy）。
 * 保留导出仅为避免旧测试瞬间全红；调用将直接失败。
 */
export async function generateUploadUrl(
  _fileName: string,
  _contentType: string,
): Promise<null> {
  return null
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
/**
 * @description 生成signedurl
 * @param assetUrl - assetURL 地址
 * @param expires - expires
 * @returns string
 */
export function generateSignedUrl(assetUrl: string, expires = 7200): string {
  if (!isConfigured() || !isManagedOssUrl(assetUrl)) return assetUrl;

  const key = extractOssKey(assetUrl);
  const client = getClient();
  return client.signatureUrl(key, { method: "GET", expires });
}

/**
 * @description 删除指定 URL 对应的 OSS 对象（仅限当前存储桶内的对象）
 * @param assetUrl - 待删除的 OSS 资源 URL
 * @returns 删除成功返回 true，未配置或非当前桶返回 false
 */
export async function deleteManagedOssObject(assetUrl: string): Promise<boolean> {
  if (!isConfigured()) return false;

  const urlObj = new URL(assetUrl);
  const currentHostname = `${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com`;
  if (urlObj.hostname !== currentHostname) return false;

  await getClient().delete(extractOssKey(assetUrl));
  return true;
}

/**
 * Generate a signed thumbnail URL from a private OSS video.
 * Uses Aliyun OSS video snapshot processing.
 */
/**
 * @description 生成videothumbnailurl
 * @param assetUrl - assetURL 地址
 * @param expires - expires
 * @returns string
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
/**
 * @description persistvideothumbnail
 * @param assetUrl - assetURL 地址
 * @param destKey - dest键
 * @returns Promise<string | null>
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
/**
 * @description transferfromurl
 * @param sourceUrl - 来源URL 地址
 * @param destKey - dest键
 * @returns Promise<string>
 */
export async function transferFromUrl(
  sourceUrl: string,
  destKey: string,
): Promise<string> {
  const result = await transferFromUrlDetailed(sourceUrl, destKey);
  return result.url;
}

/**
 * @description 从源 URL 流式下载并上传到 OSS，返回详细转存结果（含持久化状态、警告、过期时间）
 * @param sourceUrl - 源文件下载地址
 * @param destKey - OSS 目标对象键
 * @returns 转存结果对象，包含最终 URL、是否持久化、警告信息及过期时间
 */
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
/**
 * @description transferlargefiletooss
 * @param sourceUrl - 来源URL 地址
 * @param destKey - dest键
 * @returns Promise<TransferFromUrlResult>
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
/**
 * @description signossurls
 * @param obj - obj
 * @returns T
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

/**
 * @description 将 Buffer 数据直接上传到 OSS 指定路径
 * @param destKey - OSS 目标对象键
 * @param buffer - 待上传的文件二进制数据
 * @param contentType - 文件 MIME 类型，默认 application/octet-stream
 * @returns 上传成功后的 OSS 资源访问 URL
 */
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
