import { prisma } from "@/lib/prisma";
import type { CreateVideoTaskInput, ResolvedPlan, ResolvedScript, VideoTaskType } from "./contracts";
import { VideoTaskRequestError } from "./contracts";

const SCRIPT_REQUIRED_TYPES = ["virtualman_broadcast", "broadcast_mixcut", "virtualman_video"];

export async function resolveVideoTaskScript(input: {
  userId: string;
  body: CreateVideoTaskInput;
  plan: ResolvedPlan | null;
  videoType: VideoTaskType;
}): Promise<{ script: ResolvedScript | null; content: string }> {
  const scriptId = input.plan?.scriptId ?? input.body.scriptId;
  const script = scriptId ? await loadOwnedScript(scriptId, input.userId) : null;
  const content = script?.content ?? input.body.scriptContent ?? "";
  if (SCRIPT_REQUIRED_TYPES.includes(input.videoType) && !content.trim()) {
    throw new VideoTaskRequestError("scriptId or scriptContent is required for this video type", 400);
  }
  return { script, content };
}

async function loadOwnedScript(scriptId: string, userId: string): Promise<ResolvedScript> {
  const script = await prisma.script.findUnique({
    where: { id: scriptId },
    select: { id: true, userId: true, content: true, sourceTemplateId: true },
  });
  if (!script || script.userId !== userId) throw new VideoTaskRequestError("Script not found", 404);
  return { id: script.id, content: script.content, sourceTemplateId: script.sourceTemplateId };
}
