import { generateSignedUrl, isManagedOssUrl } from "@/lib/oss";
import type { MaterialAssignment } from "@/types/api";

export class AssetReadabilityError extends Error {
  readonly code = "ASSET_READABILITY_FAILED";
  readonly field: string;
  readonly assetUrl: string | null;

  constructor(message: string, input: { field: string; assetUrl?: string | null }) {
    super(message);
    this.name = "AssetReadabilityError";
    this.field = input.field;
    this.assetUrl = input.assetUrl ?? null;
  }
}

function parseHttpUrl(value: string, field: string): URL {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
    return parsed;
  } catch {
    throw new AssetReadabilityError("素材地址不是有效的 HTTP/HTTPS URL", {
      field,
      assetUrl: value,
    });
  }
}

export function resolveUpstreamReadableUrl(
  value: string,
  field = "assetUrl",
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AssetReadabilityError("素材地址不能为空", {
      field,
      assetUrl: value,
    });
  }

  parseHttpUrl(trimmed, field);

  if (isManagedOssUrl(trimmed)) {
    return generateSignedUrl(trimmed);
  }

  return trimmed;
}

export function resolveOptionalUpstreamReadableUrl(
  value: string | null | undefined,
  field: string,
): string | undefined {
  if (!value) return undefined;
  return resolveUpstreamReadableUrl(value, field);
}

export function resolveMaterialAssignmentsForUpstream(
  materials: MaterialAssignment[] | null | undefined,
): MaterialAssignment[] | undefined {
  if (!materials || materials.length === 0) return undefined;

  return materials.map((material, index) => ({
    ...material,
    fileUrl: resolveUpstreamReadableUrl(
      material.fileUrl,
      `materials[${index}].fileUrl`,
    ),
  }));
}

export function resolveBackgroundMusicForUpstream(
  backgroundMusic:
    | {
        audioUrl: string;
        volume: number;
      }
    | null
    | undefined,
):
  | {
      audioUrl: string;
      volume: number;
    }
  | undefined {
  if (!backgroundMusic) return undefined;

  return {
    ...backgroundMusic,
    audioUrl: resolveUpstreamReadableUrl(
      backgroundMusic.audioUrl,
      "backgroundMusic.audioUrl",
    ),
  };
}
