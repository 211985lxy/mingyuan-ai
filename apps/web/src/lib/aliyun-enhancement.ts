import Videoenhan, {
  EnhanceVideoQualityRequest,
  GetAsyncJobResultRequest,
} from "@alicloud/videoenhan20200320";
import { $OpenApiUtil } from "@alicloud/openapi-core";
import { generateSignedUrl } from "@/lib/oss";

let _client: Videoenhan | null = null;

export function createViapiClient(): Videoenhan {
  if (_client) return _client;

  const accessKeyId = process.env.ALIYUN_VIAPI_ACCESS_KEY_ID || process.env.OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_VIAPI_ACCESS_KEY_SECRET || process.env.OSS_ACCESS_KEY_SECRET;
  const endpoint = process.env.ALIYUN_VIAPI_ENDPOINT || "videoenhan.cn-shanghai.aliyuncs.com";

  if (!accessKeyId || !accessKeySecret) {
    throw new Error(
      "[aliyun-enhancement] ALIYUN_VIAPI_ACCESS_KEY_ID (or OSS_ACCESS_KEY_ID) and ALIYUN_VIAPI_ACCESS_KEY_SECRET (or OSS_ACCESS_KEY_SECRET) must be set"
    );
  }

  const config = new $OpenApiUtil.Config({
    accessKeyId,
    accessKeySecret,
    endpoint,
  });

  _client = new Videoenhan(config);

  return _client;
}

export type EnhancementJobResult = {
  status: "PROCESS_SUCCESS" | "PROCESS_FAIL" | "PROCESSING" | string;
  videoUrl?: string;
  errorMessage?: string;
  errorCode?: string;
};

export async function submitEnhancementJob(input: {
  taskId: string;
  sourceVideoUrl: string;
}): Promise<{ jobId: string; requestId: string }> {
  const client = createViapiClient();

  // Aliyun VIAPI needs a publicly-accessible URL.
  // If the source is a private OSS URL, generate a signed URL with 2-hour expiry.
  const videoUrl = generateSignedUrl(input.sourceVideoUrl, 7200);

  const request = new EnhanceVideoQualityRequest({
    videoURL: videoUrl,
    outPutWidth: 3840,
    outPutHeight: 2160,
    bitrate: 20,
    frameRate: 30,
  });

  const response = await client.enhanceVideoQuality(request);

  const requestId = response.body?.requestId ?? "";
  // The API returns a RequestId. For async APIs, the actual JobId may be in
  // response.body.data?.jobId. Try both paths defensively.
  const jobId = response.body?.data?.jobId ?? requestId;

  if (!jobId) {
    throw new Error(
      `[aliyun-enhancement] No jobId returned for task ${input.taskId}. ` +
        `RequestId: ${requestId}, Response: ${JSON.stringify(response.body)}`
    );
  }

  console.log(
    `[aliyun-enhancement] Submitted enhancement for task ${input.taskId}, ` +
      `jobId=${jobId}, requestId=${requestId}`
  );

  return { jobId, requestId };
}

export async function getEnhancementJobResult(
  jobId: string
): Promise<EnhancementJobResult> {
  const client = createViapiClient();

  const request = new GetAsyncJobResultRequest({ jobId });
  const response = await client.getAsyncJobResult(request);

  const data = response.body?.data;
  const status = data?.status ?? "UNKNOWN";

  let videoUrl: string | undefined;
  if (status === "PROCESS_SUCCESS" && data?.result) {
    try {
      const parsed =
        typeof data.result === "string" ? JSON.parse(data.result) : data.result;
      videoUrl = parsed?.videoUrl ?? parsed?.VideoUrl ?? parsed?.videoURL;
    } catch {
      console.warn(
        `[aliyun-enhancement] Failed to parse job result for ${jobId}: ${data.result}`
      );
    }
  }

  return {
    status,
    videoUrl,
    errorMessage: data?.errorMessage ?? undefined,
    errorCode: data?.errorCode ?? undefined,
  };
}
