import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSignedUrl } from "@/lib/oss";
import { withUserAuth } from "@/lib/user-auth";
import { getPhoto, getVideo, PexelsError } from "@/lib/pexels";
import {
  getImage as getPixabayImage,
  getVideo as getPixabayVideo,
  PixabayError,
} from "@/lib/pixabay";

export const runtime = "nodejs";

// ─── GET /api/pexels/media/[pexelsId] ───────────────────
// Supports both Pexels and Pixabay lookups via ?provider= param.

export const GET = withUserAuth(async (request, { params }) => {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider") ?? "pexels";
  const externalId = parseInt(params?.pexelsId ?? "", 10);

  if (Number.isNaN(externalId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  if (provider === "pixabay") {
    return handlePixabayLookup(externalId);
  }

  return handlePexelsLookup(externalId);
});

// ─── Pexels lookup (with DB cache) ──────────────────────

async function handlePexelsLookup(pexelsId: number) {
  // Check DB first
  const existing = await prisma.pexelsMedia.findUnique({
    where: { provider_pexelsId: { provider: "pexels", pexelsId } },
  });

  if (existing) {
    const signed = {
      ...existing,
      ossUrl: existing.ossUrl ? generateSignedUrl(existing.ossUrl) : null,
    };
    return NextResponse.json({ data: signed });
  }

  // Fallback: try Pexels API (photo first, then video)
  try {
    const photo = await getPhoto(pexelsId);
    const created = await prisma.pexelsMedia.create({
      data: {
        provider: "pexels",
        pexelsId: photo.id,
        mediaType: "photo",
        width: photo.width,
        height: photo.height,
        url: photo.url,
        photographer: photo.photographer,
        photographerUrl: photo.photographer_url,
        photographerId: photo.photographer_id,
        avgColor: photo.avg_color,
        alt: photo.alt,
        srcJson: JSON.parse(JSON.stringify(photo.src)),
      },
    });
    return NextResponse.json({ data: created });
  } catch {
    // Not a photo, try video
  }

  try {
    const video = await getVideo(pexelsId);
    const created = await prisma.pexelsMedia.create({
      data: {
        provider: "pexels",
        pexelsId: video.id,
        mediaType: "video",
        width: video.width,
        height: video.height,
        url: video.url,
        photographer: video.user.name,
        photographerUrl: video.user.url,
        photographerId: video.user.id,
        duration: video.duration,
        videoFilesJson: JSON.parse(JSON.stringify(video.video_files)),
        videoPicturesJson: JSON.parse(JSON.stringify(video.video_pictures)),
        imageUrl: video.image,
      },
    });
    return NextResponse.json({ data: created });
  } catch (error) {
    if (error instanceof PexelsError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "RATE_LIMITED" ? 429 : 404 },
      );
    }
    throw error;
  }
}

// ─── Pixabay lookup (DB cache first, then API) ──────────

async function handlePixabayLookup(pixabayId: number) {
  // Check DB first — may already have ossUrl from transfer
  const existing = await prisma.pexelsMedia.findUnique({
    where: { provider_pexelsId: { provider: "pixabay", pexelsId: pixabayId } },
  });

  if (existing) {
    const signed = {
      ...existing,
      ossUrl: existing.ossUrl ? generateSignedUrl(existing.ossUrl) : null,
    };
    return NextResponse.json({ data: signed });
  }

  // Fallback: try Pixabay API (image first)
  try {
    const img = await getPixabayImage(pixabayId);
    if (img) {
      return NextResponse.json({
        data: {
          id: `pixabay-img-${img.id}`,
          provider: "pixabay",
          mediaType: img.type === "film" || img.type === "animation" ? "video" : "photo",
          width: img.webformatWidth,
          height: img.webformatHeight,
          url: img.pageURL,
          photographer: img.user,
          alt: img.tags,
          srcJson: {
            original: img.largeImageURL,
            large2x: img.largeImageURL,
            large: img.webformatURL.replace("_640", "_960"),
            medium: img.webformatURL.replace("_640", "_340"),
            small: img.previewURL,
            portrait: img.webformatURL,
            landscape: img.webformatURL,
            tiny: img.previewURL,
          },
          ossUrl: null,
          ossStatus: "none",
        },
      });
    }
  } catch {
    // Not an image, try video
  }

  try {
    const vid = await getPixabayVideo(pixabayId);
    if (vid) {
      const thumbnail =
        vid.videos.medium?.thumbnail ||
        vid.videos.small?.thumbnail ||
        "";

      return NextResponse.json({
        data: {
          id: `pixabay-vid-${vid.id}`,
          provider: "pixabay",
          mediaType: "video",
          width: vid.videos.medium?.width ?? 0,
          height: vid.videos.medium?.height ?? 0,
          url: vid.pageURL,
          photographer: vid.user,
          alt: vid.tags,
          duration: vid.duration,
          imageUrl: thumbnail,
          videoFilesJson: Object.entries(vid.videos)
            .filter(([, size]) => size && size.url)
            .map(([key, size]) => ({
              id: vid.id,
              quality: key === "large" || key === "medium" ? "hd" : "sd",
              file_type: "video/mp4",
              width: size.width,
              height: size.height,
              fps: 0,
              link: size.url,
            })),
          ossUrl: null,
          ossStatus: "none",
        },
      });
    }
  } catch (error) {
    if (error instanceof PixabayError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "RATE_LIMITED" ? 429 : 404 },
      );
    }
    throw error;
  }

  return NextResponse.json({ error: "Media not found" }, { status: 404 });
}
