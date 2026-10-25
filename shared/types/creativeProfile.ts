import { z } from "zod";

/**
 * 作品创作取向配置（书级、可空）。
 *
 * 轴边界：
 * - 题材由 genreId 管，时代与世界由题材/世界设定管；"现代文学"是取向，不等于故事发生在现代。
 * - 叙事形式（长篇/短篇）与视角继续由 narrativeForm、narrativePov 管。
 * - 平台写法只描述发布场景；取向永远不从平台推导。
 *
 * 配置只能来自用户确认的结构化选择（可以是用户确认后的 AI 推荐），不从文本关键词猜测。
 */
export const CREATIVE_PROFILE_SCHEMA_VERSION = 1 as const;

export const creativeOrientationSchema = z.enum(["web_serial", "modern_literary", "literary_genre"]);
export type CreativeOrientation = z.infer<typeof creativeOrientationSchema>;

/** 推进主要靠什么。 */
export const narrativeDriveSchema = z.enum(["event", "character", "relationship", "theme"]);
export type NarrativeDrive = z.infer<typeof narrativeDriveSchema>;

/** 冲突发生在哪些层面，可多选。 */
export const conflictScaleSchema = z.enum(["inner", "relationship", "family", "society", "institution"]);
export type ConflictScale = z.infer<typeof conflictScaleSchema>;

/** 主要人物弧线的形状。 */
export const characterArcShapeSchema = z.enum(["growth", "decline", "recognition", "open"]);
export type CharacterArcShape = z.infer<typeof characterArcShapeSchema>;

/** 本书允许的章节收尾方式；每章具体用哪一种由章节规划决定。 */
export const chapterEndingModeSchema = z.enum(["hook", "decision_point", "revelation", "resonance", "quiet_turn"]);
export type ChapterEndingMode = z.infer<typeof chapterEndingModeSchema>;

/** 取向指导所服务的阶段，与平台写法的五类指导对齐。 */
export const creativeProfileStageSchema = z.enum(["positioning", "planning", "drafting", "auditing", "repairing"]);
export type CreativeProfileStage = z.infer<typeof creativeProfileStageSchema>;

function uniqueEnumList<T extends z.ZodEnum>(item: T, max: number) {
  return z.array(item).min(1).max(max).refine(
    (values) => new Set(values).size === values.length,
    { message: "选项不能重复。" },
  );
}

const optionalShortText = (max: number) => z.string().trim().min(1).max(max).optional();

export const narrativeStrategySchema = z.object({
  drive: narrativeDriveSchema.optional(),
  conflictScales: uniqueEnumList(conflictScaleSchema, 3).optional(),
  arcShape: characterArcShapeSchema.optional(),
  allowedChapterEndings: uniqueEnumList(chapterEndingModeSchema, 5).optional(),
}).strict();
export type NarrativeStrategy = z.infer<typeof narrativeStrategySchema>;

/**
 * 书级命名背景。跨时代作品在这里写全书的大背景，单个角色的出生年代与成长地在取名请求里逐人提供。
 */
export const namingBackgroundSchema = z.object({
  era: optionalShortText(80),
  region: optionalShortText(80),
  languageCulture: optionalShortText(80),
  familyConventions: optionalShortText(300),
}).strict();
export type NamingBackground = z.infer<typeof namingBackgroundSchema>;

/** 聚焦方式：与 narrativePov（人称）分开，全知与轮换聚焦按用户选择执行，不默认收窄为单人限知。 */
export const focalizationSchema = z.enum(["single_limited", "rotating_limited", "omniscient"]);
export type Focalization = z.infer<typeof focalizationSchema>;

export const narrativeDistanceSchema = z.enum(["close", "medium", "distant", "variable"]);
export type NarrativeDistance = z.infer<typeof narrativeDistanceSchema>;

export const imageryDensitySchema = z.enum(["restrained", "recurring_motifs", "rich"]);
export type ImageryDensity = z.infer<typeof imageryDensitySchema>;

export const dialogueModeSchema = z.enum(["subtext", "direct", "sparse"]);
export type DialogueMode = z.infer<typeof dialogueModeSchema>;

/** 叙述者议论：不是禁令，只说明本书允许到什么程度。 */
export const narratorCommentarySchema = z.enum(["minimal", "functional", "essayistic"]);
export type NarratorCommentary = z.infer<typeof narratorCommentarySchema>;

/**
 * 书级文风维度。节奏复用 Novel.pacePreference，人称复用 Novel.narrativePov，具体写法复用文风资产绑定；
 * 这里只放现有资产没有覆盖、且能写成可执行要求的少量维度。全部可选，省略即不额外要求。
 */
export const styleDimensionsSchema = z.object({
  focalization: focalizationSchema.optional(),
  narrativeDistance: narrativeDistanceSchema.optional(),
  imagery: imageryDensitySchema.optional(),
  dialogue: dialogueModeSchema.optional(),
  commentary: narratorCommentarySchema.optional(),
  /** 方言、时代用语、称谓等需要全书保持一致的约定。 */
  consistencyNotes: optionalShortText(300),
}).strict();
export type StyleDimensions = z.infer<typeof styleDimensionsSchema>;

const creativeProfileShape = {
  orientation: creativeOrientationSchema,
  strategy: narrativeStrategySchema.optional(),
  styleDimensions: styleDimensionsSchema.optional(),
  namingBackground: namingBackgroundSchema.optional(),
};

/** 已保存的配置：版本号必须显式为 1。 */
export const creativeProfileSchema = z.object({
  schemaVersion: z.literal(CREATIVE_PROFILE_SCHEMA_VERSION),
  ...creativeProfileShape,
}).strict();
export type CreativeProfile = z.infer<typeof creativeProfileSchema>;

/** 用户/HTTP 输入：可省略版本号，解析后补为当前版本。 */
export const creativeProfileInputSchema = z.object({
  schemaVersion: z.literal(CREATIVE_PROFILE_SCHEMA_VERSION).optional(),
  ...creativeProfileShape,
}).strict().transform((value): CreativeProfile => ({
  ...value,
  schemaVersion: CREATIVE_PROFILE_SCHEMA_VERSION,
}));
export type CreativeProfileInput = z.input<typeof creativeProfileInputSchema>;

/** 更新字段：null 表示清除设置（回到旧行为），省略表示不修改。 */
export const creativeProfileUpdateSchema = creativeProfileInputSchema.nullable().optional();

export type CreativeProfileIssueCode = "malformed_json" | "unsupported_version" | "invalid_shape";

/** 已保存配置无法读取时投影给界面的问题说明；此时 creativeProfile 为 null，但不等于未设置。 */
export interface CreativeProfileIssue {
  code: CreativeProfileIssueCode;
  message: string;
}

export interface CreativeProfileOption<T extends string> {
  value: T;
  label: string;
  description: string;
}

export const CREATIVE_ORIENTATION_OPTIONS: CreativeProfileOption<CreativeOrientation>[] = [
  { value: "web_serial", label: "网文连载", description: "按章追读，目标清楚、推进密集，章末留下继续读的理由。" },
  { value: "modern_literary", label: "现代文学", description: "由人物、关系和主题推进，章节可以停在余韵或安静的转折上。" },
  { value: "literary_genre", label: "文学化类型小说", description: "保留悬疑、家族等类型的张力，但用人物与处境组织故事，不按爽点结构安排。" },
];

export const NARRATIVE_DRIVE_OPTIONS: CreativeProfileOption<NarrativeDrive>[] = [
  { value: "event", label: "事件推进", description: "每段故事由外部事件和目标的得失往前走。" },
  { value: "character", label: "人物推进", description: "故事随人物的选择、认识和处境变化往前走。" },
  { value: "relationship", label: "关系推进", description: "人与人之间的距离、信任和立场变化是主线。" },
  { value: "theme", label: "主题推进", description: "不同情境反复检验同一个问题，读者对它的理解逐步加深。" },
];

export const CONFLICT_SCALE_OPTIONS: CreativeProfileOption<ConflictScale>[] = [
  { value: "inner", label: "内心", description: "人物与自己的欲望、恐惧或信念相持。" },
  { value: "relationship", label: "关系", description: "冲突发生在亲密或重要的两个人之间。" },
  { value: "family", label: "家庭", description: "家庭责任、代际观念或家族秘密形成压力。" },
  { value: "society", label: "社会", description: "人群、阶层、风气或时代变化形成压力。" },
  { value: "institution", label: "制度", description: "单位、规则、组织或权力结构形成压力。" },
];

export const CHARACTER_ARC_SHAPE_OPTIONS: CreativeProfileOption<CharacterArcShape>[] = [
  { value: "growth", label: "成长", description: "人物付出代价后变得更有能力或更清醒。" },
  { value: "decline", label: "下落", description: "人物一步步失去所守护的东西或自我。" },
  { value: "recognition", label: "看清但未必改变", description: "人物最终认清处境或自己，行为不一定随之改变。" },
  { value: "open", label: "开放", description: "结局给出人物处境的变化，把判断留给读者。" },
];

export const CHAPTER_ENDING_MODE_OPTIONS: CreativeProfileOption<ChapterEndingMode>[] = [
  { value: "hook", label: "悬念钩子", description: "章末抛出新问题或危机，推动读者立刻读下一章。" },
  { value: "decision_point", label: "选择关口", description: "章末停在人物必须做决定的时刻。" },
  { value: "revelation", label: "揭示", description: "章末揭开一层事实或真相，改变读者的理解。" },
  { value: "resonance", label: "余韵", description: "章末停在一个画面、动作或一句话上，让情绪继续发酵。" },
  { value: "quiet_turn", label: "安静的转折", description: "表面平静，人物关系或心境已经悄悄改变。" },
];

export const FOCALIZATION_OPTIONS: CreativeProfileOption<Focalization>[] = [
  { value: "single_limited", label: "单人聚焦", description: "一个场景只跟一个人物看、想、知道。" },
  { value: "rotating_limited", label: "轮换聚焦", description: "不同章节或段落轮流跟随不同人物，切换处让读者看得出来。" },
  { value: "omniscient", label: "全知叙述", description: "叙述者可以进入多个人物内心，也可以交代人物不知道的事。" },
];

export const NARRATIVE_DISTANCE_OPTIONS: CreativeProfileOption<NarrativeDistance>[] = [
  { value: "close", label: "贴近", description: "紧贴人物的感受和语气，读者像在人物身边。" },
  { value: "medium", label: "适中", description: "既写人物感受，也交代场景与他人。" },
  { value: "distant", label: "疏离", description: "叙述保持距离，克制地呈现人物，少写内心直白感受。" },
  { value: "variable", label: "随情绪调整", description: "关键时刻拉近，过渡处拉远。" },
];

export const IMAGERY_DENSITY_OPTIONS: CreativeProfileOption<ImageryDensity>[] = [
  { value: "restrained", label: "克制", description: "只在关键处用具体物象，平时以叙事为主。" },
  { value: "recurring_motifs", label: "反复出现的意象", description: "少数物象在全书多次出现，意义随情节变化。" },
  { value: "rich", label: "丰富", description: "允许较多感官细节和景物描写，但要服务于人物与情绪。" },
];

export const DIALOGUE_MODE_OPTIONS: CreativeProfileOption<DialogueMode>[] = [
  { value: "subtext", label: "多潜台词", description: "人物常常不直说，回避和沉默也在传达意思。" },
  { value: "direct", label: "直接", description: "对话清楚表达立场和信息，推进快。" },
  { value: "sparse", label: "少对话", description: "以叙述为主，对话只在关键处出现。" },
];

export const NARRATOR_COMMENTARY_OPTIONS: CreativeProfileOption<NarratorCommentary>[] = [
  { value: "minimal", label: "少议论", description: "叙述者很少直接评价，让事件和人物自己说话。" },
  { value: "functional", label: "必要时议论", description: "议论可以出现，但要推动理解或形成反讽，不重复读者已经明白的事。" },
  { value: "essayistic", label: "随笔式议论", description: "叙述者可以展开思考和评说，作为本书文体的一部分。" },
];
