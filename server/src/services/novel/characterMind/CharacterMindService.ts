import type { CharacterMindSnapshot, CharacterMindSnapshotSource } from "@ai-novel/shared/types/characterMind";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  buildCharacterMindContextBlocks,
  characterMindSnapshotPrompt,
} from "../../../prompting/prompts/novel/characterMind.prompts";
import type { CharacterMindDelta, CharacterMindSnapshotItem } from "../../../prompting/prompts/novel/characterMind.promptSchemas";

type MindGenerationOptions = {
  provider?: any;
  model?: string;
  temperature?: number;
};

type CharacterRow = {
  id: string;
  name: string;
  role: string;
  storyFunction: string | null;
  personality: string | null;
  background: string | null;
  development: string | null;
  currentState: string | null;
  currentGoal: string | null;
  identityLabel: string | null;
  factionLabel: string | null;
  stanceLabel: string | null;
  availability: string | null;
  outerGoal: string | null;
  innerNeed: string | null;
  fear: string | null;
  wound: string | null;
  misbelief: string | null;
  secret: string | null;
  moralLine: string | null;
};

function compact(value: string | null | undefined, fallback = ""): string {
  return String(value ?? "").replace(/\s+/g, " ").trim() || fallback;
}

function parseStringArray(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed)
      ? parsed.map((item) => compact(String(item))).filter(Boolean).slice(0, 4)
      : [];
  } catch {
    return [];
  }
}

function serialize(row: {
  id: string;
  novelId: string;
  characterId: string;
  sourceChapterId: string | null;
  sourceChapter?: { order: number; title: string } | null;
  sourceType: string;
  currentInterpretation: string;
  privateIntent: string | null;
  activePlan: string | null;
  emotionalStance: string | null;
  actionTendency: string | null;
  decisionTrigger: string | null;
  beliefsJson: string;
  misbeliefsJson: string;
  evidenceJson: string;
  confidence: number | null;
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
}): CharacterMindSnapshot {
  return {
    id: row.id,
    novelId: row.novelId,
    characterId: row.characterId,
    sourceChapterId: row.sourceChapterId,
    sourceChapterOrder: row.sourceChapter?.order ?? null,
    sourceChapterTitle: row.sourceChapter?.title ?? null,
    sourceType: row.sourceType as CharacterMindSnapshotSource,
    currentInterpretation: row.currentInterpretation,
    privateIntent: row.privateIntent,
    activePlan: row.activePlan,
    emotionalStance: row.emotionalStance,
    actionTendency: row.actionTendency,
    decisionTrigger: row.decisionTrigger,
    beliefs: parseStringArray(row.beliefsJson),
    misbeliefs: parseStringArray(row.misbeliefsJson),
    evidence: parseStringArray(row.evidenceJson),
    confidence: row.confidence,
    isCurrent: row.isCurrent,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toOptional(value: string | null | undefined): string | null {
  const normalized = compact(value);
  return normalized || null;
}

export class CharacterMindService {
  async getCurrentMindState(novelId: string, characterId: string): Promise<CharacterMindSnapshot | null> {
    const row = await prisma.characterMindSnapshot.findFirst({
      where: { novelId, characterId, isCurrent: true },
      orderBy: { updatedAt: "desc" },
      include: { sourceChapter: { select: { order: true, title: true } } },
    });
    return row ? serialize(row) : null;
  }

  async refreshMindState(
    novelId: string,
    characterId: string,
    options: MindGenerationOptions = {},
  ): Promise<CharacterMindSnapshot> {
    const snapshots = await this.generateSnapshots(novelId, [characterId], "manual_refresh", options);
    if (snapshots.length === 0) {
      throw new Error("AI 未能整理当前角色的思路线，请稍后重试。");
    }
    return snapshots[0];
  }

  async bootstrapMindStates(
    novelId: string,
    characterIds: string[],
    options: MindGenerationOptions = {},
  ): Promise<CharacterMindSnapshot[]> {
    return this.generateSnapshots(novelId, characterIds, "bootstrap", options);
  }

  async applyChapterMindDeltas(input: {
    novelId: string;
    chapterId: string;
    deltas: CharacterMindDelta[];
  }): Promise<number> {
    if (input.deltas.length === 0) {
      return 0;
    }
    const characters = await prisma.character.findMany({
      where: { novelId: input.novelId },
      select: { id: true, name: true },
    });
    const byName = new Map(characters.map((character) => [compact(character.name).replace(/\s+/g, "").toLowerCase(), character]));
    const normalized = input.deltas.flatMap((delta) => {
      const character = byName.get(compact(delta.characterName).replace(/\s+/g, "").toLowerCase());
      return character ? [{ characterId: character.id, snapshot: delta }] : [];
    });
    await this.persistSnapshots(input.novelId, normalized.map((item) => ({
      characterId: item.characterId,
      sourceChapterId: input.chapterId,
      sourceType: "artifact_delta" as const,
      snapshot: item.snapshot,
    })));
    return normalized.length;
  }

  private async generateSnapshots(
    novelId: string,
    requestedCharacterIds: string[],
    sourceType: "bootstrap" | "manual_refresh",
    options: MindGenerationOptions,
  ): Promise<CharacterMindSnapshot[]> {
    const characterIds = Array.from(new Set(requestedCharacterIds.filter(Boolean))).slice(0, 6);
    if (characterIds.length === 0) {
      return [];
    }
    const context = await this.loadContext(novelId, characterIds);
    const result = await runStructuredPrompt({
      asset: characterMindSnapshotPrompt,
      promptInput: { mode: sourceType === "bootstrap" ? "bootstrap" : "refresh" },
      contextBlocks: buildCharacterMindContextBlocks(context),
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.35,
        novelId,
        stage: "character_mind",
        entrypoint: sourceType,
      },
    });
    const byName = new Map(context.characters.map((character) => [compact(character.name).replace(/\s+/g, "").toLowerCase(), character]));
    const accepted = result.output.snapshots.flatMap((snapshot) => {
      const character = byName.get(compact(snapshot.characterName).replace(/\s+/g, "").toLowerCase());
      return character ? [{ characterId: character.id, snapshot }] : [];
    });
    if (accepted.length === 0) {
      throw new Error("角色思路线没有匹配到当前小说角色。");
    }
    return this.persistSnapshots(novelId, accepted.map((item) => ({
      characterId: item.characterId,
      sourceChapterId: null,
      sourceType,
      snapshot: item.snapshot,
    })));
  }

  private async persistSnapshots(inputNovelId: string, items: Array<{
    characterId: string;
    sourceChapterId: string | null;
    sourceType: CharacterMindSnapshotSource;
    snapshot: CharacterMindSnapshotItem | CharacterMindDelta;
  }>): Promise<CharacterMindSnapshot[]> {
    if (items.length === 0) {
      return [];
    }
    const rows = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const item of items) {
        await tx.characterMindSnapshot.updateMany({
          where: { novelId: inputNovelId, characterId: item.characterId, isCurrent: true },
          data: { isCurrent: false },
        });
        created.push(await tx.characterMindSnapshot.create({
          data: {
            novelId: inputNovelId,
            characterId: item.characterId,
            sourceChapterId: item.sourceChapterId,
            sourceType: item.sourceType,
            currentInterpretation: item.snapshot.currentInterpretation,
            privateIntent: toOptional(item.snapshot.privateIntent),
            activePlan: toOptional(item.snapshot.activePlan),
            emotionalStance: toOptional(item.snapshot.emotionalStance),
            actionTendency: toOptional(item.snapshot.actionTendency),
            decisionTrigger: toOptional(item.snapshot.decisionTrigger),
            beliefsJson: JSON.stringify(item.snapshot.beliefs ?? []),
            misbeliefsJson: JSON.stringify(item.snapshot.misbeliefs ?? []),
            evidenceJson: JSON.stringify(item.snapshot.evidence),
            confidence: item.snapshot.confidence,
            isCurrent: true,
          },
        }));
      }
      return created;
    });
    return rows.map(serialize);
  }

  private async loadContext(novelId: string, characterIds: string[]) {
    const [novel, resources, latestState, relationStages] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: novelId },
        include: {
        bible: { select: { coreSetting: true, mainPromise: true } },
        storyMacroPlan: { select: { decompositionJson: true, constraintEngineJson: true } },
        bookContract: { select: { coreSellingPoint: true, relationshipMainline: true, escalationLadder: true } },
        characters: {
          where: { id: { in: characterIds } },
          select: {
            id: true, name: true, role: true, storyFunction: true, personality: true, background: true, development: true,
            currentState: true, currentGoal: true, identityLabel: true, factionLabel: true, stanceLabel: true, availability: true,
            outerGoal: true, innerNeed: true, fear: true, wound: true, misbelief: true, secret: true, moralLine: true,
          },
        },
        characterRelations: {
          where: { OR: [{ sourceCharacterId: { in: characterIds } }, { targetCharacterId: { in: characterIds } }] },
          include: { sourceCharacter: { select: { name: true } }, targetCharacter: { select: { name: true } } },
        },
        chapters: { where: { content: { not: "" } }, orderBy: { order: "desc" }, take: 2, select: { order: true, title: true, content: true } },
        },
      }),
      prisma.characterResourceLedgerItem.findMany({
        where: {
          novelId,
          OR: [
            { ownerCharacterId: { in: characterIds } },
            { holderCharacterId: { in: characterIds } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 12,
        select: {
          name: true, summary: true, status: true, holderCharacterId: true,
          holderCharacterName: true, ownerCharacterId: true, ownerName: true,
          readerKnows: true, holderKnows: true, knownByCharacterIdsJson: true, constraintsJson: true,
        },
      }),
      prisma.storyStateSnapshot.findFirst({
        where: { novelId },
        orderBy: { updatedAt: "desc" },
        select: {
          summary: true,
          characterStates: {
            where: { characterId: { in: characterIds } },
            select: { characterId: true, currentGoal: true, emotion: true, summary: true, knownFactsJson: true, misbeliefsJson: true },
          },
          informationStates: {
            where: {
              OR: [
                { holderType: "reader" },
                { holderRefId: { in: characterIds } },
              ],
            },
            select: { holderType: true, holderRefId: true, fact: true, status: true, summary: true },
            take: 12,
          },
        },
      }),
      prisma.characterRelationStage.findMany({
        where: {
          novelId,
          isCurrent: true,
          OR: [
            { sourceCharacterId: { in: characterIds } },
            { targetCharacterId: { in: characterIds } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 12,
        include: { sourceCharacter: { select: { name: true } }, targetCharacter: { select: { name: true } } },
      }),
    ]);
    if (!novel || novel.characters.length === 0) {
      throw new Error("当前小说没有可整理思路线的角色。");
    }
    const characters = novel.characters as CharacterRow[];
    const roster = characters.map((character) => [
      `角色：${character.name}（${character.role}）`,
      `戏剧功能：${compact(character.storyFunction, "未指定")}`,
      `性格/背景/成长：${compact(character.personality, "待补全")}｜${compact(character.background, "待补全")}｜${compact(character.development, "待补全")}`,
      `目标与处境：${compact(character.currentGoal, "待明确")}｜${compact(character.currentState, "待明确")}`,
      `内在驱动：${compact(character.outerGoal, "")}｜${compact(character.innerNeed, "")}｜恐惧/伤口=${compact(character.fear || character.wound, "")}`,
      `既有误判/秘密/底线：${compact(character.misbelief, "")}｜${compact(character.secret, "")}｜${compact(character.moralLine, "")}`,
    ].join("\n")).join("\n\n");
    const stateByCharacterId = new Map(latestState?.characterStates.map((state) => [state.characterId, state]) ?? []);
    const facts = [
      `小说：${novel.title}`,
      `书级卖点：${compact(novel.bookContract?.coreSellingPoint || novel.bible?.mainPromise, "待补全")}`,
      `主线约束：${compact(novel.storyMacroPlan?.decompositionJson, "待补全")}`,
      `世界与规则：${compact(novel.bible?.coreSetting, "待补全")}`,
      latestState?.summary ? `最新正史状态：${compact(latestState.summary)}` : "",
      ...characters.map((character) => {
        const state = stateByCharacterId.get(character.id);
        return state
          ? `正史角色状态：${character.name}｜目标=${compact(state.currentGoal, "未更新")}｜情绪=${compact(state.emotion, "未更新")}｜摘要=${compact(state.summary, "未更新")}`
          : "";
      }),
    ].join("\n");
    const relations = [
      ...relationStages.map((stage) => (
        `${stage.sourceCharacter.name} -> ${stage.targetCharacter.name}：当前阶段=${stage.stageLabel}；${stage.stageSummary}${stage.nextTurnPoint ? `；下一转折=${stage.nextTurnPoint}` : ""}`
      )),
      ...novel.characterRelations.map((relation) => (
      `${relation.sourceCharacter.name} -> ${relation.targetCharacter.name}：${relation.surfaceRelation}；隐藏张力=${compact(relation.hiddenTension, "无")}`
      )),
    ].filter(Boolean).slice(0, 12).join("\n");
    const recentEvents = novel.chapters.map((chapter) => (
      `第${chapter.order}章《${chapter.title}》：${compact(chapter.content, "").slice(0, 900)}`
    )).join("\n\n");
    const resourcesText = resources.map((resource) => (
      `${resource.holderCharacterName || resource.ownerName || "角色"}持有/关联${resource.name}（${resource.status}）：${compact(resource.summary)}；约束=${compact(resource.constraintsJson, "无")}`
    )).join("\n");
    const informationBoundaries = [
      ...(latestState?.informationStates.map((state) => (
        `${state.holderType}${state.holderRefId ? `:${state.holderRefId}` : ""}｜${state.status}｜${state.fact}${state.summary ? `（${state.summary}）` : ""}`
      )) ?? []),
      ...characters.flatMap((character) => {
        const state = stateByCharacterId.get(character.id);
        return state
          ? [
            ...parseStringArray(state.knownFactsJson).map((fact) => `${character.name}已知：${fact}`),
            ...parseStringArray(state.misbeliefsJson).map((fact) => `${character.name}既有误判：${fact}`),
          ]
          : [];
      }),
    ].filter(Boolean).slice(0, 14).join("\n");
    return { characters, roster, facts, relations, recentEvents, resources: resourcesText, informationBoundaries };
  }
}

export const characterMindService = new CharacterMindService();
