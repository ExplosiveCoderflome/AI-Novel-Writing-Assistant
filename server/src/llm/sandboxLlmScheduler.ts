export interface LlmSchedulerTask<T> {
  id: string;
  clientId: string;
  tickIndex: number;
  priority: number; // 1 = High, 2 = Normal, 3 = Low
  queuedAt: number;
  taskFn: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

export class SandboxLlmScheduler {
  private queue: LlmSchedulerTask<any>[] = [];
  private activeCount = 0;
  private nextAllowedStart = 0;
  private readonly maxConcurrency: number;
  private readonly requestIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(options?: { maxConcurrency?: number; requestIntervalMs?: number }) {
    this.maxConcurrency = options?.maxConcurrency ?? 1;
    this.requestIntervalMs = options?.requestIntervalMs ?? 100; // Default 100ms cooling between requests
  }

  /**
   * Schedules a task to run through the priority scheduler.
   * Client actions are executed in lock-step based on priority and queue time.
   */
  public schedule<T>(
    clientId: string,
    tickIndex: number,
    priority: number, // 1 = High (Defend/Flee), 2 = Normal (Attack/Move), 3 = Low (Social/Rest)
    taskFn: () => Promise<T>
  ): Promise<T> {
    const id = `${clientId}_t${tickIndex}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    return new Promise<T>((resolve, reject) => {
      const task: LlmSchedulerTask<T> = {
        id,
        clientId,
        tickIndex,
        priority,
        queuedAt: Date.now(),
        taskFn,
        resolve,
        reject,
      };

      this.queue.push(task);
      this.sortQueue();
      this.processQueue();
    });
  }

  /**
   * Sorts queue by:
   * 1. tickIndex (earlier ticks first)
   * 2. priority (lower priority number means higher priority, e.g. 1 > 2 > 3)
   * 3. queuedAt (FIFO within same tick and priority)
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      if (a.tickIndex !== b.tickIndex) {
        return a.tickIndex - b.tickIndex;
      }
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.queuedAt - b.queuedAt;
    });
  }

  private processQueue(): void {
    if (this.queue.length === 0) {
      return;
    }

    if (this.activeCount >= this.maxConcurrency) {
      return;
    }

    const now = Date.now();
    const waitMs = this.nextAllowedStart - now;

    if (waitMs > 0) {
      if (!this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.processQueue();
        }, waitMs);
      }
      return;
    }

    const nextTask = this.queue.shift();
    if (!nextTask) {
      return;
    }

    this.activeCount += 1;
    this.nextAllowedStart = Date.now() + this.requestIntervalMs;

    nextTask.taskFn()
      .then((val) => {
        nextTask.resolve(val);
      })
      .catch((err) => {
        nextTask.reject(err);
      })
      .finally(() => {
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.processQueue();
      });

    // Attempt to schedule more tasks if concurrency slots permit
    this.processQueue();
  }

  /**
   * Helper to inspect the current queue length
   */
  public getQueueLength(): number {
    return this.queue.length;
  }
}
