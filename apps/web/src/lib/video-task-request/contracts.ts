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
  avatarId?: string;
  scriptId?: string;
  scriptContent?: string;
  sourceTemplateId?: string;
  styleId?: string;
  productionPlanId?: string;
  virtualmanId?: string;
  speakerId?: string;
  avatarName?: string;
  processRules?: unknown;
  speakerExtra?: unknown;
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
  status: string;
  externalVirtualmanId: string | null;
  externalSpeakerId: string | null;
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
