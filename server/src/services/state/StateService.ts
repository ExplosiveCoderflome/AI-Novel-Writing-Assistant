import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { getLLM } from "../../llm/factory";
import { briefSummary, extractFacts, parseJSONObject, stringifyStringArray, toText } from "../novel/novelP0Utils";

interface StateServiceOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

interface CharacterStateOutput {
  characterId?: string;
  characterName?: string;
  currentGoal?: string;
  emotion?: string;
  stressLevel?: number;
  secretExposure?: string;
  knownFacts?: string[];
  misbeliefs?: string[];
  summary?: string;
}

interface RelationStateOutput {
  sourceCharacterId?: string;
  sourceCharacterName?: string;
  targetCharacterId?: string;
  targetCharacterName?: string;
  trustScore?: number;
  intimacyScore?: number;
  conflictScore?: number;
  dependencyScore?: number;
  summary?: string;
}

interface InformationStateOutput {
  holderType?: string;
  holderRefId?: string;
  holderRefName?: string;
  fact?: string;
  status?: string;
  summary?: string;
}

interface ForeshadowStateOutput {
  title?: string;
  summary?: string;
  status?: string;
  setupChapterId?: string;
  payoffChapterId?: string;
}

interface SnapshotExtractionOutput {
  summary?: string;
  characterStates?: CharacterStateOutput[];
  relationStates?: RelationStateOutput[];
  informationStates?: InformationStateOutput[];
  foreshadowStates?: ForeshadowStateOutput[];
}

function clampStateScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeStatus(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export class StateService {
  async getNovelState(novelId: string) {
    return this.getLatestSnapshot(novelId);
  }

  async getLatestSnapshot(novelId: string) {
    return prisma.storyStateSnapshot.findFirst({
      where: { novelId },
      include: {
        characterStates: true,
        relationStates: true,
        informationStates: true,
        foreshadowStates: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getChapterSnapshot(novelId: string, chapterId: string) {
    return prisma.storyStateSnapshot.findFirst({
      where: { novelId, sourceChapterId: chapterId },
      include: {
        characterStates: true,
        relationStates: true,
        informationStates: true,
        foreshadowStates: true,
      },
    });
  }

  async getLatestSnapshotBeforeChapter(novelId: string, chapterOrder: number) {
    const snapshots = await prisma.storyStateSnapshot.findMany({
      where: { novelId },
      include: {
        sourceChapter: {
          select: {
            order: true,
          },
        },
        characterStates: true,
        relationStates: true,
        informationStates: true,
        foreshadowStates: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return snapshots.find((item) => (item.sourceChapter?.order ?? Number.MAX_SAFE_INTEGER) < chapterOrder) ?? null;
  }

  async buildStateContextBlock(novelId: string, chapterOrder: number): Promise<string> {
    const snapshot = await this.getLatestSnapshotBeforeChapter(novelId, chapterOrder);
    if (!snapshot) {
      return "";
    }
    const characterLines = snapshot.characterStates
      .map((item) => item.summary?.trim())
      .filter((item): item is string => Boolean(item))
      .slice(0, 4);
    const relationLines = snapshot.relationStates
      .map((item) => item.summary?.trim())
      .filter((item): item is string => Boolean(item))
      .slice(0, 3);
    const infoLines = snapshot.informationStates
      .map((item) => `${item.holderType}:${item.fact}`)
      .slice(0, 4);
    const foreshadowLines = snapshot.foreshadowStates
      .map((item) => `${item.title}(${item.status})`)
      .slice(0, 4);
    return [
      `State snapshot summary: ${snapshot.summary ?? "暂无摘要"}`,
      characterLines.length > 0 ? `Character states:\n- ${characterLines.join("\n- ")}` : "",
      relationLines.length > 0 ? `Relations:\n- ${relationLines.join("\n- ")}` : "",
      infoLines.length > 0 ? `Knowledge:\n- ${infoLines.join("\n- ")}` : "",
      foreshadowLines.length > 0 ? `Foreshadowing:\n- ${foreshadowLines.join("\n- ")}` : "",
    ].filter(Boolean).join("\n\n");
  }

  async syncChapterState(novelId: string, chapterId: string, content: string, options: StateServiceOptions = {}) {
    const [chapter, characters, summaryRow, factRows, timelineRows] = await Promise.all([
      prisma.chapter.findFirst({
        where: { id: chapterId, novelId },
        select: { id: true, title: true, order: true, expectation: true },
      }),
      prisma.character.findMany({
        where: { novelId },
        select: { id: true, name: true, currentGoal: true, currentState: true, role: true },
      }),
      prisma.chapterSummary.findUnique({
        where: { chapterId },
        select: { summary: true, keyEvents: true, characterStates: true, hook: true },
      }),
      prisma.consistencyFact.findMany({
        where: { novelId, chapterId },
        select: { category: true, content: true },
      }),
      prisma.characterTimeline.findMany({
        where: { novelId, chapterId, source: "chapter_extract" },
        select: { characterId: true, content: true },
      }),
    ]);
    if (!chapter) {
      throw new Error("章节不存在。");
    }
    const previousSnapshot = await this.getLatestSnapshotBeforeChapter(novelId, chapter.order);
    const extracted = await this.extractSnapshotWithAI({
      novelId,
      chapter,
      content,
      characters,
      summaryRow,
      factRows,
      timelineRows,
      previousSnapshot,
      options,
    });
    return this.persistSnapshot({
      novelId,
      chapterId,
      chapterOrder: chapter.order,
      characters,
      extracted,
    });
  }

  async rebuildState(novelId: string, options: StateServiceOptions = {}) {
    const chapters = await prisma.chapter.findMany({
      where: { novelId },
      select: { id: true, content: true, order: true },
      orderBy: { order: "asc" },
    });
    await prisma.storyStateSnapshot.deleteMany({ where: { novelId } });
    const rebuilt = [];
    for (const chapter of chapters) {
      if (!chapter.content?.trim()) {
        continue;
      }
      const snapshot = await this.syncChapterState(novelId, chapter.id, chapter.content, options);
      rebuilt.push(snapshot);
    }
    return rebuilt;
  }

  private async extractSnapshotWithAI(input: {
    novelId: string;
    chapter: { id: string; title: string; order: number; expectation: string | null };
    content: string;
    characters: Array<{ id: string; name: string; currentGoal: string | null; currentState: string | null; role: string }>;
    summaryRow: { summary: string; keyEvents: string | null; characterStates: string | null; hook: string | null } | null;
    factRows: Array<{ category: string; content: string }>;
    timelineRows: Array<{ characterId: string; content: string }>;
    previousSnapshot: Awaited<ReturnType<StateService["getLatestSnapshotBeforeChapter"]>>;
    options: StateServiceOptions;
  }): Promise<SnapshotExtractionOutput> {
    const chapterFacts = input.factRows.length > 0
      ? input.factRows.map((item) => `${item.category}: ${item.content}`).join("\n")
      : extractFacts(input.content).map((item) => `${item.category}: ${item.content}`).join("\n");
    const timelineBlock = input.timelineRows
      .map((item) => {
        const character = input.characters.find((entry) => entry.id === item.characterId);
        return `${character?.name ?? item.characterId}: ${item.content}`;
      })
      .join("\n");
    const previousSummary = input.previousSnapshot?.summary
      ? `上一状态快照：${input.previousSnapshot.summary}`
      : "上一状态快照：无";
    const llm = await getLLM(input.options.provider ?? "deepseek", {
      model: input.options.model,
      temperature: input.options.temperature ?? 0.2,
      taskType: "summary",
    });

    try {
      const result = await llm.invoke([
        new SystemMessage(
          "你是小说状态引擎。请严格输出 JSON，字段为 summary, characterStates, relationStates, informationStates, foreshadowStates。不要输出额外解释。",
        ),
        new HumanMessage(
          `小说ID：${input.novelId}
章节：第${input.chapter.order}章《${input.chapter.title}》
章节目标：${input.chapter.expectation ?? "无"}
角色清单：
${input.characters.map((item) => `- ${item.id} | ${item.name} | ${item.role} | goal=${item.currentGoal ?? ""} | state=${item.currentState ?? ""}`).join("\n")}

章节摘要：
${input.summaryRow?.summary ?? briefSummary(input.content)}

事实：
${chapterFacts || "无"}

角色时间线：
${timelineBlock || "无"}

${previousSummary}

正文：
${input.content}

输出 JSON 规则：
1. characterStates 中每个角色最多一条。
2. relationStates 只保留本章实际变化的关系。
3. informationStates 的 holderType 只能是 reader 或 character；status 只能是 known 或 misbelief。
4. foreshadowStates 的 status 只能是 setup, hinted, pending_payoff, paid_off, failed。
5. 如果不知道 characterId，可填 characterName；如果 holderType=character，可填 holderRefName。
6. summary 必须简洁描述当前章节后的全局状态。`,
        ),
      ]);
      return parseJSONObject<SnapshotExtractionOutput>(toText(result.content));
    } catch {
      return this.buildFallbackSnapshot(input);
    }
  }

  private buildFallbackSnapshot(input: {
    chapter: { order: number; title: string };
    content: string;
    characters: Array<{ id: string; name: string; currentGoal: string | null; currentState: string | null; role: string }>;
    summaryRow: { summary: string; keyEvents: string | null; characterStates: string | null; hook: string | null } | null;
    factRows: Array<{ category: string; content: string }>;
    timelineRows: Array<{ characterId: string; content: string }>;
  }): SnapshotExtractionOutput {
    const summary = input.summaryRow?.summary ?? briefSummary(input.content);
    const facts = input.factRows.length > 0 ? input.factRows : extractFacts(input.content);
    const characterStates = input.characters.map((character) => {
      const timeline = input.timelineRows.filter((item) => item.characterId === character.id).map((item) => item.content);
      const relevantFacts = facts.filter((item) => item.content.includes(character.name)).map((item) => item.content);
      return {
        characterId: character.id,
        currentGoal: character.currentGoal ?? undefined,
        emotion: relevantFacts[0] ?? character.currentState ?? undefined,
        stressLevel: relevantFacts.length > 0 ? 60 : 40,
        secretExposure: "unknown",
        knownFacts: relevantFacts.slice(0, 3),
        misbeliefs: [],
        summary: [timeline[0], relevantFacts[0], character.currentState].filter(Boolean).join("；") || `${character.name}在第${input.chapter.order}章继续推进主线。`,
      };
    });
    const relationStates = input.characters.slice(0, 4).flatMap((source) => {
      return input.characters
        .filter((target) => target.id !== source.id && input.content.includes(source.name) && input.content.includes(target.name))
        .slice(0, 2)
        .map((target) => ({
          sourceCharacterId: source.id,
          targetCharacterId: target.id,
          trustScore: 50,
          intimacyScore: 40,
          conflictScore: 50,
          dependencyScore: 35,
          summary: `${source.name}与${target.name}在本章发生直接互动。`,
        }));
    });
    const informationStates = facts.slice(0, 6).map((item) => ({
      holderType: "reader",
      fact: item.content,
      status: "known",
      summary: item.category,
    }));
    const foreshadowStates = input.summaryRow?.hook?.trim()
      ? [{
          title: input.summaryRow.hook,
          summary: input.summaryRow.hook,
          status: "setup",
        }]
      : [];
    return {
      summary,
      characterStates,
      relationStates,
      informationStates,
      foreshadowStates,
    };
  }

  private async persistSnapshot(input: {
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    characters: Array<{ id: string; name: string }>;
    extracted: SnapshotExtractionOutput;
  }) {
    const characterMap = new Map<string, string>();
    for (const character of input.characters) {
      characterMap.set(character.id, character.id);
      characterMap.set(character.name, character.id);
    }
    const normalizedCharacterStates = (input.extracted.characterStates ?? [])
      .map((item) => {
        const characterId = characterMap.get(item.characterId ?? "") ?? characterMap.get(item.characterName ?? "");
        if (!characterId) {
          return null;
        }
        return {
          characterId,
          currentGoal: item.currentGoal?.trim() || null,
          emotion: item.emotion?.trim() || null,
          stressLevel: clampStateScore(item.stressLevel),
          secretExposure: item.secretExposure?.trim() || null,
          knownFactsJson: stringifyStringArray(item.knownFacts),
          misbeliefsJson: stringifyStringArray(item.misbeliefs),
          summary: item.summary?.trim() || null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const normalizedRelationStates = (input.extracted.relationStates ?? [])
      .map((item) => {
        const sourceCharacterId = characterMap.get(item.sourceCharacterId ?? "") ?? characterMap.get(item.sourceCharacterName ?? "");
        const targetCharacterId = characterMap.get(item.targetCharacterId ?? "") ?? characterMap.get(item.targetCharacterName ?? "");
        if (!sourceCharacterId || !targetCharacterId || sourceCharacterId === targetCharacterId) {
          return null;
        }
        return {
          sourceCharacterId,
          targetCharacterId,
          trustScore: clampStateScore(item.trustScore),
          intimacyScore: clampStateScore(item.intimacyScore),
          conflictScore: clampStateScore(item.conflictScore),
          dependencyScore: clampStateScore(item.dependencyScore),
          summary: item.summary?.trim() || null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const normalizedInformationStates = (input.extracted.informationStates ?? [])
      .map((item) => {
        const holderType = item.holderType === "character" ? "character" : "reader";
        const holderRefId = holderType === "character"
          ? characterMap.get(item.holderRefId ?? "") ?? characterMap.get(item.holderRefName ?? "")
          : null;
        if (!item.fact?.trim()) {
          return null;
        }
        return {
          holderType,
          holderRefId,
          fact: item.fact.trim(),
          status: normalizeStatus(item.status, "known"),
          summary: item.summary?.trim() || null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const normalizedForeshadowStates = (input.extracted.foreshadowStates ?? [])
      .map((item) => {
        if (!item.title?.trim()) {
          return null;
        }
        return {
          title: item.title.trim(),
          summary: item.summary?.trim() || null,
          status: normalizeStatus(item.status, "setup"),
          setupChapterId: item.setupChapterId?.trim() || input.chapterId,
          payoffChapterId: item.payoffChapterId?.trim() || null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const rawStateJson = JSON.stringify({
      summary: input.extracted.summary ?? null,
      characterStates: normalizedCharacterStates,
      relationStates: normalizedRelationStates,
      informationStates: normalizedInformationStates,
      foreshadowStates: normalizedForeshadowStates,
    });
    const summary = input.extracted.summary?.trim() || `第${input.chapterOrder}章状态快照`;
    const existing = await prisma.storyStateSnapshot.findFirst({
      where: { novelId: input.novelId, sourceChapterId: input.chapterId },
      select: { id: true },
    });
    const snapshotId = await prisma.$transaction(async (tx) => {
      const snapshot = existing
        ? await tx.storyStateSnapshot.update({
            where: { id: existing.id },
            data: {
              summary,
              rawStateJson,
            },
            select: { id: true },
          })
        : await tx.storyStateSnapshot.create({
            data: {
              novelId: input.novelId,
              sourceChapterId: input.chapterId,
              summary,
              rawStateJson,
            },
            select: { id: true },
          });
      await Promise.all([
        tx.characterState.deleteMany({ where: { snapshotId: snapshot.id } }),
        tx.relationState.deleteMany({ where: { snapshotId: snapshot.id } }),
        tx.informationState.deleteMany({ where: { snapshotId: snapshot.id } }),
        tx.foreshadowState.deleteMany({ where: { snapshotId: snapshot.id } }),
      ]);
      if (normalizedCharacterStates.length > 0) {
        await tx.characterState.createMany({
          data: normalizedCharacterStates.map((item) => ({
            snapshotId: snapshot.id,
            ...item,
          })),
        });
      }
      if (normalizedRelationStates.length > 0) {
        await tx.relationState.createMany({
          data: normalizedRelationStates.map((item) => ({
            snapshotId: snapshot.id,
            ...item,
          })),
        });
      }
      if (normalizedInformationStates.length > 0) {
        await tx.informationState.createMany({
          data: normalizedInformationStates.map((item) => ({
            snapshotId: snapshot.id,
            ...item,
          })),
        });
      }
      if (normalizedForeshadowStates.length > 0) {
        await tx.foreshadowState.createMany({
          data: normalizedForeshadowStates.map((item) => ({
            snapshotId: snapshot.id,
            ...item,
          })),
        });
      }
      return snapshot.id;
    });
    return prisma.storyStateSnapshot.findUnique({
      where: { id: snapshotId },
      include: {
        characterStates: true,
        relationStates: true,
        informationStates: true,
        foreshadowStates: true,
      },
    });
  }
}

export const stateService = new StateService();
