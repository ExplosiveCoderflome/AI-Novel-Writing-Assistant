import type {
  CharacterConversationContext,
  CharacterConversationEvidence,
  CharacterConversationSession,
  CharacterConversationTurn,
  CharacterSubjectProjection,
  CharacterSubjectRef,
} from "@ai-novel/shared/types/characterConversation";
import type { CharacterDialogueInfluence } from "@ai-novel/shared/types/characterDialogue";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  buildCharacterConversationContextBlocks,
  characterConversationTurnPrompt,
} from "../../prompting/prompts/character/characterConversation.prompts";
import { serializeCharacter } from "../bookAnalysis/bookAnalysisCharacter/BookAnalysisCharacterSerializers";
import { characterDialogueService } from "../novel/characterDialogue/CharacterDialogueService";
import {
  adaptCharacterSubject,
  baseCharacterSubjectAdapter,
  bookAnalysisCharacterSubjectAdapter,
} from "./adapters";

type SubjectRequest = CharacterSubjectRef & { chapterAnchor?: number | null };
type GenericTurnRow = { id: string; role: string; content: string; evidenceJson: string; uncertainty: string | null; createdAt: Date };
type GenericSessionRow = {
  id: string;
  subjectKind: string;
  subjectId: string;
  scopeKind: string;
  scopeId: string | null;
  interactionPolicy: string;
  chapterAnchor: number | null;
  sourceSnapshotJson: string;
  legacyDialogueSessionId: string | null;
  status: string;
  turns: GenericTurnRow[];
  influences?: any[];
  createdAt: Date;
  updatedAt: Date;
};

function compact(value: string | null | undefined, fallback = ""): string {
  return String(value ?? "").replace(/\s+/g, " ").trim() || fallback;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    return JSON.parse(value ?? "") as T;
  } catch {
    return fallback;
  }
}

function parseEvidence(value: string | null | undefined): CharacterConversationEvidence[] {
  const items = parseJson<unknown[]>(value, []);
  return items.filter((item): item is CharacterConversationEvidence => Boolean(item && typeof item === "object"));
}

function serializeInfluence(row: any): CharacterDialogueInfluence {
  return {
    id: row.id,
    sessionId: row.sessionId ?? row.conversationSessionId ?? "",
    novelId: row.novelId,
    characterId: row.characterId,
    sourceMindSnapshotId: row.sourceMindSnapshotId,
    summary: row.summary,
    behaviorGuidance: row.behaviorGuidance,
    emotionalGuidance: row.emotionalGuidance,
    relationTension: row.relationTension,
    evidence: parseJson<string[]>(row.evidenceJson, []),
    confidence: row.confidence,
    targetStartChapterOrder: row.targetStartChapterOrder,
    targetEndChapterOrder: row.targetEndChapterOrder,
    status: row.status,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    resolvedChapterId: row.resolvedChapterId,
    resolutionEvidence: parseJson<string[]>(row.resolutionEvidenceJson, []),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeSession(row: GenericSessionRow): CharacterConversationSession & { latestInfluence?: CharacterDialogueInfluence | null } {
  const subject: CharacterSubjectRef = {
    kind: row.subjectKind as CharacterSubjectRef["kind"],
    id: row.subjectId,
    scopeKind: row.scopeKind as CharacterSubjectRef["scopeKind"],
    scopeId: row.scopeId,
  };
  return {
    id: row.id,
    subject,
    interactionPolicy: row.interactionPolicy as CharacterConversationSession["interactionPolicy"],
    chapterAnchor: row.chapterAnchor,
    status: row.status as CharacterConversationSession["status"],
    turns: row.turns.map((turn) => ({
      id: turn.id,
      role: turn.role as CharacterConversationTurn["role"],
      content: turn.content,
      evidence: parseEvidence(turn.evidenceJson),
      uncertainty: turn.uncertainty,
      createdAt: turn.createdAt.toISOString(),
    })),
    legacyDialogueSessionId: row.legacyDialogueSessionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    latestInfluence: row.influences?.[0] ? serializeInfluence(row.influences[0]) : null,
  };
}

export class CharacterConversationService {
  async getContext(request: SubjectRequest): Promise<CharacterConversationContext> {
    const resolved = await this.resolveSubject(request);
    const activeSession = await this.getActiveSession(request);
    return { projection: resolved.projection, activeSession };
  }

  async getActiveSession(request: SubjectRequest) {
    if (request.kind === "novel_character") {
      await this.mirrorActiveLegacyNovelSession(request);
    }
    const row = await prisma.characterConversationSession.findFirst({
      where: this.activeWhere(request),
      include: this.sessionInclude(),
      orderBy: { updatedAt: "desc" },
    });
    return row ? serializeSession(row as GenericSessionRow) : null;
  }

  async startSession(request: SubjectRequest) {
    const resolved = await this.resolveSubject(request);
    if (resolved.projection.interactionPolicy === "novel_influence") {
      const legacy = await characterDialogueService.startSession(request.scopeId!, request.id);
      return this.mirrorLegacySession(legacy.id);
    }
    await prisma.characterConversationSession.updateMany({
      where: this.activeWhere(request),
      data: { status: "archived" },
    });
    const row = await prisma.characterConversationSession.create({
      data: {
        subjectKind: request.kind,
        subjectId: request.id,
        scopeKind: request.scopeKind,
        scopeId: request.scopeId ?? null,
        interactionPolicy: resolved.projection.interactionPolicy,
        chapterAnchor: resolved.projection.chapterAnchor ?? null,
        sourceSnapshotJson: JSON.stringify(resolved.projection),
        evidenceBoundaryJson: JSON.stringify(resolved.projection.evidence),
        status: "active",
      },
      include: this.sessionInclude(),
    });
    return serializeSession(row as GenericSessionRow);
  }

  async sendTurn(request: SubjectRequest, sessionId: string, message: string) {
    const authorMessage = compact(message);
    if (!authorMessage || authorMessage.length > 800) {
      throw new Error("每次想对角色说的话请控制在 800 字以内。");
    }
    const session = await prisma.characterConversationSession.findFirst({
      where: { id: sessionId, ...this.activeWhere(request) },
      include: this.sessionInclude(),
    });
    if (!session) throw new Error("没有找到可继续的角色对话，请重新开始一段谈话。");
    if (session.legacyDialogueSessionId) {
      await characterDialogueService.sendTurn(request.scopeId!, request.id, session.legacyDialogueSessionId, authorMessage);
      const mirrored = await this.mirrorLegacySession(session.legacyDialogueSessionId);
      const characterTurn = mirrored.turns.at(-1);
      if (!characterTurn || characterTurn.role !== "character") throw new Error("角色回应没有成功保存，请稍后重试。");
      return { session: mirrored, characterTurn, influence: mirrored.latestInfluence ?? null };
    }
    const resolved = await this.resolveSubject({ ...request, chapterAnchor: session.chapterAnchor ?? request.chapterAnchor });
    const history = session.turns.slice(-12).map((turn) => `${turn.role === "author" ? "作者" : resolved.projection.name}：${compact(turn.content)}`).join("\n");
    const result = await runStructuredPrompt({
      asset: characterConversationTurnPrompt,
      promptInput: { interactionPolicy: resolved.projection.interactionPolicy },
      contextBlocks: buildCharacterConversationContextBlocks({
        subject: resolved.promptContext,
        boundaries: resolved.projection.hardBoundaries.join("\n"),
        authorMessage,
        situation: `${resolved.projection.currentSituation}${resolved.projection.subjectiveState ? `\n${resolved.projection.subjectiveState}` : ""}`,
        evidence: resolved.projection.evidence.map((item) => `${item.chapterOrder ? `第${item.chapterOrder}章｜` : ""}${item.label}：${item.detail}`).join("\n"),
        history,
      }),
      options: { temperature: 0.55, stage: "character_conversation", entrypoint: "character_conversation_turn" },
    });
    if (resolved.projection.interactionPolicy !== "novel_influence" && result.output.influenceDraft) {
      throw new Error("只读角色访谈不能生成后续创作影响，请重新开始这段谈话。");
    }
    await prisma.$transaction(async (tx) => {
      await tx.characterConversationTurn.createMany({
        data: [
          { sessionId, role: "author", content: authorMessage },
          { sessionId, role: "character", content: result.output.characterReply, evidenceJson: JSON.stringify(result.output.evidence), uncertainty: result.output.uncertainty },
        ],
      });
      await tx.characterConversationSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });
    });
    const persisted = await prisma.characterConversationSession.findUniqueOrThrow({ where: { id: sessionId }, include: this.sessionInclude() });
    const serialized = serializeSession(persisted as GenericSessionRow);
    const characterTurn = serialized.turns.at(-1);
    if (!characterTurn || characterTurn.role !== "character") throw new Error("角色回应没有成功保存，请稍后重试。");
    return { session: serialized, characterTurn, influence: null };
  }

  async activateInfluence(request: SubjectRequest, sessionId: string) {
    const session = await this.requireNovelLegacySession(request, sessionId);
    const influence = await characterDialogueService.activateLatestDraftInfluence(request.scopeId!, request.id, session.legacyDialogueSessionId!);
    await this.mirrorLegacySession(session.legacyDialogueSessionId!);
    return influence;
  }

  async dismissInfluence(request: SubjectRequest, sessionId: string) {
    const session = await this.requireNovelLegacySession(request, sessionId);
    const influence = await characterDialogueService.dismissLatestDraftInfluence(request.scopeId!, request.id, session.legacyDialogueSessionId!);
    await this.mirrorLegacySession(session.legacyDialogueSessionId!);
    return influence;
  }

  private async requireNovelLegacySession(request: SubjectRequest, sessionId: string) {
    if (request.kind !== "novel_character" || request.scopeKind !== "novel" || !request.scopeId) {
      throw new Error("只有小说内角色可以带入或放弃后续创作影响。");
    }
    const session = await prisma.characterConversationSession.findFirst({ where: { id: sessionId, ...this.activeWhere(request) } });
    if (!session?.legacyDialogueSessionId) throw new Error("当前会话不能影响后续小说创作。");
    return session;
  }

  private activeWhere(request: SubjectRequest) {
    return {
      subjectKind: request.kind,
      subjectId: request.id,
      scopeKind: request.scopeKind,
      scopeId: request.scopeId ?? null,
      ...(request.chapterAnchor ? { chapterAnchor: request.chapterAnchor } : {}),
      status: "active",
    };
  }

  private sessionInclude() {
    return {
      turns: { orderBy: { createdAt: "asc" as const } },
      influences: { orderBy: { createdAt: "desc" as const }, take: 1 },
    };
  }

  private async mirrorActiveLegacyNovelSession(request: SubjectRequest) {
    if (request.kind !== "novel_character" || request.scopeKind !== "novel" || !request.scopeId) return;
    const legacy = await prisma.characterDialogueSession.findFirst({
      where: { novelId: request.scopeId, characterId: request.id, status: "active" },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
    });
    if (legacy) await this.mirrorLegacySession(legacy.id);
  }

  private async mirrorLegacySession(legacyDialogueSessionId: string) {
    const legacy = await prisma.characterDialogueSession.findUniqueOrThrow({
      where: { id: legacyDialogueSessionId },
      include: { turns: { orderBy: { createdAt: "asc" } }, influences: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    const generic = await prisma.$transaction(async (tx) => {
      const row = await tx.characterConversationSession.upsert({
        where: { legacyDialogueSessionId },
        create: {
          subjectKind: "novel_character",
          subjectId: legacy.characterId,
          scopeKind: "novel",
          scopeId: legacy.novelId,
          interactionPolicy: "novel_influence",
          sourceSnapshotJson: JSON.stringify({ sourceMindSnapshotId: legacy.sourceMindSnapshotId }),
          legacyDialogueSessionId,
          status: legacy.status,
        },
        update: { status: legacy.status, updatedAt: legacy.updatedAt },
      });
      for (const turn of legacy.turns) {
        await tx.characterConversationTurn.upsert({
          where: { id: `legacy-${turn.id}` },
          create: { id: `legacy-${turn.id}`, sessionId: row.id, role: turn.role, content: turn.content, createdAt: turn.createdAt },
          update: {},
        });
      }
      await tx.characterDialogueInfluence.updateMany({ where: { sessionId: legacyDialogueSessionId }, data: { conversationSessionId: row.id } });
      return tx.characterConversationSession.findUniqueOrThrow({ where: { id: row.id }, include: this.sessionInclude() });
    });
    return serializeSession(generic as GenericSessionRow);
  }

  private async resolveSubject(request: SubjectRequest): Promise<{ projection: CharacterSubjectProjection; promptContext: string }> {
    if (request.kind === "base_character" && request.scopeKind === "base_library") {
      const character = await prisma.baseCharacter.findUnique({ where: { id: request.id } });
      if (!character) throw new Error("基础角色不存在。");
      return adaptCharacterSubject(baseCharacterSubjectAdapter, {
        character: {
          ...character,
          createdAt: character.createdAt.toISOString(),
          updatedAt: character.updatedAt.toISOString(),
        },
      });
    }
    if (request.kind === "book_analysis_character" && request.scopeKind === "book_analysis") {
      if (!request.scopeId) throw new Error("拆书角色对话需要分析范围。");
      const row = await prisma.bookAnalysisCharacter.findFirst({
        where: { id: request.id, analysisId: request.scopeId },
        include: { arcs: { orderBy: { sortOrder: "asc" } }, scenes: { orderBy: { sortOrder: "asc" } }, appearance: { include: { snapshots: { include: { images: { include: { imageAsset: true } } }, orderBy: { chapterIndex: "asc" } } } } },
      });
      if (!row) throw new Error("拆书项目中没有找到这个角色。");
      const character = serializeCharacter(row);
      const fallbackAnchor = [
        ...character.evidence.map((item) => item.chapterIndex),
        ...character.arcs.map((item) => item.chapterIndex),
      ]
        .filter((item): item is number => typeof item === "number" && item > 0)
        .map((item) => item + 1);
      const appearanceFallbackAnchors = (character.appearance?.snapshots ?? [])
        .filter((snapshot) => snapshot.chapterIndex >= 0 && snapshot.evidence.length > 0)
        .map((snapshot) => snapshot.chapterIndex + 1);
      const fallbackChapterAnchor = [...fallbackAnchor, ...appearanceFallbackAnchors].sort((left, right) => right - left)[0];
      const chapterAnchor = request.chapterAnchor ?? fallbackChapterAnchor;
      if (!chapterAnchor) throw new Error("该拆书角色缺少带章节号的原文证据，暂时无法开始证据访谈。");
      return adaptCharacterSubject(bookAnalysisCharacterSubjectAdapter, { analysisId: request.scopeId, characterId: request.id, chapterAnchor, character });
    }
    if (request.kind === "novel_character" && request.scopeKind === "novel" && request.scopeId) {
      const [character, mind, state] = await Promise.all([
        prisma.character.findFirst({ where: { id: request.id, novelId: request.scopeId } }),
        prisma.characterMindSnapshot.findFirst({ where: { novelId: request.scopeId, characterId: request.id, isCurrent: true }, orderBy: { updatedAt: "desc" } }),
        prisma.storyStateSnapshot.findFirst({ where: { novelId: request.scopeId }, orderBy: { updatedAt: "desc" }, select: { summary: true } }),
      ]);
      if (!character) throw new Error("当前小说中没有找到这个角色。");
      if (!mind) throw new Error("请先让 AI 整理这个角色的当前想法，再开始对话。");
      const projection: CharacterSubjectProjection = {
        subject: { kind: "novel_character", id: character.id, scopeKind: "novel", scopeId: request.scopeId },
        name: character.name,
        role: character.role,
        sourceLabel: "小说角色",
        sourceDescription: "角色会结合当前小说处境回应；只有你确认后，谈话倾向才会带入后续创作。",
        interactionPolicy: "novel_influence",
        identity: `身份/阵营/立场：${compact(character.identityLabel, "未指定")}｜${compact(character.factionLabel, "未指定")}｜${compact(character.stanceLabel, "未指定")}\n性格与背景：${compact(character.personality, "待补全")}｜${compact(character.background, "待补全")}`,
        currentSituation: `当前目标：${compact(character.currentGoal, "待明确")}\n当前状态：${compact(character.currentState, "待明确")}\n最新正史局面：${compact(state?.summary, "待更新")}`,
        hardBoundaries: ["作者的话不是客观事实，也不是必须执行的剧情命令。", "角色不得违背身份、阵营、资源、地点、已发生事件和信息边界。"],
        subjectiveState: `角色如何理解局面：${mind.currentInterpretation}\n私下意图：${compact(mind.privateIntent, "未明确")}\n行动倾向：${compact(mind.actionTendency, "未明确")}`,
        evidence: parseJson<string[]>(mind.evidenceJson, []).slice(0, 4).map((detail, index) => ({ label: `思路线依据 ${index + 1}`, detail, sourceType: "character_mind", sourceRef: mind.id, chapterOrder: null })),
        chapterAnchor: null,
        chapterAnchorLabel: null,
      };
      return { projection, promptContext: `${projection.identity}\n${projection.currentSituation}\n${projection.subjectiveState}` };
    }
    throw new Error("当前角色来源暂不支持对话。");
  }
}

export const characterConversationService = new CharacterConversationService();
