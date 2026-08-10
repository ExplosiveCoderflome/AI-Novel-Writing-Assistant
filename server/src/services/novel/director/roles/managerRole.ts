import { WorkingContract, workingContractService } from '../contract/workingContract';
import { FalsifiedRoute } from '../state/falsifiedRouteLedger';

export interface ManagerDecision {
  action: 'HOLD' | 'ADVANCE' | 'ROLLBACK' | 'PIVOT';
  nextStage?: string;
  reason: string;
  admittedContract?: WorkingContract;
  falsifiedRoute?: FalsifiedRoute;
}

export class ManagerRole {
  /**
   * Evaluate whether to admit a proposed contract refinement or execute a Pivot.
   */
  public async evaluateContractAdmit(
    currentContract: WorkingContract,
    proposedGoal: string
  ): Promise<ManagerDecision> {
    const proposedObjective = {
      ...currentContract.operationalObjective,
      dramaticGoal: proposedGoal,
    };

    const validation = workingContractService.validateStandingIntentInvariance(
      currentContract.standingIntent,
      proposedObjective
    );

    if (!validation.valid) {
      return {
        action: 'HOLD',
        reason: `Manager rejected contract refinement: ${validation.reason}`,
      };
    }

    const updatedContract = await workingContractService.createContract({
      ...currentContract,
      version: currentContract.version + 1,
      operationalObjective: proposedObjective,
      updatedAt: new Date(),
    });

    return {
      action: 'PIVOT',
      reason: 'Manager admitted operational contract refinement (Verified Pivot).',
      admittedContract: updatedContract,
    };
  }

  /**
   * Determine allowed stage transition (nextStage in {currentStage, next(currentStage), prev(currentStage)}).
   */
  public determineStageTransition(
    currentStage: string,
    targetStage: string
  ): { allowed: boolean; reason?: string } {
    const validStages = [
      'inspiration',
      'world_setup',
      'character_setup',
      'volume_planning',
      'chapter_planning',
      'chapter_production',
      'review',
      'submission',
    ];

    const currIdx = validStages.indexOf(currentStage);
    const targetIdx = validStages.indexOf(targetStage);

    if (currIdx === -1 || targetIdx === -1) {
      return { allowed: false, reason: `Unknown stage: ${currentStage} or ${targetStage}` };
    }

    // Allowed: stay same, advance by 1, or rollback to any earlier stage
    if (targetIdx <= currIdx + 1) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Manager disallowed skipping stages from ${currentStage} directly to ${targetStage}`,
    };
  }
}

export const managerRole = new ManagerRole();
