import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { WorldConsistencyReport, WorldLayerKey } from "@ai-novel/shared/types/world";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  worldConsistencyPrompt,
  worldDeepeningQuestionsPrompt,
} from "../../prompting/prompts/world/world.prompts";
import { buildConsistencySummary, localizeConsistencyIssue } from "./worldConsistency";
import {
  type DeepeningAnswerInput,
  type WorldTextField,
  normalizeDeepeningTargetField,
  normalizeDeepeningTargetLayer,
  normalizeQuickOptionList,
  nowISO,
} from "./worldServiceShared";
import { ragServices } from "../rag";

interface WorldImprovementCallbacks {
  createSnapshot: (worldId: string, label?: string) => Promise<unknown>;
  queueWorldUpsert: (worldId: string) => void;
}

async function getRequiredWorld(worldId: string) {
  const world = await prisma.world.findUnique({ where: { id: worldId } });
  if (!world) {
    throw new Error("World not found.");
  }
  return world;
}

export async function createWorldDeepeningQuestions(
  worldId: string,
  options: { provider?: LLMProvider; model?: string },
) {
  const world = await getRequiredWorld(worldId);

  let ragContext = "";
  try {
    ragContext = await ragServices.hybridRetrievalService.buildContextBlock(
      `世界深化问题 ${world.name}\n${world.description ?? ""}`,
      {
        worldId,
        ownerTypes: ["world", "world_library_item"],
        finalTopK: 6,
      },
    );
  } catch {
    ragContext = "";
  }
  const result = await runStructuredPrompt({
    asset: worldDeepeningQuestionsPrompt,
    promptInput: {
      worldName: world.name,
      description: world.description ?? "none",
      dataJson: JSON.stringify({
        background: world.background,
        geography: world.geography,
        cultures: world.cultures,
        magicSystem: world.magicSystem,
        politics: world.politics,
        races: world.races,
        religions: world.religions,
        technology: world.technology,
        conflicts: world.conflicts,
        history: world.history,
        economy: world.economy,
      }),
      ragContext,
    },
    options: {
      provider: options.provider ?? "deepseek",
      model: options.model,
      temperature: 0.6,
    },
  });

  const parsed = result.output as Array<{
    priority?: "required" | "recommended" | "optional";
    question?: string;
    quickOptions?: string[];
    targetLayer?: WorldLayerKey;
    targetField?: WorldTextField;
  }>;

  const normalized = parsed
    .filter((item) => item.question?.trim())
    .slice(0, 3)
    .map((item) => {
      const question = item.question!.trim();
      const targetLayer = normalizeDeepeningTargetLayer(item.targetLayer);
      const targetField = normalizeDeepeningTargetField(item.targetField, targetLayer, question);
      return {
        worldId,
        priority: item.priority ?? "recommended",
        question,
        quickOptions: normalizeQuickOptionList(item.quickOptions),
        targetLayer,
        targetField,
        status: "pending" as const,
      };
    });

  const deduped = Array.from(
    new Map(normalized.map((item) => [item.question, item])).values(),
  ).slice(0, 3);

  const fallbackPool: Array<{
    worldId: string;
    priority: "required" | "recommended" | "optional";
    question: string;
    quickOptions: string[];
    targetLayer: WorldLayerKey;
    targetField: WorldTextField;
    status: "pending";
  }> = [
    {
      worldId,
      priority: "required",
      question: "How does the power system impact normal people?",
      quickOptions: [],
      targetLayer: "power",
      targetField: "magicSystem",
      status: "pending",
    },
    {
      worldId,
      priority: "recommended",
      question: "What is the current relation among top factions?",
      quickOptions: [],
      targetLayer: "society",
      targetField: "politics",
      status: "pending",
    },
    {
      worldId,
      priority: "recommended",
      question: "Which historical event directly triggers the present conflict?",
      quickOptions: [],
      targetLayer: "history",
      targetField: "history",
      status: "pending",
    },
  ];

  for (const fallback of fallbackPool) {
    if (deduped.length >= 2) {
      break;
    }
    if (!deduped.some((item) => item.question === fallback.question)) {
      deduped.push(fallback);
    }
  }

  await prisma.worldDeepeningQA.createMany({
    data: deduped.map(({ quickOptions: _quickOptions, ...rest }) => rest),
  });
  const questions = await prisma.worldDeepeningQA.findMany({
    where: { worldId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  const quickOptionsMap = new Map(deduped.map((item) => [item.question, item.quickOptions]));
  return questions.map((item) => ({
    ...item,
    quickOptions: quickOptionsMap.get(item.question) ?? [],
  }));
}

export async function answerWorldDeepeningQuestions(
  worldId: string,
  answers: DeepeningAnswerInput[],
  callbacks: WorldImprovementCallbacks,
) {
  const world = await getRequiredWorld(worldId);
  if (answers.length === 0) {
    return prisma.worldDeepeningQA.findMany({
      where: { worldId },
      orderBy: { createdAt: "desc" },
    });
  }

  const questions = await prisma.worldDeepeningQA.findMany({
    where: { worldId, id: { in: answers.map((item) => item.questionId) } },
  });
  const questionMap = new Map(questions.map((item) => [item.id, item]));
  const appendMap = new Map<WorldTextField, string[]>();

  for (const answer of answers) {
    const question = questionMap.get(answer.questionId);
    if (!question) {
      continue;
    }
    const merged = `Q: ${question.question}\nA: ${answer.answer.trim()}`;
    const targetLayer = normalizeDeepeningTargetLayer(question.targetLayer);
    const field = normalizeDeepeningTargetField(question.targetField, targetLayer, question.question);
    if (!field) {
      continue;
    }
    const current = appendMap.get(field) ?? [];
    current.push(merged);
    appendMap.set(field, current);
  }

  await prisma.$transaction(async (tx) => {
    for (const answer of answers) {
      const question = questionMap.get(answer.questionId);
      if (!question) {
        continue;
      }
      const targetLayer = normalizeDeepeningTargetLayer(question.targetLayer);
      const targetField = normalizeDeepeningTargetField(question.targetField, targetLayer, question.question);
      await tx.worldDeepeningQA.update({
        where: { id: question.id },
        data: {
          targetLayer,
          targetField,
          answer: answer.answer.trim(),
          integratedSummary: `Q: ${question.question}\nA: ${answer.answer.trim()}`,
          status: "integrated",
        },
      });
    }
    if (appendMap.size > 0) {
      const updateData: Partial<Record<WorldTextField, string>> = {};
      for (const [field, segments] of appendMap.entries()) {
        const existing = world[field] ?? "";
        updateData[field] = `${existing}\n\n${segments.join("\n\n")}`.trim();
      }
      await tx.world.update({
        where: { id: worldId },
        data: updateData,
      });
    }
  });

  await callbacks.createSnapshot(worldId, "deepening-integrated");
  callbacks.queueWorldUpsert(worldId);
  return prisma.worldDeepeningQA.findMany({
    where: { worldId },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
}

export async function checkWorldConsistency(
  worldId: string,
  options: { provider?: LLMProvider; model?: string } = {},
  callbacks: WorldImprovementCallbacks,
): Promise<WorldConsistencyReport> {
  const world = await getRequiredWorld(worldId);

  const issues: Array<{
    severity: "pass" | "warn" | "error";
    code: string;
    message: string;
    detail?: string;
    source: "rule" | "llm";
    targetField?: string;
  }> = [];

  const axioms = world.axioms ?? "";
  const magicText = `${world.magicSystem ?? ""} ${world.cultures ?? ""}`;
  if (
    /(no magic|without magic|magic forbidden|magic disabled)/i.test(axioms)
    && /(magic|spell|wizard|mage|academy|sorcery)/i.test(magicText)
  ) {
    issues.push({
      severity: "error",
      code: "AXIOM_MAGIC_CONFLICT",
      message: "Axiom says no magic but magic-related content is present.",
      detail: "Align core axiom and power-system details.",
      source: "rule",
      targetField: "magicSystem",
    });
  }
  if (
    /(medieval|middle age|cold weapon|pre-industrial)/i.test(`${world.worldType ?? ""} ${world.technology ?? ""}`)
    && /(laser|quantum|warp|fusion|nanotech|mecha)/i.test(world.technology ?? "")
  ) {
    issues.push({
      severity: "warn",
      code: "TECH_ERA_MISMATCH",
      message: "Technology era appears mixed without explanation.",
      detail: "Add explicit source or limit future tech references.",
      source: "rule",
      targetField: "technology",
    });
  }
  if ((world.conflicts ?? "").trim().length < 20) {
    issues.push({
      severity: "warn",
      code: "CONFLICT_WEAK",
      message: "Core conflict is too thin.",
      detail: "Add actors, trigger, and escalation path.",
      source: "rule",
      targetField: "conflicts",
    });
  }
  if (issues.length === 0) {
    issues.push({
      severity: "pass",
      code: "BASELINE_PASS",
      message: "No obvious contradiction found by rule checks.",
      source: "rule",
    });
  }

  try {
    let ragContext = "";
    try {
      ragContext = await ragServices.hybridRetrievalService.buildContextBlock(
        `世界一致性检查 ${world.name}\n${world.description ?? ""}\n${world.conflicts ?? ""}`,
        {
          worldId,
          ownerTypes: ["world", "world_library_item"],
          finalTopK: 8,
        },
      );
    } catch {
      ragContext = "";
    }
    const result = await runStructuredPrompt({
      asset: worldConsistencyPrompt,
      promptInput: {
        worldName: world.name,
        axioms: world.axioms ?? "无",
        coreSettingsJson: JSON.stringify({
          background: world.background,
          geography: world.geography,
          cultures: world.cultures,
          magicSystem: world.magicSystem,
          politics: world.politics,
          races: world.races,
          religions: world.religions,
          technology: world.technology,
          conflicts: world.conflicts,
          history: world.history,
          economy: world.economy,
          factions: world.factions,
        }),
        ragContext,
      },
      options: {
        provider: options.provider ?? "deepseek",
        model: options.model,
        temperature: 0.2,
      },
    });
    const llmIssues = result.output as Array<{
      severity?: "warn" | "error";
      code?: string;
      message?: string;
      detail?: string;
      targetField?: string;
    }>;
    for (const issue of llmIssues) {
      if (!issue.message?.trim()) {
        continue;
      }
      issues.push(localizeConsistencyIssue({
        severity: issue.severity ?? "warn",
        code: issue.code ?? "LLM_REVIEW",
        message: issue.message.trim(),
        detail: issue.detail,
        source: "llm",
        targetField: issue.targetField,
      }));
    }
  } catch {
    // keep rule-only result
  }

  const localizedIssues = issues.map((item) => localizeConsistencyIssue(item));
  const dedupedIssues = Array.from(
    new Map(localizedIssues.map((item) => [`${item.code}|${item.targetField ?? ""}|${item.message}`, item])).values(),
  );
  const errorCount = dedupedIssues.filter((item) => item.severity === "error").length;
  const warnCount = dedupedIssues.filter((item) => item.severity === "warn").length;
  const score = Math.max(0, 100 - errorCount * 30 - warnCount * 12);
  const status: "pass" | "warn" | "error" = errorCount > 0 ? "error" : warnCount > 0 ? "warn" : "pass";
  const summary = buildConsistencySummary(status, errorCount, warnCount);

  await prisma.$transaction(async (tx) => {
    await tx.worldConsistencyIssue.deleteMany({ where: { worldId } });
    await tx.worldConsistencyIssue.createMany({
      data: dedupedIssues.map((item) => ({
        worldId,
        severity: item.severity,
        code: item.code,
        message: item.message,
        detail: item.detail ?? null,
        source: item.source,
        status: item.severity === "pass" ? "resolved" : "open",
        targetField: item.targetField ?? null,
      })),
    });
    await tx.world.update({
      where: { id: worldId },
      data: {
        consistencyReport: JSON.stringify({
          worldId,
          score,
          summary,
          status,
          generatedAt: nowISO(),
        }),
      },
    });
  });

  await callbacks.createSnapshot(worldId, "consistency-checked");
  callbacks.queueWorldUpsert(worldId);

  const persisted = await prisma.worldConsistencyIssue.findMany({
    where: { worldId },
    orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }],
  });
  const normalizedIssues: WorldConsistencyReport["issues"] = persisted.map((item) => ({
    ...localizeConsistencyIssue({
      severity: item.severity as "pass" | "warn" | "error",
      code: item.code,
      message: item.message,
      detail: item.detail ?? undefined,
      source: item.source as "rule" | "llm",
      targetField: item.targetField ?? undefined,
    }),
    id: item.id,
    worldId: item.worldId,
    status: item.status as "open" | "resolved" | "ignored",
    severity: item.severity as "pass" | "warn" | "error",
    source: item.source as "rule" | "llm",
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));
  return {
    worldId,
    score,
    summary,
    status,
    issues: normalizedIssues,
  };
}

export async function updateWorldConsistencyIssueStatus(
  worldId: string,
  issueId: string,
  status: "open" | "resolved" | "ignored",
) {
  const updated = await prisma.worldConsistencyIssue.update({
    where: { id: issueId },
    data: { status },
  });
  if (updated.worldId !== worldId) {
    throw new Error("Issue does not belong to world.");
  }
  return updated;
}
