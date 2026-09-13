// ─── Generic Response ────────────────────────────────────

/** Standard Shanjian API response wrapper. */
export interface ShanjianResponse<T = unknown> {
  code: string
  data: T
  message?: string
  requestId: string
}

/** Response shape for async task creation endpoints. */
export interface ShanjianTaskResponse {
  taskId: string
}

// ─── Asset Types (3.2) ──────────────────────────────────

export interface ShanjianVoice {
  id: string
  name: string
  gender: string
  coverUrl: string
  demoUrl: string
  langs: string[]
}

export interface ShanjianVirtualman {
  id: string
  name: string
  gender: string
  coverUrl: string
}

export interface ShanjianTemplate {
  id: string
  name: string
  coverUrl: string
  scene: "virtualman" | "realMan" | "oralMixCutting" | "newsMixCutting"
  demoUrl: string
}

export interface LayerInfo {
  width: number
  height: number
  transform: {
    anchor: [number, number, number]
    scalar: [number, number, number]
    position: [number, number, number]
  }
}

export interface ShanjianTemplateDetail extends ShanjianTemplate {
  videoStructInfo: {
    editInfo: {
      canvas: { width: number; height: number }
      headerLayer: LayerInfo
      subtitleLayer: LayerInfo
      ipLayer: LayerInfo
    }
  }
}

export interface ShanjianCoverTemplate {
  id: string
  name: string
  coverUrl: string
}

// ─── Clone Request Types (3.3) ──────────────────────────

export interface ProfessionalCloneRequest {
  videoUrl: string
  authVideoUrl: string
  authText: string
  callbackUrl?: string
}

export interface FastCloneRequest {
  videoUrl: string
  authVideoUrl: string
  authText: string
  callbackUrl?: string
}

export interface ImageCloneRequest {
  imageUrl: string
  authVideoUrl: string
  authText: string
  callbackUrl?: string
}

export type VoiceModel = "v1" | "v2" | "v3" | "s1" | "s3"

export interface VoiceCloneRequest {
  audioUrl: string
  model: VoiceModel
  language: string
  demoText?: string
  callbackUrl?: string
}

// ─── Effect Types (3.4) ─────────────────────────────────

export type TextMark =
  | { type: "break"; index: number; time: number }
  | { type: "replace"; indexRange: number[]; text: string }

export interface TTSRequest {
  text: string
  speakerId: string
  language?: string
  speedRatio?: number
  volume?: number
  codec?: "mp3" | "wav"
  marks?: TextMark[]
  returnSubtitle?: boolean
  callbackUrl?: string
}

export interface ASRRequest {
  audioUrl: string
  language: string
  callbackUrl?: string
}

// ─── Video Generation Shared Sub-structures (3.5) ───────

export interface MaterialItem {
  type?: "image" | "video"
  fileUrl: string
  soundSwitch?: boolean
  entryPoint?: number
  duration?: number
}

export interface IntroduceCard {
  name?: string
  description?: string
}

export interface SubtitleItem {
  startMs: number
  endMs: number
  text: string
}

export interface PackRules {
  headerSwitch?: boolean
  materialSwitch?: boolean
  subtitleSwitch?: boolean
  keywordSwitch?: boolean
  backgroundMusic?: {
    audioSwitch?: boolean
    audioUrl?: string
    volume?: number
  }
}

export interface ProcessRules {
  watermarkShow?: boolean
  resourcePreprocessMethod?: "roughCut" | "sliceMerge"
  materialMatchWay?: "fuzzyMatch" | "preciseMatch"
  materialComposition?: "random" | "order"
  metadata?: Record<string, string>
  firstFrameCover?: {
    coverSwitch?: boolean
    templateId?: string
    imageUrl?: string
    resultImageUrl?: string
  }
}

export interface StructLayer {
  markCode: "headerLayer" | "subtitleLayer" | "ipLayer"
  show?: boolean
  showMode?: "always" | "customize"
  showTime?: number
  layer?: {
    transform?: {
      position: [number, number, number]
    }
  }
}

export interface VideoScene {
  captions: {
    content: string
    marks?: TextMark[]
  }
  materials?: MaterialItem[]
}

export interface SpeakerExtra {
  speedRatio?: number
  language?: string
  marks?: TextMark[]
}

// ─── Video Generation Request Types (3.5) ───────────────

export interface VirtualmanVideoRequest {
  virtualmanId: string
  audioUrl?: string
  text?: string
  speakerId?: string
  speakerExtra?: SpeakerExtra
  metadata?: Record<string, string>
  callbackUrl?: string
}

export interface VirtualmanBroadcastRequest {
  styleId: string
  virtualmanId: string
  audioUrl?: string
  content?: string
  speakerId?: string
  speakerExtra?: SpeakerExtra
  language?: string
  title?: string
  materials?: MaterialItem[]
  materialSoundSwitch?: boolean
  introduceCard?: IntroduceCard
  subtitle?: SubtitleItem[]
  packRules?: PackRules
  processRules?: ProcessRules
  structLayers?: StructLayer[]
  callbackUrl?: string
}

export interface RealmanBroadcastRequest {
  styleId: string
  videoUrl: string
  language?: string
  title?: string
  subtitle?: SubtitleItem[]
  materials?: MaterialItem[]
  materialSoundSwitch?: boolean
  introduceCard?: IntroduceCard
  packRules?: PackRules
  processRules?: ProcessRules
  structLayers?: StructLayer[]
  callbackUrl?: string
}

export type CustomRealmanBroadcastRequest = RealmanBroadcastRequest

export interface MaterialMixcutRequest {
  styleId: string
  materials: MaterialItem[]
  audioUrl?: string
  content?: string
  speakerId?: string
  speakerExtra?: SpeakerExtra
  language?: string
  title?: string
  introduceCard?: IntroduceCard
  subtitle?: SubtitleItem[]
  packRules?: PackRules
  processRules?: ProcessRules
  structLayers?: StructLayer[]
  callbackUrl?: string
}

export interface NewsMixcutRequest {
  styleId: string
  title: string
  materials: MaterialItem[]
  introduceCard?: IntroduceCard
  packRules?: PackRules
  processRules?: ProcessRules
  structLayers?: StructLayer[]
  callbackUrl?: string
}

export interface CustomVirtualmanBroadcastRequest {
  styleId: string
  virtualmanId: string
  speakerId: string
  scenes: VideoScene[]
  title?: string
  speakerExtra?: SpeakerExtra
  introduceCard?: IntroduceCard
  packRules?: PackRules
  processRules?: ProcessRules
  structLayers?: StructLayer[]
  callbackUrl?: string
}

export interface CustomMaterialMixcutRequest {
  styleId: string
  scenes: VideoScene[]
  title?: string
  speakerId?: string
  speakerExtra?: SpeakerExtra
  introduceCard?: IntroduceCard
  packRules?: PackRules
  processRules?: ProcessRules
  structLayers?: StructLayer[]
  callbackUrl?: string
}

export interface AICoverRequest {
  imageUrl: string
  templateId: string
  processRules: {
    coverMainTitle: string
    coverSubtitle?: string
    coverKeywords?: string[]
    metadata?: Record<string, string>
  }
  callbackUrl?: string
}

// ─── Task Query & Callback Types (3.6) ──────────────────

export type TaskStatus = "processing" | "succeed" | "failed"

export interface SubtitleResult {
  text: string
  startMs: string
  endMs: string
}

export interface TaskResult {
  taskId: string
  status: TaskStatus
  result?: {
    videoUrl?: string
    audioUrl?: string
    imageUrl?: string
    text?: string
    coverUrl?: string
    aiCoverSucceed?: boolean
    duration?: number
    demoAudioUrl?: string
    virtualmanId?: string
    speakerId?: string
    subtitle?: SubtitleResult[]
  }
  errorCode?: string
  errorMessage?: string
}

export type WebhookPayload = TaskResult
