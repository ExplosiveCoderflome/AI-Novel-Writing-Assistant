import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import {
  characterProfileImpactCandidateSchema,
  characterProfileImpactResourceTypes,
  characterProfileImpactSuggestionSchema,
  type CharacterProfileImpactCandidate,
  type CharacterProfileImpactSuggestion,
} from "@ai-novel/shared/types/director/characterProfileImpact";
import type { CharacterProfileDraft } from "@ai-novel/shared/types/director/characterProfile";
import type { PromptAsset } from "../../../core/promptTypes";

export interface CharacterProfileImpactPromptInput {
  character: {name: string; before: CharacterProfileDraft; after: CharacterProfileDraft};
  candidates: CharacterProfileImpactCandidate[];
}

const outputSchema = z.object({
  suggestions: z.array(characterProfileImpactSuggestionSchema).max(80),
}).strict();

function validateSuggestions(output: z.infer<typeof outputSchema>, input: CharacterProfileImpactPromptInput) {
  const candidates = new Map(input.candidates.map(candidate => [candidate.id, candidate]));
  const seen = new Set<string>();
  for (const suggestion of output.suggestions) {
    if (seen.has(suggestion.candidateId)) throw new Error("影响建议不能重复引用同一资料项。");
    seen.add(suggestion.candidateId);
    const candidate = candidates.get(suggestion.candidateId);
    if (!candidate) throw new Error("影响建议引用了不存在的资料项。");
    if (suggestion.resourceType !== candidate.resourceType || suggestion.resourceId !== candidate.resourceId
      || suggestion.field !== candidate.field || suggestion.before !== candidate.before || suggestion.updatedAt !== candidate.updatedAt) {
      throw new Error("影响建议与资料快照不一致。");
    }
    if (suggestion.applyMode !== candidate.applyMode) throw new Error("影响建议的应用方式与资料类型不一致。");
    if (suggestion.applyMode === "replace" && (!suggestion.after || suggestion.after === suggestion.before)) {
      throw new Error("可应用的影响建议必须提供新的完整内容。");
    }
    if (suggestion.resourceType === "prose" && (suggestion.applyMode !== "review" || suggestion.after !== null)) {
      throw new Error("正文影响只能先进入核对清单，不能直接覆盖正文。");
    }
    if (suggestion.resourceType === "prose") {
      const sourceParagraphs = candidate.paragraphs ?? [];
      const paragraphs = suggestion.paragraphs ?? [];
      if (!paragraphs.length || paragraphs.some(item => !sourceParagraphs.some(source => source.paragraph === item.paragraph && source.before === item.before))) {
        throw new Error("正文影响建议必须引用候选中的具体段落。");
      }
    }
  }
  return output;
}

export const characterProfileImpactPrompt: PromptAsset<
  CharacterProfileImpactPromptInput,
  z.infer<typeof outputSchema>
> = {
  id: "novel.director.character_profile_impact",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  management: {productPrompt: true, editModes: ["readonly"]},
  contextPolicy: {maxTokensBudget: 12000},
  contextRequirements: [],
  outputSchema,
  render: input => [
    new SystemMessage([
      "你是长篇小说角色资料影响分析器。作者正在修改一个角色的资料，你需要从确定性候选资料中筛出真正受影响的项目，并给出作者确认后才能使用的建议。",
      "只使用 candidates 中的资料，不要编造资源、章节或字段。每条建议必须引用真实 candidateId，并保留候选的 resourceType、resourceId、field、before 和 applyMode。",
      "简介、世界设定、人物关系、卷章规划和章节规划可以给出完整的新字段值，after 必须是可直接保存的完整内容。",
      "正文只做识别和核对建议，applyMode 必须为 review，after 返回 null。每条正文建议必须引用 candidates.paragraphs 中的具体段落并原样保留 paragraph 和 before。不要重写正文，也不要把正文建议标记为可直接应用。",
      "角色改名时，优先识别正文、简介、世界设定、关系和规划中使用旧名的地方。角色性格、目标、经历变化时，优先识别会改变行动因果、关系张力和后续章节任务的资料。",
      "没有足够证据支持修改时不要提出建议。reason 说明为什么受影响，confidence 为 0 到 1。输出严格 JSON。",
      `允许的资源类型：${characterProfileImpactResourceTypes.join("、")}`,
    ].join("\n")),
    new HumanMessage(JSON.stringify(input)),
  ],
  postValidate: validateSuggestions,
  structuredOutputHint: {
    example: () => ({suggestions: []}),
  },
};

export type CharacterProfileImpactPromptOutput = {suggestions: CharacterProfileImpactSuggestion[]};
