import type { DirectorIssueCode, DirectorIssueDecision } from "@ai-novel/shared/types/directorIssue";
import type { PipelinePayload } from "../../novelCoreShared";
import { logPipelineWarn } from "../../novelCoreShared";
import { prisma } from "../../../../db/prisma";
import {
  directorIssueService,
  type ReportDirectorIssueResult,
  type DirectorIssueTaskContext,
} from "../../director/issues";

class DirectorIssueActionInterrupt extends Error {
  constructor(readonly result: ReportDirectorIssueResult) {
    super(result.occurrence.summary);
  }
}

function isDirectorIssueActionInterrupt(error: unknown): error is DirectorIssueActionInterrupt {
  return error instanceof DirectorIssueActionInterrupt;
}

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
  applyAction?: (decision: DirectorIssueDecision) => Promise<void>;
}): Promise<void> {
  if (!input.governance || !input.workflowTaskId) return;
  try {
    const result = await directorIssueService.reportIssue({
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
      applyAction: input.applyAction,
    });
    if (result && !input.applyAction && (
      result.decision.action === "pause_for_manual"
      || result.decision.action === "fail_task"
    )) {
      throw new DirectorIssueActionInterrupt(result);
    }
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
  return true;
}
