import type { PrismaClient } from "@prisma/client";
import type { CharacterResourceLedgerItem } from "@ai-novel/shared/types/characterResource";
import { buildChapterArtifactLedgerContext } from "../../../../services/novel/runtime/artifactSync/context";
import { InvalidProductionRequestError } from "../../application";
import type { ArtifactExtractionDependencies } from "./extraction";

interface PreviousSnapshot {
  summary: string | null;
  characterStates: { summary: string | null }[];
  relationStates: { summary: string | null }[];
  informationStates: { holderType: string; fact: string }[];
  foreshadowStates: { title: string; status: string }[];
}
interface SourceCharacter {
  id: string; name: string; role: string; castRole: string | null;
  currentGoal: string | null; currentState: string | null; currentLocation: string | null;
}
export interface ArtifactSourceFacades {
  listResources(novelId: string): Promise<CharacterResourceLedgerItem[]>;
  readPreviousSnapshot(novelId: string, chapterOrder: number): Promise<PreviousSnapshot | null>;
  readLocationContext(input: { novelId: string; chapterOrder: number; characters: SourceCharacter[] }): Promise<string>;
}
function previousState(snapshot: PreviousSnapshot | null): string {
  if (!snapshot) return "";
  const characters = snapshot.characterStates.map(item => item.summary?.trim()).filter(Boolean).slice(0, 6);
  const relations = snapshot.relationStates.map(item => item.summary?.trim()).filter(Boolean).slice(0, 5);
  const information = snapshot.informationStates.map(item => `${item.holderType}:${item.fact}`).slice(0, 6);
  const foreshadows = snapshot.foreshadowStates.map(item => `${item.title}(${item.status})`).slice(0, 6);
  return [snapshot.summary ? `摘要：${snapshot.summary}` : "",
    ...([["角色", characters], ["关系", relations], ["信息", information], ["伏笔", foreshadows]] as const)
      .map(([label, values]) => values.length ? `${label}：\n${values.map(value => `- ${value}`).join("\n")}` : ""),
  ].filter(Boolean).join("\n\n").slice(0, 5000);
}

/** Read-only assembly relocated from unified extraction; no producer/version dispatch or empty-data fallback. */
export function createArtifactSourceReader(
  db: Pick<PrismaClient, "novel" | "chapter" | "character" | "payoffLedgerItem" | "characterDialogueInfluence">,
  facades: ArtifactSourceFacades,
): ArtifactExtractionDependencies["read"] {
  return async context => {
    const { novelId, chapterId, order } = context.run.progress.unit;
    const [novel, chapter, characters, resources, payoffs, snapshot, influences] = await Promise.all([
      db.novel.findUnique({ where: { id: novelId }, select: { title: true } }),
      db.chapter.findFirst({ where: { id: chapterId, novelId }, select: { id: true, order: true, title: true, taskSheet: true, expectation: true } }),
      db.character.findMany({ where: { novelId }, orderBy: { createdAt: "asc" }, select: {
        id: true, name: true, role: true, castRole: true, currentGoal: true, currentState: true, currentLocation: true,
      } }),
      facades.listResources(novelId),
      db.payoffLedgerItem.findMany({ where: { novelId }, orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }], take: 30,
        select: { ledgerKey: true, title: true, currentStatus: true, summary: true, targetStartChapterOrder: true,
          targetEndChapterOrder: true, lastTouchedChapterOrder: true } }),
      facades.readPreviousSnapshot(novelId, order),
      db.characterDialogueInfluence.findMany({ where: { novelId, status: "active",
        targetStartChapterOrder: { lte: order }, targetEndChapterOrder: { gte: order } },
        orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }], take: 8,
        select: { id: true, summary: true, behaviorGuidance: true, emotionalGuidance: true, relationTension: true,
          targetStartChapterOrder: true, targetEndChapterOrder: true, character: { select: { name: true } } } }),
    ]);
    if (!novel || !chapter || chapter.order !== order) throw new InvalidProductionRequestError("Artifact source chapter identity changed");
    const characterLocationText = context.run.snapshots.profile.capabilities.includes("character_state")
      ? await facades.readLocationContext({ novelId, chapterOrder: order, characters }) : "";
    return {
      novelTitle: novel.title, chapterTitle: chapter.title,
      chapterGoal: chapter.taskSheet?.trim() || chapter.expectation?.trim() || "无明确章节目标",
      ...buildChapterArtifactLedgerContext({ characters, resources, payoffs }), characterLocationText,
      previousStateText: previousState(snapshot),
      activeCharacterDialogueInfluenceText: influences.map(item => [`- influenceId=${item.id}`,
        `角色=${item.character.name}`, `对话沉淀=${item.summary}`, `窗口=${item.targetStartChapterOrder}-${item.targetEndChapterOrder}`,
        `行动倾向=${item.behaviorGuidance}`, item.emotionalGuidance ? `情绪倾向=${item.emotionalGuidance}` : "",
        item.relationTension ? `关系张力=${item.relationTension}` : ""].filter(Boolean).join(" | ")).join("\n").slice(0, 3500),
    };
  };
}
