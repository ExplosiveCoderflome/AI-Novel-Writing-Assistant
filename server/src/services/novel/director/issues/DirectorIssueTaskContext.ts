import {
  DIRECTOR_ISSUE_GOVERNANCE_VERSION,
  directorIssuePolicySchema,
  type DirectorIssuePolicy,
} from "@ai-novel/shared/types/directorIssue";
import { prisma } from "../../../../db/prisma";
import { directorIssuePolicyService } from "./DirectorIssuePolicyService";
import { DirectorStateReader, toDirectorTaskDataView } from "../state/DirectorStateReader";

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
    select: { novelId: true },
  });
  if (!task) return null;
  const taskState = await new DirectorStateReader().readTaskStateById(taskId);
  const directorTaskData = taskState ? toDirectorTaskDataView(taskState) : {};
  const policy = directorIssuePolicySchema.safeParse(directorTaskData.issuePolicy);
  if (directorTaskData.issueGovernanceVersion === DIRECTOR_ISSUE_GOVERNANCE_VERSION && policy.success) {
    return {
      novelId: task.novelId,
      issueGovernanceVersion: DIRECTOR_ISSUE_GOVERNANCE_VERSION,
      policy: policy.data,
      runMode: typeof directorTaskData.runMode === "string" ? directorTaskData.runMode : undefined,
      policySource: directorTaskData.issuePolicySource === "global" || directorTaskData.issuePolicySource === "novel"
        ? directorTaskData.issuePolicySource
        : "task_snapshot",
    };
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
    runMode: typeof directorTaskData.runMode === "string" ? directorTaskData.runMode : undefined,
    policySource: fallback.source,
  };
}
