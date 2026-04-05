import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import type { ResolvedStyleContext } from "@ai-novel/shared/types/styleEngine";
import type { PayoffLedgerResponse } from "@ai-novel/shared/types/payoffLedger";
import { buildStoryModePromptBlock, normalizeStoryModeOutput } from "../storyMode/storyModeProfile";
import { characterDynamicsQueryService } from "../novel/dynamics/CharacterDynamicsQueryService";

export type PlannerStoryModeRow = {
  id: string;
  name: string;
  description: string | null;
  template: string | null;
  parentId: string | null;
  profileJson: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PlannerMappedVolume = {
  sortOrder: number;
  title: string;
  summary: string | null;
  mainPromise: string | null;
  climax: string | null;
  openPayoffs: string[];
  updatedAt: string;
  chapters: Array<{
    chapterOrder: number;
    title: string;
    summary: string | null;
  }>;
};

type PlannerCharacterDynamicsOverview = Awaited<ReturnType<typeof characterDynamicsQueryService.getOverview>>;

function compactText(value: string | null | undefined, fallback = ""): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function takeNonEmptyLines(text: string | null | undefined, maxLines: number): string[] {
  if (!text?.trim()) {
    return [];
  }
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);
}

export function buildPlannerStoryModeBlock(input: {
  primaryStoryMode?: PlannerStoryModeRow | null;
  secondaryStoryMode?: PlannerStoryModeRow | null;
}): string {
  return buildStoryModePromptBlock({
    primary: input.primaryStoryMode ? normalizeStoryModeOutput(input.primaryStoryMode) : null,
    secondary: input.secondaryStoryMode ? normalizeStoryModeOutput(input.secondaryStoryMode) : null,
  });
}

export function buildStoryMacroSummary(plan: StoryMacroPlan | null): string {
  if (!plan) {
    return "无";
  }
  const lines = [
    plan.expansion?.expanded_premise ? `扩展 premise：${plan.expansion.expanded_premise}` : "",
    plan.expansion?.protagonist_core ? `主角核心：${plan.expansion.protagonist_core}` : "",
    plan.decomposition?.selling_point ? `卖点拆解：${plan.decomposition.selling_point}` : "",
    plan.decomposition?.core_conflict ? `核心冲突：${plan.decomposition.core_conflict}` : "",
    plan.decomposition?.main_hook ? `主钩子：${plan.decomposition.main_hook}` : "",
    plan.decomposition?.progression_loop ? `推进回路：${plan.decomposition.progression_loop}` : "",
    plan.decomposition?.growth_path ? `成长路径：${plan.decomposition.growth_path}` : "",
    plan.decomposition?.major_payoffs?.length
      ? `关键兑现：${plan.decomposition.major_payoffs.join("；")}`
      : "",
    plan.decomposition?.ending_flavor ? `结尾风味：${plan.decomposition.ending_flavor}` : "",
    plan.constraints.length > 0 ? `硬约束：${plan.constraints.join("；")}` : "",
    plan.constraintEngine?.phase_model?.length
      ? `阶段模型：${plan.constraintEngine.phase_model.map((item) => `${item.name}:${item.goal}`).join(" | ")}`
      : "",
  ].filter(Boolean);
  return lines.join("\n") || "无";
}

export function buildCurrentVolumeWindowSummary(
  volumes: PlannerMappedVolume[],
  chapterOrder: number,
): string {
  if (volumes.length === 0) {
    return "当前尚未建立卷级窗口，请先确认卷工作台。";
  }
  const currentIndex = volumes.findIndex((volume) => (
    volume.chapters.some((chapter) => chapter.chapterOrder === chapterOrder)
  ));
  if (currentIndex < 0) {
    return [
      `当前章节：第${chapterOrder}章`,
      "当前尚未绑定到任何卷结构，请先同步章节与卷窗口。",
      `已有卷窗口：${volumes.map((volume) => `第${volume.sortOrder}卷《${volume.title}》`).join("；")}`,
    ].join("\n");
  }

  const currentVolume = volumes[currentIndex];
  const previousVolume = currentIndex > 0 ? volumes[currentIndex - 1] : null;
  const nextVolume = currentIndex < volumes.length - 1 ? volumes[currentIndex + 1] : null;
  const chapterOrders = currentVolume.chapters.map((chapter) => chapter.chapterOrder).sort((a, b) => a - b);
  const chapterIndex = currentVolume.chapters
    .slice()
    .sort((left, right) => left.chapterOrder - right.chapterOrder)
    .findIndex((chapter) => chapter.chapterOrder === chapterOrder);

  return [
    `当前章节：第${chapterOrder}章（卷内位置 ${chapterIndex + 1}/${currentVolume.chapters.length}）`,
    `当前卷：第${currentVolume.sortOrder}卷《${currentVolume.title}》`,
    `卷使命：${currentVolume.mainPromise ?? currentVolume.summary ?? "无"}`,
    currentVolume.climax ? `卷末高潮：${currentVolume.climax}` : "",
    chapterOrders.length > 0 ? `卷章节范围：${chapterOrders[0]}-${chapterOrders[chapterOrders.length - 1]}` : "",
    currentVolume.openPayoffs.length > 0 ? `本卷待兑现事项：${currentVolume.openPayoffs.join("；")}` : "",
    previousVolume
      ? `上一卷承接：第${previousVolume.sortOrder}卷《${previousVolume.title}》 | ${previousVolume.mainPromise ?? previousVolume.summary ?? "无"}`
      : "上一卷承接：无",
    nextVolume
      ? `下一卷预期：第${nextVolume.sortOrder}卷《${nextVolume.title}》 | ${nextVolume.mainPromise ?? nextVolume.summary ?? "无"}`
      : "下一卷预期：无",
  ].filter(Boolean).join("\n");
}

export function buildPlannerCharacterDynamicsContext(overview: PlannerCharacterDynamicsOverview | null): {
  summary: string;
  volumeAssignments: string;
  relationStages: string;
  candidateGuards: string;
} {
  if (!overview) {
    return {
      summary: "无",
      volumeAssignments: "无",
      relationStages: "无",
      candidateGuards: "无",
    };
  }

  const highRiskCharacters = overview.characters
    .filter((item) => item.absenceRisk === "high" || item.absenceRisk === "warn")
    .slice(0, 4)
    .map((item) => `${item.name}(${item.absenceRisk}, 缺席跨度=${item.absenceSpan})`);
  const coreCharacters = overview.characters
    .filter((item) => item.isCoreInVolume)
    .slice(0, 6)
    .map((item) => (
      [
        item.name,
        item.volumeRoleLabel ? `卷级身份=${item.volumeRoleLabel}` : "",
        item.volumeResponsibility ? `卷级职责=${item.volumeResponsibility}` : "",
        item.plannedChapterOrders.length > 0 ? `计划章次=${item.plannedChapterOrders.join("、")}` : "",
        item.absenceRisk !== "none" ? `缺席风险=${item.absenceRisk}(跨度=${item.absenceSpan})` : "",
      ].filter(Boolean).join(" | ")
    ));
  const relationStages = overview.relations
    .slice(0, 8)
    .map((item) => (
      `${item.sourceCharacterName} -> ${item.targetCharacterName}: ${item.stageLabel} | ${item.stageSummary}${item.nextTurnPoint ? ` | 下一步=${item.nextTurnPoint}` : ""}`
    ));
  const candidateGuards = overview.candidates
    .slice(0, 4)
    .map((item) => (
      `${item.proposedName}${item.proposedRole ? `(${item.proposedRole})` : ""} | ${item.summary ?? "待确认候选"} | 来源章节=${item.sourceChapterOrder ?? "未知"} | 只读约束，未确认前禁止写入正式执行链`
    ));

  return {
    summary: [
      overview.summary,
      overview.currentVolume ? `当前卷：${overview.currentVolume.title}` : "当前卷：未定位",
      coreCharacters.length > 0 ? `当前卷核心角色：${coreCharacters.map((item) => item.split(" | ")[0]).join("、")}` : "当前卷核心角色：无",
      highRiskCharacters.length > 0 ? `缺席高风险角色：${highRiskCharacters.join("；")}` : "缺席高风险角色：无",
      overview.pendingCandidateCount > 0 ? `待确认候选：${overview.pendingCandidateCount} 个` : "待确认候选：无",
    ].join("\n"),
    volumeAssignments: coreCharacters.join("\n") || "无",
    relationStages: relationStages.join("\n") || "无",
    candidateGuards: candidateGuards.join("\n") || "无",
  };
}

export function buildPlannerStyleEngineSummary(styleContext: ResolvedStyleContext | null | undefined): string {
  const matchedBindings = styleContext?.matchedBindings ?? [];
  const compiled = styleContext?.compiledBlocks;

  if (matchedBindings.length === 0 && !compiled) {
    return "无";
  }

  const bindingLine = matchedBindings.length > 0
    ? `当前命中写法：${matchedBindings
      .map((binding) => compactText(binding.styleProfile?.name, binding.styleProfileId))
      .join(" / ")}`
    : "";

  const sections = [
    takeNonEmptyLines(compiled?.style, 3),
    takeNonEmptyLines(compiled?.character, 2),
    takeNonEmptyLines(compiled?.antiAi, 2),
    takeNonEmptyLines(compiled?.selfCheck, 2),
  ]
    .flat()
    .slice(0, 8);

  return [
    bindingLine,
    sections.length > 0 ? `规划期写法约束：\n${sections.join("\n")}` : "",
  ].filter(Boolean).join("\n\n") || "无";
}

export function buildPlannerPayoffLedgerContext(ledger: PayoffLedgerResponse, chapterOrder: number): string {
  if (!ledger.items.length) {
    return "无";
  }

  const pendingItems = ledger.items
    .filter((item) => item.currentStatus === "setup" || item.currentStatus === "hinted" || item.currentStatus === "pending_payoff")
    .slice(0, 6)
    .map((item) => `${item.title} | ${item.summary}`);
  const overdueItems = ledger.items
    .filter((item) => item.currentStatus === "overdue")
    .slice(0, 4)
    .map((item) => `${item.title} | ${item.statusReason ?? item.summary}`);
  const touchNowItems = ledger.items
    .filter((item) => item.currentStatus !== "paid_off" && item.currentStatus !== "failed")
    .filter((item) => (
      (typeof item.targetStartChapterOrder === "number" && item.targetStartChapterOrder <= chapterOrder)
      || (typeof item.targetEndChapterOrder === "number" && item.targetEndChapterOrder <= chapterOrder + 1)
      || item.currentStatus === "overdue"
    ))
    .slice(0, 5)
    .map((item) => `${item.title} | 窗口=${item.targetStartChapterOrder ?? "?"}-${item.targetEndChapterOrder ?? "?"}`);
  const recentlyPaidOff = ledger.items
    .filter((item) => item.currentStatus === "paid_off")
    .sort((left, right) => (right.lastTouchedChapterOrder ?? 0) - (left.lastTouchedChapterOrder ?? 0))
    .slice(0, 4)
    .map((item) => `${item.title} | 已在第${item.lastTouchedChapterOrder ?? "?"}章附近兑现`);

  return [
    `账本摘要：待兑现=${ledger.summary.pendingCount}，紧急=${ledger.summary.urgentCount}，逾期=${ledger.summary.overdueCount}，已兑现=${ledger.summary.paidOffCount}`,
    `当前未兑现项：${pendingItems.join("；") || "无"}`,
    `当前逾期项：${overdueItems.join("；") || "无"}`,
    `本章应触碰项：${touchNowItems.join("；") || "无"}`,
    `最近一次已兑现项：${recentlyPaidOff.join("；") || "无"}`,
  ].join("\n");
}
