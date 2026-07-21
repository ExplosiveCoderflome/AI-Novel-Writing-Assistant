const test = require("node:test");
const assert = require("node:assert/strict");
const { StylePatchService } = require("../dist/services/styleEngine/StylePatchService.js");
const { StyleBindingService } = require("../dist/services/styleEngine/StyleBindingService.js");
const { PostGenerationStyleReviewRunner } = require("../dist/services/novel/runtime/PostGenerationStyleReviewRunner.js");
const { prisma } = require("../dist/db/prisma.js");

test("StylePatch lifecycle and compiler integration", async (t) => {
  const service = new StylePatchService();
  const bindingService = new StyleBindingService();
  const novelId = `test-novel-${Date.now()}`;
  const ruleKey = "rule-psychology-explaining";

  t.after(async () => {
    // Cleanup
    await prisma.stylePatch.deleteMany({ where: { novelId } });
    await prisma.styleBinding.deleteMany({ where: { targetId: novelId } });
  });

  await t.test("recordViolation creates a new StylePatch and increments on subsequent violations", async () => {
    // 1. Initial violation
    const patch1 = await service.recordViolation(novelId, ruleKey, "Describe character action instead.");
    assert.ok(patch1.id);
    assert.equal(patch1.novelId, novelId);
    assert.equal(patch1.ruleKey, ruleKey);
    assert.equal(patch1.violationCount, 1);
    assert.match(patch1.promptInstruction, /Describe character action instead/);

    // 2. Repeat violation
    const patch2 = await service.recordViolation(novelId, ruleKey, "Use actions and dialogue.");
    assert.equal(patch2.id, patch1.id);
    assert.equal(patch2.violationCount, 2);
    assert.match(patch2.promptInstruction, /Use actions and dialogue/);

    // 3. Resolve patches
    const activePatches = await service.resolvePatches(novelId);
    assert.equal(activePatches.length, 1);
    assert.equal(activePatches[0].id, patch1.id);

    // 4. Toggle patch
    await service.togglePatch(patch1.id, false);
    const resolvedNone = await service.resolvePatches(novelId);
    assert.equal(resolvedNone.length, 0);

    // 5. Delete patch
    await service.deletePatch(patch1.id);
    const deletedCheck = await prisma.stylePatch.findUnique({ where: { id: patch1.id } });
    assert.equal(deletedCheck, null);
  });

  await t.test("PostGenerationStyleReviewRunner records violation upon successful auto-rewrite", async () => {
    // Create custom mock dependencies
    const mockDetectionReport = {
      canAutoRewrite: true,
      riskScore: 40,
      violations: [
        {
          ruleName: ruleKey,
          canAutoRewrite: true,
          excerpt: "He felt extremely sad.",
          suggestion: "Show tears or slow down speech.",
        },
      ],
    };

    const mockDetectionService = {
      check: async () => mockDetectionReport,
    };

    const mockRewriteService = {
      rewrite: async () => ({
        content: "Tears welled up in his eyes, and his voice slowed to a whisper.",
      }),
    };

    const mockPolicyResolver = {
      resolve: async () => ({ enabled: true }),
    };

    const recordedViolations = [];
    const mockStylePatchService = {
      recordViolation: async (nId, rKey, sugg) => {
        recordedViolations.push({ nId, rKey, sugg });
        return {};
      },
    };

    const runner = new PostGenerationStyleReviewRunner({
      styleDetectionService: mockDetectionService,
      styleRewriteService: mockRewriteService,
      postGenerationStyleReviewPolicyResolver: mockPolicyResolver,
      stylePatchService: mockStylePatchService,
    });

    const result = await runner.run({
      novelId,
      chapterId: "chapter-1",
      request: { provider: "openai", model: "gpt-4" },
      contextPackage: { styleContext: { compiledBlocks: {} } },
      content: "He was extremely sad.",
    });

    assert.ok(result.autoRewritten);
    assert.equal(recordedViolations.length, 1);
    assert.equal(recordedViolations[0].nId, novelId);
    assert.equal(recordedViolations[0].rKey, ruleKey);
    assert.equal(recordedViolations[0].sugg, "Show tears or slow down speech.");
  });

  await t.test("StyleBindingService.resolveForGeneration appends active patches to compiled prompts", async () => {
    // Create an active style patch
    const patch = await service.recordViolation(novelId, ruleKey, "Do not explain emotions.");

    const context = await bindingService.resolveForGeneration({
      novelId,
      chapterId: "chapter-1",
    });

    assert.ok(context.compiledBlocks);
    assert.match(context.compiledBlocks.antiAi, /Runtime Style Correction Patches/);
    assert.match(context.compiledBlocks.antiAi, /Do not explain emotions/);
  });
});
