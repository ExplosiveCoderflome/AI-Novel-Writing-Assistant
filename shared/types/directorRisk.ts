import { z } from "zod";

export const DIRECTOR_RISK_SCORE_MIN = 1;
/**
 * 8 is the highest user-facing risk score. A protection pause is represented
 * by `action`, never by inflating a score beyond this scale.
 */
export const DIRECTOR_RISK_SCORE_MAX = 8;
export const DIRECTOR_RISK_NOTICE_THRESHOLD_MIN = 2;
export const DIRECTOR_RISK_NOTICE_THRESHOLD_MAX = 7;
export const DIRECTOR_RISK_PAUSE_THRESHOLD_MIN = 3;
export const DIRECTOR_RISK_PAUSE_THRESHOLD_MAX = 8;

export const DEFAULT_DIRECTOR_RISK_POLICY = {
  noticeThreshold: 5,
  pauseThreshold: 8,
} as const;

/**
 * The frozen risk thresholds used by one auto-director run. A novel may
 * override the global defaults, but a running task must retain this snapshot.
 */
export const directorRiskPolicySchema = z.object({
  noticeThreshold: z.number().int()
    .min(DIRECTOR_RISK_NOTICE_THRESHOLD_MIN)
    .max(DIRECTOR_RISK_NOTICE_THRESHOLD_MAX)
    .default(DEFAULT_DIRECTOR_RISK_POLICY.noticeThreshold),
  pauseThreshold: z.number().int()
    .min(DIRECTOR_RISK_PAUSE_THRESHOLD_MIN)
    .max(DIRECTOR_RISK_PAUSE_THRESHOLD_MAX)
    .default(DEFAULT_DIRECTOR_RISK_POLICY.pauseThreshold),
}).superRefine((policy, context) => {
  if (policy.pauseThreshold <= policy.noticeThreshold) {
    context.addIssue({
      code: "custom",
      path: ["pauseThreshold"],
      message: "暂停阈值必须高于提醒阈值。",
    });
  }
});

export type DirectorRiskPolicy = z.infer<typeof directorRiskPolicySchema>;

export function parseDirectorRiskPolicy(input: unknown): DirectorRiskPolicy {
  return directorRiskPolicySchema.parse(input);
}

/**
 * Tasks created before the fixed 8-point boundary may retain a 9 or 10-point
 * pause threshold in their frozen seed. Keep both user preferences while
 * clamping them to the current 1–8 scale.
 */
export function parsePersistedDirectorRiskPolicy(input: unknown): DirectorRiskPolicy | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const candidate = input as Record<string, unknown>;
  const rawNotice = typeof candidate.noticeThreshold === "number"
    ? candidate.noticeThreshold
    : DEFAULT_DIRECTOR_RISK_POLICY.noticeThreshold;
  const noticeThreshold = Math.max(
    DIRECTOR_RISK_NOTICE_THRESHOLD_MIN,
    Math.min(DIRECTOR_RISK_NOTICE_THRESHOLD_MAX, Math.round(rawNotice)),
  );
  const rawPause = typeof candidate.pauseThreshold === "number"
    ? candidate.pauseThreshold
    : DEFAULT_DIRECTOR_RISK_POLICY.pauseThreshold;
  return directorRiskPolicySchema.parse({
    noticeThreshold,
    pauseThreshold: Math.max(
      DIRECTOR_RISK_PAUSE_THRESHOLD_MIN,
      Math.min(DIRECTOR_RISK_PAUSE_THRESHOLD_MAX, Math.max(noticeThreshold + 1, Math.round(rawPause))),
    ),
  });
}

export function isDirectorRiskScore(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= DIRECTOR_RISK_SCORE_MIN
    && value <= DIRECTOR_RISK_SCORE_MAX;
}

export const directorRiskCategorySchema = z.enum([
  "planning",
  "candidate_confirmation",
  "chapter_generation",
  "chapter_acceptance",
  "chapter_repair",
  "state_proposal",
  "replan",
  "model_failure",
  "worker_failure",
  "task_recovery",
  "protected_content",
  "runtime_safety",
  "data_integrity",
  "unknown",
]);

export type DirectorRiskCategory = z.infer<typeof directorRiskCategorySchema>;

export const directorRiskImpactScopeSchema = z.enum([
  "current_step",
  "current_chapter",
  "chapter_range",
  "novel",
  "task",
  "system",
]);

export type DirectorRiskImpactScope = z.infer<typeof directorRiskImpactScopeSchema>;

export const directorRiskRecommendationSchema = z.enum([
  "continue",
  "record_quality_debt",
  "retry",
  "local_repair",
  "replan",
  "pause",
  "stop",
]);

export type DirectorRiskRecommendation = z.infer<typeof directorRiskRecommendationSchema>;

/**
 * Structured conclusion produced by the risk-assessment prompt. Runtime safety
 * rules may override `canPause`, but may never raise a score above 8.
 */
export const aiDirectorRiskAssessmentSchema = z.object({
  score: z.number().int().min(DIRECTOR_RISK_SCORE_MIN).max(DIRECTOR_RISK_SCORE_MAX),
  category: directorRiskCategorySchema,
  impactScope: directorRiskImpactScopeSchema,
  affectedChapterOrders: z.array(z.number().int().positive()).max(20).default([]),
  evidenceSummary: z.string().trim().min(1).max(2_000),
  recommendation: directorRiskRecommendationSchema,
  recommendationReason: z.string().trim().min(1).max(2_000),
  canPause: z.boolean(),
});

export type AiDirectorRiskAssessment = z.infer<typeof aiDirectorRiskAssessmentSchema>;

export const directorRiskActionSchema = z.enum([
  "logged",
  "notified",
  "continued",
  "quality_debt_recorded",
  "pause_requested",
  "paused",
  "forced_pause",
]);

export type DirectorRiskAction = z.infer<typeof directorRiskActionSchema>;

/**
 * Persistable risk record. `action` and `assessedAt` capture what the runtime
 * actually did after applying the frozen policy and non-blocking quality rules.
 */
export const directorRiskAssessmentSchema = aiDirectorRiskAssessmentSchema.extend({
  action: directorRiskActionSchema,
  assessedAt: z.string().datetime(),
  issueFingerprint: z.string().trim().min(1).max(256).optional(),
});

export type DirectorRiskAssessment = z.infer<typeof directorRiskAssessmentSchema>;

/**
 * Older task events can contain the former forced-pause score of 10. Keep
 * those events readable while presenting them on the current 1–8 scale.
 */
export function parsePersistedDirectorRiskAssessment(input: unknown): DirectorRiskAssessment | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const candidate = input as Record<string, unknown>;
  const rawScore = typeof candidate.score === "number" ? candidate.score : null;
  const normalized = rawScore === null
    ? candidate
    : {
        ...candidate,
        score: Math.max(DIRECTOR_RISK_SCORE_MIN, Math.min(DIRECTOR_RISK_SCORE_MAX, Math.round(rawScore))),
      };
  const parsed = directorRiskAssessmentSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

/** A persisted scored issue as shown in the task-center risk history. */
export type DirectorRiskHistoryItem = DirectorRiskAssessment & {
  eventId: string;
};
