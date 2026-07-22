import i18next from "i18next";
import type { Character, CharacterTimeline } from "@ai-novel/shared/types/novel";

const RELATION_POSITIVE_KEYWORDS = [i18next.t("gen.pages.novels.components.characterPanel.utils.partner"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_96665c0a"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_ba871361"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_2b5f9e88"), i18next.t("gen.pages.novels.components.characterPanel.utils.intimate"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_3d6c396c"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_e673449d")];
const RELATION_NEGATIVE_KEYWORDS = [i18next.t("gen.pages.novels.components.characterPanel.utils.gen_22998d1b"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_89e0f9da"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_75331359"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_3bcb50a4"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_c0d076b9"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_93190be9"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_ecb25c00")];
const TREND_UP_KEYWORDS = [i18next.t("gen.pages.novels.components.characterPanel.utils.gen_f100b6eb"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_40b6ef4a"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_9332494c"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_f82661e8"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_d9516830"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_cd4c0df0")];
const TREND_DOWN_KEYWORDS = [i18next.t("gen.pages.novels.components.characterPanel.utils.gen_bf360313"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_01c56b67"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_2ca174f4"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_587f2127"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_e396bdee"), i18next.t("gen.pages.novels.components.characterPanel.utils.gen_87955a09")];

function compactText(input: string | null | undefined): string {
  return (input ?? "").trim();
}

function joinSegments(segments: Array<string | null | undefined>): string {
  return segments
    .map((segment) => compactText(segment))
    .filter((segment) => segment.length > 0)
    .join("；");
}

function countHits(source: string, keywords: string[]): number {
  return keywords.reduce((count, keyword) => (source.includes(keyword) ? count + 1 : count), 0);
}

export interface QuickCharacterCreatePayload {
  name: string;
  role: string;
  relationToProtagonist?: string;
  storyFunction?: string;
  keywords?: string;
  autoGenerateProfile?: boolean;
}

export interface CharacterRelationRow {
  targetCharacterId: string;
  targetCharacterName: string;
  currentRelation: string;
  trend: string;
  lastChangedChapter: number | null;
  evidence: string;
}

interface GeneratedCharacterProfile {
  personality?: string;
  background?: string;
  development?: string;
  currentState?: string;
  currentGoal?: string;
}

export function buildCharacterProfileFromWizard(payload: QuickCharacterCreatePayload): GeneratedCharacterProfile {
  if (!payload.autoGenerateProfile) {
    return {};
  }

  const keywordList = (payload.keywords ?? "")
    .split(/[，,\s]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const keywordText = keywordList.length > 0 ? keywordList.join("、") : i18next.t("gen.pages.novels.components.characterPanel.utils.gen_a0a7859f");

  const personality = `核心特征：${keywordText}`;
  const background = joinSegments([
    payload.relationToProtagonist ? `与主角关系：${payload.relationToProtagonist}` : "",
    payload.storyFunction ? `故事作用：${payload.storyFunction}` : "",
  ]);
  const development = joinSegments([
    payload.storyFunction ? `角色成长主轴：围绕“${payload.storyFunction}”推进。` : "",
    keywordList.length > 0 ? `潜在冲突点：${keywordList.slice(0, 3).join("、")}` : "",
    keywordList.length > 0 ? `可埋伏笔点：${keywordList.slice(-2).join("、")}` : "",
    keywordList.length > 0 ? `说话风格建议：偏向${keywordList[0]}语气。` : "",
  ]);

  return {
    personality: personality || undefined,
    background: background || undefined,
    development: development || undefined,
    currentState: payload.relationToProtagonist ? `关系推进中（${payload.relationToProtagonist}）` : i18next.t("gen.pages.novels.components.characterPanel.utils.gen_eeef0952"),
    currentGoal: payload.storyFunction || i18next.t("gen.pages.novels.components.characterPanel.utils.gen_2c85cc64"),
  };
}

function inferCurrentRelation(source: string): string {
  if (!source) {
    return i18next.t("gen.pages.novels.components.characterPanel.utils.gen_301cbf58");
  }
  const positiveHits = countHits(source, RELATION_POSITIVE_KEYWORDS);
  const negativeHits = countHits(source, RELATION_NEGATIVE_KEYWORDS);
  if (positiveHits > negativeHits) {
    return i18next.t("gen.pages.novels.components.characterPanel.utils.gen_e9a82506");
  }
  if (negativeHits > positiveHits) {
    return i18next.t("gen.pages.novels.components.characterPanel.utils.gen_966d54f3");
  }
  return i18next.t("gen.pages.novels.components.characterPanel.utils.gen_183fac1d");
}

function inferTrend(source: string): string {
  if (!source) {
    return i18next.t("gen.pages.novels.components.characterPanel.utils.gen_27b34703");
  }
  const upHits = countHits(source, TREND_UP_KEYWORDS);
  const downHits = countHits(source, TREND_DOWN_KEYWORDS);
  if (upHits > downHits) {
    return i18next.t("gen.pages.novels.components.characterPanel.utils.gen_f100b6eb");
  }
  if (downHits > upHits) {
    return i18next.t("gen.pages.novels.components.characterPanel.utils.gen_bf360313");
  }
  return i18next.t("gen.pages.novels.components.characterPanel.utils.gen_42f8a02a");
}

function includesCharacterName(source: string, characterName: string): boolean {
  if (!source || !characterName) {
    return false;
  }
  return source.includes(characterName);
}

function buildLatestEvidence(event?: CharacterTimeline): string {
  if (!event) {
    return i18next.t("gen.pages.novels.components.characterPanel.utils.gen_b09b78d6");
  }
  const excerpt = compactText(event.content).slice(0, 36);
  return excerpt.length > 0 ? excerpt : event.title;
}

export function buildCharacterRelationRows(
  selectedCharacter: Character | undefined,
  characters: Character[],
  timelineEvents: CharacterTimeline[],
): CharacterRelationRow[] {
  if (!selectedCharacter) {
    return [];
  }

  const selectedText = joinSegments([
    selectedCharacter.background,
    selectedCharacter.development,
    selectedCharacter.currentState,
    selectedCharacter.currentGoal,
    selectedCharacter.personality,
  ]);

  return characters
    .filter((character) => character.id !== selectedCharacter.id)
    .map((character) => {
      const relatedEvents = timelineEvents
        .filter((event) => includesCharacterName(`${event.title} ${event.content}`, character.name))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const latestEvent = relatedEvents[0];
      const relationSource = joinSegments([
        selectedText,
        ...relatedEvents.slice(0, 3).map((event) => `${event.title} ${event.content}`),
      ]);

      return {
        targetCharacterId: character.id,
        targetCharacterName: character.name,
        currentRelation: inferCurrentRelation(relationSource),
        trend: inferTrend(relationSource),
        lastChangedChapter: latestEvent?.chapterOrder ?? null,
        evidence: buildLatestEvidence(latestEvent),
      };
    });
}

export function getLastAppearanceChapter(timelineEvents: CharacterTimeline[]): number | null {
  return timelineEvents.reduce<number | null>((latest, event) => {
    if (typeof event.chapterOrder !== "number") {
      return latest;
    }
    if (latest === null || event.chapterOrder > latest) {
      return event.chapterOrder;
    }
    return latest;
  }, null);
}
