import type {
  CharacterArcShape,
  CreativeOrientation,
  CreativeProfileStage,
  DialogueMode,
  Focalization,
  ImageryDensity,
  NarrativeDistance,
  NarrativeDrive,
  NarratorCommentary,
} from "@ai-novel/shared/types/creativeProfile";

/**
 * 创作取向指导的产品级文本片段。
 * 这里只放文本，由 modules/novel/creative-profile 按用户已保存的结构化选择确定性拼接；
 * 不在这里判断取向，也不反向依赖业务模块。
 */

export const CREATIVE_ORIENTATION_HEADINGS: Record<CreativeOrientation, string> = {
  web_serial: "创作取向：网文连载（用户明确选择）",
  modern_literary: "创作取向：现代文学（用户明确选择）",
  literary_genre: "创作取向：文学化类型小说（用户明确选择）",
};

export const CREATIVE_PROFILE_PRECEDENCE_RULE = [
  "优先级：事实、连续性与用户手写正文 > 用户明确选择的创作取向、叙事策略、写法与视角 > 本取向指导 > 题材与流派模式 > 平台写法。",
  "题材、流派或平台的默认要求与本取向冲突时，按本取向执行；需要取舍的地方写明理由，不把两套要求静默混合。",
].join("\n");

export const PLATFORM_DEFAULT_ROLE_TEXT =
  "平台写法：按所选平台的定位、节奏与回报要求执行，同时服从上面的叙事策略。";

export const PLATFORM_PRESENTATION_ONLY_TEXT =
  "平台写法：只作为段落长度、篇幅与发布呈现的参考；不得因平台要求强制加入升级、爽点、打脸或每章悬念钩子。";

export const INVALID_CREATIVE_PROFILE_NOTICE = [
  "本书的创作取向设置暂时无法读取。",
  "本次不要默认套用网文连载的升级、爽点或每章悬念钩子要求，也不要自行假定为文学取向；以已有章节、文风合同和用户输入为准，保持中性叙事。",
  "平台写法只作为段落长度、篇幅与发布呈现的参考。",
].join("\n");

export const ORIENTATION_STAGE_GUIDANCE: Record<CreativeOrientation, Record<CreativeProfileStage, string[]>> = {
  web_serial: {
    positioning: [
      "用清晰的主角愿望、可感知的处境压力和阶段回报建立追读；题材卖点在开篇几章内成立。",
    ],
    planning: [
      "每章推进目标、阻力或得失之一；阶段节点给出读者看得见的回报。",
      "章节收尾保持追读牵引，具体方式在叙事策略允许的范围内选择。",
    ],
    drafting: [
      "语言直接顺畅，以行动、选择和对话推进，减少慢热说明。",
      "章末留下继续阅读的理由，方式服从本章任务指定的收尾。",
    ],
    auditing: [
      "检查推进密度、主角主动性、回报是否兑现，以及章末牵引是否成立。",
    ],
    repairing: [
      "优先补足行动、局面变化与回报，压缩解释和同义反复，不改变既定事实。",
    ],
  },
  modern_literary: {
    positioning: [
      "读者从这本书得到的是对人物处境与关系的理解、情感的余波和主题的回声，不以升级或爽点作为卖点。",
      "作品成立靠人物处境真实、选择有分量、细节准确；开篇要尽早让读者感到人物身上的压力或缺口。",
    ],
    planning: [
      "每章至少让一项发生可辨认的变化：人物的认识、关系的距离、处境的压力或主题的一个侧面。变化可以很小，但要落在具体事件、动作或对话上。",
      "主题主要通过不同情境反复检验同一个问题来推进；叙述者议论是否使用、用到什么程度，服从用户选择的文风维度。",
      "允许慢场景，但慢场景要承担功能：铺垫关系、积压情绪，或埋下后文要回收的细节。",
      "章节收尾从叙事策略允许的方式中选；余韵和安静的转折同样是有效收尾，不默认要求每章悬念。",
    ],
    drafting: [
      "视角与叙事距离：服从本书人称与用户选择的聚焦方式。用户选了全知或轮换聚焦，就可以进入多个人物内心，只需让读者跟得上切换；未指定时，同一场景内聚焦保持稳定，切换要有叙事理由。",
      "节奏：快慢由场景功能决定。紧张处可以用短句和动作，内省处可以放慢，但每段都要让读者多知道一点或多感到一点。",
      "意象：优先选与人物经历相关的具体物象，在关键处复现并让意义发生变化；避免与人物和情绪无关的形容词堆叠。",
      "对白：按本书对白取向写；人物不必句句直说想要什么，回避、打岔和沉默也可以承载关系张力。",
      "心理、环境与议论段落都可以写，判断标准是叙事功能：揭示人物没说出口的判断、与对白形成反差、标记时间或处境变化、为后文埋下细节，或形成本书文体本身。有功能的段落保留，不必改写成动作。",
      "一致性：人物的说话方式、见识和时代用语前后一致；不模仿任何在世作家的个人风格，不套用固定句式模板。",
    ],
    auditing: [
      "检查本章是否让人物认识、关系、处境或主题至少一项发生可辨认的变化。",
      "按本书选择的聚焦方式、叙事距离、意象与对白取向检查一致性；心理、环境与议论段落只在缺少叙事功能时提出问题。",
      "收尾只按叙事策略允许的方式评判；不因缺少升级、爽点或悬念钩子扣分。",
    ],
    repairing: [
      "保留作者的视角、叙事距离和意象系统；优先修复变化不清、功能缺失的段落和与所选聚焦方式不符的越界。",
      "收尾在允许的方式内调整，不额外加章末悬念；不把有功能的内省、环境或议论段落机械改写为动作。",
    ],
  },
  literary_genre: {
    positioning: [
      "保留所选类型（如悬疑、家族、历史、科幻）的核心疑问与张力，让答案最终落在人物处境与选择上。",
      "张力主要来自信息、关系与代价；等级、资源或能力变化可以作为类型元素出现，但不默认按升级循环组织全书。",
    ],
    planning: [
      "类型线与人物线并行；每章至少推进一条：类型疑问的信息、人物关系的变化，或人物的选择与代价。",
      "揭示要公平，关键线索提前埋下；反转必须能被前文解释。",
      "收尾从叙事策略允许的方式中选；悬念可以用，但不是每章必需。",
    ],
    drafting: [
      "调查、对峙、危机等类型场面写清因果和信息，读者能跟上推理或局势。",
      "同时按本书选择的聚焦方式、叙事距离、意象与对白取向写作；心理、环境与议论段落按叙事功能取舍。",
      "反转要由前文铺垫支撑，不默认用打脸场面组织章节；不模仿任何在世作家的个人风格。",
    ],
    auditing: [
      "检查类型疑问是否持续成立、线索是否公平、人物动机是否可信。",
      "检查视角、意象与对白是否与本书文风一致；不因缺少升级或爽点扣分。",
    ],
    repairing: [
      "优先修正因果与线索的公平性，补足人物动机；保留文风与允许的收尾方式，不强行加钩子或反转。",
    ],
  },
};

export const NARRATIVE_DRIVE_GUIDANCE: Record<NarrativeDrive, string> = {
  event: "推进驱动：事件推进。用外部事件与目标得失组织章节，事件要改变人物的处境或逼出选择。",
  character: "推进驱动：人物推进。章节以人物的选择、犹豫与认识变化为轴，外部事件服务于逼出这些选择。",
  relationship: "推进驱动：关系推进。主线是人物之间距离、信任与立场的变化，每次变化都由具体事件或对话触发。",
  theme: "推进驱动：主题推进。让不同人物与情境反复检验同一个问题，读者的理解逐步加深；结论主要由情境呈现，议论的分寸服从本书文风。",
};

export const CHARACTER_ARC_GUIDANCE: Record<CharacterArcShape, string> = {
  growth: "人物弧线：成长。成长要付出看得见的代价，按阶段发生，不一蹴而就。",
  decline: "人物弧线：下落。每一步失去都有人物自己的选择参与，避免没有原因的命运式下坠。",
  recognition: "人物弧线：看清但未必改变。重点是人物认识的变化；行为可以保持原样，但要让读者感到这份认识的重量。",
  open: "人物弧线：开放。结局交代人物处境的变化，把最终判断留给读者。",
};

export function renderConflictScaleGuidance(labels: string[]): string {
  return `冲突层面：${labels.join("、")}。冲突主要在这些层面内加深；引入其他层面的对抗时，要说明它服务于这些层面。`;
}

/**
 * 文风维度：每项都是用户的偏好或许可，不承诺审美质量，也不触发额外重试。
 * 只渲染用户选了的项；未选的项不产生任何要求。
 */
export const FOCALIZATION_GUIDANCE: Record<Focalization, string> = {
  single_limited: "聚焦：单人聚焦。一个场景只写聚焦人物能看到、想到和知道的；换人聚焦放在分段或换场处。",
  rotating_limited: "聚焦：轮换聚焦。不同章节或段落可以跟随不同人物，切换处给出清楚的标记，同一段内不混用。",
  omniscient: "聚焦：全知叙述。可以进入多个人物内心，也可以交代人物不知道的事；切换要让读者跟得上，不因为全知就把所有秘密提前说破。",
};

export const NARRATIVE_DISTANCE_GUIDANCE: Record<NarrativeDistance, string> = {
  close: "叙事距离：贴近。叙述语气贴着人物的感受和用词，少用旁观者的概括。",
  medium: "叙事距离：适中。人物感受与场景、他人的交代交替出现。",
  distant: "叙事距离：疏离。克制呈现人物，用动作、物件和对话让情绪显形，少写直白的内心感受。",
  variable: "叙事距离：随情绪调整。关键时刻拉近，过渡和交代处拉远；每次远近变化有场景上的理由。",
};

export const IMAGERY_GUIDANCE: Record<ImageryDensity, string> = {
  restrained: "意象：克制。只在关键处用具体物象，平时以叙事为主。",
  recurring_motifs: "意象：反复出现的意象。沿用前文已经建立的物象，复现时让它的意义随情节有所变化，不要每次同样的用法。",
  rich: "意象：丰富。可以多写感官细节和景物，但每处细节都要连到人物的处境或情绪上。",
};

export const DIALOGUE_GUIDANCE: Record<DialogueMode, string> = {
  subtext: "对白：多潜台词。人物常常不直说，让回避、打岔、答非所问和沉默承载张力；叙述不替读者解释潜台词。",
  direct: "对白：直接。对话清楚表达立场和信息，用来推进；仍要符合人物身份与说话习惯。",
  sparse: "对白：少对话。以叙述为主，对话只出现在关键处，每句都要有分量。",
};

export const NARRATOR_COMMENTARY_GUIDANCE: Record<NarratorCommentary, string> = {
  minimal: "叙述者议论：少议论。很少直接评价，让事件和人物自己呈现意义。",
  functional: "叙述者议论：必要时议论。议论要推动理解、形成反讽或对照，不重复读者已经明白的事。",
  essayistic: "叙述者议论：随笔式议论。叙述者可以展开思考与评说，作为本书文体的一部分，但不能取代场景与人物行动。",
};

export function renderConsistencyNotes(notes: string): string {
  return `全书一致性约定（用户填写）：${notes}`;
}

export function renderChapterEndingGuidance(stage: CreativeProfileStage, labels: string[]): string {
  const list = labels.join("、");
  if (stage === "planning") {
    return `允许的章节收尾方式：${list}。每章从中选一种写进章节任务，不使用未列出的方式。`;
  }
  if (stage === "drafting") {
    return `章节收尾：按本章任务指定的方式；任务未指定时，从${list}中选最贴合本章的一种。`;
  }
  if (stage === "auditing") {
    return `章节收尾只按允许的方式评判：${list}。使用了其中任一方式且成立，就不因缺少其他收尾扣分。`;
  }
  if (stage === "repairing") {
    return `修文时收尾保持在允许的方式内：${list}。`;
  }
  return `允许的章节收尾方式：${list}。`;
}
