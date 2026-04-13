import type {
  TaskKind,
  TaskStatus,
  UnifiedTaskDetail,
  UnifiedTaskListResponse,
  UnifiedTaskSummary,
} from "@ai-novel/shared/types/task";
import type { DirectorLLMOptions } from "@ai-novel/shared/types/novelDirector";
import { AppError } from "../../middleware/errorHandler";
import { NovelService } from "../novel/NovelService";
import { AgentRunTaskAdapter } from "./adapters/AgentRunTaskAdapter";
import { BookTaskAdapter } from "./adapters/BookTaskAdapter";
import { KnowledgeTaskAdapter } from "./adapters/KnowledgeTaskAdapter";
import { ImageTaskAdapter } from "./adapters/ImageTaskAdapter";
import { NovelWorkflowTaskAdapter } from "./adapters/NovelWorkflowTaskAdapter";
import { PipelineTaskAdapter } from "./adapters/PipelineTaskAdapter";
import {
  compareTaskSummary,
  isAfterCursor,
  normalizeKeyword,
  normalizeLimit,
  parseCursor,
  toCursor,
  type ListTasksFilters,
} from "./taskCenter.shared";

export class TaskCenterService {
  private readonly novelService = new NovelService();

  private readonly bookAdapter = new BookTaskAdapter();

  private readonly pipelineAdapter = new PipelineTaskAdapter(this.novelService);

  private readonly knowledgeAdapter = new KnowledgeTaskAdapter();

  private readonly imageAdapter = new ImageTaskAdapter();

  private readonly workflowAdapter = new NovelWorkflowTaskAdapter();

  private readonly agentAdapter = new AgentRunTaskAdapter();

  async listTasks(filters: ListTasksFilters = {}): Promise<UnifiedTaskListResponse> {
    const limit = normalizeLimit(filters.limit);
    const sourceTake = Math.max(60, limit * 4);
    const keyword = normalizeKeyword(filters.keyword);
    const cursorPayload = parseCursor(filters.cursor);

    const [bookTasks, novelTasks, knowledgeTasks, imageTasks, agentTasks, workflowTasks] = await Promise.all([
      filters.kind && filters.kind !== "book_analysis"
        ? Promise.resolve<UnifiedTaskSummary[]>([])
        : this.bookAdapter.list({ status: filters.status, keyword, take: sourceTake }),
      filters.kind && filters.kind !== "novel_pipeline"
        ? Promise.resolve<UnifiedTaskSummary[]>([])
        : this.pipelineAdapter.list({ status: filters.status, keyword, take: sourceTake }),
      filters.kind && filters.kind !== "knowledge_document"
        ? Promise.resolve<UnifiedTaskSummary[]>([])
        : this.knowledgeAdapter.list({ status: filters.status, keyword, take: sourceTake }),
      filters.kind && filters.kind !== "image_generation"
        ? Promise.resolve<UnifiedTaskSummary[]>([])
        : this.imageAdapter.list({ status: filters.status, keyword, take: sourceTake }),
      filters.kind && filters.kind !== "agent_run"
        ? Promise.resolve<UnifiedTaskSummary[]>([])
        : this.agentAdapter.list({ status: filters.status, keyword, take: sourceTake }),
      filters.kind && filters.kind !== "novel_workflow"
        ? Promise.resolve<UnifiedTaskSummary[]>([])
        : this.workflowAdapter.list({ status: filters.status, keyword, take: sourceTake }),
    ]);

    const merged = [...bookTasks, ...novelTasks, ...knowledgeTasks, ...imageTasks, ...agentTasks, ...workflowTasks].sort(compareTaskSummary);
    const filteredByCursor = cursorPayload
      ? merged.filter((item) => isAfterCursor(item, cursorPayload))
      : merged;
    const items = filteredByCursor.slice(0, limit);
    const nextCursor = filteredByCursor.length > limit ? toCursor(items[items.length - 1]) : null;

    return {
      items,
      nextCursor,
    };
  }

  async getTaskDetail(kind: TaskKind, id: string): Promise<UnifiedTaskDetail | null> {
    if (kind === "book_analysis") {
      return this.bookAdapter.detail(id);
    }
    if (kind === "novel_pipeline") {
      return this.pipelineAdapter.detail(id);
    }
    if (kind === "knowledge_document") {
      return this.knowledgeAdapter.detail(id);
    }
    if (kind === "agent_run") {
      return this.agentAdapter.detail(id);
    }
    if (kind === "novel_workflow") {
      return this.workflowAdapter.detail(id);
    }
    return this.imageAdapter.detail(id);
  }

  async retryTask(
    kind: TaskKind,
    id: string,
    options?: {
      llmOverride?: Pick<DirectorLLMOptions, "provider" | "model" | "temperature">;
      resume?: boolean;
    },
  ): Promise<UnifiedTaskDetail> {
    if (kind === "book_analysis") {
      return this.bookAdapter.retry(id);
    }
    if (kind === "novel_pipeline") {
      return this.pipelineAdapter.retry(id);
    }
    if (kind === "knowledge_document") {
      return this.knowledgeAdapter.retry(id);
    }
    if (kind === "agent_run") {
      return this.agentAdapter.retry(id);
    }
    if (kind === "novel_workflow") {
      return this.workflowAdapter.retry({
        id,
        llmOverride: options?.llmOverride,
        resume: options?.resume,
      });
    }
    if (kind === "image_generation") {
      return this.imageAdapter.retry(id);
    }
    throw new AppError(`Unsupported task kind: ${kind}`, 400);
  }

  async cancelTask(kind: TaskKind, id: string): Promise<UnifiedTaskDetail> {
    if (kind === "book_analysis") {
      return this.bookAdapter.cancel(id);
    }
    if (kind === "novel_pipeline") {
      return this.pipelineAdapter.cancel(id);
    }
    if (kind === "knowledge_document") {
      return this.knowledgeAdapter.cancel(id);
    }
    if (kind === "agent_run") {
      return this.agentAdapter.cancel(id);
    }
    if (kind === "novel_workflow") {
      return this.workflowAdapter.cancel(id);
    }
    if (kind === "image_generation") {
      return this.imageAdapter.cancel(id);
    }
    throw new AppError(`Unsupported task kind: ${kind}`, 400);
  }

  async archiveTask(kind: TaskKind, id: string): Promise<UnifiedTaskDetail | null> {
    if (kind === "book_analysis") {
      return this.bookAdapter.archive(id);
    }
    if (kind === "novel_pipeline") {
      return this.pipelineAdapter.archive(id);
    }
    if (kind === "knowledge_document") {
      return this.knowledgeAdapter.archive(id);
    }
    if (kind === "agent_run") {
      return this.agentAdapter.archive(id);
    }
    if (kind === "novel_workflow") {
      return this.workflowAdapter.archive(id);
    }
    if (kind === "image_generation") {
      return this.imageAdapter.archive(id);
    }
    throw new AppError(`Unsupported task kind: ${kind}`, 400);
  }
}

export const taskCenterService = new TaskCenterService();
