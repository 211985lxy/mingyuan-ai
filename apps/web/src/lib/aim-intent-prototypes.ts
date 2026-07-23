/**
 * 本轮意图向量原型库（口语近义兜底用）
 * 规模刻意控制在几十条；命中后仍走生成前意图确认。
 */

import type { AimTurnIntentAction, AimTurnIntentScope } from "@/lib/aim-turn-intent"

export interface AimIntentPrototype {
  id: string
  /** 用于 embedding 的标准说法 */
  phrase: string
  action: AimTurnIntentAction
  scope?: AimTurnIntentScope
}

export const AIM_TURN_INTENT_PROTOTYPES: AimIntentPrototype[] = [
  // create
  { id: "create_xhs", phrase: "帮我写一篇小红书种草笔记", action: "create" },
  { id: "create_xhs_2", phrase: "出一条种草文案发小红书", action: "create" },
  { id: "create_koubo", phrase: "写一条口播短视频脚本", action: "create" },
  { id: "create_douyin", phrase: "帮我写抖音口播稿", action: "create" },
  { id: "create_moments", phrase: "写三条朋友圈文案", action: "create" },
  { id: "create_wechat", phrase: "写一篇公众号文章", action: "create" },
  { id: "create_generic", phrase: "按这个选题直接生成一版成稿", action: "create" },
  { id: "create_script", phrase: "出一版可拍摄的视频文案", action: "create" },

  // local_edit
  { id: "edit_opening", phrase: "只优化开头钩子不要改正文", action: "local_edit", scope: "opening" },
  { id: "edit_opening_2", phrase: "把前三秒改得更抓人", action: "local_edit", scope: "opening" },
  { id: "edit_title", phrase: "只改标题其他不动", action: "local_edit", scope: "title" },
  { id: "edit_ending", phrase: "只润色结尾收束", action: "local_edit", scope: "ending" },
  { id: "edit_cta", phrase: "只改最后的行动引导CTA", action: "local_edit", scope: "cta" },
  { id: "edit_local", phrase: "局部改一下这段表述别重写全文", action: "local_edit" },

  // rewrite
  { id: "rewrite_full", phrase: "整篇重写这一版文案", action: "rewrite", scope: "full" },
  { id: "rewrite_bench", phrase: "按对标爆款结构改写这篇", action: "rewrite" },
  { id: "rewrite_redo", phrase: "推倒重来重新写一版", action: "rewrite" },

  // review
  { id: "review_qc", phrase: "发布前帮我质检一下这篇文案", action: "review" },
  { id: "review_check", phrase: "检查一下有没有违禁和空泛表述", action: "review" },

  // position
  { id: "position_persona", phrase: "帮我梳理账号人设和定位方向", action: "position" },
  { id: "position_topic", phrase: "先做人设定位和选题策划不要写正文", action: "position" },

  // chat / clarify-ish（低优先级，避免轻易盖过写作意图）
  { id: "chat_ask", phrase: "这个选题还能怎么做解释一下思路", action: "chat" },
]
