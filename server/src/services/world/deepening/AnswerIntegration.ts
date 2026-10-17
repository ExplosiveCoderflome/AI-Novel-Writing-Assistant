import { createHash } from "node:crypto";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { worldAnswerIntegrationPrompt } from "../../../prompting/prompts/world/deepening/answerIntegration.prompts";
import { readWorldAnswerIntegration } from "@ai-novel/shared/types/world";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { applyStructuredWorldToLegacyFields, buildWorldBindingSupport, buildWorldStructureSeedFromSource,
  normalizeWorldStructuredData, parseWorldStructurePayload } from "../worldStructure";
import { serializeWorldSnapshot } from "../worldTransfer";
import { buildWorldStructurePromptSource, type DeepeningAnswerInput } from "../worldServiceShared";

/** Apply AI-classified updates without deleting unmentioned fields, entities or string-list entries. */
function mergeChanges(current: unknown, patch: unknown): unknown {
  if (patch === undefined || patch === null || patch === "") return current;
  if (Array.isArray(patch)) {
    const values: unknown[] = Array.isArray(current) ? [...current] : [];
    for (const value of patch) {
      if (typeof value === "string") { if (!values.includes(value)) values.push(value); continue; }
      const id = (value as {id: string}).id;
      const index = values.findIndex(row => typeof row === "object" && row !== null && (row as {id?: string}).id === id);
      if (index < 0) values.push(value); else values[index] = mergeChanges(values[index], value);
    }
    return values;
  }
  if (patch && typeof patch === "object") {
    const result: Record<string, unknown> = current && typeof current === "object" ? {...current} : {};
    for (const [key, value] of Object.entries(patch)) result[key] = mergeChanges(result[key], value);
    return result;
  }
  return patch;
}

export async function integrateWorldAnswers(worldId: string, answers: DeepeningAnswerInput[],
  options: {provider?: LLMProvider; model?: string} = {}) {
  const world = await prisma.world.findUniqueOrThrow({where: {id: worldId}});
  if (!answers.length || new Set(answers.map(row => row.questionId)).size !== answers.length
    || answers.some(row => !row.answer.trim())) throw new AppError("请选择问题并填写回答，同一问题只提交一次。", 400);
  const questions = await prisma.worldDeepeningQA.findMany({where: {worldId, id: {in: answers.map(row => row.questionId)}}});
  if (questions.length !== answers.length) throw new AppError("部分问题不属于这个世界样本，请刷新后核对回答。", 400);
  const pending = answers.map(answer => ({...answer, answer: answer.answer.trim(),
    question: questions.find(row => row.id === answer.questionId)!,
    hash: createHash("sha256").update(JSON.stringify([answer.questionId, answer.answer.trim()])).digest("hex"),
  })).filter(row => row.question.status !== "integrated" || readWorldAnswerIntegration(row.question.integratedSummary)?.answerHash !== row.hash);
  if (!pending.length) return prisma.worldDeepeningQA.findMany({where: {worldId}, orderBy: {createdAt: "desc"}});
  if (world.structureJson?.trim()) {
    try {
      const source = JSON.parse(world.structureJson);
      if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("invalid structure");
    } catch { throw new AppError("已保存的世界手册无法读取，请先核对手册或版本记录，回答将继续保留。", 409); }
  }
  const stored = parseWorldStructurePayload(world.structureJson, world.bindingSupportJson);
  const current = stored.hasStructuredData ? stored.structure : buildWorldStructureSeedFromSource(world);
  const result = await runStructuredPrompt({asset: worldAnswerIntegrationPrompt,
    promptInput: {currentStructure: current, source: buildWorldStructurePromptSource(world),
      answers: pending.map(row => ({questionId: row.questionId, question: row.question.question, answer: row.answer}))},
    options: {...options, temperature: 0.3},
  });
  const merged = mergeChanges(current, result.output.changes);
  const next = normalizeWorldStructuredData(merged, current);
  // Normalization may reject malformed entities or dangling links; never silently claim they were integrated.
  const collections = (value: typeof next) => [value.factions, value.forces, value.locations, value.rules.axioms,
    value.relations.forceRelations, value.relations.locationControls];
  const proposed = merged as typeof next;
  collections(proposed).forEach((items, index) => {
    const ids = collections(next)[index].map(row => row.id);
    if (items.some(row => !ids.includes(row.id))) throw new AppError("整合结果包含无效实体或关系，回答已保留，请重试。", 422);
  });
  const factionIds = new Set(next.factions.map(row => row.id));
  const forceIds = new Set(next.forces.map(row => row.id));
  if (result.output.changes.forces?.some(row => row.factionId && !factionIds.has(row.factionId))
    || result.output.changes.factions?.some(row => row.representativeForceIds?.some(id => !forceIds.has(id)))
    || result.output.changes.locations?.some(row => row.controllingForceIds?.some(id => !forceIds.has(id)))) {
    throw new AppError("整合结果引用了不存在的阵营或组织，回答已保留，请重试。", 422);
  }
  if (JSON.stringify(next) === JSON.stringify(current)) throw new AppError("AI 未生成有效的设定补充，回答已保留，请重新整合。", 422);
  const fields = applyStructuredWorldToLegacyFields(next, world, buildWorldBindingSupport(next));
  await prisma.$transaction(async tx => {
    const changed = await tx.world.updateMany({where: {id: worldId, version: world.version, updatedAt: world.updatedAt,
      structureJson: world.structureJson}, data: {...fields, version: {increment: 1}}});
    if (changed.count !== 1) throw new AppError("世界手册在整合期间有新修改，回答已保留，请刷新后重新提交。", 409);
    for (const row of pending) {
      const summary = result.output.answers.find(answer => answer.questionId === row.questionId)?.summary;
      if (!summary) throw new AppError("AI 未完整处理提交的回答，请重新整合。", 422);
      const changedAnswer = await tx.worldDeepeningQA.updateMany({where: {id: row.questionId, worldId, updatedAt: row.question.updatedAt},
        data: {answer: row.answer, integratedSummary: JSON.stringify({version: 1, summary, answerHash: row.hash}), status: "integrated"}});
      if (changedAnswer.count !== 1) throw new AppError("回答在整合期间有新修改，请刷新后核对。", 409);
    }
    const saved = await tx.world.findUniqueOrThrow({where: {id: worldId}});
    await tx.worldSnapshot.create({data: {worldId, label: "deepening-integrated", data: serializeWorldSnapshot(saved)}});
  });
  return prisma.worldDeepeningQA.findMany({where: {worldId}, orderBy: {createdAt: "desc"}});
}
