import { workingContractService, WorkingContract } from '../contract/workingContract';
import { falsifiedRouteLedgerService, FalsifiedRoute } from '../state/falsifiedRouteLedger';

export interface ArgusDashboardProjection {
  novelId: string;
  contractVersion: number;
  standingIntentSummary: string;
  operationalGoal: string;
  activeFalsifiedRoutesCount: number;
  latestNegativeConstraint?: string;
  totalPivotsCount: number;
}

export class ArgusRuntimeProjectionService {
  /**
   * Build a lightweight Argus runtime projection for UI Cockpit.
   */
  public async getProjection(novelId: string): Promise<ArgusDashboardProjection | null> {
    const contract = await workingContractService.getActiveContract(novelId);
    if (!contract) return null;

    const routes = await falsifiedRouteLedgerService.listByNovel(novelId);
    const latestRoute = routes.length > 0 ? routes[0] : null;

    return {
      novelId,
      contractVersion: contract.version,
      standingIntentSummary: `${contract.standingIntent.coreTheme} | ${contract.standingIntent.protagonistArc}`,
      operationalGoal: contract.operationalObjective.dramaticGoal,
      activeFalsifiedRoutesCount: routes.length,
      latestNegativeConstraint: latestRoute?.negativePromptConstraint,
      totalPivotsCount: contract.version - 1,
    };
  }
}

export const argusRuntimeProjectionService = new ArgusRuntimeProjectionService();
