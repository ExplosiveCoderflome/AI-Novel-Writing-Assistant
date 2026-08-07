import type {
  WritingPlatform,
  WritingPlatformProfileDefinition,
} from "@ai-novel/shared/types/writingPlatform";

export const OFFICIAL_WRITING_PLATFORM_PROFILES: Record<WritingPlatform, WritingPlatformProfileDefinition> = {
  fanqie_free: {
    platform: "fanqie_free",
    label: "番茄免费网文",
    summary: "快速入戏、短段落、高冲突、阶段回报清楚，适合移动端连续阅读。",
    supportedNarrativeForms: ["long_novel", "short_story"],
    officialVersion: 1,
    guidance: {
      long_novel: {
        positioning: "面向大众移动端读者，用清晰愿望、强处境和稳定回报建立追读。",
        planning: "开篇尽快给出异常或冲突；每章推进目标、阻力或得失；阶段节点必须有可见回报。",
        drafting: "语言直接顺畅，段落以一至四句为主；减少慢热说明，强化动作、选择、对话和章末牵引。",
        auditing: "重点检查开篇进入速度、主角主动性、有效信息增量、冲突/回报密度和移动端段落读感。",
        repairing: "优先压缩解释和同义反复，补足主角行动、局面变化与可感知回报，不改变既定事实。",
      },
      short_story: {
        positioning: "把完整网文体验压缩进一次阅读：快开场、强因果、连续升级、明确结局。",
        planning: "前五百字进入压力；每个内部片段都发生转折或得失；结尾完整兑现核心承诺。",
        drafting: "保持手机阅读短段落与自然对话，持续产生新信息、阻力、选择和回报，禁止梗概化。",
        auditing: "检查全文是否像完整网络小说而非文学小品，尤其检查开场钩子、推进密度和结尾兑现。",
        repairing: "局部补强事件与因果，删除空泛抒情和长说明，保留人工编辑内容与完整结局。",
      },
    },
  },
  qidian_male: {
    platform: "qidian_male",
    label: "起点男频",
    summary: "成长目标明确，能力、资源和局势持续变化，升级与伏笔兑现稳定。",
    supportedNarrativeForms: ["long_novel"],
    officialVersion: 1,
    guidance: {
      long_novel: {
        positioning: "围绕主角成长与世界探索建立可长期运转的故事引擎，让每阶段都有新目标和新上限。",
        planning: "明确能力、资源、身份或势力的成长刻度；挑战逐级升级；伏笔按 seed、touch、payoff 有序兑现。",
        drafting: "重视行动逻辑、规则可信度和解决问题的过程；爽点来自积累后的突破，不靠无铺垫碾压。",
        auditing: "检查成长净变化、规则一致性、资源账、挑战升级、伏笔责任和章末追读问题。",
        repairing: "优先补齐成长因果、代价和策略过程，修正战力或规则冲突，不凭空追加核心能力。",
      },
    },
  },
  jinjiang_female: {
    platform: "jinjiang_female",
    label: "晋江女频",
    summary: "人物关系与情绪因果清晰，角色声音鲜明，关系状态持续发生变化。",
    supportedNarrativeForms: ["long_novel"],
    officialVersion: 1,
    guidance: {
      long_novel: {
        positioning: "以鲜明人物、关系张力和情绪回报驱动追读，同时保证外部事件持续推进。",
        planning: "每章明确人物欲望、误解或立场差；关系变化必须由事件和选择触发，避免原地拉扯。",
        drafting: "保持角色声音差异，用动作、潜台词和具体细节呈现情绪；不以大段内心总结代替互动。",
        auditing: "检查人物动机、情绪因果、关系净变化、角色声音、边界感以及外部剧情推进。",
        repairing: "补足导致情绪与关系变化的事件链，减少强行误会和作者判词，保留人物尊严与既定事实。",
      },
    },
  },
  zhihu_story: {
    platform: "zhihu_story",
    label: "知乎短故事",
    summary: "高概念切入、信息差驱动、连续揭示，最终给出完整而有余味的结局。",
    supportedNarrativeForms: ["short_story"],
    officialVersion: 1,
    guidance: {
      short_story: {
        positioning: "用一句可传播的高概念和强处境抓住读者，以真相、选择或关系答案支撑一次读完。",
        planning: "开头直接交付异常与核心疑问；按信息差安排连续揭示；中后段反转必须回收前文线索。",
        drafting: "叙述清楚克制，第一人称或贴近主角的视角要有真实口吻；每段服务于推进、揭示或情绪升级。",
        auditing: "检查高概念是否迅速成立、信息是否按层揭示、反转是否公平、情绪是否有因果、结局是否回答核心疑问。",
        repairing: "优先调整信息顺序和伏笔回收，删除故弄玄虚与空泛议论，不用戛然而止冒充余味。",
      },
    },
  },
};

export const WRITING_PLATFORM_VALUES = Object.keys(OFFICIAL_WRITING_PLATFORM_PROFILES) as WritingPlatform[];

export function supportsWritingPlatformForm(platform: WritingPlatform, form: "short_story" | "long_novel"): boolean {
  return OFFICIAL_WRITING_PLATFORM_PROFILES[platform].supportedNarrativeForms.includes(form);
}

