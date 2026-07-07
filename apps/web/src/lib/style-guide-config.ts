/**
 * 风格指令配置模块
 * 12 种内置文案风格，供 /api/scripts/polish 的 imitate（跨行业爆款仿写）模式使用：
 * 用户在仿写时可选择一种风格覆盖默认的「用户写作风格档案」做本次腔调。
 * 每种风格对应一段中文 prompt，注入到 system prompt 尾部。
 */

export type StyleGuideId =
  | "sharp"
  | "humor"
  | "restrained"
  | "colloquial"
  | "literary"
  | "story"
  | "golden_quote"
  | "boss"
  | "experienced"
  | "counter_intuitive"
  | "healing"
  | "professional"

export const STYLE_GUIDE_IDS: StyleGuideId[] = [
  "sharp",
  "humor",
  "restrained",
  "colloquial",
  "literary",
  "story",
  "golden_quote",
  "boss",
  "experienced",
  "counter_intuitive",
  "healing",
  "professional",
]

export const STYLE_GUIDE_LABELS: Record<StyleGuideId, string> = {
  sharp: "犀利",
  humor: "幽默",
  restrained: "克制高级",
  colloquial: "口语化",
  literary: "文艺",
  story: "故事感",
  golden_quote: "金句体",
  boss: "老板口吻",
  experienced: "过来人",
  counter_intuitive: "反常识",
  healing: "治愈",
  professional: "专业理性",
}

const STYLE_PROMPTS: Record<StyleGuideId, string> = {
  sharp:
    "用犀利尖锐的笔触改写文案。观点鲜明、直击痛点，善用反问和对比制造冲击力。语言简洁有力，不留情面，让读者产生「被说中」的感觉。避免温和的过渡词。",
  humor:
    "用幽默风趣的语调改写文案。善用双关、反讽、夸张和出人意料的比喻，让读者会心一笑。严肃的观点用轻松的方式包装，降低阅读门槛。避免低俗和强行搞笑。",
  restrained:
    "用克制高级的语调改写文案。少即是多，去掉所有多余修饰词和感叹号。用冷静客观的陈述传递力量，留白让读者自己思考。避免煽情、夸张和堆砌形容词。",
  colloquial:
    "用日常口语化的语调改写文案。像跟朋友聊天一样自然，短句为主，允许适当使用语气词。避免书面语、成语堆砌和官方腔调。读出来要顺口，听感像说话而不是朗读。",
  literary:
    "用文艺抒情的语调改写文案。善用意象、隐喻和通感，语言有画面感和节奏感。可以引用或化用诗句典故，营造氛围和情绪张力。避免空洞的抒情和无意义的排比。",
  story:
    "用讲故事的语调改写文案。将观点嵌入一个小场景或叙事片段中，有画面、有人物、有转折。用「画面感」代替「说教感」，让读者身临其境。避免平铺直叙的开头。",
  golden_quote:
    "用金句体的方式改写文案。每段话都要有记忆点，追求「一句话被截图转发」的效果。善用对仗、对比、反转和押韵。节奏紧凑，朗朗上口。避免冗长解释和铺垫。",
  boss:
    "用老板/创始人的口吻改写文案。语气笃定、有决策感，像在给团队开会或给客户拍板。善用指令性表达和经验判断，传递「我走过这条路」的权威感。避免犹豫和模棱两可。",
  experienced:
    "用过来人的语调改写文案。语气真诚、有温度，像前辈在跟后辈分享经验。可以用「我当年」「后来才明白」的叙事角度，传递经历过后的洞察。避免居高临下和说教。",
  counter_intuitive:
    "用反常识的角度改写文案。打破读者的固有认知，用出人意料的数据、案例或观点制造认知冲突。开头就要抛出与大众相反的判断，引发好奇。避免哗众取宠和无依据的反转。",
  healing:
    "用治愈温暖的语调改写文案。语气温柔包容，给读者安全感和希望感。善用共情表达，先看见和承认读者的困境，再给出轻柔的建议。避免有毒的正能量和空洞的安慰。",
  professional:
    "用专业理性的语调改写文案。逻辑清晰、论据扎实，善用数据和权威背书增强说服力。表达克制客观，用事实和推理代替情绪渲染。避免过度专业化和生硬的学术腔。",
}

export function getStylePromptBlock(styleId?: StyleGuideId): string {
  if (!styleId || !(styleId in STYLE_PROMPTS)) return ""
  return `\n\n【风格指令：${STYLE_GUIDE_LABELS[styleId]}】\n${STYLE_PROMPTS[styleId]}`
}
