import { prisma } from "@/lib/prisma";
import { generateRawVideo } from "@/lib/shanjian";

export const AVATAR_DEMO_TEXT = "大家好，我是你的专属数字人，很高兴认识你。";

export async function triggerAvatarDemoVideo(input: {
  avatarId: string;
  virtualmanId: string;
  speakerId?: string | null;
  logPrefix?: string;
}): Promise<boolean> {
  const logPrefix = input.logPrefix ?? "[avatar-demo]";

  if (!input.speakerId) {
    console.warn(
      `${logPrefix} Skip demo video for avatar ${input.avatarId}: missing private speaker`,
    );
    return false;
  }

  const { taskId: demoTaskId } = await generateRawVideo({
    virtualmanId: input.virtualmanId,
    text: AVATAR_DEMO_TEXT,
    speakerId: input.speakerId,
  });

  await prisma.avatar.update({
    where: { id: input.avatarId },
    data: { demoTaskId },
  });

  console.log(
    `${logPrefix} Demo video triggered for avatar ${input.avatarId}, taskId: ${demoTaskId}`,
  );

  return true;
}
