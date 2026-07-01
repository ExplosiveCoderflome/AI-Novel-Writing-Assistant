import "dotenv/config";
import { ensureRuntimeDatabaseReady } from "../db/runtimeMigrations";
import { loadProviderApiKeys } from "../llm/factory";
import { initializeRagSettingsCompatibility } from "../services/settings/RagCompatibilityBootstrapService";
import { qualityDebtSettingsService } from "../services/settings/QualityDebtSettingsService";
import { DirectorCommandExecutor } from "../services/novel/director/commands/DirectorCommandExecutor";
import { DirectorTaskQueue, type DirectorTaskQueueOptions } from "./DirectorTaskQueue";
import { taskDispatcher } from "./TaskDispatcher";

// DirectorWorker 通常由 app.ts 的 initializeBackgroundServices() 在同进程内启动。
// 此文件保留独立进程入口（`require.main === module`），仅供需要分离部署时使用。

export interface DirectorWorkerDeps {
  queue: DirectorTaskQueue;
  commandExecutor: { execute: DirectorCommandExecutor["execute"] };
}

/**
 * Single-track director worker.
 *
 * The worker leases `directorRunCommand` rows, renews leases while work is in
 * flight, and delegates execution to `DirectorCommandExecutor`. Resource
 * throttling stays local to the worker, while `TaskDispatcher` handles wakeups
 * and polling remains only as a stale-recovery fallback.
 */
export class DirectorWorker {
  private stopped = false;
  private readonly queue: DirectorTaskQueue;
  private readonly commandExecutor: DirectorWorkerDeps["commandExecutor"];

  constructor(options?: DirectorTaskQueueOptions);
  constructor(deps: DirectorWorkerDeps);
  constructor(arg?: DirectorTaskQueueOptions | DirectorWorkerDeps) {
    if (arg && "queue" in arg) {
      this.queue = arg.queue;
      this.commandExecutor = arg.commandExecutor;
    } else {
      this.queue = new DirectorTaskQueue(arg);
      this.commandExecutor = new DirectorCommandExecutor();
    }
  }

  stop(): void {
    this.stopped = true;
    taskDispatcher.notify();
  }

  async start(): Promise<void> {
    console.log(
      `[director.worker] started workerId=${this.queue.workerId} slots=${this.queue.executionSlots} pollMs=${this.queue.pollMs} leaseMs=${this.queue.leaseMs}`,
    );

    const runners = Array.from({ length: this.queue.executionSlots }, (_, i) =>
      this.runSlot(`slot-${i + 1}`),
    );
    await Promise.all(runners);
  }

  private async runSlot(slotId: string): Promise<void> {
    while (!this.stopped) {
      try {
        const didWork = await this.tick(slotId);
        if (!didWork) {
          await this.queue.waitForWork();
        }
      } catch (error) {
        console.error(`[director.worker] slot error slotId=${slotId}`, error);
        await this.queue.waitForWork();
      }
    }
  }

  async tick(slotId: string): Promise<boolean> {
    const leased = await this.queue.leaseNext(slotId);
    if (!leased) return false;

    const { command } = leased;
    const stopRenewal = this.queue.startLeaseRenewal(command.id, slotId);

    try {
      await this.queue.acquireResourceGate(command.novelId, command.commandType);
      try {
        await this.queue.markRunning(command.id, slotId);

        console.log(
          `[director.worker] executing commandId=${command.id} type=${command.commandType} taskId=${command.taskId} novelId=${command.novelId} slot=${slotId}`,
        );

        const outcome = await this.commandExecutor.execute(command.id);

        if (outcome === "cancelled") {
          await this.queue.cancelTask(command.id, slotId);
          console.log(`[director.worker] cancelled commandId=${command.id}`);
        } else {
          await this.queue.completeTask(command.id, slotId);
          console.log(`[director.worker] completed commandId=${command.id}`);
        }
      } finally {
        this.queue.releaseResourceGate(command.novelId, command.commandType);
      }
    } catch (error) {
      console.error(`[director.worker] command failed commandId=${command.id}`, error);
      await this.queue.failTask(command.id, slotId, error);
    } finally {
      stopRenewal();
    }

    return true;
  }
}

async function bootstrap(): Promise<void> {
  await ensureRuntimeDatabaseReady();
  await initializeRagSettingsCompatibility().catch((error) => {
    console.warn("[director.worker] failed to initialize RAG compatibility settings.", error);
  });
  await qualityDebtSettingsService.warnIfAutoPromotionEnabled().catch((error) => {
    console.warn("[director.worker] failed to inspect pending review auto-promotion settings.", error);
  });
  await loadProviderApiKeys().catch((error) => {
    console.warn("[director.worker] failed to load provider API keys from database.", error);
  });

  const worker = new DirectorWorker();
  process.once("SIGINT", () => worker.stop());
  process.once("SIGTERM", () => worker.stop());
  await worker.start();
}

if (require.main === module) {
  void bootstrap().catch((error) => {
    console.error("[director.worker] bootstrap failed", error);
    process.exit(1);
  });
}
