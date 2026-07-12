import type {
  User,
  Avatar,
  AvatarStatus,
  Asset,
  Script,
  VideoTask,
  VideoTaskStatus,
  ScriptGenerateInput,
} from "@mingyuan/shared";
import {
  getCurrentUser as apiGetCurrentUser,
  listAvatars,
  listAssets,
  listVideoTasks,
  getVideoTask as apiGetVideoTask,
  createVideoTask as apiCreateVideoTask,
  ApiError,
} from "@/lib/api/client";
import type { ApiAsset, ApiAvatar, ApiVideoTask, ApiUser } from "@/types/api";
import {
  mockUser,
  mockAvatars,
  mockAssets,
  mockScripts,
  mockVideoTasks,
} from "./data";
import { scriptTemplates, type ScriptTemplate } from "./script-templates";

export type { ScriptTemplate } from "./script-templates";

// ─── Marketing Analysis ──────────────────────────────────

export interface MarketingAnalysis {
  overallScore: number; // 0-100
  dimensions: {
    name: string;
    score: number; // 0-100
    comment: string;
  }[];
  summary: string;
  suggestions: string[];
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const currentMockUser = { ...mockUser };
let avatars = [...mockAvatars];
let assets = [...mockAssets];
let scripts = [...mockScripts];
const videoTasks = [...mockVideoTasks];

// ─── API → Domain Mappers ───────────────────────────────

function mapApiAvatarToAvatar(a: ApiAvatar): Avatar {
  return {
    id: a.id,
    userId: a.userId,
    name: a.name,
    status: a.status as AvatarStatus,
    coverUrl: a.coverUrl ?? "",
    sourceVideoUrl: a.sourceVideoUrl ?? "",
    previewUrl: a.previewUrl ?? "",
    thumbnailUrl: a.thumbnailUrl ?? "",
    externalVirtualmanId: a.externalVirtualmanId ?? undefined,
    externalSpeakerId: a.externalSpeakerId ?? undefined,
    speakerName: a.speakerName ?? "",
    demoVideoUrl: a.demoVideoUrl ?? "",
    createdAt: a.createdAt,
  };
}

function mapApiVideoTaskToVideoTask(t: ApiVideoTask): VideoTask {
  return {
    id: t.id,
    userId: t.userId,
    avatarId: t.avatarId ?? "",
    scriptId: t.scriptId ?? "",
    status: t.status as VideoTaskStatus,
    videoUrl: t.videoUrl,
    thumbnailUrl: t.coverUrl,
    scriptContent: t.scriptContent,
    avatarName: t.avatarName,
    errorMessage: t.errorMessage,
    marketingAnalysis: t.marketingAnalysis ?? null,
    createdAt: t.createdAt,
    completedAt: t.completedAt,
  };
}

function mapApiAssetToAsset(a: ApiAsset): Asset {
  return {
    id: a.id,
    userId: a.userId,
    sourceAvatarId: a.sourceAvatarId ?? undefined,
    name: a.name,
    assetType: a.assetType as Asset["assetType"],
    url: a.url ?? "",
    status: (a.status as Asset["status"]) || "ready",
    externalSpeakerId: a.externalSpeakerId ?? undefined,
    voiceModel: a.voiceModel ?? undefined,
    demoAudioUrl: a.demoAudioUrl ?? undefined,
    errorMessage: a.errorMessage ?? undefined,
    createdAt: a.createdAt,
  };
}

function mapApiUserToUser(u: ApiUser): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    dailyLimit: u.dailyLimit ?? 2,
    videosCreatedToday: u.videosCreatedToday ?? 0,
    createdAt: u.createdAt || new Date().toISOString(),
  };
}

// ─── Auth (mock — real auth uses separate login page) ───

export async function login(
  email: string,
  password: string,
): Promise<User | null> {
  void password;
  await delay(800);
  if (email) {
    return { ...currentMockUser, email };
  }
  return null;
}

export async function register(
  email: string,
  password: string,
): Promise<boolean> {
  void password;
  await delay(800);
  return !!email;
}

// ─── User (bridged to real API) ─────────────────────────

export async function getCurrentUser(): Promise<User> {
  try {
    const apiUser = await apiGetCurrentUser();
    return mapApiUserToUser(apiUser);
  } catch (e) {
    if (e instanceof ApiError) {
      console.warn(
        "[mock/services] getCurrentUser API failed, falling back to mock:",
        e.message,
      );
    }
    await delay(300);
    return { ...currentMockUser };
  }
}

// ─── Avatars (bridged to real API) ──────────────────────

export async function getAvatars(): Promise<Avatar[]> {
  try {
    const apiAvatars = await listAvatars();
    return apiAvatars.map(mapApiAvatarToAvatar);
  } catch (e) {
    if (e instanceof ApiError) {
      console.warn(
        "[mock/services] getAvatars API failed, falling back to mock:",
        e.message,
      );
    }
    await delay(400);
    return [...avatars];
  }
}

export async function getAvatar(id: string): Promise<Avatar | null> {
  await delay(200);
  return avatars.find((a) => a.id === id) ?? null;
}

export async function createAvatar(name: string): Promise<Avatar> {
  await delay(1000);
  const avatar: Avatar = {
    id: `avatar-${Date.now()}`,
    userId: "user-1",
    name,
    status: "cloning",
    coverUrl: `https://picsum.photos/seed/${Date.now()}/200/200`,
    sourceVideoUrl: "",
    previewUrl: "",
    thumbnailUrl: "",
    speakerName: "",
    demoVideoUrl: "",
    createdAt: new Date().toISOString(),
  };
  avatars = [avatar, ...avatars];

  setTimeout(() => {
    avatars = avatars.map((a) =>
      a.id === avatar.id
        ? { ...a, status: "ready" as const, speakerName: `${name}-Voice` }
        : a,
    );
  }, 5000);

  return avatar;
}

// ─── Assets (mock) ──────────────────────────────────────

export async function getAssets(): Promise<Asset[]> {
  try {
    const apiAssets = await listAssets();
    const realAssets = apiAssets.map(mapApiAssetToAsset);
    const realIds = new Set(realAssets.map((asset) => asset.id));
    const mockOnly = assets.filter((asset) => !realIds.has(asset.id));
    return [...realAssets, ...mockOnly];
  } catch (e) {
    if (e instanceof ApiError) {
      console.warn(
        "[mock/services] getAssets API failed, falling back to mock:",
        e.message,
      );
    }
    await delay(400);
    return [...assets];
  }
}

export async function uploadAsset(
  name: string,
  assetType: Asset["assetType"],
): Promise<Asset> {
  await delay(1200);
  const asset: Asset = {
    id: `asset-${Date.now()}`,
    userId: "user-1",
    name,
    assetType,
    url: `https://picsum.photos/seed/${Date.now()}/400/300`,
    status: "ready",
    createdAt: new Date().toISOString(),
  };
  assets = [asset, ...assets];
  return asset;
}

// ─── Scripts (mock) ─────────────────────────────────────

export async function getScripts(): Promise<Script[]> {
  await delay(300);
  return [...scripts];
}

export async function generateScripts(
  input: ScriptGenerateInput,
): Promise<string[]> {
  await delay(2000);
  const { industry, sellingPoints, city } = input;
  return [
    `大家好，我是来自${city}的${industry}达人。今天跟大家分享一下${sellingPoints}，真的是用过就回不去了！对于想打造个人品牌的朋友，这绝对是你的必备好物。`,
    `各位老板注意了！做${industry}的朋友都知道，${sellingPoints}才是核心竞争力。我在${city}帮助了上百位企业主提升业绩，今天把这个方法分享给你。`,
    `你好，我是${city}${industry}领域的创业者。很多粉丝问我${sellingPoints}到底怎么选？今天一次性讲清楚，记得收藏转发给需要的朋友！`,
  ];
}

export async function saveScript(content: string): Promise<Script> {
  await delay(500);
  const script: Script = {
    id: `script-${Date.now()}`,
    userId: "user-1",
    content,
    createdAt: new Date().toISOString(),
  };
  scripts = [script, ...scripts];
  return script;
}

// ─── Video Tasks (bridged to real API) ──────────────────

export async function getVideoTasks(): Promise<VideoTask[]> {
  try {
    const apiTasks = await listVideoTasks();
    return apiTasks.map(mapApiVideoTaskToVideoTask);
  } catch (e) {
    if (e instanceof ApiError) {
      console.warn(
        "[mock/services] getVideoTasks API failed, falling back to mock:",
        e.message,
      );
    }
    await delay(400);
    return [...videoTasks];
  }
}

export async function getVideoTask(id: string): Promise<VideoTask | null> {
  await delay(200);
  return videoTasks.find((t) => t.id === id) ?? null;
}

export async function createVideoTask(
  avatarId: string,
  scriptContent: string,
  extra?: {
    virtualmanId?: string;
    speakerId?: string;
    styleId?: string;
    avatarName?: string;
  },
): Promise<VideoTask> {
  try {
    // Build real API params
    const params: Record<string, unknown> = {
      type: "virtualman_broadcast",
      scriptContent,
      // Default Shanjian template
      styleId: extra?.styleId || "6904552d68f703003047c54f",
    };

    if (extra?.virtualmanId && extra?.speakerId) {
      // Public avatar: pass Shanjian IDs directly
      params.virtualmanId = extra.virtualmanId;
      params.speakerId = extra.speakerId;
      params.avatarName = extra.avatarName || "公共数字人";
    } else {
      // User's own avatar (in DB)
      params.avatarId = avatarId;
      // Pass speakerId as fallback for fast/image clones without voice
      if (extra?.speakerId) {
        params.speakerId = extra.speakerId;
      }
    }

    const apiTask = await apiCreateVideoTask(params);
    return mapApiVideoTaskToVideoTask(apiTask);
  } catch (e) {
    if (e instanceof ApiError) {
      console.warn("[mock/services] createVideoTask API failed:", e.message);
    }
    throw e;
  }
}

export async function pollTaskStatus(id: string): Promise<VideoTask | null> {
  try {
    const apiTask = await apiGetVideoTask(id);
    return mapApiVideoTaskToVideoTask(apiTask);
  } catch {
    return null;
  }
}

// ─── Script Templates (mock) ───────────────────────────

export async function getScriptTemplates(): Promise<ScriptTemplate[]> {
  await delay(300);
  return [...scriptTemplates];
}

// ─── Marketing Analysis (mock) ─────────────────────────

export interface PublishInfo {
  title: string;
  description: string;
  tags: string[];
}

export async function getPublishInfo(
  taskOrId: string | VideoTask,
): Promise<PublishInfo | null> {
  await delay(800);
  const task =
    typeof taskOrId === "string"
      ? videoTasks.find((t) => t.id === taskOrId)
      : taskOrId;
  if (!task || task.status !== "completed") return null;

  const snippet = task.scriptContent.slice(0, 20);
  return {
    title: `${snippet}...｜${task.avatarName}带你了解`,
    description: task.scriptContent,
    tags: ["创业", "个人IP", "营销干货", "短视频运营", "小企业主"],
  };
}

export async function getMarketingAnalysis(
  taskOrId: string | VideoTask,
): Promise<MarketingAnalysis | null> {
  await delay(1500); // simulate AI analysis time
  const task =
    typeof taskOrId === "string"
      ? videoTasks.find((t) => t.id === taskOrId)
      : taskOrId;
  if (!task || task.status !== "completed") return null;

  // Generate mock analysis - vary scores slightly based on script length
  const scriptLen = task.scriptContent.length;
  const baseScore = Math.min(95, Math.max(70, 75 + Math.floor(scriptLen / 10)));

  return {
    overallScore: baseScore,
    dimensions: [
      {
        name: "开场吸引力",
        score: baseScore + 3,
        comment: "开场直切主题，能在前3秒内抓住观众注意力",
      },
      {
        name: "内容说服力",
        score: baseScore - 2,
        comment: "卖点阐述清晰，但可以增加更多具体数据或案例支撑",
      },
      {
        name: "行动号召力",
        score: baseScore + 1,
        comment: "结尾引导明确，建议增加限时紧迫感提升转化",
      },
      {
        name: "品牌一致性",
        score: baseScore - 1,
        comment: "整体风格统一，建议固定开场口头禅强化个人IP记忆点",
      },
      {
        name: "情感共鸣",
        score: baseScore + 2,
        comment: "语言亲切自然，能拉近与目标受众的距离",
      },
    ],
    summary: `这条视频文案整体质量${baseScore >= 85 ? "优秀" : "良好"}，开场吸引力强，能快速抓住目标受众注意力。建议在后续创作中持续强化个人IP特征，保持发布频率，逐步建立粉丝信任度。`,
    suggestions: [
      "建议在开头加入一个引发共鸣的痛点问题，提升完播率",
      "可以在结尾添加互动引导（如「你觉得呢？评论区告诉我」），提升互动率",
      "尝试在视频中加入字幕关键词高亮，强化核心卖点记忆",
    ],
  };
}

// ─── Douyin Hot ──────────────────────────────────────────

export interface DouyinHotItem {
  word: string;
  hot_value: number;
  position: number;
  word_cover?: { url_list?: string[] };
}

export async function getDouyinHot(): Promise<DouyinHotItem[]> {
  try {
    const res = await fetch("/api/douyin-hot");
    if (!res.ok) throw new Error("API error");
    const json = await res.json();
    if (json.code === 200 && Array.isArray(json.data)) {
      return json.data.slice(0, 20).map((item: DouyinHotItem) => ({
        word: item.word,
        hot_value: item.hot_value,
        position: item.position,
        word_cover: item.word_cover,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

export async function extractHotTopicSubtitles(topic: string): Promise<string> {
  // Mock: simulate extracting subtitles from hot topic videos
  await delay(2000);
  const mockSubtitles: Record<string, string> = {
    default: `最近「${topic}」这个话题在抖音上爆了！很多人都在讨论这件事。作为一个内容创作者，我觉得这里面有几个关键点值得我们关注。首先，这个话题之所以火，是因为它直击了大家的痛点。其次，如果你也想借势做内容，一定要找到和自己领域的结合点，不要生硬蹭热点。记住，追热点不是照搬，而是用你的专业视角去解读，给粉丝提供价值。`,
  };
  return mockSubtitles.default;
}

export async function generateScriptsWithHotTopic(
  input: ScriptGenerateInput & { hotTopic: string; subtitles: string },
): Promise<string[]> {
  await delay(2500);
  const { industry, sellingPoints, city, hotTopic } = input;
  return [
    `最近「${hotTopic}」火遍全网，作为${city}${industry}行业的从业者，我发现这个热点和${sellingPoints}息息相关。今天就从我的专业角度，给大家拆解一下背后的逻辑，顺便分享几个实操方法。`,
    `刷到「${hotTopic}」了吗？很多人在问这是怎么回事。我在${city}做${industry}这么多年，一眼就看出了门道。其实核心就是${sellingPoints}，今天一次性给你讲透！`,
    `${hotTopic}——这个话题我必须聊聊！作为一个专注${industry}领域的${city}创业者，我觉得${sellingPoints}才是关键。不信你往下看，绝对颠覆你的认知。`,
  ];
}
