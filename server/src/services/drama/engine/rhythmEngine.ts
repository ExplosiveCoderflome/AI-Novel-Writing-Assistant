/**
 * 竖屏付费短剧节奏引擎（P1 核心 · 平台护城河）
 *
 * 把竖屏付费短剧的真实创作法则落成确定性、可配置的规则集：
 * 钩子类型库 / 赛道模板库 / 付费卡点策略 / 情绪曲线目标。
 *
 * 这是来源无关的纯领域知识，不依赖 LLM、不依赖任何外部模块，
 * 供策略规划与分集大纲阶段查询与约束。
 */

// ============================================================
// 钩子类型库
// ============================================================
export type HookTypeId =
  | "identity_reversal" // 身份反转
  | "face_slap" // 打脸
  | "hidden_strength" // 扮猪吃老虎/实力隐藏
  | "mask_drop" // 马甲掉落
  | "misunderstanding" // 误会
  | "crisis" // 危机降临
  | "emotional_tug" // 情感拉扯
  | "crushing_power" // 实力碾压
  | "villain_provoke" // 反派挑衅
  | "secret_reveal"; // 秘密揭露

export interface HookType {
  id: HookTypeId;
  label: string;
  description: string;
  /** 适合放在开场钩子还是集尾卡点，或两者皆可 */
  placement: "opening" | "cliffhanger" | "both";
}

export const HOOK_TYPES: readonly HookType[] = [
  { id: "identity_reversal", label: "身份反转", description: "隐藏的真实身份被部分揭示或暗示，颠覆他人认知。", placement: "both" },
  { id: "face_slap", label: "打脸", description: "曾轻视/羞辱主角的人当众被现实反打，爽点高频核心。", placement: "both" },
  { id: "hidden_strength", label: "扮猪吃老虎", description: "主角刻意示弱，实力在关键处暴露一角。", placement: "both" },
  { id: "mask_drop", label: "马甲掉落", description: "主角的隐藏头衔/势力/财富被揭开一层。", placement: "cliffhanger" },
  { id: "misunderstanding", label: "误会", description: "信息差制造冲突，观众知情而角色不知，制造张力。", placement: "opening" },
  { id: "crisis", label: "危机降临", description: "突发威胁逼近主角或其重要的人，制造紧迫。", placement: "both" },
  { id: "emotional_tug", label: "情感拉扯", description: "暧昧/误解/错过推动情感线，留住情感向观众。", placement: "cliffhanger" },
  { id: "crushing_power", label: "实力碾压", description: "主角以绝对优势解决看似无解的局面，释放爽感。", placement: "both" },
  { id: "villain_provoke", label: "反派挑衅", description: "反派步步紧逼或当众挑衅，蓄积观众憋屈情绪。", placement: "opening" },
  { id: "secret_reveal", label: "秘密揭露", description: "关键秘密/伏笔被揭开，推动剧情进入新阶段。", placement: "cliffhanger" },
] as const;

// ============================================================
// 赛道模板库
// ============================================================
export type TrackId =
  | "counterattack" // 逆袭
  | "rebirth_revenge" // 重生复仇
  | "war_god" // 战神归来
  | "live_in_son" // 赘婿
  | "miracle_doctor" // 神医
  | "rich_family" // 豪门恩怨
  | "sweet_love" // 甜宠
  | "hidden_identity"; // 马甲文

export interface TrackTemplate {
  id: TrackId;
  label: string;
  description: string;
  /** 典型人设组合 */
  typicalArchetypes: string[];
  /** 该赛道偏好的钩子类型 */
  preferredHooks: HookTypeId[];
  /** 爽点节奏说明 */
  rhythmNote: string;
  /** 赛道禁忌（黑名单），避免拖节奏/劝退 */
  taboos: string[];
}

export const TRACK_TEMPLATES: readonly TrackTemplate[] = [
  {
    id: "counterattack",
    label: "逆袭",
    description: "底层/受压主角靠实力或机遇翻身，高频打脸。",
    typicalArchetypes: ["扮猪吃老虎主角", "势利眼配角", "傲慢反派"],
    preferredHooks: ["face_slap", "hidden_strength", "crushing_power", "villain_provoke"],
    rhythmNote: "1-2 集一个打脸释放；付费点前堆最大憋屈，再给最强反打。",
    taboos: ["主角长时间无还手忍气", "大段背景交代", "环境描写"],
  },
  {
    id: "rebirth_revenge",
    label: "重生复仇",
    description: "主角带前世记忆重生，对仇人精准复仇。",
    typicalArchetypes: ["重生复仇主角", "前世仇人", "前世亏欠的恩人"],
    preferredHooks: ["secret_reveal", "face_slap", "identity_reversal", "crisis"],
    rhythmNote: "用先知信息制造碾压式复仇；每集兑现一个前世未了之仇。",
    taboos: ["复仇拖沓不兑现", "主角圣母心放过仇人", "重复回忆前世"],
  },
  {
    id: "war_god",
    label: "战神归来",
    description: "隐退/被弃的强者归来，护短复仇横扫。",
    typicalArchetypes: ["扮猪吃老虎战神", "瞧不起人的岳家", "外部强敌"],
    preferredHooks: ["mask_drop", "crushing_power", "villain_provoke", "identity_reversal"],
    rhythmNote: "马甲一层层揭，实力一次次升级碾压。",
    taboos: ["过早暴露全部底牌", "战力体系混乱", "无端示弱"],
  },
  {
    id: "live_in_son",
    label: "赘婿",
    description: "被轻视的上门女婿实为隐藏大佬，反转打脸。",
    typicalArchetypes: ["隐藏身份赘婿", "势利岳家", "刁难连襟"],
    preferredHooks: ["hidden_strength", "face_slap", "mask_drop", "villain_provoke"],
    rhythmNote: "受辱蓄势→身份/实力曝光→当众打脸，循环升级。",
    taboos: ["岳家无脑到失真", "主角窝囊过久", "身份揭太快没张力"],
  },
  {
    id: "miracle_doctor",
    label: "神医",
    description: "身怀绝技的医者出手起死回生，技压群医。",
    typicalArchetypes: ["扮猪吃老虎神医", "傲慢专家", "求医权贵"],
    preferredHooks: ["crushing_power", "face_slap", "crisis", "secret_reveal"],
    rhythmNote: "以一次次妙手回春打脸权威，专业碾压制造爽点。",
    taboos: ["医疗常识硬伤", "治病过程冗长", "无冲突的纯炫技"],
  },
  {
    id: "rich_family",
    label: "豪门恩怨",
    description: "豪门内部权斗、争产、身世之谜交织。",
    typicalArchetypes: ["落难千金/隐藏继承人", "恶毒亲属", "深沉家主"],
    preferredHooks: ["identity_reversal", "secret_reveal", "emotional_tug", "face_slap"],
    rhythmNote: "身世/财产/情感多线并进，每集抖一个反转。",
    taboos: ["人物关系混乱难记", "撕逼无信息增量", "节奏拖沓"],
  },
  {
    id: "sweet_love",
    label: "甜宠",
    description: "强情感钩子的恋爱线，撒糖与拉扯交替。",
    typicalArchetypes: ["高位男主", "倔强女主", "情敌"],
    preferredHooks: ["emotional_tug", "misunderstanding", "identity_reversal", "crisis"],
    rhythmNote: "甜点与虐点交替，集尾留情感悬念。",
    taboos: ["无脑甜无张力", "误会拖太久转虐", "男主油腻越界"],
  },
  {
    id: "hidden_identity",
    label: "马甲文",
    description: "主角多重隐藏身份，逐一掉落震惊全场。",
    typicalArchetypes: ["多重马甲主角", "质疑者", "崇拜者"],
    preferredHooks: ["mask_drop", "identity_reversal", "face_slap", "secret_reveal"],
    rhythmNote: "每隔数集掉一个马甲，层层加码制造惊呼点。",
    taboos: ["马甲过多记不住", "掉马甲无铺垫突兀", "身份无含金量"],
  },
] as const;

// ============================================================
// 付费卡点策略 & 情绪曲线
// ============================================================
export interface PaywallStrategy {
  /** 免费引流集数：前 N 集免费，必须立住主爽点与追剧动力 */
  freeEpisodes: number;
  /** 首付费点：卡在第一个大反转/情绪最高点 */
  firstPaywallAt: number;
  /** 之后每隔几集设强卡点（1=每集集尾都卡） */
  paywallCadence: number;
}

/** 竖屏付费短剧默认卡点策略 */
export const DEFAULT_PAYWALL_STRATEGY: PaywallStrategy = {
  freeEpisodes: 10,
  firstPaywallAt: 12,
  paywallCadence: 1,
};

export interface EmotionCurveTarget {
  description: string;
  /** 每个滑动窗口（集）内情绪净值至少要有一次正向释放 */
  releaseEveryEpisodes: number;
  /** 付费点前允许的最大憋屈蓄势深度（负值） */
  maxBuildupDepth: number;
}

export const DEFAULT_EMOTION_CURVE: EmotionCurveTarget = {
  description: "憋屈蓄势→反转释放→新钩子；每 1-2 集一个释放点，付费点前蓄最大憋屈再给最强释放。",
  releaseEveryEpisodes: 2,
  maxBuildupDepth: -3,
};

// ============================================================
// 引擎
// ============================================================
export class RhythmEngine {
  listHooks(): readonly HookType[] {
    return HOOK_TYPES;
  }

  getHook(id: HookTypeId): HookType | undefined {
    return HOOK_TYPES.find((hook) => hook.id === id);
  }

  listTracks(): readonly TrackTemplate[] {
    return TRACK_TEMPLATES;
  }

  getTrack(id: TrackId): TrackTemplate | undefined {
    return TRACK_TEMPLATES.find((track) => track.id === id);
  }

  /** 该赛道推荐的钩子类型（完整对象） */
  recommendHooksForTrack(id: TrackId): HookType[] {
    const track = this.getTrack(id);
    if (!track) {
      return [];
    }
    return track.preferredHooks
      .map((hookId) => this.getHook(hookId))
      .filter((hook): hook is HookType => Boolean(hook));
  }

  /**
   * 计算付费卡点集号列表（1-based）。
   * 首付费点起，按 cadence 标记强卡点，直到总集数。
   */
  buildPaywallPlan(targetEpisodes: number, strategy: PaywallStrategy = DEFAULT_PAYWALL_STRATEGY): number[] {
    const plan: number[] = [];
    const cadence = Math.max(1, strategy.paywallCadence);
    for (let ep = strategy.firstPaywallAt; ep <= targetEpisodes; ep += cadence) {
      plan.push(ep);
    }
    return plan;
  }

  /** 某集是否为付费卡点集 */
  isPaywallEpisode(
    episodeOrder: number,
    targetEpisodes: number,
    strategy: PaywallStrategy = DEFAULT_PAYWALL_STRATEGY,
  ): boolean {
    if (episodeOrder < strategy.firstPaywallAt || episodeOrder > targetEpisodes) {
      return false;
    }
    const cadence = Math.max(1, strategy.paywallCadence);
    return (episodeOrder - strategy.firstPaywallAt) % cadence === 0;
  }
}

export const rhythmEngine = new RhythmEngine();
