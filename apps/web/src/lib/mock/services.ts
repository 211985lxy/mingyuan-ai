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

// ─── Script Templates ────────────────────────────────────

export interface ScriptTemplate {
  id: string;
  title: string;
  category: string;
  content: string;
  tags: string[];
}

const scriptTemplates: ScriptTemplate[] = [
  {
    id: "tpl-1",
    title: "开箱测评",
    category: "产品种草",
    content:
      "刚收到这款【产品名】，包装就给我惊喜了！打开之后迫不及待试了一下，手感/质感远超预期。用了一周真实感受：【核心体验】。对比之前用过的三四款同类产品，这款在【差异化卖点】上真的碾压级别。想入手的姐妹放心冲，不踩雷！",
    tags: ["电商", "测评", "开箱"],
  },
  {
    id: "tpl-2",
    title: "好物推荐",
    category: "产品种草",
    content:
      "有没有姐妹跟我一样，被【痛点问题】困扰了好久？之前试了好多方法都没用，直到朋友推荐了这款【产品名】。用了不到两周，效果肉眼可见！最关键是【核心卖点】，性价比真的太高了。需要的姐妹评论区扣1，我发链接给你们！",
    tags: ["电商", "好物", "种草"],
  },
  {
    id: "tpl-3",
    title: "行业观点",
    category: "个人IP",
    content:
      "我说句可能得罪人的话：90%的人做【行业】都在犯同一个错误。大家都觉得【常见误区】才是关键，但真正赚到钱的人都知道，核心在于【真实洞察】。我在这个行业摸爬滚打了【X】年，这条经验值几万块。关注我，每天分享一个行业真相。",
    tags: ["个人品牌", "行业洞察", "涨粉"],
  },
  {
    id: "tpl-4",
    title: "创业故事",
    category: "个人IP",
    content:
      "三年前我还在工厂打工，月薪不到五千。最难的时候信用卡刷爆、房租都交不起。转折点是我决定all in【领域】，头三个月零收入，第四个月靠一个方法单月做到了【成果】。最大的教训就是：别等准备好了再开始，边干边学才是普通人逆袭的唯一路径。",
    tags: ["创业", "个人IP", "逆袭"],
  },
  {
    id: "tpl-5",
    title: "干货教程",
    category: "知识分享",
    content:
      "很多人问我【问题】到底怎么做？今天一次性讲清楚。第一步：【操作步骤1】，这步90%的人都会忽略。第二步：【操作步骤2】，注意一定要【关键细节】。第三步：【操作步骤3】，做完你会发现效果立竿见影。全是干货，建议先收藏再看，免得刷着刷着就找不到了！",
    tags: ["教程", "干货", "收藏"],
  },
  {
    id: "tpl-6",
    title: "避坑指南",
    category: "知识分享",
    content:
      "入行【领域】千万别踩这三个坑！第一个：【误区1】，我身边至少五个朋友因为这个亏了钱。第二个：【误区2】，看着省钱其实最费钱。第三个：【误区3】，新手最容易犯。正确的做法应该是【正确方法】，我整理了一份完整的避坑清单，需要的评论区扣「要」。",
    tags: ["避坑", "指南", "新手必看"],
  },
  {
    id: "tpl-7",
    title: "限时优惠",
    category: "促销活动",
    content:
      "紧急通知！这款【产品名】今天最后一天活动价，过了今晚恢复原价【原价】！现在下单直接立减【优惠金额】，再叠加我的专属优惠券，到手价只要【到手价】。库存只剩最后【数量】件了，上次补货等了整整两个月。犹豫的姐妹赶紧下单，手慢无！",
    tags: ["促销", "限时", "优惠"],
  },
  {
    id: "tpl-8",
    title: "新品发布",
    category: "促销活动",
    content:
      "等了三个月，终于可以官宣了！我们的全新【产品名】正式上线！这次最大的升级是【核心新功能】，同时还加入了【亮点功能】，完全是根据粉丝反馈打磨出来的。首发期间下单享【专属福利】，前100名再送【赠品】。点击主页链接抢先体验，数量有限先到先得！",
    tags: ["新品", "首发", "福利"],
  },
];

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
