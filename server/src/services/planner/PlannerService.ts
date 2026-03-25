import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { AuditReport, ReplanResult } from "@ai-novel/shared/types/novel";
import { prisma } from "../../db/prisma";
import { buildStoryModePromptBlock, normalizeStoryModeOutput } from "../storyMode/storyModeProfile";
import { parseJsonStringArray } from "../novel/novelP0Utils";
import { characterDynamicsQueryService } from "../novel/dynamics/CharacterDynamicsQueryService";
import { stateService } from "../state/StateService";
import { buildDerivedOutlineFromVolumes } from "../novel/volume/volumePlanUtils";
import {
  buildDefaultPlanMetadata,
  enrichStoryPlan,
  normalizePlanMetadata,
} from "./plannerPlanMetadata";
import { persistStoryPlan } from "./plannerPersistence";
import { invokePlannerLLM, type PlannerLlmOptions } from "./plannerLlm";

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
    const output = await invokePlannerLLM({
      options,
      storyModeBlock,
      scopeLabel: `全书规划：${novel.title}`,
      context: [
        `简介：${novel.description ?? ""}`,
        `作品圣经：${novel.bible?.rawContent ?? "无"}`,
        `章节草稿：${novel.chapters.map((item) => `${item.order}.${item.title} ${item.expectation ?? ""}`).join("\n") || "无"}`,
        `剧情拍点：${novel.plotBeats.map((item) => `${item.chapterOrder ?? "-"} ${item.title} ${item.content}`).join("\n") || "无"}`,
      ].join("\n\n"),
      includeScenes: false,
      planLevel: "book",
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
    const output = await invokePlannerLLM({
      options,
      storyModeBlock,
      scopeLabel: `分段规划：${arcId}`,
      context: [
        `小说：${novel.title}`,
        `简介：${novel.description ?? ""}`,
        `作品圣经：${novel.bible?.rawContent ?? "无"}`,
        `现有章节：${novel.chapters.map((item) => `${item.order}.${item.title} ${item.expectation ?? ""}`).join("\n") || "无"}`,
      ].join("\n\n"),
      includeScenes: false,
      planLevel: "arc",
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
    const [novel, chapter, bible, plotBeats, summaries, characters, bookPlan, arcPlans, volumePlans, recentAuditReports, recentDecisions] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: novelId },
        select: {
          id: true,
          title: true,
          description: true,
          outline: true,
          structuredOutline: true,
          estimatedChapterCount: true,
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
    ]);
    if (!novel || !chapter) {
      throw new Error("小说或章节不存在。");
    }
    const storyModeBlock = buildPlannerStoryModeBlock(novel);
    const characterDynamicsDigest = await characterDynamicsQueryService.buildContextDigest(novelId, {
      chapterOrder: chapter.order,
    }).catch(() => "");
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
    const volumeOutline = mappedVolumes.length > 0 ? buildDerivedOutlineFromVolumes(mappedVolumes) : "";
    const volumeSummary = mappedVolumes.length > 0
      ? mappedVolumes.map((volume) => `${volume.sortOrder}. ${volume.title} | ${volume.mainPromise ?? volume.summary ?? "无"}${volume.climax ? ` | 高潮=${volume.climax}` : ""}`).join("\n")
      : "无";
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
    const output = await invokePlannerLLM({
      options,
      storyModeBlock,
      scopeLabel: `章节规划：第${chapter.order}章《${chapter.title}》`,
      context: [
        `小说：${novel.title}`,
        `简介：${novel.description ?? ""}`,
        `章节目标草稿：${chapter.expectation ?? "无"}`,
        `任务单：${chapter.taskSheet ?? "无"}`,
        `作品圣经：${bible?.rawContent ?? "无"}`,
        `主线大纲：${volumeOutline || novel.outline || "无"}`,
        `结构化大纲：${novel.structuredOutline ?? "无"}`,
        `卷级工作台：${volumeSummary}`,
        `全书规划：${bookPlan ? `${bookPlan.title} | ${bookPlan.objective}${bookPlan.phaseLabel ? ` | 阶段=${bookPlan.phaseLabel}` : ""}` : "无"}`,
        `阶段规划：${arcPlans.length > 0 ? arcPlans.map((plan) => `${plan.externalRef ?? "-"} ${plan.title} | ${plan.objective}${plan.phaseLabel ? ` | 阶段=${plan.phaseLabel}` : ""}`).join("\n") : "无"}`,
        `角色：${characters.map((item) => `${item.id}|${item.name}|${item.role}|goal=${item.currentGoal ?? ""}|state=${item.currentState ?? ""}`).join("\n") || "无"}`,
        `最近章节摘要：${summaries.map((item) => `${item.summary}`).join("\n") || "无"}`,
        `剧情拍点：${plotBeats.map((item) => `${item.chapterOrder ?? "-"} ${item.title} ${item.content}`).join("\n") || "无"}`,
        `输入状态快照：${stateSnapshot?.summary ?? "无"}`,
        `最近未解决审计问题：${openAuditIssues.join("\n") || "无"}`,
        `最近创作决策：${recentDecisions.map((item) => `${item.category}/${item.importance}: ${item.content}`).join("\n") || "无"}`,
        `动态角色系统：${characterDynamicsDigest || "无"}`,
        `默认结构职责建议：planRole=${defaultMetadata.planRole ?? "progress"} | phase=${defaultMetadata.phaseLabel ?? "无"}`,
        `本章必须推进：${defaultMetadata.mustAdvance.join("；") || "无"}`,
        `本章必须保留：${defaultMetadata.mustPreserve.join("；") || "无"}`,
        `重规划输入：${replanContextBlock}`,
      ].join("\n\n"),
      includeScenes: true,
      planLevel: "chapter",
    });
    const metadata = normalizePlanMetadata("chapter", output, {
      ...defaultMetadata,
      sourceIssueIds: options.replanContext?.sourceIssueIds ?? [],
      replannedFromPlanId: options.replanContext?.replannedFromPlanId ?? null,
    });
    return persistStoryPlan({
      novelId,
      chapterId: chapter.id,
      sourceStateSnapshotId: stateSnapshot?.id ?? null,
      level: "chapter",
      title: output.title || chapter.title,
      objective: output.objective || chapter.expectation?.trim() || `推进第${chapter.order}章主线。`,
      participants: output.participants ?? characters.slice(0, 4).map((item) => item.name),
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
