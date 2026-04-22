import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

interface PromptMetaRecord {
  novelId?: string | null;
  chapterId?: string | null;
  stage?: string | null;
  sceneIndex?: number | null;
  roundIndex?: number | null;
  triggerReason?: string | null;
  contextBlockIds?: string[];
  estimatedInputTokens?: number | null;
  promptId?: string | null;
}

interface LogRecord {
  requestId?: string | null;
  event?: string | null;
  promptMeta?: PromptMetaRecord | null;
  actualPromptTokens?: number | null;
}

interface AggregateRow {
  key: string;
  estimatedInputTokens: number;
  actualPromptTokens: number;
  callCount: number;
}

export interface NovelPromptTraceChapterSummary {
  chapterId: string;
  estimatedInputTokens: number;
  actualPromptTokens: number;
  callCount: number;
}

export interface NovelPromptTraceStageSummary {
  stage: string;
  estimatedInputTokens: number;
  actualPromptTokens: number;
  callCount: number;
}

export interface NovelPromptTraceSceneSummary {
  chapterId: string;
  stage: string;
  sceneIndex: number | null;
  roundIndex: number | null;
  estimatedInputTokens: number;
  actualPromptTokens: number;
  callCount: number;
}

export interface NovelPromptTraceContextBlockSummary {
  blockId: string;
  estimatedInputTokens: number;
  count: number;
}

export interface NovelPromptTraceReport {
  chapters: NovelPromptTraceChapterSummary[];
  stages: NovelPromptTraceStageSummary[];
  scenes: NovelPromptTraceSceneSummary[];
  lowValueContextBlocks: NovelPromptTraceContextBlockSummary[];
}

function resolveLlmLogDir(date: string): string {
  return path.resolve(process.cwd(), "..", ".logs", date);
}

function toSafeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readJsonLine(line: string): LogRecord | null {
  try {
    return JSON.parse(line) as LogRecord;
  } catch {
    return null;
  }
}

function upsertAggregate(map: Map<string, AggregateRow>, key: string, estimated: number, actual: number): void {
  const row = map.get(key) ?? {
    key,
    estimatedInputTokens: 0,
    actualPromptTokens: 0,
    callCount: 0,
  };
  row.estimatedInputTokens += estimated;
  row.actualPromptTokens += actual;
  row.callCount += 1;
  map.set(key, row);
}

export async function buildNovelPromptTraceReport(params: {
  novelId: string;
  date?: string;
}): Promise<NovelPromptTraceReport> {
  const date = params.date?.trim() || new Date().toISOString().slice(0, 10);
  const logDir = resolveLlmLogDir(date);
  if (!fs.existsSync(logDir)) {
    return {
      chapters: [],
      stages: [],
      scenes: [],
      lowValueContextBlocks: [],
    };
  }

  const files = fs.readdirSync(logDir)
    .filter((file) => file.endsWith(".llm.jsonl"))
    .map((file) => path.join(logDir, file));
  const requestMetaById = new Map<string, PromptMetaRecord>();
  const actualPromptTokensById = new Map<string, number>();

  for (const file of files) {
    const stream = fs.createReadStream(file, { encoding: "utf8" });
    const reader = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    for await (const line of reader) {
      const record = readJsonLine(line);
      if (!record?.requestId || !record.promptMeta || record.promptMeta.novelId !== params.novelId) {
        continue;
      }
      if (record.event === "request") {
        requestMetaById.set(record.requestId, record.promptMeta);
        continue;
      }
      if (record.event === "response") {
        actualPromptTokensById.set(record.requestId, toSafeNumber(record.actualPromptTokens));
      }
    }
  }

  const chapterAggregates = new Map<string, AggregateRow>();
  const stageAggregates = new Map<string, AggregateRow>();
  const sceneAggregates = new Map<string, AggregateRow>();
  const contextBlockAggregates = new Map<string, { blockId: string; estimatedInputTokens: number; count: number }>();

  for (const [requestId, promptMeta] of requestMetaById.entries()) {
    const chapterId = promptMeta.chapterId?.trim();
    const stage = promptMeta.stage?.trim() || "unknown";
    const estimatedInputTokens = toSafeNumber(promptMeta.estimatedInputTokens);
    const actualPromptTokens = toSafeNumber(actualPromptTokensById.get(requestId));
    if (!chapterId) {
      continue;
    }

    upsertAggregate(chapterAggregates, chapterId, estimatedInputTokens, actualPromptTokens);
    upsertAggregate(stageAggregates, stage, estimatedInputTokens, actualPromptTokens);
    upsertAggregate(
      sceneAggregates,
      `${chapterId}::${stage}::${promptMeta.sceneIndex ?? 0}::${promptMeta.roundIndex ?? 0}`,
      estimatedInputTokens,
      actualPromptTokens,
    );

    for (const blockId of promptMeta.contextBlockIds ?? []) {
      const row = contextBlockAggregates.get(blockId) ?? {
        blockId,
        estimatedInputTokens: 0,
        count: 0,
      };
      row.estimatedInputTokens += estimatedInputTokens;
      row.count += 1;
      contextBlockAggregates.set(blockId, row);
    }
  }

  return {
    chapters: [...chapterAggregates.values()]
      .sort((left, right) => right.estimatedInputTokens - left.estimatedInputTokens)
      .map((row) => ({
        chapterId: row.key,
        estimatedInputTokens: row.estimatedInputTokens,
        actualPromptTokens: row.actualPromptTokens,
        callCount: row.callCount,
      })),
    stages: [...stageAggregates.values()]
      .sort((left, right) => right.estimatedInputTokens - left.estimatedInputTokens)
      .map((row) => ({
        stage: row.key,
        estimatedInputTokens: row.estimatedInputTokens,
        actualPromptTokens: row.actualPromptTokens,
        callCount: row.callCount,
      })),
    scenes: [...sceneAggregates.values()]
      .sort((left, right) => right.estimatedInputTokens - left.estimatedInputTokens)
      .map((row) => {
        const [chapterId, stage, sceneIndex, roundIndex] = row.key.split("::");
        return {
          chapterId,
          stage,
          sceneIndex: Number(sceneIndex) > 0 ? Number(sceneIndex) : null,
          roundIndex: Number(roundIndex) > 0 ? Number(roundIndex) : null,
          estimatedInputTokens: row.estimatedInputTokens,
          actualPromptTokens: row.actualPromptTokens,
          callCount: row.callCount,
        };
      }),
    lowValueContextBlocks: [...contextBlockAggregates.values()]
      .sort((left, right) => right.estimatedInputTokens - left.estimatedInputTokens)
      .map((row) => ({
        blockId: row.blockId,
        estimatedInputTokens: row.estimatedInputTokens,
        count: row.count,
      })),
  };
}
