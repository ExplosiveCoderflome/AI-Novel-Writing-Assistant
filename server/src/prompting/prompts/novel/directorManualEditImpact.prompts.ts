import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type {
  AiManualEditImpactDecision,
  DirectorManualEditInventory,
  DirectorWorkspaceInventory,
} from "@ai-novel/shared/types/directorRuntime";
import type { PromptAsset } from "../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../core/renderContextBlocks";

export interface DirectorManualEditImpactPromptInput {
  inventory: DirectorWorkspaceInventory;
  editInventory: DirectorManualEditInventory;
}

const repairStepSchema = z.object({
  action: z.enum([
    "continue_chapter_execution",
    "review_recent_chapters",
    "update_continuity_state",
    "repair_scope",
    "ask_user_confirmation",
  ]),
  label: z.string().min(1),
  reason: z.string().min(1),
  affectedScope: z.string().nullable().optional(),
  requiresApproval: z.boolean(),
});

export const directorManualEditImpactDecisionSchema = z.object({
  impactLevel: z.enum(["none", "low", "medium", "high"]),
  affectedArtifactIds: z.array(z.string()).default([]),
  minimalRepairPath: z.array(repairStepSchema).default([]),
  safeToContinue: z.boolean(),
  requiresApproval: z.boolean(),
  summary: z.string().min(1),
  riskNotes: z.array(z.string()).default([]),
  evidenceRefs: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
}) satisfies z.ZodType<AiManualEditImpactDecision>;

function formatManualEditContext(input: DirectorManualEditImpactPromptInput): string {
  return JSON.stringify({
    novelId: input.inventory.novelId,
    novelTitle: input.inventory.novelTitle,
    changedChapters: input.editInventory.changedChapters,
    relatedArtifacts: input.inventory.artifacts
      .filter((artifact) => (
        input.editInventory.changedChapters.some((chapter) => (
          chapter.relatedArtifactIds.includes(artifact.id)
          || artifact.targetId === chapter.chapterId
          || artifact.dependsOn?.some((dependency) => chapter.relatedArtifactIds.includes(dependency.artifactId))
        ))
      ))
      .map((artifact) => ({
        id: artifact.id,
        artifactType: artifact.artifactType,
        targetType: artifact.targetType,
        targetId: artifact.targetId,
        status: artifact.status,
        source: artifact.source,
        protectedUserContent: artifact.protectedUserContent,
        dependsOn: artifact.dependsOn,
      })),
    productionSignals: {
      hasStoryMacro: input.inventory.hasStoryMacro,
      hasCharacters: input.inventory.hasCharacters,
      hasVolumeStrategy: input.inventory.hasVolumeStrategy,
      hasChapterPlan: input.inventory.hasChapterPlan,
      draftedChapterCount: input.inventory.draftedChapterCount,
      pendingRepairChapterCount: input.inventory.pendingRepairChapterCount,
    },
  }, null, 2);
}

export const directorManualEditImpactPrompt: PromptAsset<
  DirectorManualEditImpactPromptInput,
  AiManualEditImpactDecision
> = {
  id: "novel.director.manual_edit_impact",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 3600,
    requiredGroups: ["manual_edit_inventory"],
  },
  outputSchema: directorManualEditImpactDecisionSchema,
  render: (_input, context) => [
    new SystemMessage([
      "你是长篇小说自动导演的手动编辑影响分析器。",
      "你的任务是根据确定性编辑清单和产物依赖，判断用户改动会影响哪些后续产物，并给出最小修复路径。",
      "",
      "必须遵守：",
      "1. 优先保护用户已经改过的正文，不要建议直接覆盖用户内容。",
      "2. 只基于清单里的章节、产物、依赖和状态做判断，不要编造不存在的章节或资产。",
      "3. 如果只是轻微润色，建议复查或更新连续性，不要重做宏观规划。",
      "4. 如果改动可能影响角色动机、关键伏笔、承诺兑现或后续章节任务单，说明需要复核的最小范围。",
      "5. 输出严格 JSON，不要输出 Markdown 或额外解释。",
    ].join("\n")),
    new HumanMessage([
      "请评估用户手动修改后的影响范围和继续路径。",
      "",
      "【分层上下文】",
      renderSelectedContextBlocks(context),
      "",
      "请输出结构化判断：impactLevel、affectedArtifactIds、minimalRepairPath、safeToContinue、requiresApproval、summary、riskNotes、evidenceRefs、confidence。",
    ].join("\n")),
  ],
  structuredOutputHint: {
    example: (input: DirectorManualEditImpactPromptInput) => ({
      impactLevel: input.editInventory.changedChapters.length > 0 ? "low" : "none",
      affectedArtifactIds: input.editInventory.changedChapters.flatMap((chapter) => chapter.relatedArtifactIds),
      minimalRepairPath: input.editInventory.changedChapters.length > 0
        ? [{
          action: "review_recent_chapters",
          label: "复查最近修改章节",
          reason: "用户改过正文后，先确认本章连续性和审校结果是否仍可用。",
          affectedScope: input.editInventory.changedChapters.map((chapter) => `chapter:${chapter.chapterId}`).join(","),
          requiresApproval: false,
        }]
        : [],
      safeToContinue: input.editInventory.changedChapters.length === 0,
      requiresApproval: false,
      summary: input.editInventory.changedChapters.length > 0
        ? "检测到章节正文发生变化，建议先做局部复查。"
        : "没有检测到需要处理的手动正文改动。",
      riskNotes: [],
      evidenceRefs: ["manual_edit_inventory"],
      confidence: 0.72,
    }),
  },
};

export function buildDirectorManualEditImpactContextBlocks(input: DirectorManualEditImpactPromptInput) {
  const content = formatManualEditContext(input);
  return [
    {
      id: "manual_edit_inventory",
      group: "manual_edit_inventory",
      priority: 100,
      required: true,
      estimatedTokens: Math.ceil(content.length / 4),
      content,
    },
  ];
}
