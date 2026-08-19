/**
 * Quota-Aware Unattended Auto-Wake Strategy Configuration & Data Types
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
