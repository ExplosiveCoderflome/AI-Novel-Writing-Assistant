import { userAssetBackupGateway } from "../../services/novel/export/UserAssetBackupGateway";
import {
  SafetyCheckFailedError,
  type SafetyCheckInput,
  type SafetyCheckResult,
} from "./safetyGuardTypes";

export class SafetyGuardService {
  /**
   * Asserts pre-operation safety checks for high-risk data mutations.
   * If riskLevel is HIGH or CRITICAL, forces backup creation/verification
   * and double-confirmation, otherwise throws SafetyCheckFailedError to block execution.
   */
  async assertSafetyCheck(input: SafetyCheckInput): Promise<SafetyCheckResult> {
    const { riskLevel, operationName, novelId, confirmToken, requireVerifiedBackup = true } = input;

    if (riskLevel === "LOW" || riskLevel === "MEDIUM") {
      return { safe: true, riskLevel, backupCreated: false };
    }

    // 1. 显式确认 Token 校验
    if (!confirmToken || confirmToken.trim() !== "CONFIRM_DELETE") {
      throw new SafetyCheckFailedError(
        `操作 '${operationName}' 属于 ${riskLevel} 高危级，必须提供 confirmToken = 'CONFIRM_DELETE' 进行显式确认。`,
        requireVerifiedBackup,
      );
    }

    // 2. 事前备份强校验 (Pre-Deletion Snapshot)
    let backupCreated = false;
    let backupPath: string | undefined;

    if (novelId && requireVerifiedBackup) {
      try {
        const pkg = await userAssetBackupGateway.exportProjectAssets(novelId);
        const verified = userAssetBackupGateway.verifyBackupIntegrity(pkg);
        if (!verified) {
          throw new Error("备份快照结构完整性校验未通过");
        }
        backupCreated = true;
        backupPath = `snapshot-${novelId}-${pkg.exportedAt}`;
      } catch (error) {
        throw new SafetyCheckFailedError(
          `无法为小说 ${novelId} 创建事前安全快照备份，破坏性操作被阻断。原因: ${error instanceof Error ? error.message : String(error)}`,
          true,
        );
      }
    }

    return {
      safe: true,
      riskLevel,
      backupCreated,
      backupPath,
    };
  }
}

export const safetyGuardService = new SafetyGuardService();
