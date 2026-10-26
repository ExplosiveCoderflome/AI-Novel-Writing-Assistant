import {
  normalizeChapterScenePlan,
  serializeChapterScenePlan,
} from "@ai-novel/shared/types/chapterLengthControl";
import { sanitizeCreativeMustAdvanceItems } from "@ai-novel/shared/types/chapterCreativeContract";
import { createHash } from "node:crypto";


export interface PersistPlanInput {
  novelId: string;
  chapterId?: string;
  sourceStateSnapshotId?: string | null;
  level: "book" | "arc" | "chapter";
  status?: string | null;
  planRole?: string | null;
  phaseLabel?: string | null;
  title: string;
  objective: string;
  targetWordCount?: number | null;
  participants: string[];
  reveals: string[];
  riskNotes: string[];
  mustAdvance: string[];
  mustPreserve: string[];
  sourceIssueIds: string[];
  replannedFromPlanId: string | null;
  hookTarget: string | null;
  baseExecutionContract?: ChapterExecutionContractHashInput | null;
  scenes: Array<{
    title?: string;
    objective?: string;
    conflict?: string;
    reveal?: string;
    emotionBeat?: string;
  }>;
  externalRef?: string;
}

export function sanitizePlanText(value?: string | null): string {
  return (value ?? "").trim();
}

export interface ChapterExecutionContractHashInput {
  expectation?: string | null;
  targetWordCount?: number | null;
  conflictLevel?: number | null;
  revealLevel?: number | null;
  mustAvoid?: string | null;
  taskSheet?: string | null;
  sceneCards?: string | null;
  hook?: string | null;
}

function normalizeHashText(value?: string | null): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || null;
}

export function buildChapterExecutionContractHash(input: ChapterExecutionContractHashInput): string {
  const stablePayload = {
    expectation: normalizeHashText(input.expectation),
    targetWordCount: typeof input.targetWordCount === "number" ? input.targetWordCount : null,
    conflictLevel: typeof input.conflictLevel === "number" ? input.conflictLevel : null,
    revealLevel: typeof input.revealLevel === "number" ? input.revealLevel : null,
    mustAvoid: normalizeHashText(input.mustAvoid),
    taskSheet: normalizeHashText(input.taskSheet),
    sceneCards: normalizeHashText(input.sceneCards),
    hook: normalizeHashText(input.hook),
  };
  return createHash("sha256").update(JSON.stringify(stablePayload)).digest("hex");
}

export function readPlanExecutionContractHash(rawPlanJson: string | null | undefined): string | null {
  if (!rawPlanJson?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawPlanJson) as { executionContractHash?: unknown };
    return typeof parsed.executionContractHash === "string" && parsed.executionContractHash.trim()
      ? parsed.executionContractHash.trim()
      : null;
  } catch {
    return null;
  }
}

export function buildPlanTaskSheet(input: PersistPlanInput): string | undefined {
  const lines: string[] = [];
  const objective = sanitizePlanText(input.objective);
  const hookTarget = sanitizePlanText(input.hookTarget);
  const participants = input.participants.map((item) => sanitizePlanText(item)).filter(Boolean);
  const mustAdvance = sanitizeCreativeMustAdvanceItems(input.mustAdvance.map((item) => sanitizePlanText(item)).filter(Boolean));
  const mustPreserve = input.mustPreserve.map((item) => sanitizePlanText(item)).filter(Boolean);
  const riskNotes = input.riskNotes.map((item) => sanitizePlanText(item)).filter(Boolean);

  if (objective) {
    lines.push(`章节目标：${objective}`);
  }
  if (participants.length > 0) {
    lines.push(`关键角色：${participants.join("、")}`);
  }
  if (mustAdvance.length > 0) {
    lines.push("必须推进：");
    lines.push(...mustAdvance.map((item) => `- ${item}`));
  }
  if (mustPreserve.length > 0) {
    lines.push("必须保留：");
    lines.push(...mustPreserve.map((item) => `- ${item}`));
  }
  if (riskNotes.length > 0) {
    lines.push("风险提醒：");
    lines.push(...riskNotes.map((item) => `- ${item}`));
  }
  if (hookTarget) {
    lines.push(`收尾钩子：${hookTarget}`);
  }

  return lines.length > 0 ? lines.join("\n") : undefined;
}

export function buildPlanSceneCards(input: PersistPlanInput): string | undefined {
  if (input.scenes.length < 3 || input.scenes.length > 8) {
    return undefined;
  }

  const targetWordCount = Math.max(
    Math.round(input.targetWordCount ?? 0),
    input.scenes.length * 600,
  );

  const rawSceneCards = input.scenes.map((scene, index) => {
    const title = sanitizePlanText(scene.title) || `Scene ${index + 1}`;
    const objective = sanitizePlanText(scene.objective);
    const conflict = sanitizePlanText(scene.conflict);
    const reveal = sanitizePlanText(scene.reveal);
    const emotionBeat = sanitizePlanText(scene.emotionBeat);
    const previousScene = index > 0 ? input.scenes[index - 1] : null;
    const entryState = index === 0
      ? sanitizePlanText(input.objective) || `进入${input.title}`
      : sanitizePlanText(previousScene?.reveal)
        || sanitizePlanText(previousScene?.objective)
        || `承接上一场进入${title}`;
    const exitState = reveal || emotionBeat || objective || `完成${title}`;
    return {
      key: `plan_scene_${index + 1}`,
      title,
      purpose: objective || reveal || title,
      mustAdvance: sanitizeCreativeMustAdvanceItems([objective, reveal, conflict].filter(Boolean)),
      mustPreserve: input.mustPreserve.slice(0, 3).map((item) => sanitizePlanText(item)).filter(Boolean),
      entryState,
      exitState,
      forbiddenExpansion: [],
      targetWordCount: Math.max(240, Math.round(targetWordCount / input.scenes.length)),
    };
  });

  const normalized = normalizeChapterScenePlan(rawSceneCards, targetWordCount);
  return serializeChapterScenePlan(normalized);
}
