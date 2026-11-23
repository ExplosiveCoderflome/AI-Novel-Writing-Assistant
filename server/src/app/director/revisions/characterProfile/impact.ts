import type { Prisma } from "@prisma/client";
import {
  characterProfileImpactApplySchema,
  characterProfileImpactCandidateSchema,
  characterProfileImpactParagraphSchema,
  characterProfileImpactRequestSchema,
  characterProfileImpactSuggestionSchema,
  characterProfileImpactResourceTypes,
  type CharacterProfileImpactApply,
  type CharacterProfileImpactCandidate,
  type CharacterProfileImpactPreview,
  type CharacterProfileImpactSuggestion,
} from "@ai-novel/shared/types/director/characterProfileImpact";
import {
  characterProfileDraftSchema,
  characterProfileValueIssue,
  type CharacterProfileDraft,
  type CharacterProfileSave,
} from "@ai-novel/shared/types/director/characterProfile";
import { prisma } from "../../../../db/prisma";
import { withSqliteRetry } from "../../../../db/sqliteRetry";
import { ragConfig } from "../../../../config/rag";
import { novelEventBus } from "../../../../events/publisher";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { characterProfileImpactPrompt } from "../../../../prompting/prompts/novel/character/characterProfileImpact.prompt";
import { readCharacterProfile } from "./profile";
import { chapterParagraphs } from "@ai-novel/shared/types/chapterEditor/document";

type ImpactCandidateInput = Omit<CharacterProfileImpactCandidate, "before"> & {before: string};

const MAX_CANDIDATES = 80;
const MAX_PROMPT_TEXT = 6000;

function text(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function rawText(value: string | null | undefined): string {
  return value ?? "";
}

function excerpt(value: string, needle: string): string {
  if (value.length <= 1200) return value;
  const index = needle ? value.indexOf(needle) : -1;
  if (index < 0) return value.slice(0, 1200);
  const start = Math.max(0, index - 420);
  return `${start > 0 ? "…" : ""}${value.slice(start, start + 1200)}${start + 1200 < value.length ? "…" : ""}`;
}

function addCandidate(
  candidates: ImpactCandidateInput[],
  input: Omit<ImpactCandidateInput, "id" | "applyMode"> & {id?: string; applyMode?: "replace" | "review"},
) {
  const before = rawText(input.before);
  if (!before) return;
  const candidate = characterProfileImpactCandidateSchema.parse({
    ...input,
    id: input.id ?? `${input.resourceType}:${input.resourceId}:${input.field}`,
    before,
    applyMode: input.applyMode ?? (input.resourceType === "prose" || before.length > MAX_PROMPT_TEXT ? "review" : "replace"),
  });
  if (!candidates.some(item => item.id === candidate.id)) candidates.push(candidate);
}

function changedFields(changes: CharacterProfileSave["changes"]): Set<string> {
  return new Set(changes.map(change => change.field));
}

function changedName(changes: CharacterProfileSave["changes"], currentName: string): string {
  return changes.find(change => change.field === "name")?.after.trim() || currentName;
}

function shouldInspectText(value: string, name: string, nextName: string, fields: Set<string>): boolean {
  if (value.includes(name)) return true;
  if (nextName !== name && value.includes(nextName)) return true;
  return fields.has("role") || fields.has("storyFunction") || fields.has("personality")
    || fields.has("background") || fields.has("outerGoal") || fields.has("innerNeed")
    || fields.has("fear") || fields.has("secret") || fields.has("moralLine")
    || fields.has("appearance") || fields.has("voiceTexture");
}

function impactedParagraphs(content: string, name: string, nextName: string): Array<{paragraph: number; before: string}> {
  const paragraphs = chapterParagraphs(content).filter(item => item.text.trim());
  const direct = paragraphs.filter(item => item.text.includes(name) || (nextName !== name && item.text.includes(nextName)));
  const selected = (direct.length ? direct : paragraphs).slice(0, 12);
  return selected.map(item => characterProfileImpactParagraphSchema.parse({paragraph: item.index, before: item.text}));
}

async function readImpactCandidates(db: Prisma.TransactionClient | typeof prisma, novelId: string, characterId: string, changes: CharacterProfileSave["changes"]): Promise<{
  character: {id: string; name: string; before: CharacterProfileDraft; after: CharacterProfileDraft; updatedAt: string};
  candidates: CharacterProfileImpactCandidate[];
}> {
  const character = await db.character.findFirst({where: {id: characterId, novelId}});
  if (!character) throw new AppError("本书没有这个角色。", 404);
  const before = characterProfileDraftSchema.parse(Object.fromEntries([
    ["name", character.name], ["role", character.role], ["storyFunction", character.storyFunction], ["personality", character.personality],
    ["background", character.background], ["outerGoal", character.outerGoal], ["innerNeed", character.innerNeed], ["fear", character.fear],
    ["secret", character.secret], ["moralLine", character.moralLine], ["appearance", character.appearance], ["voiceTexture", character.voiceTexture],
  ].map(([field, value]) => [field, rawText(value as string | null)])));
  const after = {...before, ...Object.fromEntries(changes.map(change => [change.field, change.after]))};
  const fields = changedFields(changes);
  const nextName = changedName(changes, character.name);
  const [novel, relations, volumes, chapters] = await Promise.all([
    db.novel.findUniqueOrThrow({where: {id: novelId}, select: {
      id: true, description: true, bookSellingPoint: true, competingFeel: true, first30ChapterPromise: true, updatedAt: true,
      bible: {select: {id: true, coreSetting: true, forbiddenRules: true, mainPromise: true, characterArcs: true, worldRules: true, rawContent: true, updatedAt: true}},
    }}),
    db.characterRelation.findMany({where: {novelId, OR: [{sourceCharacterId: characterId}, {targetCharacterId: characterId}]}, include: {
      sourceCharacter: {select: {name: true}}, targetCharacter: {select: {name: true}},
    }, orderBy: {updatedAt: "desc"}}),
    db.volumePlan.findMany({where: {novelId}, orderBy: {sortOrder: "asc"}, include: {chapters: {orderBy: {chapterOrder: "asc"}}}}),
    db.chapter.findMany({where: {novelId}, orderBy: {order: "asc"}, select: {
      id: true, order: true, title: true, content: true, mustAvoid: true, taskSheet: true, sceneCards: true, updatedAt: true,
    }}),
  ]);

  const candidates: ImpactCandidateInput[] = [];
  const synopsisFields: Array<[string, string | null]> = [
    ["description", novel.description], ["bookSellingPoint", novel.bookSellingPoint],
    ["competingFeel", novel.competingFeel], ["first30ChapterPromise", novel.first30ChapterPromise],
  ];
  for (const [field, value] of synopsisFields) {
    if (shouldInspectText(text(value), character.name, nextName, fields)) addCandidate(candidates, {
      resourceType: "synopsis", resourceId: novel.id, title: "小说简介与卖点", field, before: rawText(value), updatedAt: novel.updatedAt.toISOString(),
      evidence: excerpt(rawText(value), character.name),
    });
  }
  if (novel.bible) {
    const worldFields: Array<[string, string | null]> = [
      ["coreSetting", novel.bible.coreSetting], ["forbiddenRules", novel.bible.forbiddenRules], ["mainPromise", novel.bible.mainPromise],
      ["characterArcs", novel.bible.characterArcs], ["worldRules", novel.bible.worldRules], ["rawContent", novel.bible.rawContent],
    ];
    for (const [field, value] of worldFields) {
      if (shouldInspectText(text(value), character.name, nextName, fields)) addCandidate(candidates, {
        resourceType: "world", resourceId: novel.bible.id, title: "本书世界设定", field, before: rawText(value), updatedAt: novel.bible.updatedAt.toISOString(),
        evidence: excerpt(rawText(value), character.name),
      });
    }
  }
  for (const relation of relations) {
    const title = `${relation.sourceCharacter.name} → ${relation.targetCharacter.name}`;
    const relationFields: Array<[string, string | null]> = [
      ["surfaceRelation", relation.surfaceRelation], ["hiddenTension", relation.hiddenTension], ["conflictSource", relation.conflictSource],
      ["secretAsymmetry", relation.secretAsymmetry], ["dynamicLabel", relation.dynamicLabel], ["nextTurnPoint", relation.nextTurnPoint],
    ];
    for (const [field, value] of relationFields) if (shouldInspectText(text(value), character.name, nextName, fields)) addCandidate(candidates, {
      resourceType: "relationship", resourceId: relation.id, title: `人物关系 · ${title}`, field, before: rawText(value), updatedAt: relation.updatedAt.toISOString(),
      evidence: excerpt(rawText(value), character.name),
    });
  }
  for (const volume of volumes) {
    const title = `第 ${volume.sortOrder + 1} 卷 · ${volume.title}`;
    const volumeFields: Array<[string, string | null]> = [
      ["summary", volume.summary], ["mainPromise", volume.mainPromise], ["escalationMode", volume.escalationMode],
      ["protagonistChange", volume.protagonistChange], ["climax", volume.climax], ["nextVolumeHook", volume.nextVolumeHook], ["resetPoint", volume.resetPoint],
    ];
    for (const [field, value] of volumeFields) if (shouldInspectText(text(value), character.name, nextName, fields)) addCandidate(candidates, {
      resourceType: "volume_plan", resourceId: volume.id, title, field, before: rawText(value), updatedAt: volume.updatedAt.toISOString(),
      evidence: excerpt(rawText(value), character.name),
    });
    for (const chapter of volume.chapters) {
      const chapterTitle = `${title} · 第 ${chapter.chapterOrder} 章 · ${chapter.title}`;
      const planFields: Array<[string, string | null]> = [
        ["summary", chapter.summary], ["purpose", chapter.purpose], ["mustAvoid", chapter.mustAvoid], ["taskSheet", chapter.taskSheet], ["sceneCards", chapter.sceneCards],
      ];
      for (const [field, value] of planFields) if (shouldInspectText(text(value), character.name, nextName, fields)) addCandidate(candidates, {
        resourceType: "chapter_plan", resourceId: chapter.id, title: chapterTitle, field, before: rawText(value), updatedAt: chapter.updatedAt.toISOString(),
        evidence: excerpt(rawText(value), character.name),
      });
    }
  }
  for (const chapter of chapters) {
    const content = text(chapter.content);
    if (!content || !shouldInspectText(content, character.name, nextName, fields)) continue;
    addCandidate(candidates, {
      resourceType: "prose", resourceId: chapter.id, title: `第 ${chapter.order} 章 · ${chapter.title}`, field: "content", before: rawText(chapter.content),
      updatedAt: chapter.updatedAt.toISOString(), evidence: excerpt(content, character.name), applyMode: "review",
      paragraphs: impactedParagraphs(content, character.name, nextName),
    });
  }
  for (const chapter of chapters) {
    const chapterTitle = `第 ${chapter.order} 章 · ${chapter.title}`;
    for (const [field, value] of [["mustAvoid", chapter.mustAvoid], ["taskSheet", chapter.taskSheet], ["sceneCards", chapter.sceneCards]] as Array<[string, string | null]>) {
      if (shouldInspectText(text(value), character.name, nextName, fields)) addCandidate(candidates, {
        resourceType: "chapter_plan", resourceId: chapter.id, title: chapterTitle, field, before: rawText(value), updatedAt: chapter.updatedAt.toISOString(),
        evidence: excerpt(rawText(value), character.name),
      });
    }
  }
  const limits: Record<string, number> = {synopsis: 8, world: 10, relationship: 14, volume_plan: 12, chapter_plan: 18, prose: 18};
  const counts = new Map<string, number>();
  const limited = candidates.filter(candidate => {
    const count = counts.get(candidate.resourceType) ?? 0;
    if (count >= (limits[candidate.resourceType] ?? 8)) return false;
    counts.set(candidate.resourceType, count + 1);
    return true;
  });
  return {
    character: {id: character.id, name: character.name, before, after: characterProfileDraftSchema.parse(after), updatedAt: character.updatedAt.toISOString()},
    candidates: limited.slice(0, MAX_CANDIDATES).map(candidate => characterProfileImpactCandidateSchema.parse(candidate)),
  };
}

export async function previewCharacterProfileImpact(novelId: string, characterId: string, input: unknown): Promise<CharacterProfileImpactPreview> {
  const request = characterProfileImpactRequestSchema.parse(input);
  const snapshot = await readImpactCandidates(prisma, novelId, characterId, request.changes);
  if (!snapshot.candidates.length) return { ...snapshot, suggestions: [], prompt: null };
  const result = await runStructuredPrompt({
    asset: characterProfileImpactPrompt,
    promptInput: {
      character: {name: snapshot.character.name, before: snapshot.character.before, after: snapshot.character.after},
      candidates: snapshot.candidates.map(candidate => ({...candidate, before: candidate.before.length > MAX_PROMPT_TEXT ? candidate.evidence : candidate.before})),
    },
    options: {novelId, stage: "character_profile_impact", itemKey: "character_profile_impact", triggerReason: "character_profile_changed"},
  });
  const suggestions = result.output.suggestions.map(suggestion => {
    const candidate = snapshot.candidates.find(item => item.id === suggestion.candidateId);
    if (!candidate) return suggestion;
    return {
      ...suggestion,
      title: candidate.title,
      updatedAt: candidate.updatedAt,
      before: candidate.before,
      ...(candidate.resourceType === "prose" && candidate.paragraphs ? {paragraphs: suggestion.paragraphs?.length ? suggestion.paragraphs : candidate.paragraphs} : {}),
    };
  });
  return {
    ...snapshot,
    suggestions: suggestions.map(suggestion => characterProfileImpactSuggestionSchema.parse(suggestion)),
    prompt: {
      id: result.meta.invocation.promptId, version: result.meta.invocation.promptVersion,
      provider: result.meta.provider ?? "", model: result.meta.model ?? "",
    },
  };
}

const editableFields: Record<string, Set<string>> = {
  synopsis: new Set(["description", "bookSellingPoint", "competingFeel", "first30ChapterPromise"]),
  world: new Set(["coreSetting", "forbiddenRules", "mainPromise", "characterArcs", "worldRules", "rawContent"]),
  relationship: new Set(["surfaceRelation", "hiddenTension", "conflictSource", "secretAsymmetry", "dynamicLabel", "nextTurnPoint"]),
  volume_plan: new Set(["summary", "mainPromise", "escalationMode", "protagonistChange", "climax", "nextVolumeHook", "resetPoint"]),
  chapter_plan: new Set(["summary", "purpose", "mustAvoid", "taskSheet", "sceneCards"]),
};

async function updateSuggestedResource(tx: Prisma.TransactionClient, novelId: string, suggestions: CharacterProfileImpactSuggestion[]) {
  const replaceSuggestions = suggestions.filter(suggestion => suggestion.applyMode === "replace" && suggestion.after !== null);
  if (!replaceSuggestions.length) return 0;
  const [first] = replaceSuggestions;
  if (replaceSuggestions.some(suggestion => suggestion.resourceType !== first.resourceType
    || suggestion.resourceId !== first.resourceId || suggestion.updatedAt !== first.updatedAt)) {
    throw new AppError("影响建议的资料范围不一致。", 400);
  }
  for (const suggestion of replaceSuggestions) if (!characterProfileImpactResourceTypes.includes(suggestion.resourceType) || !editableFields[suggestion.resourceType]?.has(suggestion.field)) {
    throw new AppError("影响建议包含不可修改的资料字段。", 400);
  }
  const expected = Object.fromEntries(replaceSuggestions.map(suggestion => [suggestion.field, suggestion.before]));
  const data = Object.fromEntries(replaceSuggestions.map(suggestion => [suggestion.field, suggestion.after]));
  const contentGuard = Object.fromEntries(Object.entries(expected).map(([field, value]) => [field, value]));
  const resourceWhere = {id: first.resourceId, updatedAt: new Date(first.updatedAt)};
  let result: {count: number};
  if (first.resourceType === "synopsis") result = await tx.novel.updateMany({where: {id: novelId, updatedAt: new Date(first.updatedAt), AND: [contentGuard]}, data});
  else if (first.resourceType === "world") result = await tx.novelBible.updateMany({where: {novelId, ...resourceWhere, AND: [contentGuard]}, data});
  else if (first.resourceType === "relationship") result = await tx.characterRelation.updateMany({where: {novelId, ...resourceWhere, AND: [contentGuard]}, data});
  else if (first.resourceType === "volume_plan") result = await tx.volumePlan.updateMany({where: {novelId, ...resourceWhere, AND: [contentGuard]}, data});
  else if (first.resourceType === "chapter_plan") result = await tx.volumeChapterPlan.updateMany({where: {volume: {novelId}, ...resourceWhere, AND: [contentGuard]}, data});
  else return 0;
  if (result.count !== 1) throw new AppError("受影响资料已有变化，请重新检查影响后再保存。", 409);
  return replaceSuggestions.length;
}

export async function applyCharacterProfileImpact(novelId: string, characterId: string, input: unknown) {
  const parsed: CharacterProfileImpactApply = characterProfileImpactApplySchema.parse(input);
  const saved = await withSqliteRetry(() => prisma.$transaction(async tx => {
    const {workspace} = await readCharacterProfile(tx, novelId, characterId, true);
    const impactSnapshot = await readImpactCandidates(tx, novelId, characterId, parsed.changes);
    if (workspace.editBlockedReason) throw new AppError(workspace.editBlockedReason, 409);
    if (workspace.fields.name !== parsed.changes.find(change => change.field === "name")?.before
      && parsed.changes.some(change => change.field === "name")) throw new AppError("角色资料有更新，请重新检查影响后再保存。", 409);
    if (parsed.changes.some(({field, before}) => workspace.fields[field] !== before)) throw new AppError("角色资料有更新，请重新检查影响后再保存。", 409);
    const candidates = new Map(impactSnapshot.candidates.map(candidate => [candidate.id, candidate]));
    const seenSuggestions = new Set<string>();
    for (const suggestion of parsed.suggestions) {
      if (seenSuggestions.has(suggestion.candidateId)) throw new AppError("影响建议不能重复引用同一资料项。", 400);
      seenSuggestions.add(suggestion.candidateId);
      const candidate = candidates.get(suggestion.candidateId);
      if (!candidate || candidate.resourceType !== suggestion.resourceType || candidate.resourceId !== suggestion.resourceId
        || candidate.field !== suggestion.field || candidate.title !== suggestion.title || candidate.before !== suggestion.before || candidate.updatedAt !== suggestion.updatedAt
        || candidate.applyMode !== suggestion.applyMode) {
        throw new AppError("影响建议已过期，请重新检查影响后再保存。", 409);
      }
      if (suggestion.resourceType === "prose") {
        const sourceParagraphs = candidate.paragraphs ?? [];
        if (!suggestion.paragraphs?.length || suggestion.paragraphs.some(item => !sourceParagraphs.some(source => source.paragraph === item.paragraph && source.before === item.before))) {
          throw new AppError("正文段落建议已变化，请重新检查影响后再保存。", 409);
        }
      }
    }
    for (const change of parsed.changes) {
      const issue = characterProfileValueIssue(change.field, change.after);
      if (issue) throw new AppError(issue, 400);
    }
    const nextName = parsed.changes.find(change => change.field === "name")?.after;
    if (nextName !== undefined) {
      if (workspace.renameBlockedReason) throw new AppError(workspace.renameBlockedReason, 409);
      const duplicate = await tx.character.findFirst({where: {novelId, id: {not: characterId}, name: nextName}, select: {id: true}});
      if (duplicate) throw new AppError("本书已有同名角色，请换一个姓名。", 409);
    }
    const originals = parsed.changes.map(({field, before}) => before ? {[field]: before} : {OR: [{[field]: null}, {[field]: ""}]});
    const characterWrite = await tx.character.updateMany({where: {id: characterId, novelId, updatedAt: new Date(parsed.expectedCharacterUpdatedAt), AND: originals}, data: Object.fromEntries(parsed.changes.map(({field, after}) => [field, after || null]))});
    if (characterWrite.count !== 1) throw new AppError("角色资料有更新，请重新检查影响后再保存。", 409);
    if (ragConfig.enabled) await tx.ragIndexJob.create({data: {
      tenantId: ragConfig.defaultTenantId, jobType: "upsert", ownerType: "character", ownerId: characterId, maxAttempts: ragConfig.workerMaxAttempts,
    }});
    let appliedSuggestionCount = 0;
    const groups = new Map<string, CharacterProfileImpactSuggestion[]>();
    for (const suggestion of parsed.suggestions) {
      const key = `${suggestion.resourceType}:${suggestion.resourceId}:${suggestion.updatedAt}`;
      const group = groups.get(key) ?? [];
      group.push(suggestion);
      groups.set(key, group);
    }
    for (const group of groups.values()) appliedSuggestionCount += await updateSuggestedResource(tx, novelId, group);
    const candidateOrder = new Map(impactSnapshot.candidates.map((candidate, index) => [candidate.id, index]));
    const proseSuggestions = parsed.suggestions
      .filter(suggestion => suggestion.resourceType === "prose")
      .map(suggestion => ({
        ...suggestion,
        paragraphs: suggestion.paragraphs ? [...suggestion.paragraphs].sort((left, right) => left.paragraph - right.paragraph) : undefined,
      }))
      .sort((left, right) => (candidateOrder.get(left.candidateId) ?? Number.MAX_SAFE_INTEGER) - (candidateOrder.get(right.candidateId) ?? Number.MAX_SAFE_INTEGER));
    return {
      appliedSuggestionCount,
      proseSuggestions,
    };
  }, {isolationLevel: "Serializable"}), {label: "director.character_profile_impact"});
  await novelEventBus.emit({type: "character:changed", payload: {novelId, characterId}});
  return saved;
}
