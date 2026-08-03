/**
 * Stage Handoff Gate Service
 * Orchestrates Layer 2 (Dynamic Formula Compiler) and Layer 1 (Generic Meta-Evaluator)
 * to verify stage handoffs and issue tamper-proof certificates.
 */
import crypto from 'node:crypto';
import {
  ValueFunctionResult,
  VerifiedHandoffCertificate,
} from '@ai-novel/shared';
import { genericMetaEvaluator } from './GenericMetaEvaluator';
import { dynamicValueFormulaCompiler } from './DynamicValueFormulaCompiler';

export interface HandoffGateVerificationResponse {
  verified: boolean;
  result: ValueFunctionResult;
  certificate?: VerifiedHandoffCertificate;
  rejectionReason?: string;
}

export class StageHandoffGateService {
  /**
   * Verifies stage handoff payload using two-layer generic value architecture.
   */
  public verifyStageHandoff(
    novelId: string,
    fromStage: string,
    toStage: string,
    payload: Record<string, unknown>,
    runtimeContext?: { worldAxioms?: string[]; telosPreset?: string }
  ): HandoffGateVerificationResponse {
    // 1. Layer 2: Compile payload-specific ValueFormulaSpec
    const spec = dynamicValueFormulaCompiler.compileFormulaSpec(
      `${fromStage}->${toStage}`,
      payload,
      runtimeContext
    );

    // 2. Layer 1: Run deterministic evaluation engine
    const result = genericMetaEvaluator.evaluate(payload, spec);

    // 3. Issue certificate if PASS
    if (result.recommendedAction === 'PASS' && result.isTrustworthy) {
      const payloadHash = this.computePayloadHash(payload);
      const certificate = this.issueCertificate(novelId, fromStage, toStage, result.totalValueScore, payloadHash);

      return {
        verified: true,
        result,
        certificate,
      };
    }

    // 4. Return rejection / repair advice
    return {
      verified: false,
      result,
      rejectionReason: `Handoff value score ${result.totalValueScore} below threshold ${spec.passThreshold} or hard constraints failed. Action: ${result.recommendedAction}`,
    };
  }

  /**
   * Computes SHA256 hash of payload.
   */
  private computePayloadHash(payload: Record<string, unknown>): string {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  /**
   * Issues tamper-proof VerifiedHandoffCertificate.
   */
  private issueCertificate(
    novelId: string,
    fromStage: string,
    toStage: string,
    valueScore: number,
    payloadHash: string
  ): VerifiedHandoffCertificate {
    const issuedAt = Date.now();
    const certificateId = `cert-${novelId}-${issuedAt}`;
    const signature = crypto
      .createHash('sha256')
      .update(`${certificateId}:${payloadHash}:${valueScore}:${issuedAt}`)
      .digest('hex');

    return {
      certificateId,
      novelId,
      fromStage,
      toStage,
      valueScore,
      payloadHash,
      issuedAt,
      signature,
    };
  }
}

export const stageHandoffGateService = new StageHandoffGateService();
