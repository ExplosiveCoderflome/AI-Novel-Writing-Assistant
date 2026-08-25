import type { DirectorIssueCode, DirectorIssueDecision } from "@ai-novel/shared/types/directorIssue";
import type { PipelinePayload } from "../../novelCoreShared";
import { logPipelineWarn } from "../../novelCoreShared";
import {
  directorIssueService,
  type ReportDirectorIssueResult,
  type DirectorIssueTaskContext,
} from "../../director/issues";

export async function reportPipelineIssue(input: {
  governance: DirectorIssueTaskContext | null;
  workflowTaskId?: string;
  novelId: string;
  jobId: string;
  issueCode: DirectorIssueCode;
  stage: string;
  summary: string;
  evidence?: string;
  chapterId?: string;
  chapterOrder?: number;
  qualityScores?: Record<string, number>;
  attempt?: number;
  hasUsableOutput?: boolean;
  provider?: PipelinePayload["provider"];
  model?: string;
  temperature?: number;
  applyAction?: (decision: DirectorIssueDecision) => Promise<void>;
}): Promise<ReportDirectorIssueResult | null> {
  if (!input.governance || !input.workflowTaskId) return null;
  try {
    return await directorIssueService.reportIssue({
      issueGovernanceVersion: input.governance.issueGovernanceVersion,
      taskId: input.workflowTaskId,
      novelId: input.novelId,
      issueCode: input.issueCode,
      stage: input.stage,
      summary: input.summary,
      evidence: input.evidence,
      affectedScope: input.chapterId ? `chapter:${input.chapterId}` : `pipeline:${input.jobId}`,
      chapterId: input.chapterId,
      chapterOrder: input.chapterOrder,
      qualityScores: input.qualityScores,
      attempt: input.attempt,
      hasUsableOutput: input.hasUsableOutput,
      runMode: input.governance.runMode,
      fingerprint: [input.jobId, input.issueCode, input.chapterId ?? "book", input.attempt ?? 0].join(":"),
      policy: input.governance.policy,
      policySource: input.governance.policySource,
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
      applyAction: input.applyAction,
    });
  } catch (error) {
    logPipelineWarn("自动导演问题治理失败", {
      jobId: input.jobId,
      issueCode: input.issueCode,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
