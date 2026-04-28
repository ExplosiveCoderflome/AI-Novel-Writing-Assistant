import type {
  AiManualEditImpactDecision,
  AiWorkspaceInterpretation,
  DirectorArtifactRef,
  DirectorManualEditImpact,
  DirectorManualEditInventory,
  DirectorWorkspaceAnalysis,
  DirectorWorkspaceInventory,
} from "@ai-novel/shared/types/directorRuntime";
import type { DirectorLLMOptions } from "@ai-novel/shared/types/novelDirector";
import { prisma } from "../../../../db/prisma";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import {
  buildDirectorWorkspaceAnalysisContextBlocks,
  directorWorkspaceAnalysisPrompt,
} from "../../../../prompting/prompts/novel/directorWorkspaceAnalysis.prompts";
import {
  buildDirectorManualEditImpactContextBlocks,
  directorManualEditImpactPrompt,
} from "../../../../prompting/prompts/novel/directorManualEditImpact.prompts";
import { DirectorRuntimeStore } from "./DirectorRuntimeStore";
import {
  buildDirectorArtifactId,
  normalizeDirectorArtifactTargets,
  stableDirectorContentHash,
  type DirectorArtifactTarget,
} from "./DirectorArtifactLedger";

function timestampOf(value?: string | null): number {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function resolveRelatedArtifactIds(artifacts: DirectorArtifactRef[], chapterId: string): string[] {
  const directIds = new Set(
    artifacts
      .filter((artifact) => artifact.targetType === "chapter" && artifact.targetId === chapterId)
      .map((artifact) => artifact.id),
  );
  const related = new Set(directIds);
  for (const artifact of artifacts) {
    if (artifact.dependsOn?.some((dependency) => directIds.has(dependency.artifactId))) {
      related.add(artifact.id);
    }
  }
  return [...related];
}

export function buildManualEditInventoryFromArtifacts(input: {
  novelId: string;
  artifacts: DirectorArtifactRef[];
  previousArtifacts?: DirectorArtifactRef[] | null;
  focusedChapterId?: string | null;
  comparedAgainstTaskId?: string | null;
  chapterMetaById?: Record<string, {
    title: string;
    order: number;
    changedAt?: string | null;
  }>;
  generatedAt?: string;
}): DirectorManualEditInventory {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const previousById = new Map((input.previousArtifacts ?? []).map((artifact) => [artifact.id, artifact]));
  const currentDrafts = input.artifacts
    .filter((artifact) => artifact.artifactType === "chapter_draft" && artifact.targetType === "chapter" && artifact.targetId)
    .sort((left, right) => timestampOf(right.updatedAt) - timestampOf(left.updatedAt));
  const hasBaseline = previousById.size > 0;
  const candidates = currentDrafts.filter((artifact) => {
    if (input.focusedChapterId && artifact.targetId !== input.focusedChapterId) {
      return false;
    }
    if (input.focusedChapterId) {
      return true;
    }
    const previous = previousById.get(artifact.id);
    return hasBaseline
      ? Boolean(previous?.contentHash && artifact.contentHash && previous.contentHash !== artifact.contentHash)
      : Boolean(artifact.protectedUserContent);
  });
  const selected = hasBaseline || input.focusedChapterId
    ? candidates
    : candidates.slice(0, 3);

  return {
    novelId: input.novelId,
    comparedAgainstTaskId: input.comparedAgainstTaskId ?? null,
    generatedAt,
    changedChapters: selected.map((artifact) => {
      const chapterId = artifact.targetId as string;
      const meta = input.chapterMetaById?.[chapterId];
      const previous = previousById.get(artifact.id);
      return {
        chapterId,
        title: meta?.title ?? `章节 ${chapterId}`,
        order: meta?.order ?? 0,
        changedAt: meta?.changedAt ?? artifact.updatedAt ?? null,
        contentHash: artifact.contentHash ?? null,
        previousContentHash: previous?.contentHash ?? null,
        relatedArtifactIds: resolveRelatedArtifactIds(input.artifacts, chapterId),
      };
    }),
  };
}

export function buildManualEditFallbackDecision(editInventory: DirectorManualEditInventory): AiManualEditImpactDecision {
  if (editInventory.changedChapters.length === 0) {
    return {
      impactLevel: "none",
      affectedArtifactIds: [],
      minimalRepairPath: [],
      safeToContinue: true,
      requiresApproval: false,
      summary: "没有检测到需要处理的手动正文改动。",
      riskNotes: [],
      evidenceRefs: ["manual_edit_inventory"],
      confidence: 0.65,
    };
  }
  const affectedArtifactIds = [...new Set(editInventory.changedChapters.flatMap((chapter) => chapter.relatedArtifactIds))];
  const affectedScope = editInventory.changedChapters
    .map((chapter) => `chapter:${chapter.chapterId}`)
    .join(",");
  return {
    impactLevel: editInventory.changedChapters.length > 2 ? "medium" : "low",
    affectedArtifactIds,
    minimalRepairPath: [{
      action: "review_recent_chapters",
      label: "复查最近修改章节",
      reason: "用户改过正文后，先确认本章审校结果、连续性和后续任务单是否仍然可用。",
      affectedScope,
      requiresApproval: false,
    }],
    safeToContinue: true,
    requiresApproval: false,
    summary: "检测到章节正文发生变化，建议先做局部复查，再继续自动导演。",
    riskNotes: [],
    evidenceRefs: ["manual_edit_inventory"],
    confidence: 0.6,
  };
}

function buildManualEditRecommendation(impact: DirectorManualEditImpact): DirectorWorkspaceAnalysis["recommendation"] {
  if (impact.changedChapters.length === 0) {
    return {
      action: "continue_chapter_execution",
      reason: "没有检测到需要处理的手动正文改动，可以继续当前生产链路。",
      affectedScope: "novel",
      riskLevel: "low",
    };
  }
  return {
    action: impact.requiresApproval ? "ask_user_confirmation" : "review_recent_chapters",
    reason: impact.summary,
    affectedScope: impact.changedChapters.map((chapter) => `chapter:${chapter.chapterId}`).join(","),
    riskLevel: impact.impactLevel === "high" ? "high" : impact.impactLevel === "medium" ? "medium" : "low",
  };
}

export class DirectorWorkspaceAnalyzer {
  constructor(private readonly runtimeStore = new DirectorRuntimeStore()) {}

  async analyze(input: {
    novelId: string;
    workflowTaskId?: string | null;
    includeAiInterpretation?: boolean;
    llm?: DirectorLLMOptions;
  }): Promise<DirectorWorkspaceAnalysis> {
    const inventory = await this.buildInventory(input.novelId);
    let interpretation: AiWorkspaceInterpretation | null = null;
    let promptMeta: DirectorWorkspaceAnalysis["prompt"] = null;

    if (input.includeAiInterpretation !== false) {
      const result = await runStructuredPrompt({
        asset: directorWorkspaceAnalysisPrompt,
        promptInput: { inventory },
        contextBlocks: buildDirectorWorkspaceAnalysisContextBlocks({ inventory }),
        options: {
          provider: input.llm?.provider,
          model: input.llm?.model,
          temperature: typeof input.llm?.temperature === "number" ? input.llm.temperature : 0.2,
          novelId: input.novelId,
          taskId: input.workflowTaskId ?? undefined,
          stage: "workspace_analysis",
          itemKey: "workspace_analyze",
          triggerReason: "director_runtime_workspace_analysis",
        },
      });
      interpretation = result.output;
      promptMeta = {
        promptId: result.meta.invocation.promptId,
        promptVersion: result.meta.invocation.promptVersion,
        provider: result.meta.provider,
        model: result.meta.model,
      };
    }

    const generatedAt = new Date().toISOString();
    const analysis: DirectorWorkspaceAnalysis = {
      novelId: input.novelId,
      inventory,
      interpretation,
      manualEditImpact: null,
      recommendation: interpretation?.recommendedAction ?? null,
      confidence: interpretation?.confidence ?? 0,
      evidenceRefs: interpretation?.evidenceRefs ?? ["workspace_inventory"],
      generatedAt,
      prompt: promptMeta,
    };

    if (input.workflowTaskId?.trim()) {
      await this.runtimeStore.recordWorkspaceAnalysis({
        taskId: input.workflowTaskId.trim(),
        analysis,
      });
    }

    return analysis;
  }

  async evaluateManualEditImpact(input: {
    novelId: string;
    workflowTaskId?: string | null;
    chapterId?: string | null;
    includeAiInterpretation?: boolean;
    llm?: DirectorLLMOptions;
  }): Promise<DirectorManualEditImpact> {
    const inventory = await this.buildInventory(input.novelId);
    const taskId = input.workflowTaskId?.trim() || null;
    const snapshot = taskId ? await this.runtimeStore.getSnapshot(taskId) : null;
    const previousArtifacts = snapshot?.lastWorkspaceAnalysis?.inventory.artifacts ?? snapshot?.artifacts ?? [];
    const editInventory = await this.buildManualEditInventory({
      novelId: input.novelId,
      inventory,
      previousArtifacts,
      focusedChapterId: input.chapterId,
      comparedAgainstTaskId: taskId,
    });

    let decision = buildManualEditFallbackDecision(editInventory);
    let promptMeta: DirectorManualEditImpact["prompt"] = null;

    if (input.includeAiInterpretation !== false && editInventory.changedChapters.length > 0) {
      const result = await runStructuredPrompt({
        asset: directorManualEditImpactPrompt,
        promptInput: { inventory, editInventory },
        contextBlocks: buildDirectorManualEditImpactContextBlocks({ inventory, editInventory }),
        options: {
          provider: input.llm?.provider,
          model: input.llm?.model,
          temperature: typeof input.llm?.temperature === "number" ? input.llm.temperature : 0.2,
          novelId: input.novelId,
          taskId: taskId ?? undefined,
          stage: "workspace_analysis",
          itemKey: "manual_edit_impact",
          triggerReason: "director_runtime_manual_edit_impact",
        },
      });
      decision = result.output;
      promptMeta = {
        promptId: result.meta.invocation.promptId,
        promptVersion: result.meta.invocation.promptVersion,
        provider: result.meta.provider,
        model: result.meta.model,
      };
    }

    const affectedArtifactIds = new Set([
      ...decision.affectedArtifactIds,
      ...editInventory.changedChapters.flatMap((chapter) => chapter.relatedArtifactIds),
    ]);
    const impact: DirectorManualEditImpact = {
      novelId: input.novelId,
      changedChapters: editInventory.changedChapters,
      affectedArtifacts: inventory.artifacts.filter((artifact) => affectedArtifactIds.has(artifact.id)),
      generatedAt: editInventory.generatedAt,
      ...decision,
      affectedArtifactIds: [...affectedArtifactIds],
      prompt: promptMeta,
    };

    if (taskId) {
      await this.runtimeStore.recordWorkspaceAnalysis({
        taskId,
        analysis: {
          novelId: input.novelId,
          inventory,
          interpretation: null,
          manualEditImpact: impact,
          recommendation: buildManualEditRecommendation(impact),
          confidence: impact.confidence,
          evidenceRefs: impact.evidenceRefs.length > 0 ? impact.evidenceRefs : ["manual_edit_inventory"],
          generatedAt: impact.generatedAt,
          prompt: promptMeta,
        },
      });
    }

    return impact;
  }

  private async buildManualEditInventory(input: {
    novelId: string;
    inventory: DirectorWorkspaceInventory;
    previousArtifacts: DirectorArtifactRef[];
    focusedChapterId?: string | null;
    comparedAgainstTaskId?: string | null;
  }): Promise<DirectorManualEditInventory> {
    const draftArtifacts = input.inventory.artifacts
      .filter((artifact) => artifact.artifactType === "chapter_draft" && artifact.targetType === "chapter" && artifact.targetId);
    const chapterIds = [...new Set(draftArtifacts.map((artifact) => artifact.targetId as string))];
    const chapters = chapterIds.length > 0
      ? await prisma.chapter.findMany({
        where: { novelId: input.novelId, id: { in: chapterIds } },
        select: {
          id: true,
          title: true,
          order: true,
          updatedAt: true,
        },
      })
      : [];
    const chapterMetaById = Object.fromEntries(chapters.map((chapter) => [
      chapter.id,
      {
        title: chapter.title,
        order: chapter.order,
        changedAt: chapter.updatedAt.toISOString(),
      },
    ]));
    return buildManualEditInventoryFromArtifacts({
      novelId: input.novelId,
      artifacts: input.inventory.artifacts,
      previousArtifacts: input.previousArtifacts,
      focusedChapterId: input.focusedChapterId,
      comparedAgainstTaskId: input.comparedAgainstTaskId,
      chapterMetaById,
    });
  }

  private async buildInventory(novelId: string): Promise<DirectorWorkspaceInventory> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        title: true,
        worldId: true,
        sourceKnowledgeDocumentId: true,
        continuationBookAnalysisId: true,
        updatedAt: true,
      },
    });
    if (!novel) {
      throw new Error("小说不存在，无法分析自动导演工作区。");
    }

    const [
      bookContract,
      storyMacro,
      characterCount,
      latestCharacter,
      volumePlans,
      chapterPlanCount,
      chapters,
      qualityReports,
      auditReports,
      activePipelineJob,
      activeDirectorRun,
      latestDirectorRun,
    ] = await Promise.all([
      prisma.bookContract.findUnique({
        where: { novelId },
        select: { id: true, updatedAt: true },
      }),
      prisma.storyMacroPlan.findUnique({
        where: { novelId },
        select: { id: true, updatedAt: true },
      }),
      prisma.character.count({ where: { novelId } }),
      prisma.character.findFirst({
        where: { novelId },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.volumePlan.findMany({
        where: { novelId },
        select: { id: true, updatedAt: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.volumeChapterPlan.count({
        where: {
          volume: { novelId },
        },
      }),
      prisma.chapter.findMany({
        where: { novelId },
        select: {
          id: true,
          content: true,
          taskSheet: true,
          repairHistory: true,
          generationState: true,
          chapterStatus: true,
          updatedAt: true,
        },
        orderBy: { order: "asc" },
        take: 120,
      }),
      prisma.qualityReport.findMany({
        where: { novelId },
        select: { id: true, chapterId: true, updatedAt: true },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.auditReport.findMany({
        where: { novelId },
        select: { id: true, chapterId: true, updatedAt: true },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.generationJob.findFirst({
        where: {
          novelId,
          status: { in: ["queued", "running"] },
        },
        select: { id: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.novelWorkflowTask.findFirst({
        where: {
          novelId,
          lane: "auto_director",
          status: { in: ["queued", "running", "waiting_approval"] },
        },
        select: { id: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.novelWorkflowTask.findFirst({
        where: {
          novelId,
          lane: "auto_director",
        },
        select: { id: true },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    const draftedChapters = chapters.filter((chapter) => (
      Boolean(chapter.content?.trim())
      || chapter.generationState !== "planned"
      || chapter.chapterStatus === "completed"
    ));
    const approvedChapterCount = chapters.filter((chapter) => (
      chapter.generationState === "approved"
      || chapter.generationState === "published"
      || chapter.chapterStatus === "completed"
    )).length;
    const pendingRepairChapterCount = chapters.filter((chapter) => chapter.chapterStatus === "needs_repair").length;

    const artifactTargets: DirectorArtifactTarget[] = [];
    if (bookContract) {
      artifactTargets.push({
        artifactType: "book_contract",
        targetType: "novel",
        targetId: novelId,
        contentRef: { table: "BookContract", id: bookContract.id },
        updatedAt: bookContract.updatedAt,
      });
    }
    if (storyMacro) {
      artifactTargets.push({
        artifactType: "story_macro",
        targetType: "novel",
        targetId: novelId,
        contentRef: { table: "StoryMacroPlan", id: storyMacro.id },
        updatedAt: storyMacro.updatedAt,
      });
    }
    if (characterCount > 0 && latestCharacter) {
      artifactTargets.push({
        artifactType: "character_cast",
        targetType: "novel",
        targetId: novelId,
        contentRef: { table: "Character", id: `novel:${novelId}` },
        updatedAt: latestCharacter.updatedAt,
        dependsOn: [
          ...(bookContract ? [{
            artifactId: buildDirectorArtifactId({
              type: "book_contract",
              targetType: "novel",
              targetId: novelId,
              table: "BookContract",
              id: bookContract.id,
            }),
            version: 1,
          }] : []),
          ...(storyMacro ? [{
            artifactId: buildDirectorArtifactId({
              type: "story_macro",
              targetType: "novel",
              targetId: novelId,
              table: "StoryMacroPlan",
              id: storyMacro.id,
            }),
            version: 1,
          }] : []),
        ],
      });
    }
    for (const volume of volumePlans) {
      artifactTargets.push({
        artifactType: "volume_strategy",
        targetType: "volume",
        targetId: volume.id,
        contentRef: { table: "VolumePlan", id: volume.id },
        updatedAt: volume.updatedAt,
        dependsOn: [
          ...(storyMacro ? [{
            artifactId: buildDirectorArtifactId({
              type: "story_macro",
              targetType: "novel",
              targetId: novelId,
              table: "StoryMacroPlan",
              id: storyMacro.id,
            }),
            version: 1,
          }] : []),
        ],
      });
    }
    for (const chapter of chapters) {
      const taskSheetArtifactId = buildDirectorArtifactId({
        type: "chapter_task_sheet",
        targetType: "chapter",
        targetId: chapter.id,
        table: "Chapter",
        id: chapter.id,
      });
      const draftArtifactId = buildDirectorArtifactId({
        type: "chapter_draft",
        targetType: "chapter",
        targetId: chapter.id,
        table: "Chapter",
        id: chapter.id,
      });
      if (chapter.taskSheet?.trim()) {
        artifactTargets.push({
          artifactType: "chapter_task_sheet",
          targetType: "chapter",
          targetId: chapter.id,
          contentRef: { table: "Chapter", id: chapter.id },
          updatedAt: chapter.updatedAt,
          contentHash: stableDirectorContentHash(chapter.taskSheet),
        });
      }
      if (chapter.content?.trim()) {
        artifactTargets.push({
          artifactType: "chapter_draft",
          targetType: "chapter",
          targetId: chapter.id,
          contentRef: { table: "Chapter", id: chapter.id },
          updatedAt: chapter.updatedAt,
          source: "user_edited",
          contentHash: stableDirectorContentHash(chapter.content),
          protectedUserContent: true,
          dependsOn: chapter.taskSheet?.trim()
            ? [{ artifactId: taskSheetArtifactId, version: 1 }]
            : [],
        });
      }
      if (chapter.chapterStatus === "needs_repair") {
        artifactTargets.push({
          artifactType: "repair_ticket",
          targetType: "chapter",
          targetId: chapter.id,
          contentRef: { table: "Chapter", id: chapter.id },
          updatedAt: chapter.updatedAt,
          contentHash: stableDirectorContentHash(chapter.repairHistory ?? chapter.content),
          dependsOn: chapter.content?.trim()
            ? [{ artifactId: draftArtifactId, version: 1 }]
            : [],
        });
      }
    }
    for (const report of qualityReports) {
      artifactTargets.push({
        artifactType: "audit_report",
        targetType: report.chapterId ? "chapter" : "novel",
        targetId: report.chapterId ?? novelId,
        contentRef: { table: "QualityReport", id: report.id },
        updatedAt: report.updatedAt,
        dependsOn: report.chapterId
          ? [{
            artifactId: buildDirectorArtifactId({
              type: "chapter_draft",
              targetType: "chapter",
              targetId: report.chapterId,
              table: "Chapter",
              id: report.chapterId,
            }),
            version: 1,
          }]
          : [],
      });
    }
    for (const report of auditReports) {
      artifactTargets.push({
        artifactType: "audit_report",
        targetType: "chapter",
        targetId: report.chapterId,
        contentRef: { table: "AuditReport", id: report.id },
        updatedAt: report.updatedAt,
        dependsOn: [{
          artifactId: buildDirectorArtifactId({
            type: "chapter_draft",
            targetType: "chapter",
            targetId: report.chapterId,
            table: "Chapter",
            id: report.chapterId,
          }),
          version: 1,
        }],
      });
    }

    return {
      novelId,
      novelTitle: novel.title,
      hasBookContract: Boolean(bookContract),
      hasStoryMacro: Boolean(storyMacro),
      hasCharacters: characterCount > 0,
      hasVolumeStrategy: volumePlans.length > 0,
      hasChapterPlan: chapterPlanCount > 0 || chapters.some((chapter) => Boolean(chapter.taskSheet?.trim())),
      chapterCount: chapters.length,
      draftedChapterCount: draftedChapters.length,
      approvedChapterCount,
      pendingRepairChapterCount,
      hasActivePipelineJob: Boolean(activePipelineJob),
      hasActiveDirectorRun: Boolean(activeDirectorRun),
      hasWorldBinding: Boolean(novel.worldId),
      hasSourceKnowledge: Boolean(novel.sourceKnowledgeDocumentId),
      hasContinuationAnalysis: Boolean(novel.continuationBookAnalysisId),
      activePipelineJobId: activePipelineJob?.id ?? null,
      activeDirectorTaskId: activeDirectorRun?.id ?? null,
      latestDirectorTaskId: latestDirectorRun?.id ?? null,
      artifacts: normalizeDirectorArtifactTargets(artifactTargets, novelId),
    };
  }
}
