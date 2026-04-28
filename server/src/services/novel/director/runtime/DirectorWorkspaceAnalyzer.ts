import { createHash } from "node:crypto";
import type {
  AiWorkspaceInterpretation,
  DirectorArtifactRef,
  DirectorArtifactType,
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
import { DirectorRuntimeStore } from "./DirectorRuntimeStore";

interface ArtifactTarget {
  artifactType: DirectorArtifactRef["artifactType"];
  targetType: DirectorArtifactRef["targetType"];
  targetId?: string | null;
  contentRef: DirectorArtifactRef["contentRef"];
  updatedAt?: Date | string | null;
  status?: DirectorArtifactRef["status"];
  source?: DirectorArtifactRef["source"];
  contentHash?: string | null;
  protectedUserContent?: boolean | null;
  dependsOn?: DirectorArtifactRef["dependsOn"];
}

function stableContentHash(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  return createHash("sha256").update(normalized).digest("hex");
}

function buildArtifactId(input: {
  type: DirectorArtifactType;
  targetType: DirectorArtifactRef["targetType"];
  targetId?: string | null;
  table: string;
  id: string;
}): string {
  return `${input.type}:${input.targetType}:${input.targetId ?? "global"}:${input.table}:${input.id}`;
}

function buildArtifact(input: {
  novelId: string;
  type: DirectorArtifactType;
  targetType: DirectorArtifactRef["targetType"];
  targetId?: string | null;
  table: string;
  id: string;
  updatedAt?: Date | string | null;
  status?: DirectorArtifactRef["status"];
  source?: DirectorArtifactRef["source"];
  contentHash?: string | null;
  protectedUserContent?: boolean | null;
  dependsOn?: DirectorArtifactRef["dependsOn"];
}): DirectorArtifactRef {
  return {
    id: buildArtifactId(input),
    novelId: input.novelId,
    artifactType: input.type,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    version: 1,
    status: input.status ?? "active",
    source: input.source ?? "backfilled",
    contentRef: {
      table: input.table,
      id: input.id,
    },
    contentHash: input.contentHash ?? null,
    schemaVersion: "legacy-wrapper-v1",
    protectedUserContent: input.protectedUserContent ?? null,
    dependsOn: input.dependsOn,
    updatedAt: input.updatedAt
      ? (input.updatedAt instanceof Date ? input.updatedAt.toISOString() : input.updatedAt)
      : null,
  };
}

function uniqueArtifacts(items: ArtifactTarget[], novelId: string): DirectorArtifactRef[] {
  const byKey = new Map<string, DirectorArtifactRef>();
  for (const item of items) {
    const artifact = buildArtifact({
      novelId,
      type: item.artifactType,
      targetType: item.targetType,
      targetId: item.targetId,
      table: item.contentRef.table,
      id: item.contentRef.id,
      updatedAt: item.updatedAt,
      status: item.status,
      source: item.source,
      contentHash: item.contentHash,
      protectedUserContent: item.protectedUserContent,
      dependsOn: item.dependsOn,
    });
    byKey.set(artifact.id, artifact);
  }
  return [...byKey.values()];
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

    const artifactTargets: ArtifactTarget[] = [];
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
            artifactId: buildArtifactId({
              type: "book_contract",
              targetType: "novel",
              targetId: novelId,
              table: "BookContract",
              id: bookContract.id,
            }),
            version: 1,
          }] : []),
          ...(storyMacro ? [{
            artifactId: buildArtifactId({
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
            artifactId: buildArtifactId({
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
      const taskSheetArtifactId = buildArtifactId({
        type: "chapter_task_sheet",
        targetType: "chapter",
        targetId: chapter.id,
        table: "Chapter",
        id: chapter.id,
      });
      const draftArtifactId = buildArtifactId({
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
          contentHash: stableContentHash(chapter.taskSheet),
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
          contentHash: stableContentHash(chapter.content),
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
          contentHash: stableContentHash(chapter.repairHistory ?? chapter.content),
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
            artifactId: buildArtifactId({
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
          artifactId: buildArtifactId({
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
      artifacts: uniqueArtifacts(artifactTargets, novelId),
    };
  }
}
