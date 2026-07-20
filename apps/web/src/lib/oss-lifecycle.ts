import { env } from "@/env"
import OSS from "ali-oss";

/**
 * Apply lifecycle rules to the configured OSS bucket.
 *
 * Usage: npx tsx src/lib/oss-lifecycle.ts
 *
 * Transitions videos/ prefix objects to Infrequent Access (IA) tier:
 * - 1080p videos (1MB-100MB): Standard -> IA after 7 days
 * - 4K videos (>100MB): Standard -> IA after 30 days
 *
 * IA storage is ~50% cheaper than Standard for Aliyun OSS.
 * Objects remain fully accessible (IA has retrieval fee but no access delay).
 */

type LifecycleRule = {
  id: string;
  prefix: string;
  status: "Enabled" | "Disabled";
  transitions: Array<{
    days: number;
    storageClass: "IA" | "Archive" | "ColdArchive";
  }>;
  filter?: {
    objectSizeGreaterThan?: number;
    objectSizeLessThan?: number;
  };
};

type OssLifecycleClient = {
  putBucketLifecycle(bucket: string, rules: LifecycleRule[]): Promise<void>;
  getBucketLifecycle(bucket: string): Promise<{ rules?: LifecycleRule[] }>;
};

const LIFECYCLE_RULES: LifecycleRule[] = [
  {
    id: "transition-1080p-to-ia",
    prefix: "videos/",
    status: "Enabled",
    transitions: [
      {
        days: 7,
        storageClass: "IA",
      },
    ],
    filter: {
      objectSizeGreaterThan: 1048576, // 1 MB
      objectSizeLessThan: 104857600, // 100 MB
    },
  },
  {
    id: "transition-4k-to-ia",
    prefix: "videos/",
    status: "Enabled",
    transitions: [
      {
        days: 30,
        storageClass: "IA",
      },
    ],
    filter: {
      objectSizeGreaterThan: 104857600, // 100 MB
    },
  },
];

function createOssClient(): OSS {
  const region = env.OSS_REGION;
  const bucket = env.OSS_BUCKET;
  const accessKeyId = env.OSS_ACCESS_KEY_ID;
  const accessKeySecret = env.OSS_ACCESS_KEY_SECRET;

  if (!region || !bucket || !accessKeyId || !accessKeySecret) {
    throw new Error(
      "Missing OSS config. Required env vars: OSS_REGION, OSS_BUCKET, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET"
    );
  }

  return new OSS({ region, bucket, accessKeyId, accessKeySecret });
}

/**
 * @description 应用lifecyclepolicy
 * @returns Promise<void>
 */
export async function applyLifecyclePolicy(): Promise<void> {
  const client = createOssClient();
  const lifecycleClient = client as unknown as OssLifecycleClient;
  const bucket = env.OSS_BUCKET!;

  console.log(`[oss-lifecycle] Applying lifecycle rules to bucket: ${bucket}`);
  console.log(
    `[oss-lifecycle] Rules: ${LIFECYCLE_RULES.map((r) => r.id).join(", ")}`
  );

  // Type assertion: ali-oss SDK supports lifecycle API but types may be incomplete
  await lifecycleClient.putBucketLifecycle(bucket, LIFECYCLE_RULES);

  console.log("[oss-lifecycle] Lifecycle rules applied successfully.");
  console.log("[oss-lifecycle] Verifying...");

  const result = await lifecycleClient.getBucketLifecycle(bucket);
  const rules = result.rules || [];
  console.log(`[oss-lifecycle] Active rules: ${rules.length}`);
  for (const rule of rules) {
    console.log(
      `  - ${rule.id}: prefix=${rule.prefix}, status=${rule.status}`
    );
  }
}

/**
 * @description 获取lifecyclepolicy
 * @returns Promise<LifecycleRule[]>
 */
export async function getLifecyclePolicy(): Promise<LifecycleRule[]> {
  const client = createOssClient();
  const lifecycleClient = client as unknown as OssLifecycleClient;
  const bucket = env.OSS_BUCKET!;
  const result = await lifecycleClient.getBucketLifecycle(bucket);
  return result.rules || [];
}

// CLI entry point
if (require.main === module || process.argv[1]?.endsWith("oss-lifecycle.ts")) {
  applyLifecyclePolicy()
    .then(() => {
      console.log("[oss-lifecycle] Done.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[oss-lifecycle] Failed:", err.message);
      process.exit(1);
    });
}
