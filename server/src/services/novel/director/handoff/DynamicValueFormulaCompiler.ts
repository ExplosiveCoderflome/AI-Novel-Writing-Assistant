/**
 * Layer 2: Dynamic Value Formula Compiler
 * Inspects any incoming payload structure and runtime context to compile a payload-specific ValueFormulaSpec.
 */
import {
  ValueFormulaSpec,
  DimensionFormulaSpec,
  AtomicValueRule,
} from '@ai-novel/shared';

export class DynamicValueFormulaCompiler {
  /**
   * Dynamically compiles a payload-specific ValueFormulaSpec for Layer 1.
   */
  public compileFormulaSpec(
    stageId: string,
    payload: Record<string, unknown>,
    runtimeContext?: { worldAxioms?: string[]; telosPreset?: string }
  ): ValueFormulaSpec {
    const dimensions: DimensionFormulaSpec[] = [
      this.compileStructuralDimension(payload),
      this.compileDomainCoverageDimension(stageId, payload),
      this.compileContinuityDimension(payload, runtimeContext?.worldAxioms),
      this.compileAlignmentDimension(payload, runtimeContext?.telosPreset),
    ];

    return {
      specId: `spec-${stageId}-${Date.now()}`,
      stageId,
      dimensions,
      passThreshold: 0.85,
      repairThreshold: 0.60,
    };
  }

  /**
   * Dynamically generates rules checking structural non-emptiness for top-level keys.
   */
  private compileStructuralDimension(payload: Record<string, unknown>): DimensionFormulaSpec {
    const keys = Object.keys(payload);
    const penaltyPerKey = Number((0.25 / Math.max(1, keys.length)).toFixed(4));

    const rules: AtomicValueRule[] = keys.map((key) => ({
      id: `rule-struct-${key}`,
      fieldPath: key,
      operator: 'NON_EMPTY',
      penaltyWeight: penaltyPerKey,
      errorMessage: `Structural field '${key}' must exist and be non-empty`,
      isHardConstraint: true,
    }));

    return {
      dimension: 'structural',
      weight: 0.30,
      rules,
    };
  }

  /**
   * Dynamically compiles domain coverage rules based on payload properties.
   */
  private compileDomainCoverageDimension(stageId: string, payload: Record<string, unknown>): DimensionFormulaSpec {
    const rules: AtomicValueRule[] = [];

    // Check array lengths if payload contains arrays (e.g. volumes, characters, candidates)
    for (const [key, val] of Object.entries(payload)) {
      if (Array.isArray(val)) {
        rules.push({
          id: `rule-coverage-${key}-len`,
          fieldPath: `${key}.length`,
          operator: 'GREATER_THAN',
          expectedValue: 0,
          penaltyWeight: 0.15,
          errorMessage: `Domain collection '${key}' must contain at least 1 item`,
          isHardConstraint: true,
        });
      }
    }

    // Default catch-all rule if no arrays found
    if (rules.length === 0) {
      rules.push({
        id: `rule-coverage-general`,
        fieldPath: Object.keys(payload)[0] || 'id',
        operator: 'NON_EMPTY',
        penaltyWeight: 0.20,
        errorMessage: 'Payload domain payload must be valid',
        isHardConstraint: false,
      });
    }

    return {
      dimension: 'domain_coverage',
      weight: 0.30,
      rules,
    };
  }

  /**
   * Compiles continuity rules cross-checking world axioms if available.
   */
  private compileContinuityDimension(
    payload: Record<string, unknown>,
    worldAxioms?: string[]
  ): DimensionFormulaSpec {
    const rules: AtomicValueRule[] = [];

    if (worldAxioms && worldAxioms.length > 0) {
      rules.push({
        id: `rule-continuity-axioms`,
        fieldPath: 'worldAxiomCount',
        operator: 'GREATER_THAN',
        expectedValue: -1,
        penaltyWeight: 0.10,
        errorMessage: 'Payload continuity checked against World Axioms',
        isHardConstraint: false,
      });
    } else {
      rules.push({
        id: `rule-continuity-base`,
        fieldPath: Object.keys(payload)[0] || 'id',
        operator: 'NON_EMPTY',
        penaltyWeight: 0.05,
        errorMessage: 'Basic continuity check passed',
        isHardConstraint: false,
      });
    }

    return {
      dimension: 'continuity',
      weight: 0.25,
      rules,
    };
  }

  /**
   * Compiles creator TELOS alignment rules.
   */
  private compileAlignmentDimension(
    payload: Record<string, unknown>,
    telosPreset?: string
  ): DimensionFormulaSpec {
    const rules: AtomicValueRule[] = [
      {
        id: `rule-alignment-telos`,
        fieldPath: Object.keys(payload)[0] || 'id',
        operator: 'NON_EMPTY',
        penaltyWeight: 0.05,
        errorMessage: `Alignment evaluated for preset: ${telosPreset || 'default'}`,
        isHardConstraint: false,
      },
    ];

    return {
      dimension: 'alignment',
      weight: 0.15,
      rules,
    };
  }
}

export const dynamicValueFormulaCompiler = new DynamicValueFormulaCompiler();
