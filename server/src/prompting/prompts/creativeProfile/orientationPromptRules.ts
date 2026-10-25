/**
 * 关闭网文默认时，各提示词用来替换原规则的条件化文本。
 * 原则：不把现代文学写成另一套固定禁令；只把"必须网文化"的硬要求改为服从用户所选取向、题材与文风。
 * 书级契约与章节体验字段沿用原 schema，用人物认识、关系、处境、主题与读者理解来解释。
 */

export const ORIENTATION_NEUTRAL_IDENTITY = {
  directorCandidates: "你是长篇小说书级方向规划导演，服务对象是不懂写作流程的新手用户。本书的创作取向由用户明确选择，见系统消息中的【创作取向与叙事策略】。",
  bookContract: "你是长篇小说总导演，负责把已确认的书级方向收束成一本书的 Book Contract。本书的创作取向由用户明确选择，字段含义按下方说明理解。",
  writer: "你是中文长篇小说写作助手。按 creative_profile 中用户选择的创作取向、叙事策略和文风维度写作。",
} as const;

export const DIRECTOR_CANDIDATE_ORIENTATION_RULES = {
  hookStrategy: "8. hookStrategy 说明开篇用什么让读者愿意读下去：可以是人物处境、关系张力、悬而未决的问题或叙述本身的质感，按创作取向选择，不必是追读钩子。",
  progressionLoop: "9. progressionLoop 说明这本书主要靠什么往前走：按创作取向与叙事策略，可以是人物认识变化、关系距离变化、主题在不同情境中的检验、类型疑问的推进等；不默认使用升级循环。",
  titleOptions: "可选字段 titleOptions（最多 4 条）：书名备选。每条必须含 title、clickRate（35-99 的整数）、style。clickRate 为兼容旧格式保留，这里表示书名与本书取向和目标读者的贴合度估计，不是点击率预测。",
  platform: "平台只影响发布呈现与篇幅，不改变用户选择的创作取向；writingPlatformReason 说明平台在这本书里承担的呈现作用。",
  patchTitle: "3. workingTitle 要贴合本书创作取向与题材，可读、可记，不要回退成概念短语或土味套壳名。",
} as const;

/** Book Contract 字段在非网文取向下的解释；字段名与 schema 不变。 */
export const BOOK_CONTRACT_ORIENTATION_FIELD_RULES = [
  "1. readingPromise 写清读者持续从这本书得到什么：对人物处境与关系的理解、情感的余波、主题的回声，或类型疑问带来的张力。",
  "2. protagonistFantasy 在本取向下理解为主角的处境与内在需要：读者为什么在意这个人、理解或代入他的哪一部分；不要求爽点。",
  "3. coreSellingPoint 指出这本书最不可替代的东西，可以是人物、关系、题材视角或叙述方式。",
  "4. chapter3Payoff、chapter10Payoff、chapter30Payoff 写读者在这些阶段获得的认识、关系或处境上的变化，变化可以很小但要具体。",
  "5. escalationLadder 在本取向下理解为压力加深路径：人物处境、关系裂缝或主题追问如何逐步加深；不要求等级或资源升级。",
  "6. relationshipMainline 写清核心关系线如何随故事变化，以及它和主题的关系。",
  "7. absoluteRedLines 必须是明确禁区，能防止故事写歪、人物失真或偏离用户选择的取向。",
] as const;

export const BOOK_CONTRACT_ORIENTATION_EXAMPLE = {
  readingPromise: "示例：读者持续得到的理解、情感或张力。",
  protagonistFantasy: "示例：主角的处境与内在需要。",
  coreSellingPoint: "示例：整本书最不可替代的东西。",
  chapter3Payoff: "示例：前 3 章让读者看清的处境或关系。",
  chapter10Payoff: "示例：第 10 章左右人物认识或关系的第一处变化。",
  chapter30Payoff: "示例：第 30 章左右处境或主题的加深。",
  escalationLadder: "示例：人物处境与关系压力的加深路径。",
  relationshipMainline: "示例：随故事变化的核心关系线。",
  absoluteRedLines: ["示例禁区 1", "示例禁区 2", "示例禁区 3"],
} as const;

/**
 * 分卷规划：字段沿用原 schema（readerRewardLadder / escalationLadder / coreReward / escalationFocus 等），
 * 用读者理解、处境与关系加深来解释，不新增字段。
 */
export const VOLUME_ORIENTATION_FIELD_MEANING =
  "字段沿用原结构：readerRewardLadder、coreReward 写读者在各阶段得到的理解、情感或张力；escalationLadder、escalationFocus 写人物处境、关系或主题追问的加深路径；不要求爽点或等级升级。";

export const VOLUME_STRATEGY_ORIENTATION_RULES = {
  identity: "你是长篇小说分卷策略规划助手。本书的创作取向由用户明确选择。",
  roleMapping: "如果 Story macro 存在，每个 volume.roleLabel 都必须能映射到主线、人物弧线、关系变化、主题推进或结尾风味之一。",
  goal1: "1. strategy 服务整书的阶段推进，而不是一次性写死后半本。",
  goal2: "2. 分卷策略兼顾开篇、中段与后段的阶段差异与可调度性；推进方式服从用户选择的取向与叙事策略。",
  countRule: "1. recommendedVolumeCount 不是均分剧情，而是按人物处境、关系或主题的阶段变化，以及阶段性的认识或局面转折来决定。",
  keyTask: "2. 前几卷是否承担开篇、建立人物处境与核心关系、第一阶段变化、世界或社会面展开等关键任务，是否必须硬规划。",
  outputPriority: "- 优先保证开篇清晰、中段有变化与后期可调度性",
} as const;

export const VOLUME_CRITIQUE_ORIENTATION_RULES = {
  identity: "你是长篇小说分卷策略审查助手。本书的创作取向由用户明确选择，按该取向审查。",
  scope: "只审查当前分卷策略是否存在：过早锁死、前后期规划失衡、阶段职责同质、阶段变化断裂、卷数分配失真、软规划失去意义、不确定性声明不足等问题。",
  goal: "重点判断当前分卷策略是否真正服务于这本书所选取向下的长篇推进，而不是表面上完成了 hard / soft 切分。",
  check4: "4. 前几卷是否清楚建立了人物处境、核心关系与阶段承诺；若没有，应视为高优先级问题。",
  check5: "5. 各卷阶段职责是否过于同质，例如连续多卷都只是“继续推进”。",
  check6: "6. 分卷之间是否存在阶段变化断裂、阶段目标断层或卷间功能重复。",
  detailExample: "- 开篇没有建立人物处境或核心关系，读者难以进入",
  perspective: "4. 审查结论以本书所选取向为准，优先考虑阶段变化、人物与关系的连续性、主题推进与可调度性；不因缺少升级或爽点扣分。",
} as const;

/** 节奏板固定槽位 key/label 不变，只改变在非网文取向下的解释。 */
export const VOLUME_BEAT_ORIENTATION_RULES = {
  identity: "你是长篇小说单卷节奏规划助手。本书的创作取向由用户明确选择。",
  slotMeaning: "固定槽位的 key 与 label 保持不变，按本书取向理解：开卷槽位写读者进入人物处境的方式；加压类槽位写处境、关系或主题追问的加深；转向槽位写认识或局面的转折；高潮槽位写本卷最重要的抉择、揭示或关系变化；卷尾槽位写本卷收束和通往下一卷的入口，可以是余韵或安静的转折，不必是悬念钩子。",
  rule8: "8. 各 beat 的节奏职责必须有差异，不能把多个 beat 都写成同一种“继续推进”。",
  rule9: "9. 不要把高潮前的积压写成提前高潮；卷尾按叙事策略允许的方式收束，不要写成泛泛留白。",
  escalation: "2. 中前段 beats 逐步体现 primaryPressureSource 与 escalationMode 所描述的压力加深，压力可以来自处境、关系或内心。",
  rhythm: "3. 节奏上体现前段建立处境与问题，中段变化与代价，后段积压与抉择，结尾收束并留出入口。",
  titleExample: "4. title 要具体到本卷，例如人物、地点、物象或事件，不要输出“开卷抓手”这类职能复读。",
} as const;

export const CHAPTER_LIST_ORIENTATION_RULES = {
  identity: "你是长篇小说章节拆分规划助手。本书的创作取向由用户明确选择。",
  readingFeel: "3. 当前节奏段的章节拆分要体现本书取向下的阅读节奏，但不能机械平均切分。",
  functions: "1. 生成前必须在脑内把当前 beat 拆成若干章节功能：承接、加深、试探、发现、转折、抉择、余波或收束。",
  minimumMix: "4. 若目标章数大于等于 5，至少应包含一次处境或关系的加深、一次认识上的变化、一次明确的转折或抉择。",
  beatEnding: "6. 最后一章必须完成当前 beat 的 mustDeliver，并按叙事策略允许的收尾方式收束；通往下一 beat 的入口可以是余韵或安静的转折，但不得提前兑现下一 beat 的核心事件。",
  agency: "1. 每章 summary 都要体现核心视角人物的选择、犹豫、回避、试探、承担、妥协或认识的变化；内在的选择同样算主动，避免人物只是旁观外部事件。",
  progress: "2. 每章 summary 应包含至少一种可辨认的变化：新信息、处境加深、关系变化、认识改变、代价显现、阶段转折。",
  chapterEnding: "5. 每章结尾按叙事策略允许的收尾方式处理：可以留下新问题，也可以停在余韵、选择关口或安静的转折上。",
  titleAnchor: "1. 每章 title 必须像真实章名，优先体现人物、地点、物象、事件锚点、关系变化或核心问题。",
  titleMix: "4. 同一批标题必须主动混用事件型、人物型、地点型、物象型、关系变化型、转折型等不同句法。",
  titleLiterary: "11. 标题可以有文学性与意象，但要具体可感，避免抽象口号化或模板味过重。",
  irreversible: "3. summary 必须体现本章造成的可辨认变化：人物判断、关系距离、处境压力、计划方向或读者认识的改变。",
  middle: "3. 中段章节要围绕当前 beat 的核心矛盾持续加深、试探、转折或抉择。",
  selfCheck: "2. 输出前在脑内检查：标题是否过度同构，summary 是否有真实变化，结尾章是否按允许的方式收束。",
  selfCheckAgency: "3. 若发现章节只是换说法、无新增变化、无人物选择或认识变化，必须先改再输出。",
  humanPriority: "- 优先保证章节变化清楚、节奏承接、标题结构分散、摘要中的人物选择与认识变化、收尾方式符合叙事策略",
  retryAgency: "7. 每章 summary 必须体现新增变化，优先体现核心视角人物的选择、犹豫、承担或认识的改变。",
  retryEnding: "13. 最后一章必须完成当前 beat 的 mustDeliver，并按叙事策略允许的方式收束，但不得提前兑现下一 beat 的核心事件。",
} as const;

/**
 * 章节读者体验合同（readerExperience）字段在非网文取向下的解释；章节规划、写作、验收、修文共用，
 * 保证各阶段对同一份合同的理解一致。字段名和 schema 不变。
 */
export const READER_EXPERIENCE_ORIENTATION_MEANING = [
  "readerExperience 字段沿用原结构，在本书取向下这样理解：",
  "- readerQuestion：读者在本章关心的问题，可以是事实，也可以是人物会怎么选、关系会怎样。",
  "- promisedReward / rewardLevel：读者在本章得到的东西，可以是对人物或处境的新理解、关系的变化、情绪的释放或积压、类型疑问的推进；不要求爽点。",
  "- protagonistWant / primaryResistance：人物想要什么、被什么阻挡，阻力可以来自他人、处境、制度或人物自己。",
  "- keyTurn / netChange：本章可辨认的转折与净变化，可以是认识、关系距离、处境压力或主题的一个侧面，变化可以很小但要具体。",
  "- inheritedHookResponsibilities：前文留下、需要本章回应的问题或线索；没有就为空。",
  "- endingHook：本章收尾的方式与落点，从叙事策略允许的收尾方式中选一种并写明；余韵、安静的转折与选择关口都是有效收尾，不必是悬念。",
].join("\n");

export const CHAPTER_DETAIL_ORIENTATION_RULES = {
  identity: "你是资深小说章节编辑。本书的创作取向由用户明确选择。",
  sceneValue: "每个场景都必须有具体阻力和转折，阻力可以来自他人、处境或人物内心，转折可以是认识或关系的变化；readerValue 说明该场景给读者带来的理解、揭示、情绪或关系价值。",
  sceneCoverage: "sceneCards 必须完整覆盖整章推进和本章收尾，不要把整章压成一个场景。",
  reward: "rewardLevel 只能使用 setup、partial、major；promisedReward 和 netChange 必须能在正文中被读者感知，可以落在人物的认识、关系或处境上。",
} as const;

export const BOOK_CONTRACT_ORIENTATION_QUALITY_RULES = [
  "1. chapter3Payoff 让读者尽早感到人物身上的压力或缺口。",
  "2. chapter10Payoff 体现第一阶段的认识、关系或处境变化。",
  "3. chapter30Payoff 体现中段的加深或转折。",
  "4. escalationLadder 要与题材、取向和人物弧线相匹配。",
  "5. absoluteRedLines 必须具体可执行，避免“不要崩”“保持一致”这类空话。",
] as const;
