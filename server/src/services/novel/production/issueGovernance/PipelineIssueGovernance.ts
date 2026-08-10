import type { DirectorIssueCode } from "@ai-novel/shared/types/directorIssue";
import type { PipelinePayload } from "../../novelCoreShared";
import { logPipelineWarn } from "../../novelCoreShared";
import { prisma } from "../../../../db/prisma";
import {
  DirectorIssueActionInterrupt,
  directorIssueService,
  isDirectorIssueActionInterrupt,
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
  maxAttempts?: number;
  hasUsableOutput?: boolean;
  provider?: PipelinePayload["provider"];
  model?: string;
  temperature?: number;
  applyAction?: (result: ReportDirectorIssueResult) => Promise<void>;
}): Promise<void> {
  if (!input.governance || !input.workflowTaskId) return;
  try {
    await directorIssueService.reportIssue({
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
      maxAttempts: input.maxAttempts,
      hasUsableOutput: input.hasUsableOutput,
      runMode: input.governance.runMode,
      fingerprint: [input.jobId, input.issueCode, input.chapterId ?? "book", input.attempt ?? 0].join(":"),
      policy: input.governance.policy,
      policySource: input.governance.policySource,
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
      applyAction: input.applyAction ?? (async (result) => {
        if (result.decision.action === "pause_for_manual" || result.decision.action === "fail_task") {
          throw new DirectorIssueActionInterrupt(result);
        }
      }),
    });
  } catch (error) {
    if (isDirectorIssueActionInterrupt(error)) throw error;
    logPipelineWarn("自动导演问题治理失败", {
      jobId: input.jobId,
      issueCode: input.issueCode,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function applyPipelineIssueInterrupt(input: {
  error: unknown;
  workflowTaskId?: string;
  novelId: string;
}): Promise<boolean> {
  if (!input.workflowTaskId || !isDirectorIssueActionInterrupt(input.error)) return false;
  const { occurrence, decision } = input.error.result;
  const now = new Date();
  if (decision.action === "pause_for_manual") {
    await prisma.novelWorkflowTask.updateMany({
      where: { id: input.workflowTaskId },
      data: {
        status: "queued",
        pendingManualRecovery: true,
        lastError: occurrence.summary,
        heartbeatAt: null,
        finishedAt: null,
      },
    });
  } else if (decision.action === "fail_task") {
    await prisma.novelWorkflowTask.updateMany({
      where: { id: input.workflowTaskId },
      data: {
        status: "failed",
        pendingManualRecovery: false,
        lastError: occurrence.summary,
        currentItemKey: occurrence.stage,
        currentItemLabel: occurrence.summary,
        heartbeatAt: now,
        finishedAt: now,
      },
    });
  }
  await directorIssueService.recordActionApplied({
    taskId: input.workflowTaskId,
    novelId: input.novelId,
    stage: occurrence.stage,
    result: input.error.result,
  });
  return true;
}
