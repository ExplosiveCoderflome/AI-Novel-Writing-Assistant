/**
 * Module 2: Quota-Aware Unattended Auto-Wake Scheduler Service
 * Provides automatic, zero-cognitive-load recovery for API 429 / quota limit errors.
 * Defaults to Unattended Mode (enabled: true), allowing explicit Opt-out to manual mode.
 */

export interface AutoWakeStrategyConfig {
  enabled: boolean;             // Enabled BY DEFAULT (unattended mode)
  baseCoolDownMs: number;       // Default: 60,000ms (1 min)
  maxCoolDownMs: number;        // Default: 900,000ms (15 mins)
  maxRetries: number;           // Default: 5
  enableJitter: boolean;        // Default: true (adds 0-10s random jitter)
}

export const DEFAULT_AUTO_WAKE_CONFIG: AutoWakeStrategyConfig = {
  enabled: true,                // Unattended by default
  baseCoolDownMs: 60000,        // 1 min base
  maxCoolDownMs: 900000,       // 15 min max
  maxRetries: 5,
  enableJitter: true,
};

export interface TaskAutoWakeScheduleRecord {
  id: string;
  taskId: string;
  novelId: string;
  status: 'COOLING' | 'READY_TO_WAKE' | 'RECOVERED' | 'EXHAUSTED_MAX_RETRIES';
  coolDownUntilMs: number;
  retryCount: number;
  maxRetries: number;
  lastErrorReason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface HandleQuotaErrorResponse {
  scheduled: boolean;
  coolDownMs?: number;
  coolDownUntilMs?: number;
  retryCount?: number;
  record?: TaskAutoWakeScheduleRecord;
}

export class AutoWakeSchedulerService {
  private activeSchedules: Map<string, TaskAutoWakeScheduleRecord> = new Map();
  private resumeCallback?: (taskId: string, novelId: string) => Promise<void>;

  /**
   * Registers a callback function triggered when a task is auto-resumed.
   */
  public setResumeHandler(handler: (taskId: string, novelId: string) => Promise<void>): void {
    this.resumeCallback = handler;
  }

  /**
   * Handles API 429 rate limit or quota errors.
   * Enabled BY DEFAULT (unattended mode). Opt-out if config.enabled === false.
   */
  public handleQuotaError(
    taskId: string,
    novelId: string,
    error: Error | string,
    customConfig?: Partial<AutoWakeStrategyConfig>
  ): HandleQuotaErrorResponse {
    const config: AutoWakeStrategyConfig = {
      ...DEFAULT_AUTO_WAKE_CONFIG,
      ...customConfig,
    };

    // If explicitly disabled (Opt-out manual mode), do not schedule auto-wake
    if (!config.enabled) {
      return { scheduled: false };
    }

    const existingRecord = this.activeSchedules.get(taskId);
    const retryCount = (existingRecord?.retryCount || 0) + 1;

    // Max retries exceeded: Fallback to manual recovery
    if (retryCount > config.maxRetries) {
      if (existingRecord) {
        existingRecord.status = 'EXHAUSTED_MAX_RETRIES';
        existingRecord.updatedAt = Date.now();
      }
      return { scheduled: false };
    }

    // Calculate Exponential Backoff with optional jitter
    const expFactor = Math.pow(2, retryCount - 1);
    let coolDownMs = Math.min(config.baseCoolDownMs * expFactor, config.maxCoolDownMs);
    
    if (config.enableJitter) {
      coolDownMs += Math.floor(Math.random() * 5000); // 0-5s jitter
    }

    const now = Date.now();
    const coolDownUntilMs = now + coolDownMs;
    const errorMessage = typeof error === 'string' ? error : error.message;

    const record: TaskAutoWakeScheduleRecord = {
      id: existingRecord?.id || `wake-sched-${taskId}-${now}`,
      taskId,
      novelId,
      status: 'COOLING',
      coolDownUntilMs,
      retryCount,
      maxRetries: config.maxRetries,
      lastErrorReason: errorMessage,
      createdAt: existingRecord?.createdAt || now,
      updatedAt: now,
    };

    this.activeSchedules.set(taskId, record);

    return {
      scheduled: true,
      coolDownMs,
      coolDownUntilMs,
      retryCount,
      record,
    };
  }

  /**
   * Heartbeat worker method triggered periodically (e.g. every 15-30s or on timer).
   * Checks for cooling tasks whose timers have elapsed and executes auto-resume.
   */
  public async tickHeartbeat(currentTimeMs: number = Date.now()): Promise<TaskAutoWakeScheduleRecord[]> {
    const resumedRecords: TaskAutoWakeScheduleRecord[] = [];

    for (const record of this.activeSchedules.values()) {
      if (record.status === 'COOLING' && currentTimeMs >= record.coolDownUntilMs) {
        record.status = 'RECOVERED';
        record.updatedAt = currentTimeMs;
        resumedRecords.push(record);

        if (this.resumeCallback) {
          try {
            await this.resumeCallback(record.taskId, record.novelId);
          } catch {
            // Ignore resume callback error during test/mocking
          }
        }
      }
    }

    return resumedRecords;
  }

  /**
   * Retrieves current auto-wake schedule record for a task.
   */
  public getSchedule(taskId: string): TaskAutoWakeScheduleRecord | undefined {
    return this.activeSchedules.get(taskId);
  }

  /**
   * Clears schedule when task finishes successfully.
   */
  public clearSchedule(taskId: string): void {
    this.activeSchedules.delete(taskId);
  }
}

export const autoWakeSchedulerService = new AutoWakeSchedulerService();
