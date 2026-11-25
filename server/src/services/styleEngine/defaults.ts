import type {
  AntiAiRuleType,
  AntiAiSeverity,
  CharacterRules,
  LanguageRules,
  NarrativeRules,
  RhythmRules,
} from "@ai-novel/shared/types/styleEngine";

export interface DefaultTemplateDefinition {
  key: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  applicableGenres: string[];
  analysisMarkdown: string;
  narrativeRules: NarrativeRules;
  characterRules: CharacterRules;
  languageRules: LanguageRules;
  rhythmRules: RhythmRules;
  defaultAntiAiRuleKeys: string[];
}

export interface DefaultAntiAiRuleDefinition {
  key: string;
  name: string;
  type: AntiAiRuleType;
  severity: AntiAiSeverity;
  description: string;
  detectPatterns: string[];
  rewriteSuggestion: string;
  promptInstruction: string;
  autoRewrite: boolean;
  enabled: boolean;
  globalBaselineEnabled: boolean;
}

export interface DefaultStarterStyleProfileDefinition {
  key: string;
  templateKey: string;
  name: string;
  description: string;
}

export const DEFAULT_STYLE_TEMPLATES: DefaultTemplateDefinition[] = [
  {
    key: "bottom-loop-reality",
    name: "底层循环现实流",
    description: "通过碎片化生活与反复落空表现人物困境。",
    category: "现实流",
    tags: ["第一人称", "口语化", "碎片叙事"],
    applicableGenres: ["都市", "现实", "成长"],
    analysisMarkdown: "以时间推进和现实落差构成叙事张力，结尾不解决核心困境。",
    narrativeRules: {
      progressionMode: "time_sequence",
      sceneUnitPattern: ["行为", "落差", "自我合理化"],
      multiPov: false,
      looping: true,
      endingStyle: "unresolved",
      summary: "以碎片化生活推进，不做总括式回顾。",
    },
    characterRules: {
      allowSelfReflection: false,
      emotionExpression: "behavior_only",
      defenseMechanisms: ["嘴硬", "转移", "自我合理化"],
      facePriority: true,
      dialogueStyle: "short_colloquial",
      summary: "人物情绪通过动作和嘴硬表达。",
    },
    languageRules: {
      register: "colloquial",
      roughness: 0.8,
      allowIncompleteSentences: true,
      allowSwearing: true,
      sentenceVariation: "high",
      allowUselessDetails: true,
      voiceExemplars: [
        "房东把收据拍在桌上，指节敲了两下。“水电另算，少一分都不行。”我盯着那张褶皱的黄纸，喉咙发干，嘴上却顺口应了一句“行，明儿转账”。转身下楼，风从楼道豁口灌进来，兜里那张只剩两位数的银行卡硌得大腿生疼。我掏出烟盒抖了抖，空的。算了，省两块。",
      ],
      contrastPairs: [
        {
          aiPattern: "他感到一种深深的无力感涌上心头，意识到生活总是如此艰难。",
          preferred: "他盯着手里的空烟盒看了两秒，顺手捏扁，塞回裤兜。",
        },
        {
          aiPattern: "在现实的重压下，每个普通人都在咬牙前行，或许这就是人生的底色。",
          preferred: "楼下早点摊刚支起锅，他摸了摸兜里剩下的硬币，拐进了巷子另一头。",
        },
      ],
      summary: "语言粗粝、口语化，允许生活杂音。",
    },
    rhythmRules: {
      pace: "medium_fast",
      paragraphDensity: "high",
      allowFragmentedFlow: true,
      actionOverExplanation: true,
      summary: "段落密实，动作先于解释。",
    },
    defaultAntiAiRuleKeys: [
      "forbid-explicit-psychology",
      "forbid-ending-elevation",
      "encourage-useless-action",
      "encourage-reality-gap",
      "encourage-hard-mouth-compensation",
    ],
  },
  {
    key: "power-up-escalation",
    name: "爽文递进推进流",
    description: "持续升级冲突和收益点，强化目标推进与爽点兑现。",
    category: "爽文流",
    tags: ["推进感", "收益点", "冲突升级"],
    applicableGenres: ["都市", "玄幻", "热血"],
    analysisMarkdown: "每段都要有目标推进或爽点兑现，保持明确因果和节奏抬升。",
    narrativeRules: {
      progressionMode: "goal_driven",
      sceneUnitPattern: ["目标", "阻碍", "压制", "反转收益"],
      multiPov: false,
      looping: false,
      endingStyle: "hook",
      summary: "围绕目标推进，尽快兑现局部收益。",
    },
    characterRules: {
      allowSelfReflection: true,
      emotionExpression: "dialogue_and_action",
      defenseMechanisms: [],
      facePriority: false,
      dialogueStyle: "direct",
      summary: "角色表达直接，情绪跟随胜负切换。",
    },
    languageRules: {
      register: "direct",
      roughness: 0.55,
      allowIncompleteSentences: false,
      allowSwearing: false,
      sentenceVariation: "medium",
      allowUselessDetails: false,
      voiceExemplars: [
        "账本摔在青石案上，茶盏震出一圈水渍。“三成利？你在打发要饭的。”对面管事脸色一僵，刚要开口打圆场，他已抬手按下印泥，直接推过去。“要么今晚签字，要么明天换人坐这把椅子。我赶时间。”",
      ],
      contrastPairs: [
        {
          aiPattern: "面对对方的挑衅，他眼神一冷，嘴角勾起一抹不屑的弧度，心中暗道此人不知天高地厚。",
          preferred: "他把茶杯搁下，杯底磕在木面上一声脆响。“说完了？把欠条拿出来。”",
        },
        {
          aiPattern: "这一刻，局势彻底发生了逆转，众人都为他的果决感到震撼。",
          preferred: "堂里一时没人接话，几个原先站着起哄的管事往后退了半步。",
        },
      ],
      summary: "句式清晰，减少无效分散信息。",
    },
    rhythmRules: {
      pace: "fast",
      paragraphDensity: "medium",
      allowFragmentedFlow: false,
      actionOverExplanation: true,
      summary: "优先冲突和结果，少停留。",
    },
    defaultAntiAiRuleKeys: [
      "forbid-theme-summary",
      "risk-dialogue-too-functional",
      "risk-three-paragraphs-exposition",
    ],
  },
  {
    key: "suspense-pressure",
    name: "悬疑压迫递增流",
    description: "通过信息遮蔽、细节异常和压力叠加制造不安感。",
    category: "悬疑流",
    tags: ["压迫感", "信息差", "异常细节"],
    applicableGenres: ["悬疑", "惊悚", "现实"],
    analysisMarkdown: "以异常细节、信息差和节奏收束推动悬念层层加压。",
    narrativeRules: {
      progressionMode: "mystery_escalation",
      sceneUnitPattern: ["现场细节", "异常", "误判", "新风险"],
      multiPov: false,
      looping: false,
      endingStyle: "suspense",
      summary: "优先制造信息缺口和压迫氛围。",
    },
    characterRules: {
      allowSelfReflection: true,
      emotionExpression: "reaction_only",
      defenseMechanisms: ["压抑"],
      facePriority: false,
      dialogueStyle: "restrained",
      summary: "角色反应克制，恐惧通过反应显现。",
    },
    languageRules: {
      register: "restrained",
      roughness: 0.45,
      allowIncompleteSentences: true,
      allowSwearing: false,
      sentenceVariation: "medium_high",
      allowUselessDetails: true,
      voiceExemplars: [
        "门锁没有被撬的痕迹。门框内侧却多了一道新鲜的灰印，指宽，斜着向下。他没有立刻推门，先退后半步，听走廊尽头的电梯声。电梯停在七楼，门开了，没人出来。",
      ],
      contrastPairs: [
        {
          aiPattern: "一股寒意瞬间袭上他的脊背，他意识到事情远没有表面上那么简单。",
          preferred: "他停住手，把钥匙重新插回兜里，盯紧了门缝底下的那道影子。",
        },
        {
          aiPattern: "空气仿佛在这一刻凝固了，一种难以言喻的压迫感笼罩着整个房间。",
          preferred: "墙上的挂钟走了一格。啪嗒。声音在空屋里响得刺耳。",
        },
      ],
      summary: "细节精确，保留少量噪音增强现场感。",
    },
    rhythmRules: {
      pace: "medium",
      paragraphDensity: "medium_high",
      allowFragmentedFlow: true,
      actionOverExplanation: true,
      summary: "通过节奏收束和信息延迟制造压力。",
    },
    defaultAntiAiRuleKeys: [
      "forbid-explicit-psychology",
      "forbid-theme-summary",
      "risk-even-paragraph-length",
      "encourage-reality-gap",
    ],
  },
  {
    key: "emotional-tension",
    name: "情绪拉扯流",
    description: "通过错位表达、停顿和误读制造关系张力。",
    category: "情感流",
    tags: ["误读", "拉扯", "停顿感"],
    applicableGenres: ["言情", "都市", "群像"],
    analysisMarkdown: "人物不直说核心情绪，靠误读、停顿和反应推动关系变化。",
    narrativeRules: {
      progressionMode: "relationship_push_pull",
      sceneUnitPattern: ["动作", "言外之意", "误读", "回避"],
      multiPov: false,
      looping: false,
      endingStyle: "emotional_hook",
      summary: "以关系错位推进，而非直接说明。",
    },
    characterRules: {
      allowSelfReflection: true,
      emotionExpression: "subtext",
      defenseMechanisms: ["回避", "试探", "嘴硬"],
      facePriority: true,
      dialogueStyle: "subtext_heavy",
      summary: "情绪通过停顿、动作和言外之意体现。",
    },
    languageRules: {
      register: "natural",
      roughness: 0.35,
      allowIncompleteSentences: true,
      allowSwearing: false,
      sentenceVariation: "high",
      allowUselessDetails: true,
      voiceExemplars: [
        "杯里的冰化了一半，碰着玻璃壁轻轻响。她把吸管转了两圈，没看他：“那天雨挺大的，我打车回去，手机还差点落车上。”他“嗯”了一声，把桌角那包没拆封的纸巾往她手边推近两寸，停住。“后来找着了？”“找着了。司机顺路送回来的。”两人都没提那通没接通的电话。",
      ],
      contrastPairs: [
        {
          aiPattern: "她心里五味杂陈，既想质问对方，又害怕听到令人失望的答案。",
          preferred: "她捏着温掉的纸杯，话到嘴边又咽了回去，只问了句：“几点走？”",
        },
        {
          aiPattern: "两人之间的气氛微妙而复杂，过去的种种回忆在此时悄然浮现。",
          preferred: "她低头理了理袖口，避开他伸手去拿账单的那一秒。",
        },
      ],
      summary: "语言自然，允许留白与停顿。",
    },
    rhythmRules: {
      pace: "medium_slow",
      paragraphDensity: "medium",
      allowFragmentedFlow: true,
      actionOverExplanation: false,
      summary: "给关系反应留空间，但避免空洞抒情。",
    },
    defaultAntiAiRuleKeys: [
      "forbid-direct-preaching",
      "forbid-ending-elevation",
      "risk-dialogue-too-functional",
      "encourage-useless-action",
    ],
  },
  {
    key: "ensemble-weave",
    name: "群像交织流",
    description: "以多人行动线和视角差异交织推进事件。",
    category: "群像流",
    tags: ["多角色", "交织", "信息流动"],
    applicableGenres: ["群像", "都市", "悬疑"],
    analysisMarkdown: "多角色并行推进，但每个角色的表达和认知范围必须区分清楚。",
    narrativeRules: {
      progressionMode: "multi_thread",
      sceneUnitPattern: ["角色动作", "局部信息", "交叉影响"],
      multiPov: true,
      looping: false,
      endingStyle: "cross_hook",
      povSwitchStyle: "controlled",
      summary: "多线并进，但视角切换要受控。",
    },
    characterRules: {
      allowSelfReflection: true,
      emotionExpression: "mixed",
      defenseMechanisms: [],
      facePriority: false,
      dialogueStyle: "distinct_by_role",
      summary: "不同角色口吻必须拉开差异。",
    },
    languageRules: {
      register: "flexible",
      roughness: 0.45,
      allowIncompleteSentences: true,
      allowSwearing: false,
      sentenceVariation: "high",
      allowUselessDetails: false,
      voiceExemplars: [
        "“名单我看过了，少两个人。”老周把文件夹合上，指腹压住封面边角，说话慢得像在掂分量。旁边年轻同事刚张嘴想接一句“要不我再去核一遍”，门外就传来皮鞋踩过瓷砖的急响。新来的副手连门都没敲全，探半个身子进来：“账目对不上了，东区那笔刚才撤了。”",
      ],
      contrastPairs: [
        {
          aiPattern: "每个人心中都有自己的算盘，多方势力的博弈正在悄然展开。",
          preferred: "老周没接话，先把桌上的签字笔扣上帽；对面的副手却把茶盖掀开又合上，水汽都没散。",
        },
        {
          aiPattern: "他们各自带着不同的目的，却又不得不在这件事上达成短暂的共识。",
          preferred: "“先报数。”老周看表。“报完这轮，各走各的线。”",
        },
      ],
      summary: "保持角色差异，避免所有人说话一样。",
    },
    rhythmRules: {
      pace: "balanced",
      paragraphDensity: "medium",
      allowFragmentedFlow: false,
      actionOverExplanation: true,
      summary: "多线交织但节奏不乱。",
    },
    defaultAntiAiRuleKeys: [
      "risk-dialogue-too-functional",
      "risk-repeated-sentence-structure",
      "forbid-theme-summary",
    ],
  },
  {
    key: "immersive-daily",
    name: "日常浸没流",
    description: "通过生活细节和细微情绪变化建立持续沉浸感。",
    category: "日常流",
    tags: ["生活感", "沉浸", "细碎细节"],
    applicableGenres: ["日常", "治愈", "都市"],
    analysisMarkdown: "允许保留生活性动作和无效信息，但核心情绪仍要通过场景自然流出。",
    narrativeRules: {
      progressionMode: "scene_immersion",
      sceneUnitPattern: ["动作", "环境", "关系反应"],
      multiPov: false,
      looping: false,
      endingStyle: "soft_open",
      summary: "重场景体验和关系温度。",
    },
    characterRules: {
      allowSelfReflection: true,
      emotionExpression: "light_behavior",
      defenseMechanisms: [],
      facePriority: false,
      dialogueStyle: "daily_natural",
      summary: "人物表达自然，不用高强度戏剧句。",
    },
    languageRules: {
      register: "colloquial",
      roughness: 0.25,
      allowIncompleteSentences: true,
      allowSwearing: false,
      sentenceVariation: "medium_high",
      allowUselessDetails: true,
      voiceExemplars: [
        "电饭煲跳闸那声响的时候，他正蹲在阳台剪枯掉的绿萝叶子。水龙头没拧紧，嘀嗒嘀嗒砸在不锈钢盆底。门口钥匙转了两圈，门开了，带进来一股外头炒菜的油烟味。“今晚买着排骨了，就是贵了两块。”鞋柜门啪地合上，塑料袋窸窣响成一团。",
      ],
      contrastPairs: [
        {
          aiPattern: "在这个充满烟火气的傍晚，他感受到了久违的温暖与宁静。",
          preferred: "他把剪刀搁回窗台，顺手接过她手里的塑料袋，腾出左肘把门掩上。",
        },
        {
          aiPattern: "平淡的日常里往往藏着最动人的陪伴，这就是生活温柔的模样。",
          preferred: "锅里水滚了，白气冒出来，把厨房玻璃蒙上一层雾。",
        },
      ],
      summary: "保留生活细节和杂音，不追求工整。",
    },
    rhythmRules: {
      pace: "slow",
      paragraphDensity: "medium",
      allowFragmentedFlow: true,
      actionOverExplanation: false,
      summary: "慢节奏沉浸，但避免空转。",
    },
    defaultAntiAiRuleKeys: [
      "forbid-ending-elevation",
      "risk-even-paragraph-length",
      "encourage-useless-action",
    ],
  },
  {
    key: "cold-professional",
    name: "冷峻专业流",
    description: "以专业事实和行业细节压住情绪，形成克制压力感。",
    category: "专业流",
    tags: ["专业细节", "克制", "事实压情绪"],
    applicableGenres: ["职场", "现实", "悬疑"],
    analysisMarkdown: "行业事实和程序细节优先，情绪不直说，信息密度高于抒情密度。",
    narrativeRules: {
      progressionMode: "fact_driven",
      sceneUnitPattern: ["事实", "动作", "专业判断", "后果"],
      multiPov: false,
      looping: false,
      endingStyle: "pressure_continue",
      summary: "让专业事实承担叙事重量。",
    },
    characterRules: {
      allowSelfReflection: false,
      emotionExpression: "suppressed",
      defenseMechanisms: ["克制"],
      facePriority: false,
      dialogueStyle: "informational",
      summary: "情绪藏在专业动作和事实选择里。",
    },
    languageRules: {
      register: "professional",
      roughness: 0.2,
      allowIncompleteSentences: false,
      allowSwearing: false,
      sentenceVariation: "medium",
      allowUselessDetails: false,
      voiceExemplars: [
        "复核表第三栏的数字与入库单差了四百三十公斤。她没抬头，用红笔在日期下方划了一道横线，调出上月同批次的称重回执。“过磅记录是十七点零四分，门禁卡刷卡时间是十七点二十二分。”她把两页纸并排推到窗前，“中间这十八分钟，车停在B区盲区。”",
      ],
      contrastPairs: [
        {
          aiPattern: "她敏锐地察觉到了数据背后的猫腻，心中不禁生出一丝警惕。",
          preferred: "她用红笔圈出时间戳差值，把回执另存了一份本地副本。",
        },
        {
          aiPattern: "在利益与原则的碰撞面前，职业操守终将经受最严峻的考验。",
          preferred: "“把原始称重日志导出来，别走内网共享。”她合上笔记本。",
        },
      ],
      summary: "术语和事实优先，避免廉价金句。",
    },
    rhythmRules: {
      pace: "balanced",
      paragraphDensity: "medium_high",
      allowFragmentedFlow: false,
      actionOverExplanation: true,
      summary: "信息密度高，但不铺张解释。",
    },
    defaultAntiAiRuleKeys: [
      "forbid-direct-preaching",
      "forbid-theme-summary",
      "risk-repeated-sentence-structure",
    ],
  },
  {
    key: "absurd-dark-humor",
    name: "荒诞黑色幽默流",
    description: "通过反差、冷感观察和荒诞细节制造黑色幽默。",
    category: "黑色幽默",
    tags: ["荒诞", "反差", "冷感"],
    applicableGenres: ["都市", "黑色幽默", "现实"],
    analysisMarkdown: "用反差和荒诞细节放大现实困境，笑点和压迫感同时存在。",
    narrativeRules: {
      progressionMode: "contrast_driven",
      sceneUnitPattern: ["现实细节", "荒诞偏差", "冷反应"],
      multiPov: false,
      looping: false,
      endingStyle: "bitter_aftertaste",
      summary: "依赖反差和冷感观察，而非热闹吐槽。",
    },
    characterRules: {
      allowSelfReflection: false,
      emotionExpression: "deadpan",
      defenseMechanisms: ["自嘲", "转移"],
      facePriority: true,
      dialogueStyle: "deadpan_colloquial",
      summary: "情绪藏在冷反应和嘴硬里。",
    },
    languageRules: {
      register: "colloquial",
      roughness: 0.5,
      allowIncompleteSentences: true,
      allowSwearing: true,
      sentenceVariation: "high",
      allowUselessDetails: true,
      voiceExemplars: [
        "公司裁员通知书印得倒是挺讲究，哑光铜版纸，边角还压了暗纹。他捧着那张比自己上个月绩效表还精致的纸，在走廊垃圾桶旁边站了五秒，突然想起上面还有自己的工号。“能带走吗？”人事点点头：“纪念品随便。”于是他叠成豆腐块塞进了衬衫口袋，顺便从茶水间多拿了两包速溶咖啡。",
      ],
      contrastPairs: [
        {
          aiPattern: "这荒诞的一幕让他哭笑不得，命运似乎总爱和人开这样的玩笑。",
          preferred: "他把通知书折了两次，正好垫在晃荡的桌腿底下，桌板总算不响了。",
        },
        {
          aiPattern: "在冷冰冰的现实面前，小人物的自嘲显得格外心酸而无奈。",
          preferred: "“行吧，至少没扣我饮水机押金。”他顺手把工牌翻了个面。",
        },
      ],
      summary: "允许夹带荒诞杂质和冷幽默节奏。",
    },
    rhythmRules: {
      pace: "balanced",
      paragraphDensity: "medium_high",
      allowFragmentedFlow: true,
      actionOverExplanation: true,
      summary: "反差点要快落地，不要解释笑点。",
    },
    defaultAntiAiRuleKeys: [
      "forbid-explicit-psychology",
      "forbid-ending-elevation",
      "encourage-reality-gap",
      "encourage-hard-mouth-compensation",
    ],
  },
];

export const DEFAULT_STARTER_STYLE_PROFILES: DefaultStarterStyleProfileDefinition[] = [
  {
    key: "starter-power-up",
    templateKey: "power-up-escalation",
    name: "我的默认爽文推进写法",
    description: "适合第一次开书先跑顺目标推进、爽点兑现和章节收益点，后续可以直接在此基础上微调。",
  },
  {
    key: "starter-suspense",
    templateKey: "suspense-pressure",
    name: "我的默认悬疑压迫写法",
    description: "适合异常、规则、调查和危险逼近类故事，先帮你把压迫感和信息差稳住。",
  },
  {
    key: "starter-emotional",
    templateKey: "emotional-tension",
    name: "我的默认情绪拉扯写法",
    description: "适合关系推进、误读拉扯和情绪兑现类故事，先有一套能直接开写的关系型表达底座。",
  },
  {
    key: "starter-daily",
    templateKey: "immersive-daily",
    name: "我的默认日常浸没写法",
    description: "适合治愈、陪伴、生活经营和轻缓成长类故事，优先保证生活感和沉浸感。",
  },
];

export const DEFAULT_ANTI_AI_RULES: DefaultAntiAiRuleDefinition[] = [
  {
    key: "forbid-explicit-psychology",
    name: "禁止解释型心理描写",
    type: "forbidden",
    severity: "high",
    description: "禁止直接使用“他感到”“他意识到”等句式解释人物心理。",
    detectPatterns: ["他感到", "她感到", "他意识到", "她意识到", "他明白了", "她明白了"],
    rewriteSuggestion: "把心理解释改成动作、语气、停顿、环境反应或结果。",
    promptInstruction: "禁止直接解释人物心理，人物状态必须通过行为、动作、语气或环境反应体现。",
    autoRewrite: true,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "forbid-ending-elevation",
    name: "禁止段尾升华",
    type: "forbidden",
    severity: "high",
    description: "禁止在段尾或收尾处用总结句升华主题。",
    detectPatterns: ["生活就是", "命运总会", "归根结底", "说到底", "这就是"],
    rewriteSuggestion: "删除升华句，回到具体动作、现场或悬而未决的处境。",
    promptInstruction: "禁止段尾升华或总结主题，收尾必须落回具体情境。",
    autoRewrite: true,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "forbid-theme-summary",
    name: "禁止总结主题",
    type: "forbidden",
    severity: "high",
    description: "禁止把段落写成总结中心思想或提炼人生道理。",
    detectPatterns: ["这说明", "这意味着", "归根结底", "其实就是"],
    rewriteSuggestion: "删掉主题总结，让信息通过事件和结果自然显现。",
    promptInstruction: "不要总结主题，不要替读者提炼中心思想。",
    autoRewrite: true,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "forbid-direct-preaching",
    name: "禁止直接说教",
    type: "forbidden",
    severity: "medium",
    description: "禁止作者替角色或读者做直接价值判断和说教。",
    detectPatterns: ["我们都应该", "人总要学会", "真正重要的是"],
    rewriteSuggestion: "改成角色具体处境或对话，不做抽象说教。",
    promptInstruction: "禁止直接说教或价值判断，让意义落在事件本身。",
    autoRewrite: true,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "risk-even-paragraph-length",
    name: "段落长度过于整齐",
    type: "risk",
    severity: "medium",
    description: "段落长度和节奏过于平均，容易产生 AI 作文感。",
    detectPatterns: ["段落整齐", "节奏平均"],
    rewriteSuggestion: "打破段落长度均衡，让句子和段落有自然起伏。",
    promptInstruction: "注意避免每段都过于工整、平均和像标准作文。",
    autoRewrite: false,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "risk-three-paragraphs-exposition",
    name: "连续三段解释性叙事",
    type: "risk",
    severity: "high",
    description: "连续几段只有解释没有动作，会削弱现场感。",
    detectPatterns: ["连续解释", "没有动作"],
    rewriteSuggestion: "插入动作、对话、环境反馈，减少连段说明。",
    promptInstruction: "注意避免连续几段只有解释没有动作或对话。",
    autoRewrite: false,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "risk-dialogue-too-functional",
    name: "对话纯功能推进",
    type: "risk",
    severity: "medium",
    description: "对话只有信息推进，没有人物语气和生活噪音。",
    detectPatterns: ["告诉你", "我们现在要", "接下来就"],
    rewriteSuggestion: "补入停顿、绕弯、语气差异和无效信息。",
    promptInstruction: "对话不要只承担推进剧情功能，要保留人物语气和生活噪音。",
    autoRewrite: false,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "risk-repeated-sentence-structure",
    name: "句式重复率过高",
    type: "risk",
    severity: "medium",
    description: "连续句式过于整齐，容易显得机械。",
    detectPatterns: ["首先", "然后", "接着", "最后"],
    rewriteSuggestion: "拉开句式长度和起句方式，打散结构。",
    promptInstruction: "警惕连续句式重复和排比化表达。",
    autoRewrite: false,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "encourage-useless-action",
    name: "鼓励无意义小动作",
    type: "encourage",
    severity: "low",
    description: "鼓励加入真实但不推动主线的小动作增强人味。",
    detectPatterns: [],
    rewriteSuggestion: "补入挠头、点烟、抠包装、挪椅子等小动作。",
    promptInstruction: "优先加入真实但不推动主线的小动作，增加生活感。",
    autoRewrite: false,
    enabled: true,
    globalBaselineEnabled: false,
  },
  {
    key: "encourage-reality-gap",
    name: "鼓励现实落差",
    type: "encourage",
    severity: "low",
    description: "让人物预期和现实结果之间出现落差。",
    detectPatterns: [],
    rewriteSuggestion: "补出人物预期与实际结果之间的差距。",
    promptInstruction: "优先制造现实落差，让人物预期和结果不完全一致。",
    autoRewrite: false,
    enabled: true,
    globalBaselineEnabled: false,
  },
  {
    key: "encourage-hard-mouth-compensation",
    name: "鼓励嘴硬补偿",
    type: "encourage",
    severity: "low",
    description: "人物吃瘪后用嘴硬、转移或找补来维持体面。",
    detectPatterns: [],
    rewriteSuggestion: "给角色补一句嘴硬找补或自我合理化。",
    promptInstruction: "人物吃瘪后可用嘴硬、转移或找补来补偿体面。",
    autoRewrite: false,
    enabled: true,
    globalBaselineEnabled: false,
  },
  {
    key: "encourage-life-noise",
    name: "鼓励生活噪音",
    type: "encourage",
    severity: "low",
    description: "适当加入与主线不完全相关的生活噪音增加现场感。",
    detectPatterns: [],
    rewriteSuggestion: "补入环境声、杂音、小打断或生活性信息。",
    promptInstruction: "适当保留生活噪音和无效信息，增强现场感。",
    autoRewrite: false,
    enabled: true,
    globalBaselineEnabled: false,
  },
];
