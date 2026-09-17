import type { MaterialAssignment } from "@/types/api";

export const VALID_VIDEO_TASK_TYPES = [
  "virtualman_broadcast",
  "realman_broadcast",
  "broadcast_mixcut",
  "news_mixcut",
  "virtualman_video",
  "custom_virtualman_broadcast",
  "custom_realman_broadcast",
  "custom_broadcast_mixcut",
  "ai_cover",
] as const;

export type VideoTaskType = (typeof VALID_VIDEO_TASK_TYPES)[number];

export const AVATAR_REQUIRING_TYPES: VideoTaskType[] = [
  "virtualman_broadcast",
  "virtualman_video",
  "custom_virtualman_broadcast",
];

export type CreateVideoTaskInput = {
  type?: string;
  projectId?: string;
  aimGenerationId?: string;
  aspectRatio?: "9:16" | "16:9" | "1:1";
  actionId?: string;
  retryOfTaskId?: string;
  provider?: "chanjing" | "shanjian" | "heygen" | "hypit";
  avatarId?: string;
  scriptId?: string;
  scriptContent?: string;
  sourceTemplateId?: string;
  styleId?: string;
  productionPlanId?: string;
  virtualmanId?: string;
  speakerId?: string;
  /**
   * 公共数字人的形态（蝉镜 figure_type，如 sit_body/whole_body/circle_view）。
   * 蝉镜对带形态列表的形象要求显式指定，缺失会以 50000 拒绝下单。
   */
  figureType?: string;
  /** 驱动模式：random=随机帧动作（动作更自然） */
  driveMode?: "random";
  avatarName?: string;
  processRules?: unknown;
  speakerExtra?: unknown;
  /** 音频来源：tts=数字人自带音色（默认）；own_voice=自有语音 API（Fish Audio）合成后驱动口型 */
  voiceSource?: "tts" | "own_voice";
  /** 自有语音的音色 id（Fish Audio reference_id）；留空用平台默认音色 */
  voiceId?: string;
  /**
   * ── Hypit 渲染源（`provider: "hypit"` 专用）────────────────────────────
   *
   * 与前三个 provider 不同，Hypit 不认识「数字人形象 + 口播文案」，它渲染的是一份
   * SVML 源。两个字段二选一：
   * - `hypitSourcePath`：渲染服务工作区内的一条 .svml / .svs / .svrun 路径
   * - `hypitSource`：内联源文本，由渲染服务写入工作区后提交
   *
   * 缺省时提交会被 fail-closed 拒绝（见 `lib/digital-human-provider.ts`）。
   */
  hypitSourcePath?: string;
  hypitSource?: string;
  /** 配合 `hypitSource` 指定扩展名（决定源类型），默认 inline.svml */
  hypitSourceFilename?: string;
  /**
   * 模板名（`provider: "hypit"` 专用，与 `hypitSource` / `hypitSourcePath` 互斥）。
   *
   * 走「预置模板 + 换文案变量」路线（见 `services/hypit-renderer/docs/TEMPLATE-CONTRACT.md`
   * 方案 A）：AIM 侧按名字从 `lib/hypit-templates.ts` 取出模板源文本，用
   * `hypitVariables` 渲染 `{{var}}` 后内联提交。素材路径由模板里的 `{{asset_base}}`
   * 决定（指向渲染服务内已烤好的素材目录，绝对路径）。
   */
  hypitTemplateName?: string;
  /** 模板变量；缺值按 `HypitTemplateError` fail-closed（绝不把 `{{var}}` 留进片子）。 */
  hypitVariables?: Record<string, string | number>;
  [key: string]: unknown;
};

export type ResolvedPlan = {
  id: string;
  scriptId: string;
  structureId: string | null;
  packagingTemplateId: string | null;
  styleId: string;
  materials: MaterialAssignment[] | null;
  backgroundMusic: { audioUrl: string; volume: number } | null;
  packRules: Record<string, unknown> | null;
  processRules: Record<string, unknown> | null;
  recommendationContext: Record<string, unknown> | null;
  videoType: string;
  structureSnapshot: Record<string, unknown> | null;
  packagingSnapshot: Record<string, unknown> | null;
};

export type ResolvedAvatar = {
  id: string;
  name: string;
  userId: string;
  projectId: string | null;
  status: string;
  externalVirtualmanId: string | null;
  externalSpeakerId: string | null;
  externalFigureType?: string | null;
  externalDriveMode?: string | null;
  speakerName: string | null;
};

export type ResolvedScript = {
  id: string;
  content: string;
  sourceTemplateId: string | null;
};

export class VideoTaskRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: { code?: string; field?: string | null; requestId?: string | null } = {},
  ) {
    super(message);
    this.name = "VideoTaskRequestError";
  }
}

export class TaskReservationError extends VideoTaskRequestError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = "TaskReservationError";
  }
}
