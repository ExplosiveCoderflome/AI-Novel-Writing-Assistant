import type { Character, CharacterTimeline } from "@ai-novel/shared/types/novel";

const RELATION_POSITIVE_KEYWORDS = ["Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", "ally", "trust", "guard", "close", "like", "cooperate"];
const RELATION_NEGATIVE_KEYWORDS = ["hostility", "opposition", "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", "betray", "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", "conflict", "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."];
const TREND_UP_KEYWORDS = ["heating up", "ease", "near", "repair", "Cooperation deepens", "Trust increases"];
const TREND_DOWN_KEYWORDS = ["Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", "rupture", "nervous", "break", "Conflict escalates", "Hostility deepens"];

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
  const keywordText = keywordList.length > 0 ? keywordList.join("、") : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";

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
    currentState: payload.relationToProtagonist ? `关系推进中（${payload.relationToProtagonist}）` : "Waiting to play",
    currentGoal: payload.storyFunction || "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  };
}

function inferCurrentRelation(source: string): string {
  if (!source) {
    return "To be defined";
  }
  const positiveHits = countHits(source, RELATION_POSITIVE_KEYWORDS);
  const negativeHits = countHits(source, RELATION_NEGATIVE_KEYWORDS);
  if (positiveHits > negativeHits) {
    return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  if (negativeHits > positiveHits) {
    return "opposition / tension";
  }
  return "Complex / to be seen";
}

function inferTrend(source: string): string {
  if (!source) {
    return "To be seen";
  }
  const upHits = countHits(source, TREND_UP_KEYWORDS);
  const downHits = countHits(source, TREND_DOWN_KEYWORDS);
  if (upHits > downHits) {
    return "heating up";
  }
  if (downHits > upHits) {
    return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  return "smooth";
}

function includesCharacterName(source: string, characterName: string): boolean {
  if (!source || !characterName) {
    return false;
  }
  return source.includes(characterName);
}

function buildLatestEvidence(event?: CharacterTimeline): string {
  if (!event) {
    return "No chapter evidence yet";
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
