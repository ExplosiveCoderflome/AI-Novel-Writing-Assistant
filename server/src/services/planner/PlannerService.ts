import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { AuditReport, ReplanResult } from "@ai-novel/shared/types/novel";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import { prisma } from "../../db/prisma";
import { buildStoryModePromptBlock, normalizeStoryModeOutput } from "../storyMode/storyModeProfile";
import { parseJsonStringArray } from "../novel/novelP0Utils";
import { characterDynamicsQueryService } from "../novel/dynamics/CharacterDynamicsQueryService";
import { mapRowToPlan } from "../novel/storyMacro/storyMacroPlanPersistence";
import { stateService } from "../state/StateService";
import {
  buildDefaultPlanMetadata,
  enrichStoryPlan,
  normalizePlanMetadata,
} from "./plannerPlanMetadata";
import { persistStoryPlan } from "./plannerPersistence";
import { invokePlannerLLM, type PlannerLlmOptions } from "./plannerLlm";
import {
  buildArcPlanContextBlocks,
  buildBookPlanContextBlocks,
  buildChapterPlanContextBlocks,
} from "./plannerContextBlocks";
import { resolveChapterPlanParticipants } from "./plannerParticipantResolution";

export { normalizePlannerOutput } from "./plannerOutputNormalization";

interface PlannerOptions extends PlannerLlmOptions {}

interface ReplanInput extends PlannerOptions {
  chapterId?: string;
  triggerType?: string;
  sourceIssueIds?: string[];
  windowSize?: number;
  reason: string;
}

interface GenerateChapterPlanOptions extends PlannerOptions {
  replanContext?: {
    reason: string;
    triggerType: string;
    sourceIssueIds: string[];
    windowIndex: number;
    windowSize: number;
    affectedChapterOrders: number[];
    replannedFromPlanId: string | null;
  };
}

type PlannerStoryModeRow = {
  id: string;
  name: string;
  description: string | null;
  template: string | null;
  parentId: string | null;
  profileJson: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const plannerStoryModeSelect = {
  id: true,
  name: true,
  description: true,
  template: true,
  parentId: true,
  profileJson: true,
  createdAt: true,
  updatedAt: true,
} as const;

function buildPlannerStoryModeBlock(input: {
  primaryStoryMode?: PlannerStoryModeRow | null;
  secondaryStoryMode?: PlannerStoryModeRow | null;
}): string {
  return buildStoryModePromptBlock({
    primary: input.primaryStoryMode ? normalizeStoryModeOutput(input.primaryStoryMode) : null,
    secondary: input.secondaryStoryMode ? normalizeStoryModeOutput(input.secondaryStoryMode) : null,
  });
}

type PlannerMappedVolume = {
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

function buildStoryMacroSummary(plan: StoryMacroPlan | null): string {
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

function buildCurrentVolumeWindowSummary(
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

function buildPlannerCharacterDynamicsContext(overview: PlannerCharacterDynamicsOverview | null): {
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

export class PlannerService {
  async getChapterPlan(novelId: string, chapterId: string) {
    const plan = await prisma.storyPlan.findFirst({
      where: { novelId, chapterId, level: "chapter", status: { not: "stale" } },
      include: {
        scenes: {
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    return plan ? enrichStoryPlan(plan as any) : null;
  }

  async getBookPlan(novelId: string) {
    const plan = await prisma.storyPlan.findFirst({
      where: { novelId, level: "book" },
      include: {
        scenes: {
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    return plan ? enrichStoryPlan(plan as any) : null;
  }

  async listArcPlans(novelId: string) {
    const plans = await prisma.storyPlan.findMany({
      where: { novelId, level: "arc" },
      include: {
        scenes: {
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" },
      ],
      take: 6,
    });
    return plans.map((plan) => enrichStoryPlan(plan as any));
  }

  async buildPlanPromptBlock(novelId: string, chapterId: string): Promise<string> {
    const plan = await this.getChapterPlan(novelId, chapterId);
    if (!plan) {
      return "";
    }
    const participants = parseJsonStringArray(plan.participantsJson);
    const reveals = parseJsonStringArray(plan.revealsJson);
    const riskNotes = parseJsonStringArray(plan.riskNotesJson);
    const sceneLines = plan.scenes
      .map((scene: (typeof plan.scenes)[number]) => `${scene.sortOrder}. ${scene.title}${scene.objective ? ` | 目标:${scene.objective}` : ""}${scene.conflict ? ` | 冲突:${scene.conflict}` : ""}${scene.reveal ? ` | 揭露:${scene.reveal}` : ""}${scene.emotionBeat ? ` | 情绪:${scene.emotionBeat}` : ""}`)
      .join("\n");
    return [
      `Plan title: ${plan.title}`,
      plan.planRole ? `Plan role: ${plan.planRole}` : "",
      plan.phaseLabel ? `Phase: ${plan.phaseLabel}` : "",
      `Objective: ${plan.objective}`,
      participants.length > 0 ? `Participants: ${participants.join("、")}` : "",
      reveals.length > 0 ? `Key reveals: ${reveals.join("；")}` : "",
      riskNotes.length > 0 ? `Risk notes: ${riskNotes.join("；")}` : "",
      plan.mustAdvanceJson ? `Must advance: ${parseJsonStringArray(plan.mustAdvanceJson).join("；")}` : "",
      plan.mustPreserveJson ? `Must preserve: ${parseJsonStringArray(plan.mustPreserveJson).join("；")}` : "",
      plan.hookTarget ? `Hook target: ${plan.hookTarget}` : "",
      sceneLines ? `Scenes:\n${sceneLines}` : "",
    ].filter(Boolean).join("\n");
  }

  async ensureChapterPlan(novelId: string, chapterId: string, options: PlannerOptions = {}) {
    const existing = await this.getChapterPlan(novelId, chapterId);
    if (existing && existing.scenes.length > 0) {
      return existing;
    }
    return this.generateChapterPlan(novelId, chapterId, options);
  }

  async generateBookPlan(novelId: string, options: PlannerOptions = {}) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: {
        bible: true,
        chapters: { orderBy: { order: "asc" }, select: { title: true, order: true, expectation: true } },
        plotBeats: { orderBy: { chapterOrder: "asc" }, take: 8 },
        primaryStoryMode: { select: plannerStoryModeSelect },
        secondaryStoryMode: { select: plannerStoryModeSelect },
      },
    });
    if (!novel) {
      throw new Error("小说不存在。");
    }
    const storyModeBlock = buildPlannerStoryModeBlock(novel);
    const contextBlocks = buildBookPlanContextBlocks({
      novelTitle: novel.title,
      description: novel.description,
      bible: novel.bible?.rawContent ?? "无",
      chapterDrafts: novel.chapters.map((item) => `${item.order}.${item.title} ${item.expectation ?? ""}`).join("\n") || "无",
      plotBeats: novel.plotBeats.map((item) => `${item.chapterOrder ?? "-"} ${item.title} ${item.content}`).join("\n") || "无",
      storyModeBlock,
    });
    const output = await invokePlannerLLM({
      options,
      scopeLabel: `全书规划：${novel.title}`,
      planLevel: "book",
      contextBlocks,
    });
    const metadata = normalizePlanMetadata("book", output, buildDefaultPlanMetadata("book"));
    return persistStoryPlan({
      novelId,
      level: "book",
      title: output.title || `${novel.title} 全书规划`,
      objective: output.objective || "建立全书目标与主线推进。",
      participants: output.participants ?? [],
      reveals: output.reveals ?? [],
      riskNotes: output.riskNotes ?? [],
      hookTarget: output.hookTarget || null,
      scenes: [],
      planRole: metadata.planRole,
      phaseLabel: metadata.phaseLabel,
      mustAdvance: metadata.mustAdvance,
      mustPreserve: metadata.mustPreserve,
      sourceIssueIds: metadata.sourceIssueIds,
      replannedFromPlanId: metadata.replannedFromPlanId,
    });
  }

  async generateArcPlan(novelId: string, arcId: string, options: PlannerOptions = {}) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: {
        bible: true,
        chapters: { orderBy: { order: "asc" }, select: { title: true, order: true, expectation: true } },
        primaryStoryMode: { select: plannerStoryModeSelect },
        secondaryStoryMode: { select: plannerStoryModeSelect },
      },
    });
    if (!novel) {
      throw new Error("小说不存在。");
    }
    const storyModeBlock = buildPlannerStoryModeBlock(novel);
    const contextBlocks = buildArcPlanContextBlocks({
      novelTitle: novel.title,
      description: novel.description,
      bible: novel.bible?.rawContent ?? "无",
      chapters: novel.chapters.map((item) => `${item.order}.${item.title} ${item.expectation ?? ""}`).join("\n") || "无",
      storyModeBlock,
    });
    const output = await invokePlannerLLM({
      options,
      scopeLabel: `分段规划：${arcId}`,
      planLevel: "arc",
      contextBlocks,
    });
    const metadata = normalizePlanMetadata("arc", output, buildDefaultPlanMetadata("arc"));
    return persistStoryPlan({
      novelId,
      level: "arc",
      externalRef: arcId,
      title: output.title || `Arc ${arcId}`,
      objective: output.objective || `围绕 ${arcId} 推进主线`,
      participants: output.participants ?? [],
      reveals: output.reveals ?? [],
      riskNotes: output.riskNotes ?? [],
      hookTarget: output.hookTarget || null,
      scenes: [],
      planRole: metadata.planRole,
      phaseLabel: metadata.phaseLabel,
      mustAdvance: metadata.mustAdvance,
      mustPreserve: metadata.mustPreserve,
      sourceIssueIds: metadata.sourceIssueIds,
      replannedFromPlanId: metadata.replannedFromPlanId,
    });
  }

  async generateChapterPlan(novelId: string, chapterId: string, options: GenerateChapterPlanOptions = {}) {
    const [novel, chapter, bible, plotBeats, summaries, characters, bookPlan, arcPlans, volumePlans, recentAuditReports, recentDecisions, storyMacroPlanRow] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: novelId },
        select: {
          id: true,
          title: true,
          description: true,
          outline: true,
          structuredOutline: true,
          estimatedChapterCount: true,
          targetAudience: true,
          bookSellingPoint: true,
          competingFeel: true,
          first30ChapterPromise: true,
          narrativePov: true,
          pacePreference: true,
          emotionIntensity: true,
          styleTone: true,
          primaryStoryMode: { select: plannerStoryModeSelect },
          secondaryStoryMode: { select: plannerStoryModeSelect },
        },
      }),
      prisma.chapter.findFirst({
        where: { id: chapterId, novelId },
        select: {
          id: true,
          title: true,
          order: true,
          expectation: true,
          content: true,
          targetWordCount: true,
          conflictLevel: true,
          revealLevel: true,
          hook: true,
          taskSheet: true,
        },
      }),
      prisma.novelBible.findUnique({
        where: { novelId },
        select: { rawContent: true },
      }),
      prisma.plotBeat.findMany({
        where: { novelId },
        orderBy: { chapterOrder: "asc" },
        take: 8,
      }),
      prisma.chapterSummary.findMany({
        where: { novelId },
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
      prisma.character.findMany({
        where: { novelId },
        select: { id: true, name: true, role: true, currentGoal: true, currentState: true },
      }),
      this.getBookPlan(novelId),
      this.listArcPlans(novelId),
      prisma.volumePlan.findMany({
        where: { novelId },
        orderBy: { sortOrder: "asc" },
        include: {
          chapters: {
            orderBy: { chapterOrder: "asc" },
          },
        },
      }),
      prisma.auditReport.findMany({
        where: { novelId },
        orderBy: { createdAt: "desc" },
        take: 4,
        include: {
          issues: {
            where: { status: "open" },
          },
        },
      }),
      prisma.creativeDecision.findMany({
        where: { novelId },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          category: true,
          content: true,
          importance: true,
        },
      }),
      prisma.storyMacroPlan.findUnique({
        where: { novelId },
      }),
    ]);
    if (!novel || !chapter) {
      throw new Error("小说或章节不存在。");
    }
    const storyModeBlock = buildPlannerStoryModeBlock(novel);
    const storyMacroPlan = storyMacroPlanRow ? mapRowToPlan(storyMacroPlanRow) : null;
    const characterDynamicsOverview = await characterDynamicsQueryService.getOverview(novelId, {
      chapterOrder: chapter.order,
    }).catch(() => null);
    const characterDynamicsContext = buildPlannerCharacterDynamicsContext(characterDynamicsOverview);
    const mappedVolumes = volumePlans.map((volume) => ({
      id: volume.id,
      novelId,
      sortOrder: volume.sortOrder,
      title: volume.title,
      summary: volume.summary,
      mainPromise: volume.mainPromise,
      escalationMode: volume.escalationMode,
      protagonistChange: volume.protagonistChange,
      climax: volume.climax,
      nextVolumeHook: volume.nextVolumeHook,
      resetPoint: volume.resetPoint,
      openPayoffs: volume.openPayoffsJson ? JSON.parse(volume.openPayoffsJson) as string[] : [],
      status: volume.status,
      sourceVersionId: volume.sourceVersionId,
      chapters: volume.chapters.map((item) => ({
        id: item.id,
        volumeId: item.volumeId,
        chapterOrder: item.chapterOrder,
        title: item.title,
        summary: item.summary,
        purpose: item.purpose,
        conflictLevel: item.conflictLevel,
        revealLevel: item.revealLevel,
        targetWordCount: item.targetWordCount,
        mustAvoid: item.mustAvoid,
        taskSheet: item.taskSheet,
        payoffRefs: item.payoffRefsJson ? JSON.parse(item.payoffRefsJson) as string[] : [],
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      createdAt: volume.createdAt.toISOString(),
      updatedAt: volume.updatedAt.toISOString(),
    }));
    const plannerVolumes: PlannerMappedVolume[] = mappedVolumes.map((volume) => ({
      sortOrder: volume.sortOrder,
      title: volume.title,
      summary: volume.summary,
      mainPromise: volume.mainPromise,
      climax: volume.climax,
      openPayoffs: volume.openPayoffs,
      updatedAt: volume.updatedAt,
      chapters: volume.chapters.map((item) => ({
        chapterOrder: item.chapterOrder,
        title: item.title,
        summary: item.summary,
      })),
    }));
    const stateSnapshot = await stateService.getLatestSnapshotBeforeChapter(novelId, chapter.order);
    const defaultMetadata = buildDefaultPlanMetadata("chapter", {
      chapterOrder: chapter.order,
      totalChapters: novel.estimatedChapterCount ?? null,
      expectation: chapter.expectation ?? null,
    });
    const openAuditIssues = recentAuditReports.flatMap((report) => report.issues.map((issue) => (
      `${issue.auditType}/${issue.severity}: ${issue.description} | 证据=${issue.evidence}`
    )));
    const replanContextBlock = options.replanContext
      ? [
          `重规划原因：${options.replanContext.reason}`,
          `触发类型：${options.replanContext.triggerType}`,
          `重规划窗口：第 ${options.replanContext.affectedChapterOrders.join("、")} 章`,
          options.replanContext.sourceIssueIds.length > 0
            ? `来源问题：${options.replanContext.sourceIssueIds.join("、")}`
            : "",
          options.replanContext.replannedFromPlanId
            ? `上一版计划：${options.replanContext.replannedFromPlanId}`
            : "",
        ].filter(Boolean).join("\n")
      : "无";
    const contextBlocks = buildChapterPlanContextBlocks({
      novelTitle: novel.title,
      description: novel.description,
      targetAudience: novel.targetAudience,
      bookSellingPoint: novel.bookSellingPoint,
      competingFeel: novel.competingFeel,
      first30ChapterPromise: novel.first30ChapterPromise,
      narrativePov: novel.narrativePov,
      pacePreference: novel.pacePreference,
      emotionIntensity: novel.emotionIntensity,
      styleTone: novel.styleTone,
      chapterExpectation: chapter.expectation,
      chapterTaskSheet: chapter.taskSheet,
      chapterTargetWordCount: chapter.targetWordCount,
      bible: bible?.rawContent ?? "无",
      outline: novel.outline,
      structuredOutline: novel.structuredOutline,
      mappedVolumes: plannerVolumes.map((volume) => ({
        sortOrder: volume.sortOrder,
        title: volume.title,
        summary: volume.summary,
        mainPromise: volume.mainPromise,
        climax: volume.climax,
        updatedAt: volume.updatedAt,
        chapters: volume.chapters,
      })),
      bookPlan: bookPlan ? `${bookPlan.title} | ${bookPlan.objective}${bookPlan.phaseLabel ? ` | 阶段=${bookPlan.phaseLabel}` : ""}` : "无",
      arcPlans: arcPlans.length > 0
        ? arcPlans.map((plan) => `${plan.externalRef ?? "-"} ${plan.title} | ${plan.objective}${plan.phaseLabel ? ` | 阶段=${plan.phaseLabel}` : ""}`).join("\n")
        : "无",
      characters: characters.map((item) => `${item.id}|${item.name}|${item.role}|goal=${item.currentGoal ?? ""}|state=${item.currentState ?? ""}`).join("\n") || "无",
      recentSummaries: summaries.map((item) => `${item.summary}`).join("\n") || "无",
      plotBeats: plotBeats.map((item) => `${item.chapterOrder ?? "-"} ${item.title} ${item.content}`).join("\n") || "无",
      stateSnapshot: stateSnapshot?.summary ?? "无",
      openAuditIssues: openAuditIssues.join("\n") || "无",
      recentDecisions: recentDecisions.map((item) => `${item.category}/${item.importance}: ${item.content}`).join("\n") || "无",
      characterDynamicsSummary: characterDynamicsContext.summary,
      characterVolumeAssignments: characterDynamicsContext.volumeAssignments,
      characterRelationStages: characterDynamicsContext.relationStages,
      characterCandidateGuards: characterDynamicsContext.candidateGuards,
      defaultMetadata: [
        `planRole=${defaultMetadata.planRole ?? "progress"} | phase=${defaultMetadata.phaseLabel ?? "无"}`,
        `mustAdvance=${defaultMetadata.mustAdvance.join("；") || "无"}`,
        `mustPreserve=${defaultMetadata.mustPreserve.join("；") || "无"}`,
      ].join("\n"),
      replanContext: replanContextBlock,
      storyMacroSummary: buildStoryMacroSummary(storyMacroPlan),
      currentVolumeWindow: buildCurrentVolumeWindowSummary(plannerVolumes, chapter.order),
      storyModeBlock,
    });
    const output = await invokePlannerLLM({
      options,
      scopeLabel: `章节规划：第${chapter.order}章《${chapter.title}》`,
      planLevel: "chapter",
      contextBlocks,
    });
    const metadata = normalizePlanMetadata("chapter", output, {
      ...defaultMetadata,
      sourceIssueIds: options.replanContext?.sourceIssueIds ?? [],
      replannedFromPlanId: options.replanContext?.replannedFromPlanId ?? null,
    });
    const resolvedParticipants = resolveChapterPlanParticipants({
      outputParticipants: output.participants ?? [],
      characters,
      characterDynamicsOverview,
      chapterOrder: chapter.order,
    });

    return persistStoryPlan({
      novelId,
      chapterId: chapter.id,
      sourceStateSnapshotId: stateSnapshot?.id ?? null,
      level: "chapter",
      title: output.title || chapter.title,
      objective: output.objective || chapter.expectation?.trim() || `推进第${chapter.order}章主线。`,
      participants: resolvedParticipants,
      reveals: output.reveals ?? [],
      riskNotes: output.riskNotes ?? [],
      hookTarget: output.hookTarget || chapter.hook?.trim() || null,
      scenes: output.scenes ?? [],
      planRole: metadata.planRole,
      phaseLabel: metadata.phaseLabel,
      mustAdvance: metadata.mustAdvance,
      mustPreserve: metadata.mustPreserve,
      sourceIssueIds: metadata.sourceIssueIds,
      replannedFromPlanId: metadata.replannedFromPlanId,
    });
  }

  async replan(novelId: string, input: ReplanInput): Promise<ReplanResult> {
    const targetChapter = input.chapterId
      ? await prisma.chapter.findFirst({
          where: { id: input.chapterId, novelId },
          select: { id: true, order: true },
        })
      : await prisma.chapter.findFirst({
          where: { novelId },
          orderBy: { order: "desc" },
          select: { id: true, order: true },
        });
    if (!targetChapter) {
      throw new Error("当前小说没有可重规划的章节。");
    }
    const windowSize = Math.max(1, Math.min(input.windowSize ?? 3, 5));
    const affectedChapters = await prisma.chapter.findMany({
      where: {
        novelId,
        order: {
          gte: targetChapter.order,
          lte: targetChapter.order + windowSize - 1,
        },
      },
      orderBy: { order: "asc" },
      select: { id: true, order: true },
    });
    if (affectedChapters.length === 0) {
      throw new Error("当前小说没有可重规划的章节。");
    }

    const generatedPlans = [];
    const affectedOrders = affectedChapters.map((item) => item.order);

    for (let index = 0; index < affectedChapters.length; index += 1) {
      const chapter = affectedChapters[index];
      const existingPlan = await this.getChapterPlan(novelId, chapter.id);
      const plan = await this.generateChapterPlan(novelId, chapter.id, {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature,
        replanContext: {
          reason: input.reason,
          triggerType: input.triggerType ?? "manual",
          sourceIssueIds: input.sourceIssueIds ?? [],
          windowIndex: index,
          windowSize: affectedChapters.length,
          affectedChapterOrders: affectedOrders,
          replannedFromPlanId: existingPlan?.id ?? null,
        },
      });
      generatedPlans.push(plan);
    }

    const primaryPlan = generatedPlans[0];
    if (!primaryPlan) {
      throw new Error("章节规划生成失败。");
    }
    const runPayload = {
      affectedChapterIds: affectedChapters.map((item) => item.id),
      affectedChapterOrders: affectedOrders,
      generatedPlanIds: generatedPlans.map((plan) => plan.id),
      sourceIssueIds: input.sourceIssueIds ?? [],
      triggerType: input.triggerType ?? "manual",
      reason: input.reason,
      windowSize: affectedChapters.length,
    };

    const run = await prisma.replanRun.create({
      data: {
        novelId,
        chapterId: targetChapter.id,
        sourcePlanId: primaryPlan.replannedFromPlanId ?? null,
        triggerType: input.triggerType ?? "manual",
        reason: input.reason,
        outputSummary: JSON.stringify(runPayload),
      },
    });
    return {
      primaryPlan,
      generatedPlans,
      affectedChapterIds: runPayload.affectedChapterIds,
      affectedChapterOrders: runPayload.affectedChapterOrders,
      sourceIssueIds: runPayload.sourceIssueIds,
      triggerType: runPayload.triggerType,
      reason: runPayload.reason,
      windowSize: runPayload.windowSize,
      run: {
        id: run.id,
        outputSummary: run.outputSummary ?? null,
        createdAt: run.createdAt.toISOString(),
      },
    };
  }

  shouldTriggerReplanFromAudit(auditReports: AuditReport[]): boolean {
    return auditReports.some((report) => report.issues.some((issue) => issue.status === "open" && (issue.severity === "high" || issue.severity === "critical")));
  }
}

export const plannerService = new PlannerService();
