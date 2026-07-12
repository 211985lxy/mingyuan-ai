import type { Prisma } from "@/generated/prisma/client"
import { searchPhotos, searchVideos } from "@/lib/pexels"
import { searchImages as searchPixabayImages, searchVideos as searchPixabayVideos } from "@/lib/pixabay"
import type { PexelsMediaType, PexelsPhoto, PexelsVideo } from "@/types/pexels"
import type { PixabayImage, PixabayVideo } from "@/types/pixabay"

export interface NormalizedMediaItem {
  pexelsId: number
  mediaType: "photo" | "video"
  width: number
  height: number
  url: string
  photographer: string
  photographerUrl: string | null
  photographerId: number | null
  avgColor: string | null
  alt: string | null
  duration: number | null
  srcJson: Prisma.InputJsonValue | null
  videoFilesJson: Prisma.InputJsonValue | null
  videoPicturesJson: Prisma.InputJsonValue | null
  imageUrl: string | null
}

export async function fetchFromPexelsApi(params: {
  query: string
  mediaType: PexelsMediaType
  orientation?: string
  size?: string
  color?: string
  locale?: string
  page: number
  perPage: number
}): Promise<{ items: NormalizedMediaItem[]; totalResults: number }> {
  const { query, mediaType, orientation, size, color, locale, page, perPage } = params
  const items: NormalizedMediaItem[] = []
  let totalResults = 0
  if (mediaType === "photo" || mediaType === "all") {
    const response = await searchPhotos(query, { orientation, size, color, locale, page, perPage: mediaType === "all" ? Math.ceil(perPage / 2) : perPage })
    totalResults += response.total_results
    items.push(...response.photos.map(normalizePexelsPhoto))
  }
  if (mediaType === "video" || mediaType === "all") {
    const response = await searchVideos(query, { orientation, size, locale, page, perPage: mediaType === "all" ? Math.floor(perPage / 2) : perPage })
    totalResults += response.total_results
    items.push(...response.videos.map(normalizePexelsVideo))
  }
  return { items, totalResults }
}

function normalizePexelsPhoto(photo: PexelsPhoto): NormalizedMediaItem {
  return {
    pexelsId: photo.id, mediaType: "photo", width: photo.width, height: photo.height,
    url: photo.url, photographer: photo.photographer, photographerUrl: photo.photographer_url,
    photographerId: photo.photographer_id, avgColor: photo.avg_color, alt: photo.alt,
    duration: null, srcJson: JSON.parse(JSON.stringify(photo.src)), videoFilesJson: null,
    videoPicturesJson: null, imageUrl: null,
  }
}

function normalizePexelsVideo(video: PexelsVideo): NormalizedMediaItem {
  return {
    pexelsId: video.id, mediaType: "video", width: video.width, height: video.height,
    url: video.url, photographer: video.user.name, photographerUrl: video.user.url,
    photographerId: video.user.id, avgColor: null, alt: null, duration: video.duration,
    srcJson: null, videoFilesJson: JSON.parse(JSON.stringify(video.video_files)),
    videoPicturesJson: JSON.parse(JSON.stringify(video.video_pictures)), imageUrl: video.image,
  }
}

export async function fetchFromPixabayApi(params: {
  query: string
  mediaType: PexelsMediaType
  orientation?: string
  category?: string
  page: number
  perPage: number
}): Promise<{ items: NormalizedMediaItem[]; totalResults: number }> {
  const { query, mediaType, orientation, category, page, perPage } = params
  const items: NormalizedMediaItem[] = []
  let totalResults = 0
  const pixabayOrientation = orientation === "landscape" ? "horizontal" : orientation === "portrait" ? "vertical" : undefined
  if (mediaType === "photo" || mediaType === "all") {
    const response = await searchPixabayImages(query, { imageType: "photo", orientation: pixabayOrientation, category: category as never, safesearch: true, page, perPage: mediaType === "all" ? Math.ceil(perPage / 2) : perPage })
    totalResults += response.totalHits
    items.push(...response.hits.map(normalizePixabayImage))
  }
  if (mediaType === "video" || mediaType === "all") {
    const response = await searchPixabayVideos(query, { category: category as never, safesearch: true, page, perPage: mediaType === "all" ? Math.floor(perPage / 2) : perPage })
    totalResults += response.totalHits
    items.push(...response.hits.map(normalizePixabayVideo))
  }
  return { items, totalResults }
}

function normalizePixabayImage(image: PixabayImage): NormalizedMediaItem {
  return {
    pexelsId: image.id, mediaType: "photo", width: image.webformatWidth, height: image.webformatHeight,
    url: image.pageURL, photographer: image.user, photographerUrl: null, photographerId: image.user_id,
    avgColor: null, alt: image.tags, duration: null,
    srcJson: JSON.parse(JSON.stringify({ original: image.largeImageURL, large2x: image.largeImageURL, large: image.webformatURL.replace("_640", "_960"), medium: image.webformatURL.replace("_640", "_340"), small: image.previewURL, portrait: image.webformatURL, landscape: image.webformatURL, tiny: image.previewURL })),
    videoFilesJson: null, videoPicturesJson: null, imageUrl: null,
  }
}

function normalizePixabayVideo(video: PixabayVideo): NormalizedMediaItem {
  const videoFiles = (["large", "medium", "small", "tiny"] as const).filter((key) => video.videos[key] && video.videos[key].url).map((key) => {
    const size = video.videos[key]
    return { id: video.id, quality: key === "large" || key === "medium" ? "hd" : "sd", file_type: "video/mp4", width: size.width, height: size.height, fps: 0, link: size.url }
  })
  const thumbnail = video.videos.medium?.thumbnail || video.videos.small?.thumbnail || video.videos.tiny?.thumbnail || ""
  return {
    pexelsId: video.id, mediaType: "video", width: video.videos.medium?.width ?? video.videos.small?.width ?? 0,
    height: video.videos.medium?.height ?? video.videos.small?.height ?? 0, url: video.pageURL,
    photographer: video.user, photographerUrl: null, photographerId: video.user_id, avgColor: null,
    alt: video.tags, duration: video.duration, srcJson: null,
    videoFilesJson: JSON.parse(JSON.stringify(videoFiles)), videoPicturesJson: null, imageUrl: thumbnail,
  }
}
