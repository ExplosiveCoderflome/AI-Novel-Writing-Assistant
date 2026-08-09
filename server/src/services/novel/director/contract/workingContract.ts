import { prisma } from '../../../../db/prisma';

export interface StandingIntent {
  bookId: string;
  coreTheme: string;
  targetAudience: string;
  protagonistArc: string;
  nonNegotiableRules: string[];
  keyPayoffs?: string[];
}

export interface OperationalObjective {
  stage: string;
  targetVolumeOrder: number;
  targetChapterRange: { start: number; end: number };
  dramaticGoal: string;
  pacingTarget: 'fast' | 'normal' | 'climax_slow';
}

export interface ContractConstraints {
  wordCountRange: { min: number; max: number };
  forbiddenTropes: string[];
  activeFalsifiedRoutes: string[];
  maxRepairRoundsPerChapter?: number;
}

export interface VerificationCriteria {
  characterConsistencyMinScore: number;
  payoffFulfillmentRequired: boolean;
  timelineIntegrityRequired: boolean;
  forbiddenOutcomes?: string[];
}

export interface WorkingContract {
  id?: string;
  novelId: string;
  version: number;
  standingIntent: StandingIntent;
  operationalObjective: OperationalObjective;
  constraints: ContractConstraints;
  verificationCriteria: VerificationCriteria;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export class WorkingContractService {
  /**
   * Initialize a default working contract for a novel.
   */
  public async createContract(contract: WorkingContract): Promise<WorkingContract> {
    // Deactivate prior active contracts
    await prisma.directorWorkingContract.updateMany({
      where: { novelId: contract.novelId, isActive: true },
      data: { isActive: false },
    });

    const record = await prisma.directorWorkingContract.create({
      data: {
        novelId: contract.novelId,
        version: contract.version || 1,
        standingIntentJson: JSON.stringify(contract.standingIntent),
        operationalObjective: JSON.stringify(contract.operationalObjective),
        constraintsJson: JSON.stringify(contract.constraints),
        verificationCriteria: JSON.stringify(contract.verificationCriteria),
        isActive: true,
      },
    });

    return this.mapRecordToContract(record);
  }

  /**
   * Get current active contract for a novel.
   */
  public async getActiveContract(novelId: string): Promise<WorkingContract | null> {
    const record = await prisma.directorWorkingContract.findFirst({
      where: { novelId, isActive: true },
      orderBy: { version: 'desc' },
    });

    if (!record) return null;
    return this.mapRecordToContract(record);
  }

  /**
   * ManagerAdmit validation: Check whether an operational objective refinement preserves StandingIntent (\iota).
   */
  public validateStandingIntentInvariance(
    intent: StandingIntent,
    proposedObjective: OperationalObjective
  ): { valid: boolean; reason?: string } {
    if (!proposedObjective.dramaticGoal || proposedObjective.dramaticGoal.trim() === '') {
      return { valid: false, reason: 'Operational objective dramaticGoal cannot be empty.' };
    }

    // Check if non-negotiable rules are violated by dramatic goal
    for (const rule of intent.nonNegotiableRules || []) {
      const goalLower = proposedObjective.dramaticGoal.toLowerCase();
      if (
        proposedObjective.dramaticGoal.includes(`VIOLATE:${rule}`) ||
        (goalLower.includes('求饶') && rule.includes('求饶')) ||
        (goalLower.includes('投降') && rule.includes('投降'))
      ) {
        return {
          valid: false,
          reason: `Proposed objective violates StandingIntent non-negotiable rule: ${rule}`,
        };
      }
    }

    return { valid: true };
  }

  private mapRecordToContract(record: any): WorkingContract {
    return {
      id: record.id,
      novelId: record.novelId,
      version: record.version,
      standingIntent: JSON.parse(record.standingIntentJson),
      operationalObjective: JSON.parse(record.operationalObjective),
      constraints: JSON.parse(record.constraintsJson),
      verificationCriteria: JSON.parse(record.verificationCriteria),
      isActive: record.isActive,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

export const workingContractService = new WorkingContractService();
