import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type {
  DirectorWorkspaceInventory,
  AiWorkspaceInterpretation,
} from "@ai-novel/shared/types/directorRuntime";
import {
  DIRECTOR_ARTIFACT_TYPES,
} from "@ai-novel/shared/types/directorRuntime";
import type { PromptAsset } from "../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../core/renderContextBlocks";

export interface DirectorWorkspaceAnalysisPromptInput {
  inventory: DirectorWorkspaceInventory;
}

const artifactTypeSchema = z.enum(DIRECTOR_ARTIFACT_TYPES);

export const directorWorkspaceInterpretationSchema = z.object({
  productionStage: z.enum([
    "empty",
    "has_seed",
    "has_contract",
    "has_macro",
    "has_characters",
    "has_volume_plan",
    "has_chapter_plan",
    "has_drafts",
    "needs_repair",
    "unknown",
  ]),
  missingArtifacts: z.array(artifactTypeSchema).default([]),
  staleArtifacts: z.array(artifactTypeSchema).default([]),
  protectedUserContent: z.array(z.string()).default([]),
  recommendedAction: z.object({
    action: z.enum([
      "generate_candidates",
      "create_book_contract",
      "complete_story_macro",
      "prepare_characters",
      "build_volume_strategy",
      "build_chapter_tasks",
      "continue_chapter_execution",
      "review_recent_chapters",
      "repair_scope",
      "ask_user_confirmation",
    ]),
    reason: z.string().min(1),
    affectedScope: z.string().nullable().optional(),
    riskLevel: z.enum(["low", "medium", "high"]),
  }),
  confidence: z.number().min(0).max(1),
  evidenceRefs: z.array(z.string()).default([]),
  summary: z.string().min(1),
  riskNotes: z.array(z.string()).default([]),
}) satisfies z.ZodType<AiWorkspaceInterpretation>;

function formatInventory(inventory: DirectorWorkspaceInventory): string {
  return JSON.stringify({
    novelId: inventory.novelId,
    novelTitle: inventory.novelTitle,
    hasBookContract: inventory.hasBookContract,
    hasStoryMacro: inventory.hasStoryMacro,
    hasCharacters: inventory.hasCharacters,
    hasVolumeStrategy: inventory.hasVolumeStrategy,
    hasChapterPlan: inventory.hasChapterPlan,
    chapterCount: inventory.chapterCount,
    draftedChapterCount: inventory.draftedChapterCount,
    approvedChapterCount: inventory.approvedChapterCount,
    pendingRepairChapterCount: inventory.pendingRepairChapterCount,
    hasActivePipelineJob: inventory.hasActivePipelineJob,
    hasActiveDirectorRun: inventory.hasActiveDirectorRun,
    hasWorldBinding: inventory.hasWorldBinding,
    hasSourceKnowledge: inventory.hasSourceKnowledge,
    hasContinuationAnalysis: inventory.hasContinuationAnalysis,
    ledgerSummary: {
      missingArtifactTypes: inventory.missingArtifactTypes,
      staleArtifacts: inventory.staleArtifacts.map((artifact) => ({
        id: artifact.id,
        artifactType: artifact.artifactType,
        targetType: artifact.targetType,
        targetId: artifact.targetId,
        dependsOn: artifact.dependsOn,
      })),
      protectedUserContentArtifacts: inventory.protectedUserContentArtifacts.map((artifact) => ({
        id: artifact.id,
        artifactType: artifact.artifactType,
        targetType: artifact.targetType,
        targetId: artifact.targetId,
        source: artifact.source,
      })),
      needsRepairArtifacts: inventory.needsRepairArtifacts.map((artifact) => ({
        id: artifact.id,
        targetType: artifact.targetType,
        targetId: artifact.targetId,
      })),
    },
    artifactTypes: inventory.artifacts.map((artifact) => ({
      id: artifact.id,
      artifactType: artifact.artifactType,
      targetType: artifact.targetType,
      targetId: artifact.targetId,
      status: artifact.status,
      source: artifact.source,
      contentRef: artifact.contentRef,
    })),
  }, null, 2);
}

export const directorWorkspaceAnalysisPrompt: PromptAsset<
  DirectorWorkspaceAnalysisPromptInput,
  AiWorkspaceInterpretation
> = {
  id: "novel.director.workspace_analysis",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 3200,
    requiredGroups: ["workspace_inventory"],
  },
  outputSchema: directorWorkspaceInterpretationSchema,
  render: (_input, context) => [
    new SystemMessage([
      "你是长篇小说自动导演运行时的工作区分析器。",
      "你的任务是基于确定性 inventory 判断当前小说处于什么生产阶段、缺少什么导演产物、哪些内容需要保护，以及下一步最应该做什么。",
      "",
      "必须遵守：",
      "1. 不要编造 inventory 中不存在的资产。",
      "2. 如果正文已经存在，必须考虑用户内容保护，不要轻易建议覆盖。",
      "3. 质量问题、承诺问题或修复问题不应直接冻结整本书，应优先给出受影响范围和最小修复路径。",
      "4. 输出必须是严格 JSON，不要输出 Markdown 或解释。",
    ].join("\n")),
    new HumanMessage([
      "请分析当前小说工作区。",
      "",
      "【分层上下文】",
      renderSelectedContextBlocks(context),
      "",
      "请输出结构化判断：productionStage、missingArtifacts、staleArtifacts、protectedUserContent、recommendedAction、confidence、evidenceRefs、summary、riskNotes。",
    ].join("\n")),
  ],
  structuredOutputHint: {
    example: (input: DirectorWorkspaceAnalysisPromptInput) => ({
      productionStage: input.inventory.hasVolumeStrategy ? "has_volume_plan" : "has_seed",
      missingArtifacts: input.inventory.missingArtifactTypes.length > 0
        ? input.inventory.missingArtifactTypes
        : input.inventory.hasBookContract ? [] : ["book_contract"],
      staleArtifacts: input.inventory.staleArtifacts.map((artifact) => artifact.artifactType),
      protectedUserContent: input.inventory.protectedUserContentArtifacts.length > 0
        ? input.inventory.protectedUserContentArtifacts.map((artifact) => artifact.id)
        : input.inventory.draftedChapterCount > 0 ? ["已有章节正文"] : [],
      recommendedAction: {
        action: input.inventory.hasBookContract ? "continue_chapter_execution" : "create_book_contract",
        reason: "根据当前资产完整度选择最小下一步。",
        affectedScope: "novel",
        riskLevel: "low",
      },
      confidence: 0.78,
      evidenceRefs: ["workspace_inventory"],
      summary: "当前工作区已完成部分前置资产，需要补齐下一步导演产物。",
      riskNotes: [],
    }),
  },
};

export function buildDirectorWorkspaceAnalysisContextBlocks(input: DirectorWorkspaceAnalysisPromptInput) {
  return [
    {
      id: "workspace_inventory",
      group: "workspace_inventory",
      priority: 100,
      required: true,
      estimatedTokens: Math.ceil(formatInventory(input.inventory).length / 4),
      content: formatInventory(input.inventory),
    },
  ];
}
