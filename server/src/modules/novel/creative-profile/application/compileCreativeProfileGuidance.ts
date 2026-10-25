import {
  CHAPTER_ENDING_MODE_OPTIONS,
  CONFLICT_SCALE_OPTIONS,
  type CreativeOrientation,
  type CreativeProfile,
  type CreativeProfileOption,
  type CreativeProfileStage,
  type NamingBackground,
} from "@ai-novel/shared/types/creativeProfile";
import {
  CHARACTER_ARC_GUIDANCE,
  CREATIVE_ORIENTATION_HEADINGS,
  CREATIVE_PROFILE_PRECEDENCE_RULE,
  DIALOGUE_GUIDANCE,
  FOCALIZATION_GUIDANCE,
  IMAGERY_GUIDANCE,
  INVALID_CREATIVE_PROFILE_NOTICE,
  NARRATIVE_DISTANCE_GUIDANCE,
  NARRATIVE_DRIVE_GUIDANCE,
  NARRATOR_COMMENTARY_GUIDANCE,
  ORIENTATION_STAGE_GUIDANCE,
  PLATFORM_DEFAULT_ROLE_TEXT,
  PLATFORM_PRESENTATION_ONLY_TEXT,
  renderChapterEndingGuidance,
  renderConflictScaleGuidance,
  renderConsistencyNotes,
} from "../../../../prompting/prompts/creativeProfile/creativeProfileGuidance.fragments";
import type { CreativeProfileIssue, CreativeProfileReadResult } from "../domain/creativeProfileCodec";

/**
 * default：平台写法保持现有权重（未设置取向或明确选择网文连载）。
 * presentation_only：平台只影响段落、篇幅与呈现，不能产生升级、爽点或钩子要求。
 */
export type CreativePlatformRole = "default" | "presentation_only";

export interface CreativeProfileGuidance {
  status: CreativeProfileReadResult["status"];
  stage: CreativeProfileStage;
  orientation: CreativeOrientation | null;
  platformRole: CreativePlatformRole;
  /** 未设置时为空串，调用方据此保持旧提示词逐字不变。 */
  text: string;
  issue: CreativeProfileIssue | null;
}

type StrategyPart = "drive" | "conflict" | "arc" | "endings";

const STAGE_STRATEGY_PARTS: Record<CreativeProfileStage, StrategyPart[]> = {
  positioning: ["drive", "arc"],
  planning: ["drive", "conflict", "arc", "endings"],
  drafting: ["drive", "conflict", "arc", "endings"],
  auditing: ["drive", "conflict", "arc", "endings"],
  repairing: ["drive", "arc", "endings"],
};

export function resolveCreativePlatformRole(read: CreativeProfileReadResult): CreativePlatformRole {
  if (read.status === "unset") return "default";
  if (read.status === "invalid") return "presentation_only";
  return read.profile.orientation === "web_serial" ? "default" : "presentation_only";
}

function labelsOf<T extends string>(options: CreativeProfileOption<T>[], values: T[]): string[] {
  return values.map((value) => options.find((option) => option.value === value)?.label ?? value);
}

function compileStrategyLines(profile: CreativeProfile, stage: CreativeProfileStage): string[] {
  const strategy = profile.strategy;
  if (!strategy) return [];
  const lines: string[] = [];
  for (const part of STAGE_STRATEGY_PARTS[stage]) {
    if (part === "drive" && strategy.drive) {
      lines.push(NARRATIVE_DRIVE_GUIDANCE[strategy.drive]);
    } else if (part === "conflict" && strategy.conflictScales) {
      lines.push(renderConflictScaleGuidance(labelsOf(CONFLICT_SCALE_OPTIONS, strategy.conflictScales)));
    } else if (part === "arc" && strategy.arcShape) {
      lines.push(CHARACTER_ARC_GUIDANCE[strategy.arcShape]);
    } else if (part === "endings" && strategy.allowedChapterEndings) {
      lines.push(renderChapterEndingGuidance(stage, labelsOf(CHAPTER_ENDING_MODE_OPTIONS, strategy.allowedChapterEndings)));
    }
  }
  return lines;
}

const STYLE_STAGES: ReadonlySet<CreativeProfileStage> = new Set(["drafting", "auditing", "repairing"]);

/** 文风维度只进入写作、审阅和修文；规划阶段只需要聚焦方式来安排视角人物。 */
function compileStyleLines(profile: CreativeProfile, stage: CreativeProfileStage): string[] {
  const dims = profile.styleDimensions;
  if (!dims) return [];
  if (stage === "planning") {
    return dims.focalization ? [FOCALIZATION_GUIDANCE[dims.focalization]] : [];
  }
  if (!STYLE_STAGES.has(stage)) return [];
  const lines: string[] = [];
  if (dims.focalization) lines.push(FOCALIZATION_GUIDANCE[dims.focalization]);
  if (dims.narrativeDistance) lines.push(NARRATIVE_DISTANCE_GUIDANCE[dims.narrativeDistance]);
  if (dims.imagery) lines.push(IMAGERY_GUIDANCE[dims.imagery]);
  if (dims.dialogue) lines.push(DIALOGUE_GUIDANCE[dims.dialogue]);
  if (dims.commentary) lines.push(NARRATOR_COMMENTARY_GUIDANCE[dims.commentary]);
  if (dims.consistencyNotes) lines.push(renderConsistencyNotes(dims.consistencyNotes));
  return lines;
}

function bullet(lines: string[]): string[] {
  return lines.map((line) => `- ${line}`);
}

function compileActiveText(profile: CreativeProfile, stage: CreativeProfileStage, platformRole: CreativePlatformRole): string {
  const strategyLines = compileStrategyLines(profile, stage);
  const styleLines = compileStyleLines(profile, stage);
  return [
    CREATIVE_ORIENTATION_HEADINGS[profile.orientation],
    CREATIVE_PROFILE_PRECEDENCE_RULE,
    platformRole === "default" ? PLATFORM_DEFAULT_ROLE_TEXT : PLATFORM_PRESENTATION_ONLY_TEXT,
    "本阶段要求：",
    ...bullet(ORIENTATION_STAGE_GUIDANCE[profile.orientation][stage]),
    ...(strategyLines.length > 0 ? ["叙事策略（用户明确选择）：", ...bullet(strategyLines)] : []),
    ...(styleLines.length > 0 ? ["文风维度（用户明确选择，是偏好与许可，不是额外检查项）：", ...bullet(styleLines)] : []),
  ].join("\n");
}

/**
 * 旧提示词里的网文默认（强制网文身份、升级循环、每章钩子、心理/环境段落禁令、缺钩子扣分、修文补悬念）
 * 只在未设置或明确选择网文连载时保留。配置损坏时同样关闭，保持中性。
 */
export function keepsWebSerialDefaults(guidance: Pick<CreativeProfileGuidance, "platformRole">): boolean {
  return guidance.platformRole === "default";
}

/**
 * 按已保存的结构化选择为一个阶段编译额外指导。纯函数：不调用模型、不读写数据库。
 */
export function compileCreativeProfileGuidance(
  read: CreativeProfileReadResult,
  stage: CreativeProfileStage,
): CreativeProfileGuidance {
  const platformRole = resolveCreativePlatformRole(read);
  if (read.status === "unset") {
    return { status: "unset", stage, orientation: null, platformRole, text: "", issue: null };
  }
  if (read.status === "invalid") {
    return { status: "invalid", stage, orientation: null, platformRole, text: INVALID_CREATIVE_PROFILE_NOTICE, issue: read.issue };
  }
  return {
    status: "valid",
    stage,
    orientation: read.profile.orientation,
    platformRole,
    text: compileActiveText(read.profile, stage, platformRole),
    issue: null,
  };
}

/** 取名请求使用的书级命名背景；未设置或配置无法读取时返回 null。 */
export function resolveNamingBackground(read: CreativeProfileReadResult): NamingBackground | null {
  if (read.status !== "valid") return null;
  return read.profile.namingBackground ?? null;
}
