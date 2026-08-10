import { WorkingContract } from '../contract/workingContract';
import { FalsifiedRoute } from '../state/falsifiedRouteLedger';

export type ReviewerVerdictType =
  | 'done'                // Pass
  | 'continue'            // Patch repair requested
  | 'defer_and_continue'  // Quality debt recorded, continue main line
  | 'replan_required';    // Fatal conflict, trigger Manager Pivot

export interface ReviewerAuditVerdict {
  verdict: ReviewerVerdictType;
  rootCauseCode?: string;
  patchInstructions?: string;
  qualityDebtSummary?: string;
  blockingObligations?: string[];
}

export class ReviewerRole {
  /**
   * Conduct independent audit on candidate artifact against contract constraints.
   */
  public auditArtifact(
    artifactContent: string,
    contract: WorkingContract,
    falsifiedRoutes: FalsifiedRoute[]
  ): ReviewerAuditVerdict {
    // 1. Check for fatal non-negotiable rule violation
    for (const rule of contract.standingIntent.nonNegotiableRules || []) {
      if (rule.includes('不跪地求饶') && artifactContent.includes('跪地求饶')) {
        return {
          verdict: 'replan_required',
          rootCauseCode: 'CHARACTER_OOC',
          blockingObligations: [`正文违反立项硬性规则: ${rule}`],
        };
      }
    }

    // 2. Check for repeated dead branch violation
    for (const route of falsifiedRoutes) {
      if (
        artifactContent.includes(route.rootCauseCode) ||
        (route.rootCauseCode === 'TIMELINE_PARADOX' && artifactContent.includes('吃废丹'))
      ) {
        return {
          verdict: 'replan_required',
          rootCauseCode: route.rootCauseCode,
          blockingObligations: [`正文再次触发历史已否决死枝: ${route.negativePromptConstraint}`],
        };
      }
    }

    // 3. Check for minor patchable defect
    if (artifactContent.includes('缺少动作描写')) {
      return {
        verdict: 'continue',
        patchInstructions: '请补充主角在对话时的动作微表情描写',
      };
    }

    // 4. Check for minor non-blocking quality debt
    if (artifactContent.includes('错别字') || artifactContent.includes('语气词稍多')) {
      return {
        verdict: 'defer_and_continue',
        qualityDebtSummary: '局部修辞轻微瑕疵，已登记质量债务，放行推进。',
      };
    }

    // Pass
    return { verdict: 'done' };
  }
}

export const reviewerRole = new ReviewerRole();
