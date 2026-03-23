import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { briefSummary, extractFacts } from "../novel/novelP0Utils";
import { invokeStructuredLlm } from "../../llm/structuredInvoke";
import { snapshotExtractionOutputSchema } from "./stateSchemas";

export interface StateServiceOptions {
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

export interface SnapshotExtractionOutput {
  summary?: string;
  characterStates?: CharacterStateOutput[];
  relationStates?: RelationStateOutput[];
  informationStates?: InformationStateOutput[];
  foreshadowStates?: ForeshadowStateOutput[];
}

export interface StateSnapshotExtractionInput {
  novelId: string;
  chapter: { id: string; title: string; order: number; expectation: string | null };
  content: string;
  characters: Array<{ id: string; name: string; currentGoal: string | null; currentState: string | null; role: string }>;
  summaryRow: { summary: string; keyEvents: string | null; characterStates: string | null; hook: string | null } | null;
  factRows: Array<{ category: string; content: string }>;
  timelineRows: Array<{ characterId: string; content: string }>;
  previousSnapshot: { summary?: string | null } | null;
  options: StateServiceOptions;
}

export async function extractSnapshotWithAI(input: StateSnapshotExtractionInput): Promise<SnapshotExtractionOutput> {
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
  try {
    const parsed = await invokeStructuredLlm({
      label: `state-snapshot:${input.novelId}:${input.chapter.id}`,
      provider: input.options.provider,
      model: input.options.model,
      temperature: input.options.temperature ?? 0.2,
      taskType: "summary",
      systemPrompt:
        "你是小说状态引擎。请严格输出 JSON，字段为 summary, characterStates, relationStates, informationStates, foreshadowStates。不要输出额外解释。",
      userPrompt: `小说ID：${input.novelId}
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
      schema: snapshotExtractionOutputSchema,
      maxRepairAttempts: 1,
    });
    return parsed as SnapshotExtractionOutput;
  } catch {
    return buildFallbackSnapshot(input);
  }
}

function buildFallbackSnapshot(input: Pick<
  StateSnapshotExtractionInput,
  "chapter" | "content" | "characters" | "summaryRow" | "factRows" | "timelineRows"
>): SnapshotExtractionOutput {
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
