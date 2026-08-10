import { z } from "zod";

export const DIRECTOR_ISSUE_GOVERNANCE_VERSION = 1 as const;

export const DIRECTOR_ISSUE_CODES = [
  "planning.prerequisite_missing",
  "planning.volume_strategy_high_risk",
  "planning.execution_contract_invalid",
  "planning.route_window_unavailable",
  "generation.empty_content",
  "generation.output_unusable",
  "generation.runtime_failed",
  "quality.chapter_below_threshold",
  "quality.acceptance_unavailable",
  "quality.obligation_gap",
  "quality.local_repair_failed",
  "quality.loop_exhausted",
  "quality.replan_required",
  "quality.replan_loop",
  "runtime.model_unavailable",
  "runtime.service_unavailable",
  "runtime.token_budget_exceeded",
  "runtime.protected_content",
  "runtime.data_integrity",
  "runtime.persistence_failed",
  "runtime.worker_stale",
  "runtime.background_prefetch_failed",
  "runtime.unclassified",
] as const;

export const directorIssueCodeSchema = z.enum(DIRECTOR_ISSUE_CODES);
export type DirectorIssueCode = z.infer<typeof directorIssueCodeSchema>;

export const DIRECTOR_ISSUE_ACTIONS = [
  "auto_retry",
  "continue_with_warning",
  "pause_for_manual",
  "fail_task",
] as const;

export const directorIssueActionSchema = z.enum(DIRECTOR_ISSUE_ACTIONS);
export type DirectorIssueAction = z.infer<typeof directorIssueActionSchema>;

export type DirectorIssueCategory = "planning" | "generation" | "quality" | "runtime";

export interface DirectorIssueCatalogEntry {
  code: DirectorIssueCode;
  category: DirectorIssueCategory;
  label: string;
  defaultAction: DirectorIssueAction;
  allowedActions: readonly DirectorIssueAction[];
  exhaustedAction: Exclude<DirectorIssueAction, "auto_retry">;
  enforcedAction?: DirectorIssueAction;
  lockedReason?: string;
}

export const DIRECTOR_ISSUE_CATALOG: readonly DirectorIssueCatalogEntry[] = [
  { code: "planning.prerequisite_missing", category: "planning", label: "前置创作资料缺失", defaultAction: "pause_for_manual", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "pause_for_manual" },
  { code: "planning.volume_strategy_high_risk", category: "planning", label: "卷战略风险过高", defaultAction: "pause_for_manual", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "pause_for_manual" },
  { code: "planning.execution_contract_invalid", category: "planning", label: "章节执行合同不可用", defaultAction: "auto_retry", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "pause_for_manual" },
  { code: "planning.route_window_unavailable", category: "planning", label: "后续章节路线未准备好", defaultAction: "auto_retry", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "pause_for_manual" },
  { code: "generation.empty_content", category: "generation", label: "模型未返回正文", defaultAction: "auto_retry", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "fail_task" },
  { code: "generation.output_unusable", category: "generation", label: "正文结果不可保存", defaultAction: "fail_task", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "fail_task", enforcedAction: "fail_task", lockedReason: "没有可用正文时不能继续推进。" },
  { code: "generation.runtime_failed", category: "generation", label: "章节运行失败", defaultAction: "auto_retry", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "pause_for_manual" },
  { code: "quality.chapter_below_threshold", category: "quality", label: "章节质量分未达标", defaultAction: "continue_with_warning", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "continue_with_warning", lockedReason: "全书模式会把局部章节质量债记录后继续。" },
  { code: "quality.acceptance_unavailable", category: "quality", label: "章节接收检查不可用", defaultAction: "continue_with_warning", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "continue_with_warning", lockedReason: "全书模式会保留可用正文并安排后续复查。" },
  { code: "quality.obligation_gap", category: "quality", label: "本章义务仍有缺口", defaultAction: "continue_with_warning", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "continue_with_warning", lockedReason: "全书模式会把局部义务缺口作为质量债继续。" },
  { code: "quality.local_repair_failed", category: "quality", label: "局部修复未安全应用", defaultAction: "continue_with_warning", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "continue_with_warning", lockedReason: "全书模式已有可用正文时会记录质量债并继续。" },
  { code: "quality.loop_exhausted", category: "quality", label: "同类质量修复已耗尽", defaultAction: "continue_with_warning", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "pause_for_manual" },
  { code: "quality.replan_required", category: "quality", label: "后续章节必须重规划", defaultAction: "pause_for_manual", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "pause_for_manual", enforcedAction: "pause_for_manual", lockedReason: "明确重规划必须在安全节点暂停。" },
  { code: "quality.replan_loop", category: "quality", label: "重规划重复循环", defaultAction: "continue_with_warning", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "pause_for_manual" },
  { code: "runtime.model_unavailable", category: "runtime", label: "创作模型不可用", defaultAction: "auto_retry", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "pause_for_manual" },
  { code: "runtime.service_unavailable", category: "runtime", label: "创作服务暂时不可用", defaultAction: "auto_retry", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "pause_for_manual" },
  { code: "runtime.token_budget_exceeded", category: "runtime", label: "AI 用量异常", defaultAction: "pause_for_manual", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "pause_for_manual", enforcedAction: "pause_for_manual", lockedReason: "异常用量必须先停止检查。" },
  { code: "runtime.protected_content", category: "runtime", label: "操作可能覆盖受保护内容", defaultAction: "pause_for_manual", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "pause_for_manual", enforcedAction: "pause_for_manual", lockedReason: "用户保护内容必须人工确认。" },
  { code: "runtime.data_integrity", category: "runtime", label: "运行数据完整性风险", defaultAction: "pause_for_manual", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "pause_for_manual", enforcedAction: "pause_for_manual", lockedReason: "数据完整性风险不可自动放行。" },
  { code: "runtime.persistence_failed", category: "runtime", label: "关键创作结果保存失败", defaultAction: "fail_task", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "fail_task", enforcedAction: "fail_task", lockedReason: "无法确认保存结果时必须终止当前任务。" },
  { code: "runtime.worker_stale", category: "runtime", label: "后台执行失去响应", defaultAction: "auto_retry", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "pause_for_manual" },
  { code: "runtime.background_prefetch_failed", category: "runtime", label: "下一章后台预取失败", defaultAction: "continue_with_warning", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "continue_with_warning", lockedReason: "正式执行时会重新准备，不阻断当前章节。" },
  { code: "runtime.unclassified", category: "runtime", label: "尚未识别的运行问题", defaultAction: "pause_for_manual", allowedActions: DIRECTOR_ISSUE_ACTIONS, exhaustedAction: "pause_for_manual" },
] as const;

export const DIRECTOR_ISSUE_CATALOG_BY_CODE = Object.fromEntries(
  DIRECTOR_ISSUE_CATALOG.map((entry) => [entry.code, entry]),
) as Record<DirectorIssueCode, DirectorIssueCatalogEntry>;

export const DEFAULT_DIRECTOR_ISSUE_POLICY = {
  noticeThreshold: 5,
  pauseThreshold: 8,
  issueActions: {},
} satisfies DirectorIssuePolicy;

export const directorIssuePolicySchema = z.object({
  noticeThreshold: z.number().int().min(2).max(7).default(5),
  pauseThreshold: z.number().int().min(3).max(8).default(8),
  issueActions: z.partialRecord(directorIssueCodeSchema, directorIssueActionSchema).default({}),
}).superRefine((policy, context) => {
  if (policy.pauseThreshold <= policy.noticeThreshold) {
    context.addIssue({ code: "custom", path: ["pauseThreshold"], message: "暂停阈值必须高于提醒阈值。" });
  }
  for (const [code, action] of Object.entries(policy.issueActions)) {
    const entry = DIRECTOR_ISSUE_CATALOG_BY_CODE[code as DirectorIssueCode];
    if (entry && action && !entry.allowedActions.includes(action)) {
      context.addIssue({ code: "custom", path: ["issueActions", code], message: `${entry.label}不允许使用该处理动作。` });
    }
  }
});

export type DirectorIssuePolicy = z.infer<typeof directorIssuePolicySchema>;

export const directorIssuePolicyOverrideSchema = z.object({
  noticeThreshold: z.number().int().min(2).max(7).optional(),
  pauseThreshold: z.number().int().min(3).max(8).optional(),
  issueActions: z.partialRecord(directorIssueCodeSchema, directorIssueActionSchema).optional(),
}).superRefine((override, context) => {
  if (
    override.noticeThreshold !== undefined
    && override.pauseThreshold !== undefined
    && override.pauseThreshold <= override.noticeThreshold
  ) {
    context.addIssue({ code: "custom", path: ["pauseThreshold"], message: "暂停阈值必须高于提醒阈值。" });
  }
  for (const [code, action] of Object.entries(override.issueActions ?? {})) {
    const entry = DIRECTOR_ISSUE_CATALOG_BY_CODE[code as DirectorIssueCode];
    if (entry && action && !entry.allowedActions.includes(action)) {
      context.addIssue({ code: "custom", path: ["issueActions", code], message: `${entry.label}不允许使用该处理动作。` });
    }
  }
});

export type DirectorIssuePolicyOverride = z.infer<typeof directorIssuePolicyOverrideSchema>;

export const directorIssueAssessmentSchema = z.object({
  issueCode: directorIssueCodeSchema,
  riskScore: z.number().int().min(1).max(8),
  summary: z.string().trim().min(1).max(1_000),
  evidence: z.string().trim().min(1).max(2_000),
  suggestedAction: directorIssueActionSchema,
  canPause: z.boolean(),
});

export type DirectorIssueAssessment = z.infer<typeof directorIssueAssessmentSchema>;

export const directorIssueOccurrenceSchema = z.object({
  schemaVersion: z.literal(1),
  issueCode: directorIssueCodeSchema,
  stage: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  evidence: z.string().trim().optional(),
  affectedScope: z.string().trim().optional(),
  chapterId: z.string().trim().optional(),
  chapterOrder: z.number().int().positive().optional(),
  riskScore: z.number().int().min(1).max(8).nullable().optional(),
  qualityScores: z.record(z.string(), z.number()).optional(),
  attempt: z.number().int().nonnegative().default(0),
  maxAttempts: z.number().int().nonnegative().default(0),
  hasUsableOutput: z.boolean().default(false),
  runMode: z.string().trim().optional(),
  fingerprint: z.string().trim().min(1),
  occurredAt: z.string().datetime(),
});

export type DirectorIssueOccurrence = z.infer<typeof directorIssueOccurrenceSchema>;

export const directorIssueDecisionSchema = z.object({
  issueCode: directorIssueCodeSchema,
  action: directorIssueActionSchema,
  reason: z.string().trim().min(1),
  locked: z.boolean(),
  policySource: z.enum(["global", "novel", "task_snapshot", "safety"]),
  retryExhaustedAction: z.enum(["continue_with_warning", "pause_for_manual", "fail_task"]),
});

export type DirectorIssueDecision = z.infer<typeof directorIssueDecisionSchema>;

export function mergeDirectorIssuePolicy(
  base: DirectorIssuePolicy,
  override?: DirectorIssuePolicyOverride | null,
): DirectorIssuePolicy {
  return directorIssuePolicySchema.parse({
    noticeThreshold: override?.noticeThreshold ?? base.noticeThreshold,
    pauseThreshold: override?.pauseThreshold ?? base.pauseThreshold,
    issueActions: { ...base.issueActions, ...(override?.issueActions ?? {}) },
  });
}

export function resolveDirectorIssueDecision(input: {
  occurrence: Pick<DirectorIssueOccurrence, "issueCode" | "riskScore" | "attempt" | "maxAttempts" | "hasUsableOutput" | "runMode">;
  policy: DirectorIssuePolicy;
  policySource?: DirectorIssueDecision["policySource"];
}): DirectorIssueDecision {
  const entry = DIRECTOR_ISSUE_CATALOG_BY_CODE[input.occurrence.issueCode];
  const configured = input.policy.issueActions[input.occurrence.issueCode];
  let action = configured && entry.allowedActions.includes(configured) ? configured : entry.defaultAction;
  let locked = false;
  let reason = `按${configured ? "当前" : "默认"}治理规则处理。`;

  if (entry.enforcedAction) {
    action = entry.enforcedAction;
    locked = true;
    reason = entry.lockedReason ?? "安全保护规则优先于用户偏好。";
  }

  if (!locked && !configured && typeof input.occurrence.riskScore === "number") {
    if (
      input.occurrence.riskScore >= input.policy.pauseThreshold
      && entry.allowedActions.includes("pause_for_manual")
    ) {
      action = "pause_for_manual";
      reason = `风险分 ${input.occurrence.riskScore} 达到暂停阈值 ${input.policy.pauseThreshold}。`;
    } else if (
      input.occurrence.riskScore >= input.policy.noticeThreshold
      && entry.allowedActions.includes("continue_with_warning")
      && action !== "auto_retry"
    ) {
      action = "continue_with_warning";
      reason = `风险分 ${input.occurrence.riskScore} 达到提醒阈值 ${input.policy.noticeThreshold}。`;
    }
  }

  const fullBookWithUsableOutput = input.occurrence.runMode === "full_book_autopilot"
    && input.occurrence.hasUsableOutput;
  if (fullBookWithUsableOutput && (
    entry.category === "quality"
    && input.occurrence.issueCode !== "quality.replan_required"
  )) {
    action = action === "auto_retry" ? action : "continue_with_warning";
    locked = true;
    reason = "全书自动成书保留可用正文，将局部问题记录为质量债后继续。";
  }

  if (action === "auto_retry" && input.occurrence.attempt >= input.occurrence.maxAttempts) {
    action = entry.exhaustedAction;
    reason = `自动重试已达到 ${input.occurrence.maxAttempts} 次上限。`;
  }

  if (action === "continue_with_warning" && !input.occurrence.hasUsableOutput) {
    action = entry.exhaustedAction === "continue_with_warning" ? "pause_for_manual" : entry.exhaustedAction;
    locked = true;
    reason = "当前没有可用正文或已保存产物，不能仅记录警告后继续。";
  }

  return {
    issueCode: input.occurrence.issueCode,
    action,
    reason,
    locked,
    policySource: locked ? "safety" : (input.policySource ?? "task_snapshot"),
    retryExhaustedAction: entry.exhaustedAction,
  };
}
