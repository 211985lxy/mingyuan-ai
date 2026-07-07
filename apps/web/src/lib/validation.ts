// ─── Rule Constants ─────────────────────────────────────

interface DurationRange { min: number; max: number }
interface VideoRules {
  duration: DurationRange
  maxSize: number
  maxResolution: number
  fps: DurationRange
  formats: string[]
  codecs: string[]
}
interface ImageRules {
  resolution: DurationRange
  maxSize: number
  formats: string[]
  aspectRatio: DurationRange
}

export const TRAINING_VIDEO_RULES: Record<string, VideoRules | ImageRules> = {
  professional: {
    duration: { min: 30, max: 120 },
    maxSize: 1024 * 1024 * 1024,
    maxResolution: 2000,
    fps: { min: 10, max: 60 },
    formats: ["mp4", "mov"],
    codecs: ["h264", "hevc"],
  },
  fast: {
    duration: { min: 5, max: 60 },
    maxSize: 500 * 1024 * 1024,
    maxResolution: 2000,
    fps: { min: 10, max: 60 },
    formats: ["mp4", "mov"],
    codecs: ["h264", "hevc"],
  },
  image: {
    resolution: { min: 300, max: 2000 },
    maxSize: 5 * 1024 * 1024,
    formats: ["jpg", "jpeg", "png", "webp"],
    aspectRatio: { min: 0.4, max: 2.5 },
  },
}

export const MATERIAL_RULES = {
  video: {
    formats: ["mp4", "mov"],
    codecs: ["h264", "hevc"],
    maxDuration: 60,
    maxSize: 500 * 1024 * 1024,
    maxResolution: 2000,
  },
  image: {
    formats: ["jpg", "jpeg", "png", "webp"],
    maxSize: 10 * 1024 * 1024,
    maxResolution: 2000,
  },
  audio: {
    formats: ["mp3", "wav", "m4a"],
    maxDuration: 300,
    maxSize: 120 * 1024 * 1024,
  },
}

export const VOICE_CLONE_RULES: Record<string, { duration: DurationRange; maxSize: number; formats: string[] }> = {
  v1: { duration: { min: 5, max: 120 }, maxSize: 10 * 1024 * 1024, formats: ["mp3", "wav", "m4a"] },
  v2: { duration: { min: 5, max: 120 }, maxSize: 10 * 1024 * 1024, formats: ["mp3", "wav", "m4a"] },
  v3: { duration: { min: 5, max: 120 }, maxSize: 10 * 1024 * 1024, formats: ["mp3", "wav", "m4a"] },
  s1: { duration: { min: 10, max: 120 }, maxSize: 10 * 1024 * 1024, formats: ["mp3", "wav", "m4a"] },
  s3: { duration: { min: 10, max: 120 }, maxSize: 10 * 1024 * 1024, formats: ["mp3", "wav", "m4a"] },
}

// ─── Validation Functions ───────────────────────────────

interface FileMetadata {
  size?: number
  duration?: number
  format?: string
  codec?: string
  width?: number
  height?: number
  fps?: number
}

interface ValidationResult {
  valid: boolean
  errors: string[]
}

export function validateTrainingVideo(
  cloneType: string,
  meta: FileMetadata
): ValidationResult {
  const rules = TRAINING_VIDEO_RULES[cloneType]
  if (!rules) return { valid: false, errors: [`Unknown clone type: ${cloneType}`] }

  const errors: string[] = []

  if (cloneType === "image") {
    const r = rules as ImageRules
    if (meta.format && !r.formats.includes(meta.format.toLowerCase())) {
      errors.push(`Format must be one of: ${r.formats.join(", ")}`)
    }
    if (meta.size && meta.size > r.maxSize) {
      errors.push(`File size must be under ${r.maxSize / 1024 / 1024}MB`)
    }
    if (meta.width && (meta.width < r.resolution.min || meta.width > r.resolution.max)) {
      errors.push(`Width must be ${r.resolution.min}-${r.resolution.max}px`)
    }
    if (meta.height && (meta.height < r.resolution.min || meta.height > r.resolution.max)) {
      errors.push(`Height must be ${r.resolution.min}-${r.resolution.max}px`)
    }
    if (meta.width && meta.height) {
      const ratio = meta.width / meta.height
      if (ratio < r.aspectRatio.min || ratio > r.aspectRatio.max) {
        errors.push(`Aspect ratio must be ${r.aspectRatio.min}-${r.aspectRatio.max}`)
      }
    }
  } else {
    const r = rules as VideoRules
    if (meta.format && !r.formats.includes(meta.format.toLowerCase())) {
      errors.push(`Format must be one of: ${r.formats.join(", ")}`)
    }
    if (meta.codec && !r.codecs.includes(meta.codec.toLowerCase())) {
      errors.push(`Codec must be one of: ${r.codecs.join(", ")}`)
    }
    if (meta.size && meta.size > r.maxSize) {
      errors.push(`File size must be under ${r.maxSize / 1024 / 1024}MB`)
    }
    if (meta.duration !== undefined) {
      if (meta.duration < r.duration.min) errors.push(`Duration must be at least ${r.duration.min} seconds`)
      if (meta.duration > r.duration.max) errors.push(`Duration must be at most ${r.duration.max} seconds`)
    }
    if (meta.fps !== undefined) {
      if (meta.fps < r.fps.min || meta.fps > r.fps.max) {
        errors.push(`FPS must be ${r.fps.min}-${r.fps.max}`)
      }
    }
    if (meta.width && meta.width > r.maxResolution) {
      errors.push(`Resolution must be under ${r.maxResolution}px`)
    }
    if (meta.height && meta.height > r.maxResolution) {
      errors.push(`Resolution must be under ${r.maxResolution}px`)
    }
  }

  return { valid: errors.length === 0, errors }
}

export function validateMaterial(
  type: string,
  meta: FileMetadata
): ValidationResult {
  const rules = MATERIAL_RULES[type as keyof typeof MATERIAL_RULES]
  if (!rules) return { valid: false, errors: [`Unknown material type: ${type}`] }

  const errors: string[] = []

  if (meta.format && !rules.formats.includes(meta.format.toLowerCase())) {
    errors.push(`Format must be one of: ${rules.formats.join(", ")}`)
  }
  if (meta.size && meta.size > rules.maxSize) {
    errors.push(`File size must be under ${rules.maxSize / 1024 / 1024}MB`)
  }
  if ("maxDuration" in rules && meta.duration !== undefined && meta.duration > rules.maxDuration) {
    errors.push(`Duration must be under ${rules.maxDuration} seconds`)
  }
  if ("maxResolution" in rules && meta.width && meta.width > rules.maxResolution) {
    errors.push(`Resolution must be under ${rules.maxResolution}px`)
  }

  return { valid: errors.length === 0, errors }
}

export function validateVoiceAudio(
  model: string,
  meta: FileMetadata
): ValidationResult {
  const rules = VOICE_CLONE_RULES[model]
  if (!rules) return { valid: false, errors: [`Unknown voice model: ${model}`] }

  const errors: string[] = []

  if (meta.format && !rules.formats.includes(meta.format.toLowerCase())) {
    errors.push(`Format must be one of: ${rules.formats.join(", ")}`)
  }
  if (meta.size && meta.size > rules.maxSize) {
    errors.push(`File size must be under ${rules.maxSize / 1024 / 1024}MB`)
  }
  if (meta.duration !== undefined) {
    if (meta.duration < rules.duration.min) {
      errors.push(`Audio must be at least ${rules.duration.min} seconds for ${model} model`)
    }
    if (meta.duration > rules.duration.max) {
      errors.push(`Audio must be at most ${rules.duration.max} seconds`)
    }
  }

  return { valid: errors.length === 0, errors }
}
