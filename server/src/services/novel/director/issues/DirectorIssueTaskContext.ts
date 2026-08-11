import {
  directorIssuePolicySchema,
  type DirectorIssuePolicy,
} from "@ai-novel/shared/types/directorIssue";
import { prisma } from "../../../../db/prisma";

export interface DirectorIssueTaskContext {
  novelId: string | null;
  issueGovernanceVersion: number;
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
  if (!task?.seedPayloadJson) return null;
  try {
    const seed = JSON.parse(task.seedPayloadJson) as Record<string, unknown>;
    const policy = directorIssuePolicySchema.safeParse(seed.issuePolicy);
    if (seed.issueGovernanceVersion !== 1 || !policy.success) return null;
    return {
      novelId: task.novelId,
      issueGovernanceVersion: 1,
      policy: policy.data,
      runMode: typeof seed.runMode === "string" ? seed.runMode : undefined,
      policySource: seed.issuePolicySource === "global" || seed.issuePolicySource === "novel"
        ? seed.issuePolicySource
        : "task_snapshot",
    };
  } catch {
    return null;
  }
}
