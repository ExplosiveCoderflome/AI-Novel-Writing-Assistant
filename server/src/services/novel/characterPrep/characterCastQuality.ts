import type {
  CharacterCastOption,
  CharacterGender,
} from "@ai-novel/shared/types/novel";
import type { CharacterCastOptionParsed } from "../../../prompting/prompts/novel/characterPreparation.promptSchemas";
import { extractCharacterAnchorHints } from "../../../prompting/prompts/novel/characterPreparation.contextBlocks";

interface CharacterCastMemberLike {
  name: string;
  role: string;
  gender?: CharacterGender | null;
  castRole: string;
  storyFunction: string;
  shortDescription?: string | null;
  relationToProtagonist?: string | null;
  outerGoal?: string | null;
  innerNeed?: string | null;
  fear?: string | null;
  wound?: string | null;
  misbelief?: string | null;
  secret?: string | null;
  moralLine?: string | null;
  firstImpression?: string | null;
}

interface CharacterCastOptionLike {
  id?: string | null;
  title: string;
  summary: string;
  whyItWorks?: string | null;
  recommendedReason?: string | null;
  members: CharacterCastMemberLike[];
  relations: Array<{
    sourceName: string;
    targetName: string;
    surfaceRelation: string;
    hiddenTension?: string | null;
    conflictSource?: string | null;
    secretAsymmetry?: string | null;
    dynamicLabel?: string | null;
    nextTurnPoint?: string | null;
  }>;
}

export interface CharacterCastQualityIssue {
  code:
    | "abstract_name"
    | "english_residue"
    | "duplicate_story_function"
    | "missing_protagonist"
    | "missing_current_identity_anchor"
    | "missing_hidden_identity_anchor"
    | "missing_gender";
  optionIndex: number;
  optionTitle: string;
  message: string;
  memberName?: string;
}

export interface CharacterCastOptionAssessment {
  optionIndex: number;
  optionId: string | null;
  title: string;
  autoApplicable: boolean;
  issues: CharacterCastQualityIssue[];
}

export interface CharacterCastBatchAssessment {
  options: CharacterCastOptionAssessment[];
  autoApplicableOptionIndex: number | null;
  autoApplicableOptionId: string | null;
  blockingReasons: string[];
}

const ABSTRACT_NAME_PATTERNS = [
  /功能位/u,
  /催化剂/u,
  /知识导师/u,
  /导师位/u,
  /威胁位/u,
  /外部威胁/u,
  /压力源/u,
  /关系变量/u,
  /情感位/u,
  /认知位/u,
  /功能角色/u,
  /工具人/u,
  /推进者/u,
  /引导者/u,
  /扰动源/u,
  /阵营代理/u,
  /谜团/u,
];

function toOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function hasTooMuchLatinText(value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  if (!text) {
    return false;
  }
  const latinCount = (text.match(/[A-Za-z]/g) ?? []).length;
  const chineseCount = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return latinCount >= 6 && latinCount > chineseCount * 2;
}

function normalizeComparableText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[\s，,。！？!?:：;；、\-_/|（）()【】[\]'"“”‘’]/g, "")
    .trim()
    .toLowerCase();
}

function isAbstractSlotLikeName(name: string): boolean {
  const normalized = name.trim();
  if (!normalized) {
    return true;
  }
  if (ABSTRACT_NAME_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  if (normalized.endsWith("位")) {
    return true;
  }
  return false;
}

function buildOptionTextCorpus(option: CharacterCastOptionLike): string {
  return [
    option.title,
    option.summary,
    option.whyItWorks,
    option.recommendedReason,
    ...option.members.flatMap((member) => [
      member.name,
      member.role,
      member.storyFunction,
      member.shortDescription,
      member.relationToProtagonist,
      member.outerGoal,
      member.innerNeed,
      member.fear,
      member.wound,
      member.misbelief,
      member.secret,
      member.moralLine,
      member.firstImpression,
    ]),
    ...option.relations.flatMap((relation) => [
      relation.sourceName,
      relation.targetName,
      relation.surfaceRelation,
      relation.hiddenTension,
      relation.conflictSource,
      relation.secretAsymmetry,
      relation.dynamicLabel,
      relation.nextTurnPoint,
    ]),
  ]
    .map((value) => toOptionalText(value))
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function summarizeBlockingReason(issue: CharacterCastQualityIssue): string {
  return `${issue.optionTitle}: ${issue.message}`;
}

function buildOptionAssessment(
  option: CharacterCastOptionLike,
  optionIndex: number,
  storyInput: string,
): CharacterCastOptionAssessment {
  const issues: CharacterCastQualityIssue[] = [];
  const optionTitle = option.title.trim() || `方案 ${optionIndex + 1}`;

  option.members.forEach((member) => {
    if (isAbstractSlotLikeName(member.name)) {
      issues.push({
        code: "abstract_name",
        optionIndex,
        optionTitle,
        memberName: member.name,
        message: `角色名“${member.name}”仍像功能位或抽象槽位，不能直接入库。`,
      });
    }
    if (!member.gender) {
      issues.push({
        code: "missing_gender",
        optionIndex,
        optionTitle,
        memberName: member.name,
        message: `角色“${member.name}”缺少 gender。`,
      });
    }
  });

  if (option.members.some((member) => {
    const memberTexts = [
      member.name,
      member.role,
      member.storyFunction,
      member.shortDescription,
      member.relationToProtagonist,
      member.secret,
    ];
    return memberTexts.some((text) => hasTooMuchLatinText(text));
  }) || option.relations.some((relation) => (
    hasTooMuchLatinText(relation.surfaceRelation)
    || hasTooMuchLatinText(relation.hiddenTension)
    || hasTooMuchLatinText(relation.conflictSource)
    || hasTooMuchLatinText(relation.dynamicLabel)
    || hasTooMuchLatinText(relation.nextTurnPoint)
  ))) {
    issues.push({
      code: "english_residue",
      optionIndex,
      optionTitle,
      message: "这套阵容仍含明显英文残留，不能直接进入角色资产库。",
    });
  }

  const protagonist = option.members.find((member) => member.castRole === "protagonist");
  if (!protagonist) {
    issues.push({
      code: "missing_protagonist",
      optionIndex,
      optionTitle,
      message: "这套阵容没有稳定主角锚点。",
    });
  }

  const normalizedFunctions = option.members
    .map((member) => normalizeComparableText(member.storyFunction))
    .filter(Boolean);
  const functionCounts = new Map<string, number>();
  for (const normalized of normalizedFunctions) {
    functionCounts.set(normalized, (functionCounts.get(normalized) ?? 0) + 1);
  }
  if ([...functionCounts.values()].some((count) => count >= 2)) {
    issues.push({
      code: "duplicate_story_function",
      optionIndex,
      optionTitle,
      message: "这套阵容里有多个角色承担了过于相近的故事职责。",
    });
  }

  const anchors = extractCharacterAnchorHints(storyInput);
  const textCorpus = buildOptionTextCorpus(option);
  if (anchors.currentIdentity && !textCorpus.includes(anchors.currentIdentity)) {
    issues.push({
      code: "missing_current_identity_anchor",
      optionIndex,
      optionTitle,
      message: `这套阵容没有显式承接主角当前身份线索「${anchors.currentIdentity}」。`,
    });
  }
  if (anchors.hiddenIdentity && !textCorpus.includes(anchors.hiddenIdentity)) {
    issues.push({
      code: "missing_hidden_identity_anchor",
      optionIndex,
      optionTitle,
      message: `这套阵容没有显式承接隐藏身份 / 真相线索「${anchors.hiddenIdentity}」。`,
    });
  }

  return {
    optionIndex,
    optionId: option.id ?? null,
    title: optionTitle,
    autoApplicable: issues.length === 0,
    issues,
  };
}

export function assessCharacterCastBatch(
  options: Array<CharacterCastOptionParsed | CharacterCastOption>,
  storyInput: string,
): CharacterCastBatchAssessment {
  const assessments = options.map((option, index) => buildOptionAssessment(option, index, storyInput));
  const autoApplicable = assessments.find((assessment) => assessment.autoApplicable) ?? null;
  const blockingReasons = Array.from(
    new Set(
      assessments
        .flatMap((assessment) => assessment.issues)
        .map(summarizeBlockingReason),
    ),
  ).slice(0, 8);

  return {
    options: assessments,
    autoApplicableOptionIndex: autoApplicable?.optionIndex ?? null,
    autoApplicableOptionId: autoApplicable?.optionId ?? null,
    blockingReasons,
  };
}

export function shouldNormalizeCharacterCastLanguage(
  options: Array<CharacterCastOptionParsed | CharacterCastOption>,
): boolean {
  return options.some((option) => {
    if (hasTooMuchLatinText(option.summary) || hasTooMuchLatinText(option.whyItWorks) || hasTooMuchLatinText(option.recommendedReason)) {
      return true;
    }
    return option.members.some((member) => {
      const texts = [
        member.role,
        member.storyFunction,
        member.shortDescription,
        member.relationToProtagonist,
        member.outerGoal,
        member.innerNeed,
        member.fear,
        member.wound,
        member.misbelief,
        member.secret,
        member.moralLine,
        member.firstImpression,
      ];
      return texts.some((text) => hasTooMuchLatinText(text));
    });
  });
}

export function buildCharacterCastRepairReasons(assessment: CharacterCastBatchAssessment): string[] {
  return assessment.blockingReasons.length > 0
    ? assessment.blockingReasons
    : ["当前阵容存在可读性或落库质量问题，请按真实角色资产标准修复。"];
}

export function buildCharacterCastBlockedMessage(assessment: CharacterCastBatchAssessment): string {
  return [
    "当前角色阵容仍含功能位式名称或关键锚点缺失，不能直接应用到正式角色库。",
    ...assessment.blockingReasons.slice(0, 5).map((reason, index) => `${index + 1}. ${reason}`),
  ].join("\n");
}
