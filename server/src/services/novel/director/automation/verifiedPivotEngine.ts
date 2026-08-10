import { WorkingContract, workingContractService } from '../contract/workingContract';
import { FalsifiedRoute, falsifiedRouteLedgerService } from '../state/falsifiedRouteLedger';
import { managerRole } from '../roles/managerRole';
import { reviewerRole, ReviewerAuditVerdict } from '../roles/reviewerRole';

export interface PivotRequest {
  novelId: string;
  triggerSource: 'REVIEWER_REPLAN' | 'REPAIR_BUDGET_EXCEEDED' | 'USER_REDIRECTION';
  failedPlanSummary: string;
  rejectionReason: string;
  rootCauseCode: string;
  evidenceArtifactId?: string;
}

export interface PivotExecutionResult {
  admitted: boolean;
  updatedContract: WorkingContract;
  newFalsifiedRoute: FalsifiedRoute;
  reason?: string;
}

export class VerifiedPivotEngine {
  /**
   * Orchestrate a Verified Pivot:
   * 1. Record dead branch into FalsifiedRoute Ledger
   * 2. Validate StandingIntent invariance
   * 3. Update WorkingContract
   * 4. Return new contract and route constraint for Planner
   */
  public async executePivot(
    currentContract: WorkingContract,
    request: PivotRequest
  ): Promise<PivotExecutionResult> {
    const negativeConstraint = `严禁安排导致 [${request.rootCauseCode}] 的剧情: ${request.failedPlanSummary}`;

    // 1. Record dead branch into FalsifiedRoute Ledger
    const newFalsifiedRoute = await falsifiedRouteLedgerService.record({
      novelId: request.novelId,
      failedPlanSummary: request.failedPlanSummary,
      rejectionReason: request.rejectionReason,
      rootCauseCode: request.rootCauseCode,
      evidenceArtifactId: request.evidenceArtifactId,
      negativePromptConstraint: negativeConstraint,
    });

    // 2. Propose refined operational objective
    const proposedObjective = {
      ...currentContract.operationalObjective,
      dramaticGoal: `[Pivot Refined Goal] 避开 ${request.rootCauseCode}，重新规划冲突`,
    };

    // 3. Manager admittance validation
    const validation = workingContractService.validateStandingIntentInvariance(
      currentContract.standingIntent,
      proposedObjective
    );

    if (!validation.valid) {
      return {
        admitted: false,
        updatedContract: currentContract,
        newFalsifiedRoute,
        reason: validation.reason,
      };
    }

    // 4. Update working contract version
    const activeRoutes = await falsifiedRouteLedgerService.listByNovel(request.novelId);
    const updatedContract = await workingContractService.createContract({
      ...currentContract,
      version: currentContract.version + 1,
      operationalObjective: proposedObjective,
      constraints: {
        ...currentContract.constraints,
        activeFalsifiedRoutes: activeRoutes.map((r) => r.id!).filter(Boolean),
      },
      updatedAt: new Date(),
    });

    return {
      admitted: true,
      updatedContract,
      newFalsifiedRoute,
    };
  }
}

export const verifiedPivotEngine = new VerifiedPivotEngine();
