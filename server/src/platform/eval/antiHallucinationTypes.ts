export interface FactCheckInput {
  query: string;
  retrievedContext?: string;
  confidenceThreshold?: number;
}

export interface FactCheckResult {
  isKnown: boolean;
  confidence: number;
  hasSufficientContext: boolean;
  sanitizedInstruction: string;
  missingFactsAlert?: string;
}

export interface AntiHallucinationSanitizeResult {
  safeText: string;
  containsUnverifiedClaims: boolean;
  flaggedClaims: string[];
}
