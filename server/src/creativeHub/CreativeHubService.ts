import type {
  CreativeHubCheckpointRef,
  CreativeHubInterrupt,
  CreativeHubMessage,
  CreativeHubResourceBinding,
  CreativeHubThread,
  CreativeHubThreadMetadata,
  CreativeHubThreadHistoryItem,
  CreativeHubThreadState,
} from "@ai-novel/shared/types/creativeHub";
import type { FailureDiagnostic } from "@ai-novel/shared/types/agent";
import { prisma } from "../db/prisma";
import { novelSetupStatusService } from "../services/novel/NovelSetupStatusService";

interface CreateThreadInput {
  title?: string;
  resourceBindings?: CreativeHubResourceBinding;
}

interface UpdateThreadInput {
  title?: string;
  archived?: boolean;
  status?: CreativeHubThread["status"];
  latestRunId?: string | null;
  latestError?: string | null;
  resourceBindings?: CreativeHubResourceBinding;
}

interface SaveCheckpointInput {
  checkpointId: string;
  parentCheckpointId?: string | null;
  runId?: string | null;
  status?: CreativeHubThread["status"];
  latestError?: string | null;
  messages: CreativeHubMessage[];
  interrupts?: CreativeHubInterrupt[];
  resourceBindings?: CreativeHubResourceBinding;
  metadata?: Record<string, unknown>;
}

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value?.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeBindings(bindings: CreativeHubResourceBinding | null | undefined): CreativeHubResourceBinding {
  return {
    novelId: bindings?.novelId ?? null,
    chapterId: bindings?.chapterId ?? null,
    worldId: bindings?.worldId ?? null,
    taskId: bindings?.taskId ?? null,
    bookAnalysisId: bindings?.bookAnalysisId ?? null,
    formulaId: bindings?.formulaId ?? null,
    styleProfileId: bindings?.styleProfileId ?? null,
    baseCharacterId: bindings?.baseCharacterId ?? null,
    knowledgeDocumentIds: Array.isArray(bindings?.knowledgeDocumentIds)
      ? bindings?.knowledgeDocumentIds.filter((item) => typeof item === "string" && item.trim().length > 0)
      : [],
  };
}

function serializePreview(messages: CreativeHubMessage[]): string | null {
  const candidates = [...messages].reverse();
  for (const message of candidates) {
    if (typeof message.content === "string" && message.content.trim()) {
      return message.content.trim().slice(0, 120);
    }
  }
  return null;
}

function deriveThreadTitle(messages: CreativeHubMessage[]): string {
  const firstHuman = messages.find((item) => item.type === "human");
  const content = typeof firstHuman?.content === "string" ? firstHuman.content.trim() : "";
  return content ? content.slice(0, 24) : "新对话";
}

function mapThread(record: {
  id: string;
  title: string;
  archived: boolean;
  status: CreativeHubThread["status"];
  latestRunId: string | null;
  latestError: string | null;
  resourceBindingsJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CreativeHubThread {
  return {
    id: record.id,
    title: record.title,
    archived: record.archived,
    status: record.status,
    latestRunId: record.latestRunId,
    latestError: record.latestError,
    resourceBindings: normalizeBindings(safeParseJson(record.resourceBindingsJson, {})),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapCheckpoint(record: {
  checkpointId: string;
  parentCheckpointId: string | null;
  runId: string | null;
  messageCount: number;
  preview: string | null;
  createdAt: Date;
  messagesJson: string;
  interruptsJson: string | null;
}): CreativeHubThreadHistoryItem {
  return {
    checkpointId: record.checkpointId,
    parentCheckpointId: record.parentCheckpointId,
    runId: record.runId,
    messageCount: record.messageCount,
    preview: record.preview,
    createdAt: record.createdAt.toISOString(),
    messages: safeParseJson(record.messagesJson, [] as CreativeHubMessage[]),
    interrupts: safeParseJson(record.interruptsJson, [] as CreativeHubInterrupt[]),
  };
}

async function loadFailureDiagnostic(runId: string | null | undefined): Promise<FailureDiagnostic | undefined> {
  if (!runId) return undefined;
  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    include: {
      steps: {
        orderBy: { seq: "desc" },
        take: 1,
      },
    },
  });
  if (!run) return undefined;
  const latestStep = run.steps[0];
  return {
    failureCode: latestStep?.errorCode ?? null,
    failureSummary: run.error ?? latestStep?.error ?? null,
    failureDetails: latestStep?.error ?? null,
    recoveryHint: run.status === "failed"
      ? "请查看最近一次失败步骤，必要时从创作中枢重新发起或重放。"
      : null,
  };
}

export class CreativeHubService {
  async listThreads(options?: { includeArchived?: boolean }): Promise<CreativeHubThread[]> {
    const records = await prisma.creativeHubThread.findMany({
      where: options?.includeArchived ? undefined : { archived: false },
      orderBy: { updatedAt: "desc" },
    });
    return records.map(mapThread);
  }

  async createThread(input?: CreateThreadInput): Promise<CreativeHubThread> {
    const record = await prisma.creativeHubThread.create({
      data: {
        title: input?.title?.trim() || "新对话",
        resourceBindingsJson: JSON.stringify(normalizeBindings(input?.resourceBindings)),
      },
    });
    return mapThread(record);
  }

  async updateThread(threadId: string, input: UpdateThreadInput): Promise<CreativeHubThread> {
    const existing = await prisma.creativeHubThread.findUnique({ where: { id: threadId } });
    if (!existing) {
      throw new Error("线程不存在。");
    }
    const nextBindings = input.resourceBindings
      ? JSON.stringify(normalizeBindings(input.resourceBindings))
      : existing.resourceBindingsJson;
    const record = await prisma.creativeHubThread.update({
      where: { id: threadId },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() || existing.title } : {}),
        ...(input.archived !== undefined ? { archived: input.archived } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.latestRunId !== undefined ? { latestRunId: input.latestRunId } : {}),
        ...(input.latestError !== undefined ? { latestError: input.latestError } : {}),
        resourceBindingsJson: nextBindings,
      },
    });
    return mapThread(record);
  }

  async deleteThread(threadId: string): Promise<void> {
    await prisma.creativeHubThread.delete({
      where: { id: threadId },
    });
  }

  async getThreadState(threadId: string): Promise<CreativeHubThreadState> {
    const record = await prisma.creativeHubThread.findUnique({
      where: { id: threadId },
      include: {
        checkpoints: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    if (!record) {
      throw new Error("线程不存在。");
    }
    const latestCheckpoint = record.checkpoints[0];
    const diagnostics = await loadFailureDiagnostic(record.latestRunId);
    const bindings = normalizeBindings(safeParseJson(record.resourceBindingsJson, {}));
    const storedMetadata = safeParseJson(record.metadataJson, {} as CreativeHubThreadMetadata);
    const novelSetup = bindings.novelId
      ? await novelSetupStatusService.getNovelSetupStatus(bindings.novelId)
      : null;
    return {
      thread: mapThread(record),
      messages: latestCheckpoint ? safeParseJson(latestCheckpoint.messagesJson, [] as CreativeHubMessage[]) : [],
      interrupts: latestCheckpoint ? safeParseJson(latestCheckpoint.interruptsJson, [] as CreativeHubInterrupt[]) : [],
      currentCheckpointId: latestCheckpoint?.checkpointId ?? null,
      diagnostics,
      metadata: {
        ...storedMetadata,
        novelSetup,
      },
    };
  }

  async getThreadHistory(threadId: string): Promise<CreativeHubThreadHistoryItem[]> {
    const records = await prisma.creativeHubCheckpoint.findMany({
      where: { threadId },
      orderBy: { createdAt: "desc" },
    });
    return records.map(mapCheckpoint);
  }

  async getCheckpointHistoryItem(threadId: string, checkpointId: string): Promise<CreativeHubThreadHistoryItem | null> {
    const record = await prisma.creativeHubCheckpoint.findFirst({
      where: {
        threadId,
        checkpointId,
      },
    });
    return record ? mapCheckpoint(record) : null;
  }

  async resolveCheckpointId(threadId: string, messages: CreativeHubMessage[]): Promise<string | null> {
    const checkpoints = await this.getThreadHistory(threadId);
    const target = JSON.stringify(messages);
    const match = checkpoints.find((item) => JSON.stringify(item.messages) === target);
    return match?.checkpointId ?? null;
  }

  async generateTitle(threadId: string): Promise<string> {
    const state = await this.getThreadState(threadId);
    const title = deriveThreadTitle(state.messages);
    await this.updateThread(threadId, { title });
    return title;
  }

  async saveCheckpoint(threadId: string, input: SaveCheckpointInput): Promise<CreativeHubCheckpointRef> {
    const existing = await prisma.creativeHubThread.findUnique({ where: { id: threadId } });
    if (!existing) {
      throw new Error("线程不存在。");
    }
    const checkpoint = await prisma.creativeHubCheckpoint.create({
      data: {
        threadId,
        checkpointId: input.checkpointId,
        parentCheckpointId: input.parentCheckpointId ?? null,
        runId: input.runId ?? null,
        messageCount: input.messages.length,
        preview: serializePreview(input.messages),
        messagesJson: JSON.stringify(input.messages),
        interruptsJson: JSON.stringify(input.interrupts ?? []),
        metadataJson: JSON.stringify(input.metadata ?? {}),
      },
    });
    await prisma.creativeHubThread.update({
      where: { id: threadId },
      data: {
        title: existing.title === "新对话" ? deriveThreadTitle(input.messages) : existing.title,
        latestRunId: input.runId ?? existing.latestRunId,
        latestError: input.latestError ?? null,
        status: input.status ?? existing.status,
        resourceBindingsJson: JSON.stringify(normalizeBindings(input.resourceBindings ?? safeParseJson(existing.resourceBindingsJson, {}))),
        metadataJson: JSON.stringify({
          ...safeParseJson(existing.metadataJson, {}),
          ...(input.metadata ?? {}),
        }),
      },
    });
    return {
      checkpointId: checkpoint.checkpointId,
      parentCheckpointId: checkpoint.parentCheckpointId,
      runId: checkpoint.runId,
      messageCount: checkpoint.messageCount,
      preview: checkpoint.preview,
      createdAt: checkpoint.createdAt.toISOString(),
    };
  }
}

export const creativeHubService = new CreativeHubService();
