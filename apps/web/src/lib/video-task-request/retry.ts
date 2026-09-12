/**
 * 从失败任务的不可变快照重建重试载荷。
 *
 * 只复用供应商中立的可选输入；文案取原始快照（源稿件可能已被编辑）。
 * own_voice 任务必须还原音源，否则重试会静默退回数字人自带音色。
 * 不复制 ownVoiceAudioUrl——签名 URL 已过期，由服务端重新合成并重新签名。
 */
export type RetryableVideoTask = {
  id: string;
  videoType: string;
  scriptContent: string;
  avatarName: string | null;
  avatarId: string | null;
  projectId: string | null;
  aimGenerationId: string | null;
  shanjianPayload: unknown;
};

export function buildRetryPayload(
  task: RetryableVideoTask,
  now: number = Date.now(),
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    type: task.videoType,
    scriptContent: task.scriptContent,
    avatarName: task.avatarName,
    projectId: task.projectId ?? undefined,
    aimGenerationId: task.aimGenerationId ?? undefined,
    actionId: `retry:${task.id}:${now}`,
    retryOfTaskId: task.id,
  };

  if (task.avatarId) payload.avatarId = task.avatarId;

  if (task.shanjianPayload && typeof task.shanjianPayload === "object") {
    const sp = task.shanjianPayload as Record<string, unknown>;
    if (sp.virtualmanId) payload.virtualmanId = sp.virtualmanId;
    if (sp.speakerId) payload.speakerId = sp.speakerId;
    if (sp.styleId) payload.styleId = sp.styleId;
    if (sp.speakerExtra) payload.speakerExtra = sp.speakerExtra;
    if (sp.processRules) payload.processRules = sp.processRules;
    if (sp.aspectRatio === "16:9" || sp.aspectRatio === "9:16") payload.aspectRatio = sp.aspectRatio;
    if (sp.audioType === "audio" && sp.ownVoiceAudioUrl) {
      payload.voiceSource = "own_voice";
      if (typeof sp.ownVoiceVoiceId === "string") payload.voiceId = sp.ownVoiceVoiceId;
    }
  }

  return payload;
}
