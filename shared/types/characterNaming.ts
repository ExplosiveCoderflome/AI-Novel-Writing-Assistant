import { z } from "zod";
import { namingBackgroundSchema } from "./creativeProfile.js";

export const NAMING_CANDIDATE_MIN = 3;
export const NAMING_CANDIDATE_MAX = 6;
export const NAMING_CANDIDATE_DEFAULT = 4;

const optionalText = (max: number) => z.string().trim().min(1).max(max).nullish();

/** 单个汉字或其他书写系统里的一个字符（按码点计）。 */
const singleCharSchema = z.string().trim().refine((value) => [...value].length === 1, { message: "必须是单个字。" });

export const characterNamingCharacterSchema = z.object({
  currentName: optionalText(80),
  /** 人物在故事中的作用。 */
  role: z.string().trim().min(1).max(200),
  gender: optionalText(20),
  /** 年龄或出生、成长年代；跨时代作品逐人填写。 */
  ageOrBirthEra: optionalText(80),
  /** 出生或成长地，覆盖书级地域。 */
  hometown: optionalText(80),
  /** 家庭背景、阶层、兄弟姐妹、父母取名习惯等。 */
  familyBackground: optionalText(400),
  /** 人物描述只作取名依据，不能被截取为名字。 */
  description: optionalText(800),
}).strict();

export const characterNamingConstraintsSchema = z.object({
  fixedSurname: z.string().trim().min(1).max(60).nullish(),
  /** 字辈及其在名中的位置（名的第 1 个或第 2 个字，不含姓）。 */
  generationChar: z.object({
    char: singleCharSchema,
    position: z.union([z.literal(1), z.literal(2)]),
  }).strict().nullish(),
  forbiddenNames: z.array(z.string().trim().min(1).max(80)).max(200).default([]),
  forbiddenChars: z.array(singleCharSchema).max(50).default([]),
  /** 平实 / 平衡 / 有寓意。默认平衡。 */
  preference: z.enum(["plain", "balanced", "meaningful"]).default("balanced"),
}).strict();

/** HTTP、服务和工作台共用的有界取名合同。 */
export const characterNamingRequestSchema = z.object({
  character: characterNamingCharacterSchema,
  constraints: characterNamingConstraintsSchema.default({ forbiddenNames: [], forbiddenChars: [], preference: "balanced" }),
  namingBackground: namingBackgroundSchema.nullish(),
  existingCastNames: z.array(z.string().trim().min(1).max(80)).max(200).default([]),
  candidateCount: z.number().int().min(NAMING_CANDIDATE_MIN).max(NAMING_CANDIDATE_MAX).default(NAMING_CANDIDATE_DEFAULT),
  storyContext: optionalText(1200),
}).strict();

export type CharacterNamingCandidatesPromptInput = z.output<typeof characterNamingRequestSchema>;
export type CharacterNamingRequestInput = z.input<typeof characterNamingRequestSchema>;

const rationaleText = z.string().trim().min(1).max(160);

export const namingReadingRiskSchema = z.object({
  type: z.enum(["homophone", "similar_glyph", "too_close_to_cast", "over_symbolic", "rare_character", "other"]),
  detail: z.string().trim().min(1).max(160),
});

export const namingCandidateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** 没有姓氏传统的语言文化可为空串。 */
  surname: z.string().trim().max(60),
  givenName: z.string().trim().min(1).max(60),
  /** plain 朴素，common 常见，meaningful 有明确寓意。 */
  register: z.enum(["plain", "common", "meaningful"]),
  appellations: z.array(z.string().trim().min(1).max(80)).max(4).default([]),
  rationale: z.object({
    era: rationaleText,
    region: rationaleText,
    languageCulture: rationaleText,
    ageAndFamily: rationaleText,
    storyRole: rationaleText,
  }),
  readingRisks: z.array(namingReadingRiskSchema).max(4).default([]),
  /** 与其他候选及已有角色的区别理由。 */
  distinction: z.string().trim().min(1).max(200),
});

export const characterNamingCandidatesOutputSchema = z.object({
  keepCurrentName: z.object({
    surname: z.string().trim().max(60).optional(),
    givenName: z.string().trim().max(60).optional(),
    recommended: z.boolean(),
    reason: z.string().trim().min(1).max(240),
  }),
  candidates: z.array(namingCandidateSchema).min(NAMING_CANDIDATE_MIN).max(NAMING_CANDIDATE_MAX),
});

export type CharacterNamingCandidatesOutput = z.output<typeof characterNamingCandidatesOutputSchema>;
export type NamingCandidate = z.output<typeof namingCandidateSchema>;
