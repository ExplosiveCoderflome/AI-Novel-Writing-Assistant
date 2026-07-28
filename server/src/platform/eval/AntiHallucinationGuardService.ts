import type {
  AntiHallucinationSanitizeResult,
  FactCheckInput,
  FactCheckResult,
} from "./antiHallucinationTypes";

export class AntiHallucinationGuardService {
  /**
   * Evaluates if the retrieved knowledge context contains sufficient confidence for the query.
   */
  evaluateKnowledgeConfidence(input: FactCheckInput): FactCheckResult {
    const { query, retrievedContext = "", confidenceThreshold = 0.6 } = input;

    if (!retrievedContext || retrievedContext.trim().length < 10) {
      return {
        isKnown: false,
        confidence: 0.0,
        hasSufficientContext: false,
        sanitizedInstruction: "【防幻觉拦截】相关背景与世界观设定在数据库中未明确登记。请明确回答：“该设定暂未明确”，严禁凭空臆造。",
        missingFactsAlert: `查询 '${query}' 缺乏底层数据库与知识库支持。`,
      };
    }

    const confidence = Math.min(1.0, retrievedContext.trim().length / 200.0);
    const hasSufficient = confidence >= confidenceThreshold;

    return {
      isKnown: hasSufficient,
      confidence,
      hasSufficientContext: hasSufficient,
      sanitizedInstruction: hasSufficient
        ? ""
        : "【防幻觉警告】当前检索到的背景信息可能不够完整。如遇未说明的细节，请回答：“设定未在已知档案中明确”。",
    };
  }

  /**
   * Injects strict anti-hallucination instructions into standard system prompt when context is low.
   */
  injectAntiHallucinationInstruction(prompt: string, factResult: FactCheckResult): string {
    if (factResult.hasSufficientContext) {
      return prompt;
    }
    return `${prompt}\n\n=== [ANTI-HALLUCINATION GUARDRAIL - ALLOW "I DON'T KNOW"] ===\n${factResult.sanitizedInstruction}`;
  }

  /**
   * Sanitizes raw LLM responses to catch unverified or vague claims.
   */
  sanitizeResponse(rawResponse: string): AntiHallucinationSanitizeResult {
    const flaggedClaims: string[] = [];

    const suspiciousPatterns = [
      /据不完全统计/,
      /根据普遍传说/,
      /大家都知道/,
      /众所周知/,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(rawResponse)) {
        flaggedClaims.push(`检测到模棱两可的大模型未证实模糊表达: ${pattern.source}`);
      }
    }

    return {
      safeText: rawResponse,
      containsUnverifiedClaims: flaggedClaims.length > 0,
      flaggedClaims,
    };
  }
}

export const antiHallucinationGuardService = new AntiHallucinationGuardService();
