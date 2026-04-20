import type {
  GenerationContextPackage,
  RuntimeSceneGenerationResult,
} from "@ai-novel/shared/types/chapterRuntime";
import type { ChapterSceneCard } from "@ai-novel/shared/types/chapterLengthControl";
import type { ReviewIssue } from "@ai-novel/shared/types/novel";
import { createContextBlock } from "../../prompting/core/contextBudget";
import type { SceneRoundPlan } from "./runtime/sceneBudgetRuntime";

export function countChapterCharacters(content: string): number {
  return content.replace(/\s+/g, "").trim().length;
}

export function joinSceneContents(sceneContents: string[]): string {
  return sceneContents
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function resolveSceneWordRange(targetWordCount: number): {
  targetWordCount: number;
  minWordCount: number;
  maxWordCount: number;
} {
  const normalizedTarget = Math.max(1, Math.round(targetWordCount));
  return {
    targetWordCount: normalizedTarget,
    minWordCount: Math.max(1, Math.floor(normalizedTarget * 0.85)),
    maxWordCount: Math.max(1, Math.ceil(normalizedTarget * 1.15)),
  };
}

export function buildDraftContinuationBlock(
  content: string,
  targetWordCount?: number | null,
  minWordCount?: number | null,
): string {
  const trimmed = content.trim();
  const excerpt = trimmed.length > 1600 ? trimmed.slice(-1600) : trimmed;
  const lines = [
    `Current saved draft length: ${countChapterCharacters(trimmed)} Chinese characters.`,
  ];
  if (typeof targetWordCount === "number" && targetWordCount > 0
    && typeof minWordCount === "number" && minWordCount > 0) {
    lines.push(
      `Current scene target: about ${targetWordCount} Chinese characters. Minimum acceptable length: ${minWordCount}.`,
    );
  }
  lines.push(
    "Continue from the existing ending. Do not restart the chapter. Do not repeat already written events.",
    "Current draft tail (continue after this):",
    excerpt || "none",
  );
  return lines.join("\n");
}

export function buildSceneContractBlock(input: {
  scene: ChapterSceneCard;
  sceneIndex: number;
  sceneCount: number;
  roundPlan?: SceneRoundPlan | null;
}): ReturnType<typeof createContextBlock> {
  const roundPlan = input.roundPlan ?? null;
  return createContextBlock({
    id: `scene_contract_${input.scene.key}`,
    group: "scene_contract",
    priority: 101,
    required: true,
    content: [
      `Current scene: ${input.sceneIndex}/${input.sceneCount}`,
      `Scene title: ${input.scene.title}`,
      `Scene purpose: ${input.scene.purpose}`,
      `Entry state: ${input.scene.entryState}`,
      `Exit state: ${input.scene.exitState}`,
      input.scene.mustAdvance.length > 0 ? `Must advance: ${input.scene.mustAdvance.join(" | ")}` : "Must advance: none",
      input.scene.mustPreserve.length > 0 ? `Must preserve: ${input.scene.mustPreserve.join(" | ")}` : "Must preserve: none",
      input.scene.forbiddenExpansion.length > 0 ? `Forbidden expansion: ${input.scene.forbiddenExpansion.join(" | ")}` : "Forbidden expansion: none",
      roundPlan ? `Word control mode: ${roundPlan.mode}` : "",
      roundPlan ? `Current round: ${roundPlan.roundIndex}/${roundPlan.maxRounds}` : "",
      roundPlan ? `Closing phase: ${roundPlan.closingPhase ? "yes" : "no"}` : "",
      roundPlan ? `Is final round: ${roundPlan.isFinalRound ? "yes" : "no"}` : "",
    ].filter(Boolean).join("\n"),
  });
}

export function buildLengthIssue(
  category: ReviewIssue["category"],
  severity: ReviewIssue["severity"],
  evidence: string,
  fixSuggestion: string,
): ReviewIssue {
  return {
    severity,
    category,
    evidence,
    fixSuggestion,
  };
}

export function buildRepairBibleFallback(contextPackage: GenerationContextPackage): string {
  const fragments = [
    contextPackage.bookContract?.sellingPoint ? `核心卖点：${contextPackage.bookContract.sellingPoint}` : "",
    contextPackage.bookContract?.first30ChapterPromise ? `前30章承诺：${contextPackage.bookContract.first30ChapterPromise}` : "",
    contextPackage.macroConstraints?.coreConflict ? `核心冲突：${contextPackage.macroConstraints.coreConflict}` : "",
    contextPackage.macroConstraints?.progressionLoop ? `推进回路：${contextPackage.macroConstraints.progressionLoop}` : "",
    contextPackage.volumeWindow?.missionSummary ? `当前卷使命：${contextPackage.volumeWindow.missionSummary}` : "",
  ].filter(Boolean);
  return fragments.join("\n") || "none";
}

export function markTailCompression(
  sceneResults: RuntimeSceneGenerationResult[],
  tailCount: number,
  status: string,
): void {
  const startIndex = Math.max(0, sceneResults.length - tailCount);
  for (let index = startIndex; index < sceneResults.length; index += 1) {
    sceneResults[index] = {
      ...sceneResults[index],
      sceneStatus: status,
    };
  }
}

export function buildTailContent(sceneContents: string[], tailCount: number, replacement: string): string {
  const safeTailCount = Math.max(1, Math.min(tailCount, sceneContents.length));
  const prefix = joinSceneContents(sceneContents.slice(0, sceneContents.length - safeTailCount));
  return [prefix, replacement.trim()].filter(Boolean).join("\n\n").trim();
}
