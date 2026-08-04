const test = require("node:test");
const assert = require("node:assert/strict");
const { antiHallucinationGuardService } = require("../../dist/platform/eval/AntiHallucinationGuardService.js");

test("PAI Insight 8: Specs-First & Anti-Hallucination Guard System", async (t) => {
  await t.test("returns hasSufficientContext: false for empty or short retrieved context", () => {
    const evalResult = antiHallucinationGuardService.evaluateKnowledgeConfidence({
      query: "主角贾宝玉的生辰八字是什么",
      retrievedContext: "",
    });

    assert.equal(evalResult.isKnown, false);
    assert.equal(evalResult.hasSufficientContext, false);
    assert.equal(evalResult.confidence, 0.0);
    assert.match(evalResult.sanitizedInstruction, /严禁凭空臆造/);
  });

  await t.test("returns hasSufficientContext: true for rich context", () => {
    const evalResult = antiHallucinationGuardService.evaluateKnowledgeConfidence({
      query: "林黛玉的性格特征",
      retrievedContext: "林黛玉，姑苏人，前世为太虚幻境绛珠仙草，今生性格敏感多愁善感、才情敏捷、体贴真挚，绝不可表现为粗俗轻浮。",
    });

    assert.equal(evalResult.hasSufficientContext, true);
    assert.ok(evalResult.confidence >= 0.6);
  });

  await t.test("injects anti-hallucination guardrail instruction into prompt when context is missing", () => {
    const basePrompt = "你是一个小说编剧助手。";
    const evalResult = antiHallucinationGuardService.evaluateKnowledgeConfidence({
      query: "未知魔法体系法则",
      retrievedContext: "",
    });

    const guardedPrompt = antiHallucinationGuardService.injectAntiHallucinationInstruction(basePrompt, evalResult);

    assert.match(guardedPrompt, /=== \[ANTI-HALLUCINATION GUARDRAIL - ALLOW "I DON'T KNOW"\] ===/);
    assert.match(guardedPrompt, /【防幻觉拦截】/);
  });

  await t.test("sanitizes raw responses to catch unverified speculative claims", () => {
    const vagueResponse = "众所周知，据不完全统计，贾府内部的库房资金大概有几百万两。";
    const sanitizeResult = antiHallucinationGuardService.sanitizeResponse(vagueResponse);

    assert.equal(sanitizeResult.containsUnverifiedClaims, true);
    assert.ok(sanitizeResult.flaggedClaims.length > 0);
  });
});
