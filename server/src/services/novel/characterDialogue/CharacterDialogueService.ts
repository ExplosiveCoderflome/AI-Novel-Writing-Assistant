import type {
  CharacterDialogueInfluence,
  CharacterDialogueSession,
  CharacterDialogueTurn,
  CharacterDialogueTurnResult,
} from "@ai-novel/shared/types/characterDialogue";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  buildCharacterDialogueContextBlocks,
  characterDialogueTurnPrompt,
} from "../../../prompting/prompts/novel/characterDialogue.prompts";
import type { CharacterDialogueInfluenceDraft } from "../../../prompting/prompts/novel/characterDialogue.promptSchemas";

type DialogueOptions = {
  provider?: any;
  model?: string;
  temperature?: number;
};

type DialogueSessionRow = {
  id: string;
  novelId: string;
  characterId: string;
  sourceMindSnapshotId: string | null;
  status: string;
  turns: Array<{ id: string; role: string; content: string; createdAt: Date }>;
  influences: Array<DialogueInfluenceRow>;
  createdAt: Date;
  updatedAt: Date;
};

type DialogueInfluenceRow = {
  id: string;
  sessionId: string;
  novelId: string;
  characterId: string;
  sourceMindSnapshotId: string | null;
  summary: string;
  behaviorGuidance: string;
  emotionalGuidance: string | null;
  relationTension: string | null;
  evidenceJson: string;
  confidence: number | null;
  targetStartChapterOrder: number;
  targetEndChapterOrder: number;
  status: string;
  activatedAt: Date | null;
  appliedAt: Date | null;
  resolvedChapterId: string | null;
  resolutionEvidenceJson: string;
  createdAt: Date;
  updatedAt: Date;
};

function compact(value: string | null | undefined, fallback = ""): string {
  return String(value ?? "").replace(/\s+/g, " ").trim() || fallback;
}

function optionalText(value: string | null | undefined): string | null {
  const normalized = compact(value);
  return normalized || null;
}

function parseStringArray(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed)
      ? parsed.map((item) => compact(String(item))).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function serializeTurn(row: { id: string; role: string; content: string; createdAt: Date }): CharacterDialogueTurn {
  return {
    id: row.id,
    role: row.role as CharacterDialogueTurn["role"],
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeInfluence(row: DialogueInfluenceRow): CharacterDialogueInfluence {
  return {
    id: row.id,
    sessionId: row.sessionId,
    novelId: row.novelId,
    characterId: row.characterId,
    sourceMindSnapshotId: row.sourceMindSnapshotId,
    summary: row.summary,
    behaviorGuidance: row.behaviorGuidance,
    emotionalGuidance: row.emotionalGuidance,
    relationTension: row.relationTension,
    evidence: parseStringArray(row.evidenceJson),
    confidence: row.confidence,
    targetStartChapterOrder: row.targetStartChapterOrder,
    targetEndChapterOrder: row.targetEndChapterOrder,
    status: row.status as CharacterDialogueInfluence["status"],
    activatedAt: row.activatedAt?.toISOString() ?? null,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    resolvedChapterId: row.resolvedChapterId,
    resolutionEvidence: parseStringArray(row.resolutionEvidenceJson),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeSession(row: DialogueSessionRow): CharacterDialogueSession {
  return {
    id: row.id,
    novelId: row.novelId,
    characterId: row.characterId,
    sourceMindSnapshotId: row.sourceMindSnapshotId,
    status: row.status as CharacterDialogueSession["status"],
    turns: row.turns.map(serializeTurn),
    latestInfluence: row.influences[0] ? serializeInfluence(row.influences[0]) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function draftData(draft: CharacterDialogueInfluenceDraft) {
  if (!draft) {
    return null;
  }
  return {
    summary: draft.summary,
    behaviorGuidance: draft.behaviorGuidance,
    emotionalGuidance: optionalText(draft.emotionalGuidance),
    relationTension: optionalText(draft.relationTension),
    evidenceJson: JSON.stringify(draft.evidence),
    confidence: draft.confidence,
  };
}

export class CharacterDialogueService {
  async getActiveSession(novelId: string, characterId: string): Promise<CharacterDialogueSession | null> {
    await this.expireEndedInfluences(novelId, characterId);
    const row = await prisma.characterDialogueSession.findFirst({
      where: { novelId, characterId, status: "active" },
      orderBy: { updatedAt: "desc" },
      include: this.sessionInclude(),
    });
    return row ? serializeSession(row as DialogueSessionRow) : null;
  }

  async startSession(novelId: string, characterId: string): Promise<CharacterDialogueSession> {
    const mind = await this.requireCurrentMind(novelId, characterId);
    const row = await prisma.$transaction(async (tx) => {
      await tx.characterDialogueSession.updateMany({
        where: { novelId, characterId, status: "active" },
        data: { status: "archived" },
      });
      return tx.characterDialogueSession.create({
        data: { novelId, characterId, sourceMindSnapshotId: mind.id, status: "active" },
        include: this.sessionInclude(),
      });
    });
    return serializeSession(row as DialogueSessionRow);
  }

  async sendTurn(
    novelId: string,
    characterId: string,
    sessionId: string,
    message: string,
    options: DialogueOptions = {},
  ): Promise<CharacterDialogueTurnResult> {
    const authorMessage = compact(message);
    if (!authorMessage || authorMessage.length > 800) {
      throw new Error("每次想对角色说的话请控制在 800 字以内。");
    }
    await this.expireEndedInfluences(novelId, characterId);
    const session = await prisma.characterDialogueSession.findFirst({
      where: { id: sessionId, novelId, characterId, status: "active" },
      include: { turns: { orderBy: { createdAt: "asc" }, take: 14 } },
    });
    if (!session) {
      throw new Error("没有找到可继续的角色对话，请重新开始一段谈话。");
    }
    const context = await this.loadPromptContext(novelId, characterId, session.turns);
    const result = await runStructuredPrompt({
      asset: characterDialogueTurnPrompt,
      promptInput: { mode: "turn" },
      contextBlocks: buildCharacterDialogueContextBlocks({ ...context, authorMessage }),
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.55,
        novelId,
        stage: "character_dialogue",
        entrypoint: "dialogue_turn",
      },
    });
    const window = await this.resolveInfluenceWindow(novelId);
    const influenceData = draftData(result.output.influenceDraft);
    const persisted = await prisma.$transaction(async (tx) => {
      await tx.characterDialogueTurn.createMany({
        data: [
          { sessionId, role: "author", content: authorMessage },
          { sessionId, role: "character", content: result.output.characterReply },
        ],
      });
      if (influenceData) {
        await tx.characterDialogueInfluence.updateMany({
          where: { sessionId, status: "draft" },
          data: { status: "superseded" },
        });
        await tx.characterDialogueInfluence.create({
          data: {
            novelId,
            characterId,
            sessionId,
            sourceMindSnapshotId: context.mindSnapshot.id,
            ...influenceData,
            targetStartChapterOrder: window.start,
            targetEndChapterOrder: window.end,
            status: "draft",
          },
        });
      }
      return tx.characterDialogueSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: this.sessionInclude(),
      });
    });
    const serialized = serializeSession(persisted as DialogueSessionRow);
    const characterTurn = serialized.turns.at(-1);
    if (!characterTurn || characterTurn.role !== "character") {
      throw new Error("角色回应没有成功保存，请稍后重试。");
    }
    return { session: serialized, characterTurn, influence: serialized.latestInfluence };
  }

  async activateLatestDraftInfluence(
    novelId: string,
    characterId: string,
    sessionId: string,
  ): Promise<CharacterDialogueInfluence> {
    await this.expireEndedInfluences(novelId, characterId);
    const draft = await prisma.characterDialogueInfluence.findFirst({
      where: { novelId, characterId, sessionId, status: "draft" },
      orderBy: { createdAt: "desc" },
    });
    if (!draft) {
      throw new Error("这段谈话没有等待确认的角色行动倾向。");
    }
    const row = await prisma.$transaction(async (tx) => {
      await tx.characterDialogueInfluence.updateMany({
        where: {
          novelId,
          characterId,
          id: { not: draft.id },
          status: "active",
          targetStartChapterOrder: { lte: draft.targetEndChapterOrder },
          targetEndChapterOrder: { gte: draft.targetStartChapterOrder },
        },
        data: { status: "superseded" },
      });
      return tx.characterDialogueInfluence.update({
        where: { id: draft.id },
        data: { status: "active", activatedAt: new Date() },
      });
    });
    return serializeInfluence(row as DialogueInfluenceRow);
  }

  async dismissLatestDraftInfluence(
    novelId: string,
    characterId: string,
    sessionId: string,
  ): Promise<CharacterDialogueInfluence> {
    const draft = await prisma.characterDialogueInfluence.findFirst({
      where: { novelId, characterId, sessionId, status: "draft" },
      orderBy: { createdAt: "desc" },
    });
    if (!draft) {
      throw new Error("这段谈话没有可放弃的待确认倾向。");
    }
    const row = await prisma.characterDialogueInfluence.update({
      where: { id: draft.id },
      data: { status: "dismissed" },
    });
    return serializeInfluence(row as DialogueInfluenceRow);
  }

  private sessionInclude() {
    return {
      turns: { orderBy: { createdAt: "asc" as const } },
      influences: { orderBy: { createdAt: "desc" as const }, take: 1 },
    };
  }

  private async requireCurrentMind(novelId: string, characterId: string) {
    const mind = await prisma.characterMindSnapshot.findFirst({
      where: { novelId, characterId, isCurrent: true },
      orderBy: { updatedAt: "desc" },
    });
    if (!mind) {
      throw new Error("请先让 AI 整理这个角色的当前想法，再开始对话。");
    }
    return mind;
  }

  private async expireEndedInfluences(novelId: string, characterId: string): Promise<void> {
    const latestCompletedChapter = await prisma.chapter.findFirst({
      where: { novelId, chapterStatus: "completed" },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    if (!latestCompletedChapter) {
      return;
    }
    await prisma.characterDialogueInfluence.updateMany({
      where: {
        novelId,
        characterId,
        status: { in: ["draft", "active"] },
        targetEndChapterOrder: { lt: latestCompletedChapter.order },
      },
      data: { status: "expired" },
    });
  }

  private async resolveInfluenceWindow(novelId: string): Promise<{ start: number; end: number }> {
    const [nextUnfinished, latestCompleted] = await Promise.all([
      prisma.chapter.findFirst({
        where: { novelId, chapterStatus: { not: "completed" } },
        orderBy: { order: "asc" },
        select: { order: true },
      }),
      prisma.chapter.findFirst({
        where: { novelId, chapterStatus: "completed" },
        orderBy: { order: "desc" },
        select: { order: true },
      }),
    ]);
    const start = nextUnfinished?.order ?? (latestCompleted?.order ?? 0) + 1;
    return { start: Math.max(start, 1), end: Math.max(start, 1) + 2 };
  }

  private async loadPromptContext(
    novelId: string,
    characterId: string,
    turns: Array<{ role: string; content: string }>,
  ) {
    const [character, mindSnapshot, latestState, relations, resources, recentChapters, novel] = await Promise.all([
      prisma.character.findFirst({
        where: { id: characterId, novelId },
        select: {
          id: true, name: true, role: true, storyFunction: true, personality: true, background: true, development: true,
          currentState: true, currentGoal: true, identityLabel: true, factionLabel: true, stanceLabel: true,
          outerGoal: true, innerNeed: true, fear: true, wound: true, misbelief: true, secret: true, moralLine: true,
        },
      }),
      this.requireCurrentMind(novelId, characterId),
      prisma.storyStateSnapshot.findFirst({
        where: { novelId },
        orderBy: { updatedAt: "desc" },
        select: {
          summary: true,
          characterStates: {
            where: { characterId },
            select: { currentGoal: true, emotion: true, summary: true, knownFactsJson: true, misbeliefsJson: true },
          },
          informationStates: {
            where: { OR: [{ holderType: "reader" }, { holderRefId: characterId }] },
            select: { holderType: true, fact: true, status: true, summary: true },
            take: 12,
          },
        },
      }),
      prisma.characterRelationStage.findMany({
        where: { novelId, isCurrent: true, OR: [{ sourceCharacterId: characterId }, { targetCharacterId: characterId }] },
        orderBy: { updatedAt: "desc" },
        take: 10,
        include: { sourceCharacter: { select: { name: true } }, targetCharacter: { select: { name: true } } },
      }),
      prisma.characterResourceLedgerItem.findMany({
        where: { novelId, OR: [{ ownerCharacterId: characterId }, { holderCharacterId: characterId }] },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: { name: true, summary: true, status: true, holderCharacterName: true, ownerName: true, constraintsJson: true },
      }),
      prisma.chapter.findMany({
        where: { novelId, chapterStatus: "completed" },
        orderBy: { order: "desc" },
        take: 2,
        select: { order: true, title: true, content: true },
      }),
      prisma.novel.findUnique({
        where: { id: novelId },
        select: {
          title: true,
          bible: { select: { coreSetting: true, mainPromise: true } },
          storyMacroPlan: { select: { decompositionJson: true, constraintEngineJson: true } },
          bookContract: { select: { coreSellingPoint: true, relationshipMainline: true } },
        },
      }),
    ]);
    if (!character || !novel) {
      throw new Error("当前小说中没有找到这个角色。");
    }
    const state = latestState?.characterStates[0];
    const mind = [
      `他当前如何理解局面：${mindSnapshot.currentInterpretation}`,
      `私下意图：${compact(mindSnapshot.privateIntent, "未明确")}`,
      `行动计划：${compact(mindSnapshot.activePlan, "未明确")}`,
      `情绪与行动倾向：${compact(mindSnapshot.emotionalStance, "未明确")}｜${compact(mindSnapshot.actionTendency, "未明确")}`,
      `可能误判：${parseStringArray(mindSnapshot.misbeliefsJson).join("；") || "未明确"}`,
      `推断依据：${parseStringArray(mindSnapshot.evidenceJson).join("；") || "未提供"}`,
    ].join("\n");
    const facts = [
      `小说：${novel.title}`,
      `角色：${character.name}（${character.role}）`,
      `身份/阵营/立场：${compact(character.identityLabel, "未指定")}｜${compact(character.factionLabel, "未指定")}｜${compact(character.stanceLabel, "未指定")}`,
      `性格与经历：${compact(character.personality, "待补全")}｜${compact(character.background, "待补全")}｜${compact(character.development, "待补全")}`,
      `目标与处境：${compact(character.currentGoal, "待明确")}｜${compact(character.currentState, "待明确")}`,
      `内在约束：${compact(character.outerGoal, "未明确")}｜${compact(character.innerNeed, "未明确")}｜恐惧/伤口=${compact(character.fear || character.wound, "未明确")}｜底线=${compact(character.moralLine, "未明确")}`,
      `既有秘密与误判：${compact(character.secret, "未明确")}｜${compact(character.misbelief, "未明确")}`,
      `书级约束：${compact(novel.bookContract?.coreSellingPoint || novel.bible?.mainPromise, "待补全")}｜${compact(novel.storyMacroPlan?.decompositionJson || novel.storyMacroPlan?.constraintEngineJson, "待补全")}`,
      `世界规则：${compact(novel.bible?.coreSetting, "待补全")}`,
      latestState?.summary ? `最新正史状态：${compact(latestState.summary)}` : "",
      state ? `角色正史状态：目标=${compact(state.currentGoal, "未更新")}｜情绪=${compact(state.emotion, "未更新")}｜摘要=${compact(state.summary, "未更新")}` : "",
      ...parseStringArray(state?.knownFactsJson).map((fact) => `角色已知：${fact}`),
      ...parseStringArray(state?.misbeliefsJson).map((fact) => `角色既有误判：${fact}`),
      ...(latestState?.informationStates.map((item) => `${item.holderType}信息边界：${item.status}｜${item.fact}${item.summary ? `（${item.summary}）` : ""}`) ?? []),
      ...resources.map((item) => `${item.holderCharacterName || item.ownerName || character.name}关联${item.name}（${item.status}）：${compact(item.summary)}；约束=${compact(item.constraintsJson, "无")}`),
    ].filter(Boolean).join("\n");
    return {
      mindSnapshot,
      target: `目标角色：${character.name}（${character.role}）\n请始终以这个角色的认知和立场回应作者。`,
      mind,
      facts,
      relations: [
        ...relations.map((relation) => `${relation.sourceCharacter.name} -> ${relation.targetCharacter.name}：${relation.stageLabel}；${relation.stageSummary}${relation.nextTurnPoint ? `；下一转折=${relation.nextTurnPoint}` : ""}`),
        novel.bookContract?.relationshipMainline ? `书级关系主线：${novel.bookContract.relationshipMainline}` : "",
      ].filter(Boolean).join("\n"),
      recentEvents: recentChapters.map((chapter) => `第${chapter.order}章《${chapter.title}》：${compact(chapter.content).slice(0, 900)}`).join("\n\n"),
      history: turns.slice(-12).map((turn) => `${turn.role === "author" ? "作者" : character.name}：${compact(turn.content)}`).join("\n"),
    };
  }
}

export const characterDialogueService = new CharacterDialogueService();
