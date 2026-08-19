/**
 * Layer 1: Generic Meta-Evaluator Framework Engine
 * Pure, deterministic, schema-agnostic evaluation runtime for arbitrary stage payloads.
 */
import {
  ValueFormulaSpec,
  ValueFunctionResult,
  ValueDimensionScore,
  RuleOperator,
} from '@ai-novel/shared';

export class GenericMetaEvaluator {
  /**
   * Universal evaluation method. Computes V_handoff score based strictly on compiled ValueFormulaSpec.
   */
  public evaluate(
    payload: Record<string, unknown>,
    spec: ValueFormulaSpec
  ): ValueFunctionResult {
    let hardMetricsPassed = true;
    const dimensionResults: ValueDimensionScore[] = [];

    for (const dim of spec.dimensions) {
      let dimScore = 1.0;
      const dimDetails: string[] = [];

      for (const rule of dim.rules) {
        const actualValue = this.resolveFieldPath(payload, rule.fieldPath);
        const passed = this.evaluateOperator(actualValue, rule.operator, rule.expectedValue);

        if (!passed) {
          dimScore -= rule.penaltyWeight;
          dimDetails.push(`[FAIL] ${rule.errorMessage} (Path: ${rule.fieldPath}, Actual: ${JSON.stringify(actualValue)})`);
          if (rule.isHardConstraint) {
            hardMetricsPassed = false;
          }
        }
      }

      dimScore = Math.max(0.0, Number(dimScore.toFixed(4)));
      dimensionResults.push({
        dimension: dim.dimension,
        score: dimScore,
        weight: dim.weight,
        weightedScore: Number((dimScore * dim.weight).toFixed(4)),
        details: dimDetails,
      });
    }

    const totalValueScore = Number(
      dimensionResults.reduce((sum, d) => sum + d.weightedScore, 0).toFixed(4)
    );

    let recommendedAction: 'PASS' | 'AUTO_REPAIR' | 'REJECT_AND_REPLAN' = 'PASS';

    if (totalValueScore >= spec.passThreshold && hardMetricsPassed) {
      recommendedAction = 'PASS';
    } else if (totalValueScore >= spec.repairThreshold) {
      recommendedAction = 'AUTO_REPAIR';
    } else {
      recommendedAction = 'REJECT_AND_REPLAN';
    }

    return {
      totalValueScore,
      isTrustworthy: totalValueScore >= spec.passThreshold && hardMetricsPassed,
      dimensions: dimensionResults,
      hardMetricsPassed,
      recommendedAction,
    };
  }

  /**
   * Safely resolves nested JSON field paths (e.g. "volumes[0].chapters.length").
   */
  public resolveFieldPath(obj: Record<string, unknown>, path: string): unknown {
    if (!obj || !path) return undefined;
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Evaluates atomic rule operators against resolved values.
   */
  private evaluateOperator(val: unknown, op: RuleOperator, expected?: unknown): boolean {
    switch (op) {
      case 'NON_EMPTY':
        if (val === null || val === undefined) return false;
        if (typeof val === 'string') return val.trim().length > 0 && !val.includes('TBD') && !val.includes('[Object');
        if (Array.isArray(val)) return val.length > 0;
        if (typeof val === 'object') return Object.keys(val as object).length > 0;
        return true;

      case 'EQUALS':
        return val === expected;

      case 'NOT_EQUALS':
        return val !== expected;

      case 'GREATER_THAN':
        return typeof val === 'number' && typeof expected === 'number' && val > expected;

      case 'LESS_THAN':
        return typeof val === 'number' && typeof expected === 'number' && val < expected;

      case 'CONTAINS':
        if (typeof val === 'string' && typeof expected === 'string') return val.includes(expected);
        if (Array.isArray(val)) return val.includes(expected);
        return false;

      case 'MATCHES_REGEX':
        if (typeof val === 'string' && typeof expected === 'string') {
          return new RegExp(expected, 'i').test(val);
        }
        return false;

      default:
        return false;
    }
  }
}

export const genericMetaEvaluator = new GenericMetaEvaluator();
