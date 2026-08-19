export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SafetyCheckInput {
  operationName: string;
  riskLevel: RiskLevel;
  novelId?: string;
  confirmToken?: string;
  requireVerifiedBackup?: boolean;
}

export interface SafetyCheckResult {
  safe: boolean;
  riskLevel: RiskLevel;
  backupCreated: boolean;
  backupPath?: string;
  reason?: string;
}

export class SafetyCheckFailedError extends Error {
  constructor(public readonly reason: string, public readonly requiredBackup: boolean = true) {
    super(`[SafetyGuardService] 破坏性操作已强行拦截: ${reason}`);
    this.name = "SafetyCheckFailedError";
  }
}
