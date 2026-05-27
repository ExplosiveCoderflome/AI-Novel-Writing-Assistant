import type {
  CharacterCastOption,
  CharacterGender,
} from "@ai-novel/shared/types/novel";
import type { CharacterCastOptionParsed } from "../../../prompting/prompts/novel/characterPreparation.promptSchemas";

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
    | "missing_protagonist"
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

function toOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function summarizeBlockingReason(issue: CharacterCastQualityIssue): string {
  return `${issue.optionTitle}: ${issue.message}`;
}

function buildOptionAssessment(
  option: CharacterCastOptionLike,
  optionIndex: number,
): CharacterCastOptionAssessment {
  const issues: CharacterCastQualityIssue[] = [];
  const optionTitle = option.title.trim() || `方案 ${optionIndex + 1}`;

  option.members.forEach((member) => {
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

  const protagonist = option.members.find((member) => member.castRole === "protagonist");
  if (!protagonist) {
    issues.push({
      code: "missing_protagonist",
      optionIndex,
      optionTitle,
      message: "这套阵容没有稳定主角锚点。",
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
  _storyInput: string,
): CharacterCastBatchAssessment {
  const assessments = options.map((option, index) => buildOptionAssessment(option, index));
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

export function buildCharacterCastRepairReasons(assessment: CharacterCastBatchAssessment): string[] {
  return assessment.blockingReasons.length > 0
    ? assessment.blockingReasons
    : ["当前阵容存在可读性或落库质量问题，请按真实角色资产标准修复。"];
}

export function buildCharacterCastBlockedMessage(assessment: CharacterCastBatchAssessment): string {
  return [
    "这套角色阵容还需要你确认后再应用到正式角色库。",
    ...assessment.blockingReasons.slice(0, 5).map((reason, index) => `${index + 1}. ${reason}`),
  ].join("\n");
}
