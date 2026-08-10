import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { AgentRun, AgentRunDetail } from "@ai-novel/shared/types/agent";
import { apiClient } from "./client";

export async function listAgentRuns(params?: {
  status?: AgentRun["status"];
  novelId?: string;
  sessionId?: string;
  limit?: number;
}) {
  const { data } = await apiClient.get<ApiResponse<AgentRun[]>>("/agent-runs", {
    params,
  });
  return data;
}

export async function getAgentRunDetail(id: string) {
  const { data } = await apiClient.get<ApiResponse<AgentRunDetail>>(`/agent-runs/${id}`);
  return data;
}

export async function resolveAgentRunApproval(
  runId: string,
  approvalId: string,
  payload: {
    action: "approve" | "reject";
    note?: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<{
    run: AgentRun;
    steps: AgentRunDetail["steps"];
    approvals: AgentRunDetail["approvals"];
    assistantOutput: string;
  }>>(`/agent-runs/${runId}/approvals/${approvalId}`, payload);
  return data;
}

export async function replayAgentRunFromStep(
  runId: string,
  payload: {
    fromStepId: string;
    mode?: "continue" | "dry_run";
    note?: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<{
    run: AgentRun;
    steps: AgentRunDetail["steps"];
    approvals: AgentRunDetail["approvals"];
    assistantOutput: string;
  }>>(`/agent-runs/${runId}/replay`, payload);
  return data;
}
