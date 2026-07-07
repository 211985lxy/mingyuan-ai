import { prisma } from "@/lib/prisma";
import {
  getBlockingAiMaterials,
  normalizeMaterialAssignment,
} from "@/lib/packaging-materials";
import type {
  BackgroundMusicSelection,
  MaterialAssignment,
} from "@/types/api";

export class PackagingInputError extends Error {
  readonly status: number;
  readonly field?: string;
  readonly code: string;

  constructor(
    message: string,
    input: {
      status?: number;
      field?: string;
      code?: string;
    } = {},
  ) {
    super(message);
    this.name = "PackagingInputError";
    this.status = input.status ?? 422;
    this.field = input.field;
    this.code = input.code ?? "PACKAGING_INPUT_INVALID";
  }
}

function isManagedManualSource(source?: string | null): boolean {
  return source === "manual_upload" || source === "manual_library";
}

export async function normalizePackagingInputs(input: {
  userId: string;
  materials?: MaterialAssignment[] | null;
  backgroundMusic?: BackgroundMusicSelection | null;
}): Promise<{
  materials: MaterialAssignment[] | null;
  backgroundMusic: BackgroundMusicSelection | null;
}> {
  const materials = Array.isArray(input.materials)
    ? input.materials.map(normalizeMaterialAssignment)
    : null;
  const backgroundMusic = input.backgroundMusic
    ? {
        ...input.backgroundMusic,
        audioUrl: input.backgroundMusic.audioUrl.trim(),
        assetId: input.backgroundMusic.assetId ?? null,
      }
    : null;

  if (materials) {
    const blockingAi = getBlockingAiMaterials(materials);
    if (blockingAi.length > 0) {
      throw new PackagingInputError(
        "AI 素材仍在转存中或转存失败，请稍后重试或删除后再提交",
        {
          code: "PACKAGING_AI_NOT_READY",
          field: "materials",
        },
      );
    }
  }

  const assetIds = new Set<string>();
  materials?.forEach((material) => {
    if (isManagedManualSource(material.source)) {
      if (!material.assetId) {
        // Skip incomplete manual materials — user chose not to assign an asset
        return;
      }
      assetIds.add(material.assetId);
    }
  });

  if (backgroundMusic?.assetId) {
    assetIds.add(backgroundMusic.assetId);
  }

  const assets = assetIds.size > 0
    ? await prisma.asset.findMany({
        where: {
          userId: input.userId,
          id: { in: [...assetIds] },
        },
        select: {
          id: true,
          assetType: true,
          url: true,
        },
      })
    : [];
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));

  const normalizedMaterials = materials?.map((material, index) => {
    if (!isManagedManualSource(material.source) || !material.assetId) {
      return material;
    }

    const asset = assetMap.get(material.assetId);
    if (!asset) {
      throw new PackagingInputError("素材资产不存在或不属于当前用户", {
        field: `materials[${index}].assetId`,
        code: "PACKAGING_ASSET_NOT_FOUND",
        status: 404,
      });
    }

    const expectedType = material.type === "image" ? "image" : "video";
    if (asset.assetType !== expectedType) {
      throw new PackagingInputError("所选素材资产类型与包装角色不匹配", {
        field: `materials[${index}].assetId`,
        code: "PACKAGING_ASSET_TYPE_MISMATCH",
      });
    }

    return {
      ...material,
      fileUrl: asset.url,
      previewUrl: material.previewUrl ?? asset.url,
      thumbnailUrl: material.thumbnailUrl ?? asset.url,
    };
  }) ?? null;

  let normalizedBackgroundMusic = backgroundMusic;
  if (backgroundMusic?.assetId) {
    const asset = assetMap.get(backgroundMusic.assetId);
    if (!asset) {
      throw new PackagingInputError("背景音乐资产不存在或不属于当前用户", {
        field: "backgroundMusic.assetId",
        code: "PACKAGING_BGM_ASSET_NOT_FOUND",
        status: 404,
      });
    }
    if (asset.assetType !== "music") {
      throw new PackagingInputError("所选背景音乐资产类型无效", {
        field: "backgroundMusic.assetId",
        code: "PACKAGING_BGM_ASSET_TYPE_MISMATCH",
      });
    }

    normalizedBackgroundMusic = {
      ...backgroundMusic,
      audioUrl: asset.url,
    };
  }

  return {
    materials: normalizedMaterials,
    backgroundMusic: normalizedBackgroundMusic,
  };
}
