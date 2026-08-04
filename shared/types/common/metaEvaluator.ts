/**
 * Two-Layer Generic Meta-Evaluator Contracts & Data Types
 * Defines data structures for Layer 1 (Generic Meta-Evaluator Engine) and Layer 2 (Value Formula Compiler).
 */

export type RuleOperator =
  | 'NON_EMPTY'
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'GREATER_THAN'
  | 'LESS_THAN'
  | 'CONTAINS'
  | 'MATCHES_REGEX';

export interface AtomicValueRule {
  id: string;
  fieldPath: string;             // JSON Path string (e.g. "data.volumes[0].chapters")
  operator: RuleOperator;
  expectedValue?: unknown;
  penaltyWeight: number;         // Score deduction weight if failed (0.0 to 1.0)
  errorMessage: string;
  isHardConstraint: boolean;     // If failed, forces hardMetricsPassed = false
}

export interface DimensionFormulaSpec {
  dimension: 'structural' | 'domain_coverage' | 'continuity' | 'alignment';
  weight: number;                // Dimension weight (sum of weights = 1.0)
  rules: AtomicValueRule[];
}

export interface ValueFormulaSpec {
  specId: string;
  stageId: string;
  dimensions: DimensionFormulaSpec[];
  passThreshold: number;         // Default 0.85
  repairThreshold: number;       // Default 0.60
}

export interface ValueDimensionScore {
  dimension: 'structural' | 'domain_coverage' | 'continuity' | 'alignment';
  score: number;                 // Normalized 0.0 to 1.0
  weight: number;
  weightedScore: number;
  details: string[];
}

export interface ValueFunctionResult {
  totalValueScore: number;       // Sum of weighted scores (0.0 to 1.0)
  isTrustworthy: boolean;        // True if score >= passThreshold and hard metrics pass
  dimensions: ValueDimensionScore[];
  hardMetricsPassed: boolean;
  recommendedAction: 'PASS' | 'AUTO_REPAIR' | 'REJECT_AND_REPLAN';
}

export interface VerifiedHandoffCertificate {
  certificateId: string;
  novelId: string;
  fromStage: string;
  toStage: string;
  valueScore: number;
  payloadHash: string;
  issuedAt: number;
  signature: string;             // SHA256 signature of payloadHash + valueScore
}
