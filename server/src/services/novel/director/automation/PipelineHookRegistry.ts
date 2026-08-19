import { prisma } from "../../../../db/prisma";

export type PipelineHookName =
  | "onSessionStart"
  | "onPreToolExecution"
  | "onPostChapterDraft"
  | "onPostChapterRepair"
  | "onPostVideoRender"
  | "onPipelineError";

export interface PipelineHookPayload {
  novelId?: string;
  chapterId?: string;
  taskId?: string;
  projectId?: string;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

export type PipelineHookHandler = (payload: PipelineHookPayload) => Promise<void>;

export class PipelineHookRegistry {
  private handlers = new Map<PipelineHookName, Set<PipelineHookHandler>>();

  constructor() {
    this.registerBuiltInHandlers();
  }

  /**
   * Registers a proactive hook handler for a specific lifecycle event.
   */
  registerHook(name: PipelineHookName, handler: PipelineHookHandler): void {
    if (!this.handlers.has(name)) {
      this.handlers.set(name, new Set());
    }
    this.handlers.get(name)!.add(handler);
  }

  /**
   * Unregisters a hook handler.
   */
  unregisterHook(name: PipelineHookName, handler: PipelineHookHandler): void {
    const set = this.handlers.get(name);
    if (set) {
      set.delete(handler);
    }
  }

  /**
   * Emits a lifecycle hook event asynchronously with error isolation.
   * All handlers execute in parallel using Promise.allSettled. A failing handler
   * will never throw uncaught exceptions or interrupt the main application flow.
   */
  async emitHook(name: PipelineHookName, payload: PipelineHookPayload): Promise<void> {
    const set = this.handlers.get(name);
    if (!set || set.size === 0) {
      return;
    }

    const tasks = Array.from(set).map(async (handler) => {
      try {
        await handler(payload);
      } catch (error) {
        console.warn(`[PipelineHookRegistry] Proactive handler for '${name}' failed safely:`, error instanceof Error ? error.message : String(error));
      }
    });

    await Promise.allSettled(tasks);
  }

  /**
   * Registers built-in system handlers for automatic post-render error clearing and status updates.
   */
  private registerBuiltInHandlers(): void {
    // 1. Post Video Render Hook: Auto clear errorMessage and normalize asset paths
    this.registerHook("onPostVideoRender", async (payload) => {
      if (!payload.projectId) return;

      try {
        await prisma.videoProject.update({
          where: { id: payload.projectId },
          data: {
            errorMessage: null,
          },
        });
        console.info(`[PipelineHookRegistry] Proactive post-render cleanup completed for VideoProject ${payload.projectId}. Error status cleared.`);
      } catch (error) {
        console.warn(`[PipelineHookRegistry] VideoProject cleanup failed for ${payload.projectId}:`, error instanceof Error ? error.message : String(error));
      }
    });
  }
}

export const pipelineHookRegistry = new PipelineHookRegistry();
