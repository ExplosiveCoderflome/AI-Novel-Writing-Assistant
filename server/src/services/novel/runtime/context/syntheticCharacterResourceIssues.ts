import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";

export function buildSyntheticCharacterResourceIssues(
  context: GenerationContextPackage["characterResourceContext"],
  input: {
    novelId: string;
    chapterId: string;
  },
): GenerationContextPackage["openAuditIssues"] {
  if (!context) {
    return [];
  }
  const now = new Date().toISOString();
  const blockedIssues = context.blockedItems.slice(0, 4).map((item) => ({
    id: `character-resource:${item.id}:blocked`,
    reportId: `character-resource:${input.novelId}:${input.chapterId}`,
    auditType: "continuity" as const,
    severity: item.status === "destroyed" || item.status === "lost" ? "high" as const : "medium" as const,
    code: "character_resource_unavailable",
    description: `${item.name} 当前为 ${item.status}，本章不能直接当作可用资源使用。`,
    evidence: item.evidence[0]?.summary ?? item.summary,
    fixSuggestion: `优先做局部修复：补出重新获得、替代资源或不能使用的行动限制，避免无铺垫复用 ${item.name}。`,
    status: "open" as const,
    createdAt: now,
    updatedAt: now,
  }));
  const highRiskIssues = context.highRiskCommittedItems.slice(0, 3).map((item) => ({
    id: `character-resource:${item.id}:high-risk-committed`,
    reportId: `character-resource:${input.novelId}:${input.chapterId}`,
    auditType: "continuity" as const,
    severity: "medium" as const,
    code: "character_resource_high_risk_committed",
    description: `${item.name} 已入账但带有高风险信号，本章使用时不要改写其持有、可见性或消耗状态。`,
    evidence: item.evidence[0]?.summary ?? item.summary,
    fixSuggestion: `将 ${item.name} 的使用写成可回收的小修补，避免把高风险资源写成新的不可逆事实。`,
    status: "open" as const,
    createdAt: now,
    updatedAt: now,
  }));
  const pendingProposalIssues = context.pendingProposalItems.slice(0, 3).map((proposal) => ({
    id: `character-resource-proposal:${proposal.id}:pending-review`,
    reportId: `character-resource:${input.novelId}:${input.chapterId}`,
    auditType: "continuity" as const,
    severity: proposal.riskLevel === "high" ? "high" as const : "medium" as const,
    code: "character_resource_pending_proposal",
    description: `${proposal.summary} 仍在待确认状态，确认前不要把这条资源变更写成已发生事实。`,
    evidence: proposal.evidence[0] ?? proposal.summary,
    fixSuggestion: "先在任务中心确认或忽略这条资源变更；正文生成只应依据已入账资源。",
    status: "open" as const,
    createdAt: now,
    updatedAt: now,
  }));
  const signalIssues = context.riskSignals
    .filter((signal) => signal.severity === "high" || signal.severity === "critical")
    .slice(0, 3)
    .map((signal, index) => ({
      id: `character-resource:signal:${index}:${signal.code}`,
      reportId: `character-resource:${input.novelId}:${input.chapterId}`,
      auditType: "continuity" as const,
      severity: signal.severity,
      code: signal.code || "character_resource_risk",
      description: signal.summary,
      evidence: signal.summary,
      fixSuggestion: "优先采用 patch_first：只修补当前章节的资源归属、消耗或知情关系，不重写整段剧情。",
      status: "open" as const,
      createdAt: now,
      updatedAt: now,
    }));
  return [...blockedIssues, ...highRiskIssues, ...pendingProposalIssues, ...signalIssues];
}
