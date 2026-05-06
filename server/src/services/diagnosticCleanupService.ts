import { directorExecutionLogger } from "./director/executionLogger";
import { cleanupOldLlmInvocationDiagnostics } from "../llm/invocationDiagnostics";

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface DiagnosticCleanupResult {
  deletedDiagnostics: number;
  deletedExecutionLogs: number;
}

export class DiagnosticCleanupService {
  private timer: NodeJS.Timeout | null = null;

  private getRetentionDays(): number {
    const envValue = process.env.DIAGNOSTIC_RETENTION_DAYS;
    if (!envValue) return DEFAULT_RETENTION_DAYS;
    const parsed = Number(envValue);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
  }

  async runCleanup(): Promise<DiagnosticCleanupResult> {
    const retentionDays = this.getRetentionDays();
    const [deletedDiagnostics, deletedExecutionLogs] = await Promise.all([
      cleanupOldLlmInvocationDiagnostics(retentionDays),
      directorExecutionLogger.cleanupOldLogs(retentionDays),
    ]);
    console.log(
      `[cleanup] diagnostic cleanup complete: deletedDiagnostics=${deletedDiagnostics}, deletedExecutionLogs=${deletedExecutionLogs}, retentionDays=${retentionDays}`,
    );
    return { deletedDiagnostics, deletedExecutionLogs };
  }

  start(intervalMs: number = DEFAULT_INTERVAL_MS): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runCleanup().catch((error) => {
        console.error("[cleanup] diagnostic cleanup failed:", error);
      });
    }, intervalMs);
    console.log("[cleanup] diagnostic cleanup service started");
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const diagnosticCleanupService = new DiagnosticCleanupService();
