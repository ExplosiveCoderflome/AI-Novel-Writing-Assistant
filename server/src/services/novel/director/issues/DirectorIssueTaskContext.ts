import {
  DIRECTOR_ISSUE_GOVERNANCE_VERSION,
  directorIssuePolicySchema,
  type DirectorIssuePolicy,
} from "@ai-novel/shared/types/directorIssue";
import { prisma } from "../../../../db/prisma";
import { directorIssuePolicyService } from "./DirectorIssuePolicyService";

export interface DirectorIssueTaskContext {
  novelId: string | null;
  issueGovernanceVersion: 1;
  policy: DirectorIssuePolicy;
  runMode?: string;
  policySource: "global" | "novel" | "task_snapshot";
}

export async function loadDirectorIssueTaskContext(
  taskId: string | null | undefined,
): Promise<DirectorIssueTaskContext | null> {
  if (!taskId?.trim()) return null;
  const task = await prisma.novelWorkflowTask.findUnique({
    where: { id: taskId },
    select: { novelId: true, seedPayloadJson: true },
  });
  if (!task) return null;
  let seed: Record<string, unknown> = {};
  try {
    seed = task.seedPayloadJson
      ? JSON.parse(task.seedPayloadJson) as Record<string, unknown>
      : {};
    const policy = directorIssuePolicySchema.safeParse(seed.issuePolicy);
    if (seed.issueGovernanceVersion === DIRECTOR_ISSUE_GOVERNANCE_VERSION && policy.success) {
      return {
        novelId: task.novelId,
        issueGovernanceVersion: DIRECTOR_ISSUE_GOVERNANCE_VERSION,
        policy: policy.data,
        runMode: typeof seed.runMode === "string" ? seed.runMode : undefined,
        policySource: seed.issuePolicySource === "global" || seed.issuePolicySource === "novel"
          ? seed.issuePolicySource
          : "task_snapshot",
      };
    }
  } catch {
    seed = {};
  }

  const fallback = task.novelId
    ? await directorIssuePolicyService.getNovelPolicy(task.novelId)
    : {
      effectivePolicy: await directorIssuePolicyService.getGlobalPolicy(),
      source: "global" as const,
    };
  return {
    novelId: task.novelId,
    issueGovernanceVersion: DIRECTOR_ISSUE_GOVERNANCE_VERSION,
    policy: fallback.effectivePolicy,
    runMode: typeof seed.runMode === "string" ? seed.runMode : undefined,
    policySource: fallback.source,
  };
}
